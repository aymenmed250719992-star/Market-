import { Router, type IRouter } from "express";
import { firestore, nextId, tsToDate } from "../lib/firebase";
import { z } from "zod";
import OpenAI from "openai";
import type { ChatCompletionTool, ChatCompletionMessageParam } from "openai/resources/chat/completions";

const router: IRouter = Router();

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "dummy",
});

const MODEL = process.env.AI_MODEL ?? "gpt-5-mini";
const MAX_AGENT_TURNS = 6;

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────
function num(v: any, d = 0): number {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : d;
}

function productSlim(p: any) {
  return {
    id: parseInt(p.id, 10),
    name: p.name,
    barcode: p.barcode,
    category: p.category,
    retailPrice: num(p.retailPrice),
    wholesalePrice: num(p.wholesalePrice),
    shelfStock: num(p.shelfStock),
    warehouseStock: num(p.warehouseStock),
    unit: p.unit,
    unitsPerCarton: num(p.unitsPerCarton, 1),
    lowStockThreshold: num(p.lowStockThreshold, 5),
    lowWarehouseThreshold: num(p.lowWarehouseThreshold, 2),
    expiryDate: p.expiryDate ?? null,
  };
}

async function loadAllProducts() {
  const snap = await firestore.collection("products").get();
  return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
}

// ─────────────────────────────────────────────────────────────────────────────
//  Tool definitions (sent to the model)
// ─────────────────────────────────────────────────────────────────────────────
const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_products",
      description: "ابحث عن منتجات بالاسم أو الباركود أو التصنيف. يرجع حتى 20 نتيجة.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "نص البحث (اسم/باركود/تصنيف)" },
          limit: { type: "integer", default: 10, maximum: 20 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product",
      description: "جلب تفاصيل منتج واحد بالـ id أو الباركود.",
      parameters: {
        type: "object",
        properties: { idOrBarcode: { type: "string" } },
        required: ["idOrBarcode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_low_stock",
      description: "أعد قائمة المنتجات منخفضة المخزون على الرف أو المستودع (حسب العتبات المعرّفة لكل منتج).",
      parameters: {
        type: "object",
        properties: { limit: { type: "integer", default: 20, maximum: 50 } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_expiring",
      description: "أعد قائمة المنتجات التي ستنتهي صلاحيتها خلال عدد أيام محدد.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "integer", default: 30 },
          limit: { type: "integer", default: 20, maximum: 50 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "inventory_overview",
      description: "إحصائيات عامة للمخزون (إجمالي المنتجات، نافذ، منخفض، قيمة المخزون).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "sales_summary",
      description: "ملخص المبيعات لفترة (today أو week أو month). يرجع عدد الفواتير، الإيراد، أكثر المنتجات مبيعاً.",
      parameters: {
        type: "object",
        properties: { period: { type: "string", enum: ["today", "week", "month"], default: "today" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_customers",
      description: "ابحث عن زبائن بالاسم أو رقم الهاتف.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "integer", default: 10, maximum: 20 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_pending_tasks",
      description: "قائمة المهام المعلّقة (pending) في النظام.",
      parameters: {
        type: "object",
        properties: { limit: { type: "integer", default: 20, maximum: 50 } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_employees",
      description: "قائمة الموظفين (الاسم، الدور، النقاط، الراتب).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_online_orders",
      description: "قائمة الطلبيات الإلكترونية حسب الحالة.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "pending|preparing|delivered|cancelled" },
          limit: { type: "integer", default: 20, maximum: 50 },
        },
      },
    },
  },
  // ─── ADMIN-ONLY WRITE TOOLS ────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "update_product",
      description: "تحديث حقول منتج (admin فقط). الحقول المسموح بها: retailPrice, wholesalePrice, shelfStock, warehouseStock, lowStockThreshold, lowWarehouseThreshold, name, category, barcode, expiryDate.",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "integer" },
          retailPrice: { type: "number" },
          wholesalePrice: { type: "number" },
          shelfStock: { type: "integer" },
          warehouseStock: { type: "integer" },
          lowStockThreshold: { type: "integer" },
          lowWarehouseThreshold: { type: "integer" },
          name: { type: "string" },
          category: { type: "string" },
          barcode: { type: "string" },
          expiryDate: { type: "string", description: "ISO date YYYY-MM-DD" },
        },
        required: ["productId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_product",
      description: "إنشاء منتج جديد (admin فقط).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          barcode: { type: "string" },
          retailPrice: { type: "number" },
          wholesalePrice: { type: "number" },
          shelfStock: { type: "integer", default: 0 },
          warehouseStock: { type: "integer", default: 0 },
          category: { type: "string", default: "عام" },
          unit: { type: "string", default: "piece" },
          unitsPerCarton: { type: "integer", default: 1 },
        },
        required: ["name", "retailPrice"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_product",
      description: "حذف منتج نهائياً (admin فقط — استخدم بحذر).",
      parameters: {
        type: "object",
        properties: { productId: { type: "integer" } },
        required: ["productId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "restock_product",
      description: "نقل كراتين من المستودع إلى الرف لمنتج (admin/buyer/cashier).",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "integer" },
          cartons: { type: "integer", description: "عدد الكراتين للنقل" },
        },
        required: ["productId", "cartons"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "إنشاء مهمة جديدة لأي عامل.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          type: { type: "string", default: "general" },
          points: { type: "integer", default: 5 },
          assignedToId: { type: "integer" },
          assignedToName: { type: "string" },
          productId: { type: "integer" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_customer",
      description: "إنشاء زبون جديد (لحساب كرني/الديون) — admin فقط.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: "string" },
          creditLimit: { type: "number", default: 0 },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "record_customer_payment",
      description: "تسجيل دفعة من زبون لتخفيض دينه (admin فقط).",
      parameters: {
        type: "object",
        properties: {
          customerId: { type: "integer" },
          amount: { type: "number" },
          note: { type: "string" },
        },
        required: ["customerId", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_expense",
      description: "تسجيل مصروف جديد (admin فقط).",
      parameters: {
        type: "object",
        properties: {
          label: { type: "string" },
          amount: { type: "number" },
          category: { type: "string", default: "عام" },
        },
        required: ["label", "amount"],
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
//  Tool implementations
// ─────────────────────────────────────────────────────────────────────────────
type Ctx = { role: string; requesterId: number | null; requesterName: string };

const ADMIN_ONLY = new Set([
  "update_product", "create_product", "delete_product",
  "create_customer", "record_customer_payment", "create_expense",
]);

async function execTool(name: string, args: any, ctx: Ctx): Promise<any> {
  if (ADMIN_ONLY.has(name) && ctx.role !== "admin") {
    return { error: `هذه العملية (${name}) متاحة للأدمن فقط. الدور الحالي: ${ctx.role}` };
  }

  switch (name) {
    case "search_products": {
      const q = String(args.query ?? "").trim().toLowerCase();
      const limit = Math.min(num(args.limit, 10), 20);
      const all = await loadAllProducts();
      const matches = all.filter((p: any) =>
        (p.name ?? "").toLowerCase().includes(q) ||
        (p.barcode ?? "").includes(q) ||
        (p.category ?? "").toLowerCase().includes(q),
      ).slice(0, limit).map(productSlim);
      return { count: matches.length, products: matches };
    }

    case "get_product": {
      const key = String(args.idOrBarcode ?? "").trim();
      const all = await loadAllProducts();
      const p = all.find((x: any) => String(x.id) === key || x.barcode === key);
      return p ? productSlim(p) : { error: "لا يوجد منتج بهذا المعرّف/الباركود." };
    }

    case "list_low_stock": {
      const limit = Math.min(num(args.limit, 20), 50);
      const all = await loadAllProducts();
      const low = all.filter((p: any) => {
        const sh = num(p.shelfStock), wh = num(p.warehouseStock);
        return sh <= num(p.lowStockThreshold, 5) || wh <= num(p.lowWarehouseThreshold, 2);
      }).sort((a: any, b: any) => num(a.shelfStock) - num(b.shelfStock))
        .slice(0, limit).map(productSlim);
      return { count: low.length, products: low };
    }

    case "list_expiring": {
      const days = num(args.days, 30);
      const limit = Math.min(num(args.limit, 20), 50);
      const cutoff = Date.now() + days * 86_400_000;
      const all = await loadAllProducts();
      const exp = all.filter((p: any) => {
        if (!p.expiryDate) return false;
        const t = new Date(p.expiryDate).getTime();
        return t >= Date.now() && t <= cutoff;
      }).sort((a: any, b: any) => +new Date(a.expiryDate) - +new Date(b.expiryDate))
        .slice(0, limit).map(productSlim);
      return { count: exp.length, products: exp };
    }

    case "inventory_overview": {
      const all = await loadAllProducts();
      const total = all.length;
      const outOfStock = all.filter((p: any) => num(p.shelfStock) === 0 && num(p.warehouseStock) === 0).length;
      const lowShelf = all.filter((p: any) => num(p.shelfStock) <= num(p.lowStockThreshold, 5)).length;
      const totalValueRetail = all.reduce((s: number, p: any) =>
        s + (num(p.shelfStock) + num(p.warehouseStock) * num(p.unitsPerCarton, 1)) * num(p.retailPrice), 0);
      const totalValueWholesale = all.reduce((s: number, p: any) =>
        s + (num(p.shelfStock) + num(p.warehouseStock) * num(p.unitsPerCarton, 1)) * num(p.wholesalePrice), 0);
      return {
        totalProducts: total,
        outOfStock,
        lowShelfStockCount: lowShelf,
        totalValueRetail: Math.round(totalValueRetail),
        totalValueWholesale: Math.round(totalValueWholesale),
        potentialProfit: Math.round(totalValueRetail - totalValueWholesale),
      };
    }

    case "sales_summary": {
      const period: string = args.period ?? "today";
      const now = new Date();
      const from = new Date(now);
      if (period === "today") from.setHours(0, 0, 0, 0);
      else if (period === "week") from.setDate(now.getDate() - 7);
      else if (period === "month") from.setMonth(now.getMonth() - 1);
      const snap = await firestore.collection("sales").get();
      const sales = snap.docs.map((d: any) => d.data())
        .filter((s: any) => tsToDate(s.createdAt) >= from);
      const revenue = sales.reduce((s: number, x: any) => s + num(x.total), 0);
      const profit = sales.reduce((s: number, x: any) => s + num(x.profit), 0);
      // Top products
      const counts = new Map<string, { name: string; qty: number; total: number }>();
      for (const s of sales) {
        for (const it of (s.items ?? []) as any[]) {
          const key = String(it.productId);
          const cur = counts.get(key) ?? { name: it.name ?? "?", qty: 0, total: 0 };
          cur.qty += num(it.quantity);
          cur.total += num(it.total);
          counts.set(key, cur);
        }
      }
      const top = [...counts.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
      return { period, salesCount: sales.length, revenue: Math.round(revenue), profit: Math.round(profit), topProducts: top };
    }

    case "search_customers": {
      const q = String(args.query ?? "").trim().toLowerCase();
      const limit = Math.min(num(args.limit, 10), 20);
      const snap = await firestore.collection("customers").get();
      const all = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      const m = all.filter((c: any) =>
        (c.name ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").includes(q),
      ).slice(0, limit).map((c: any) => ({
        id: parseInt(c.id, 10), name: c.name, phone: c.phone,
        balance: num(c.balance), creditLimit: num(c.creditLimit),
      }));
      return { count: m.length, customers: m };
    }

    case "list_pending_tasks": {
      const limit = Math.min(num(args.limit, 20), 50);
      const snap = await firestore.collection("tasks").get();
      const t = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
        .filter((x: any) => x.status === "pending")
        .slice(0, limit)
        .map((x: any) => ({
          id: parseInt(x.id, 10), title: x.title, type: x.type,
          assignedToName: x.assignedToName, productName: x.productName,
        }));
      return { count: t.length, tasks: t };
    }

    case "list_employees": {
      const snap = await firestore.collection("users").get();
      const e = snap.docs.map((d: any) => ({ id: d.id, ...d.data() })).map((u: any) => ({
        id: parseInt(u.id, 10), name: u.name, role: u.role,
        points: num(u.points), salary: num(u.salary), advance: num(u.advance),
      }));
      return { count: e.length, employees: e };
    }

    case "list_online_orders": {
      const status = args.status as string | undefined;
      const limit = Math.min(num(args.limit, 20), 50);
      const snap = await firestore.collection("online_orders").get();
      let o = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      if (status) o = o.filter((x: any) => x.status === status);
      o = o.slice(0, limit).map((x: any) => ({
        id: parseInt(x.id, 10), customerName: x.customerName,
        phone: x.phone, total: num(x.total), status: x.status,
        itemsCount: (x.items ?? []).length,
      }));
      return { count: o.length, orders: o };
    }

    // ─── WRITES ────────────────────────────────────────────────────────────
    case "update_product": {
      const pid = num(args.productId);
      const ref = firestore.collection("products").doc(String(pid));
      const snap = await ref.get();
      if (!snap.exists) return { error: `لا يوجد منتج برقم ${pid}` };
      const updates: any = { updatedAt: new Date() };
      const allowed = ["retailPrice", "wholesalePrice", "shelfStock", "warehouseStock",
        "lowStockThreshold", "lowWarehouseThreshold", "name", "category", "barcode", "expiryDate"];
      for (const k of allowed) {
        if (args[k] !== undefined) {
          if (k === "retailPrice" || k === "wholesalePrice") updates[k] = String(num(args[k]));
          else updates[k] = args[k];
        }
      }
      if (updates.shelfStock !== undefined || updates.warehouseStock !== undefined) {
        const cur = snap.data() as any;
        const sh = updates.shelfStock ?? cur.shelfStock ?? 0;
        const wh = updates.warehouseStock ?? cur.warehouseStock ?? 0;
        updates.stock = sh + wh;
      }
      await ref.update(updates);
      return { success: true, productId: pid, updated: Object.keys(updates).filter(k => k !== "updatedAt") };
    }

    case "create_product": {
      const id = await nextId("products");
      const now = new Date();
      const data = {
        name: String(args.name),
        barcode: args.barcode ?? "",
        category: args.category ?? "عام",
        unit: args.unit ?? "piece",
        unitsPerCarton: num(args.unitsPerCarton, 1),
        retailPrice: String(num(args.retailPrice)),
        wholesalePrice: String(num(args.wholesalePrice ?? args.retailPrice)),
        unitWholesalePrice: String(num(args.wholesalePrice ?? args.retailPrice)),
        shelfStock: num(args.shelfStock, 0),
        warehouseStock: num(args.warehouseStock, 0),
        stock: num(args.shelfStock, 0) + num(args.warehouseStock, 0),
        cartonSize: num(args.unitsPerCarton, 1),
        lowStockThreshold: 5,
        lowWarehouseThreshold: 2,
        profitMargin: "0",
        supplier: null,
        expiryDate: null,
        createdAt: now,
        updatedAt: now,
      };
      await firestore.collection("products").doc(String(id)).set(data);
      return { success: true, productId: id, name: data.name };
    }

    case "delete_product": {
      const pid = num(args.productId);
      await firestore.collection("products").doc(String(pid)).delete();
      return { success: true, productId: pid };
    }

    case "restock_product": {
      const pid = num(args.productId);
      const cartons = num(args.cartons);
      const ref = firestore.collection("products").doc(String(pid));
      const snap = await ref.get();
      if (!snap.exists) return { error: `لا يوجد منتج برقم ${pid}` };
      const p = snap.data() as any;
      const upc = num(p.unitsPerCarton, 1);
      const wh = num(p.warehouseStock);
      if (cartons > wh) return { error: `المستودع يحتوي ${wh} كرتون فقط، لا يمكن نقل ${cartons}.` };
      const newWh = wh - cartons;
      const newSh = num(p.shelfStock) + cartons * upc;
      await ref.update({ shelfStock: newSh, warehouseStock: newWh, stock: newSh + newWh, updatedAt: new Date() });
      return { success: true, productId: pid, movedCartons: cartons, unitsAddedToShelf: cartons * upc, newShelfStock: newSh, newWarehouseStock: newWh };
    }

    case "create_task": {
      const tid = await nextId("tasks");
      const data = {
        title: String(args.title),
        description: args.description ?? "",
        type: args.type ?? "general",
        status: "pending",
        points: num(args.points, 5),
        productId: args.productId ?? null,
        productName: null,
        reportedById: ctx.requesterId,
        reportedByName: ctx.requesterName,
        assignedToId: args.assignedToId ?? null,
        assignedToName: args.assignedToName ?? null,
        approvedById: null, approvedByName: null,
        approvedAt: null, completedAt: null, notes: null,
        createdAt: new Date(),
      };
      await firestore.collection("tasks").doc(String(tid)).set(data);
      return { success: true, taskId: tid, title: data.title };
    }

    case "create_customer": {
      const cid = await nextId("customers");
      const data = {
        name: String(args.name),
        phone: args.phone ?? "",
        balance: 0,
        creditLimit: num(args.creditLimit, 0),
        totalPurchases: 0,
        loyaltyPoints: 0,
        createdAt: new Date(),
      };
      await firestore.collection("customers").doc(String(cid)).set(data);
      return { success: true, customerId: cid, name: data.name };
    }

    case "record_customer_payment": {
      const cid = num(args.customerId);
      const amount = num(args.amount);
      if (amount <= 0) return { error: "المبلغ يجب أن يكون أكبر من صفر." };
      const ref = firestore.collection("customers").doc(String(cid));
      const snap = await ref.get();
      if (!snap.exists) return { error: `لا يوجد زبون برقم ${cid}` };
      const c = snap.data() as any;
      const newBalance = num(c.balance) - amount;
      await ref.update({ balance: newBalance, updatedAt: new Date() });
      // Optional payment record
      const pid = await nextId("customer_payments").catch(() => null as any);
      if (pid) {
        await firestore.collection("customer_payments").doc(String(pid)).set({
          customerId: cid, amount, note: args.note ?? "", createdAt: new Date(),
          recordedById: ctx.requesterId, recordedByName: ctx.requesterName,
        }).catch(() => null);
      }
      return { success: true, customerId: cid, amountPaid: amount, newBalance };
    }

    case "create_expense": {
      const eid = await nextId("expenses");
      const data = {
        label: String(args.label),
        amount: num(args.amount),
        category: args.category ?? "عام",
        recordedById: ctx.requesterId,
        recordedByName: ctx.requesterName,
        createdAt: new Date(),
      };
      await firestore.collection("expenses").doc(String(eid)).set(data);
      return { success: true, expenseId: eid, label: data.label, amount: data.amount };
    }

    default:
      return { error: `أداة غير معروفة: ${name}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Route
// ─────────────────────────────────────────────────────────────────────────────
const Body = z.object({
  question: z.string().min(1),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).optional().default([]),
  requesterId: z.number().int().nullable().optional(),
  requesterName: z.string().optional(),
  role: z.string().optional(),
  // legacy ignored fields
  createTaskIfNeeded: z.boolean().optional(),
}).passthrough();

router.post("/ai/inventory-query", async (req, res): Promise<void> => {
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "سؤال غير صحيح" });
    return;
  }
  const ctx: Ctx = {
    role: parsed.data.role ?? "موظف",
    requesterId: parsed.data.requesterId ?? null,
    requesterName: parsed.data.requesterName ?? "—",
  };

  const today = new Date().toISOString().slice(0, 10);
  const systemPrompt = `أنت "مساعد المتجر الذكي" — مساعد ذكي حقيقي لسوبرماركت جزائري، تتحدث ${ctx.requesterName} (الدور: ${ctx.role}).
التاريخ اليوم: ${today}. العملة: دج.

لديك أدوات (tools) قوية للتفاعل مع قاعدة بيانات المتجر:
- بحث وقراءة: search_products, get_product, list_low_stock, list_expiring, inventory_overview, sales_summary, search_customers, list_pending_tasks, list_employees, list_online_orders.
${ctx.role === "admin"
  ? "- تعديلات (متاحة لك كأدمن): update_product, create_product, delete_product, restock_product, create_task, create_customer, record_customer_payment, create_expense."
  : "- تعديلات محدودة: restock_product, create_task. لا يمكنك تعديل الأسعار أو حذف منتجات أو إنشاء مصاريف."}

قواعد العمل:
1. استدعِ الأدوات دائماً للحصول على بيانات حقيقية — لا تخمّن أرقاماً.
2. للبحث عن منتج باسم تقريبي استخدم search_products أولاً ثم استعمل id لتنفيذ التعديل.
3. قبل أي تعديل خطير (تغيير سعر، حذف، تخفيض مخزون) نفذه مباشرة إذا كان طلب المستخدم صريحاً وواضحاً، ثم اشرح ما فعلت.
4. أجب بالعربية بشكل مختصر ومنظّم. استخدم أرقاماً وقوائم عند الحاجة.
5. إذا كانت العملية محظورة على دور المستخدم، اشرح ذلك بدل تنفيذها.`;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...parsed.data.history.slice(-10).map((h) => ({ role: h.role, content: h.content }) as ChatCompletionMessageParam),
    { role: "user", content: parsed.data.question },
  ];

  const executedTools: { name: string; args: any; result: any }[] = [];

  try {
    let finalAnswer = "";
    for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages,
        tools: TOOLS,
        max_completion_tokens: 1500,
      });
      const msg = completion.choices[0]?.message;
      if (!msg) break;
      messages.push(msg as ChatCompletionMessageParam);

      const calls = msg.tool_calls ?? [];
      if (!calls.length) {
        finalAnswer = (msg.content ?? "").trim();
        break;
      }

      // Execute every tool call in parallel
      const results = await Promise.all(calls.map(async (call: any) => {
        let args: any = {};
        try { args = JSON.parse(call.function.arguments || "{}"); } catch { args = {}; }
        let result: any;
        try {
          result = await execTool(call.function.name, args, ctx);
        } catch (err: any) {
          result = { error: err?.message ?? String(err) };
        }
        executedTools.push({ name: call.function.name, args, result });
        return { tool_call_id: call.id, content: JSON.stringify(result).slice(0, 8000) };
      }));

      for (const r of results) {
        messages.push({ role: "tool", tool_call_id: r.tool_call_id, content: r.content });
      }
    }

    if (!finalAnswer) finalAnswer = "تم تنفيذ العملية المطلوبة.";

    // Surface a small product list if the agent fetched any
    const lastProductPayload = [...executedTools].reverse()
      .find((t) => Array.isArray(t.result?.products))?.result?.products ?? [];

    res.json({
      answer: finalAnswer,
      products: lastProductPayload.slice(0, 5),
      executedTools: executedTools.map((t) => ({ name: t.name, args: t.args, ok: !t.result?.error })),
      provider: "openai-agent",
    });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "AI agent failed");
    res.status(500).json({
      answer: "تعذّر تشغيل المساعد الذكي حالياً. حاول مجدداً بعد قليل.",
      error: err?.message,
      provider: "error",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision: count product units in an image
// ─────────────────────────────────────────────────────────────────────────────
router.post("/ai/count-products", async (req, res): Promise<void> => {
  try {
    const { image, productName } = req.body ?? {};
    if (!image || typeof image !== "string") {
      res.status(400).json({ error: "حقل الصورة مطلوب (base64 data URL)" });
      return;
    }
    // Allow either a data URL or raw base64
    const imageUrl = image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;

    const hint = productName
      ? `المنتج المستهدف: "${productName}". عدّ فقط هذا المنتج، تجاهل ما عداه.`
      : `عدّ كل وحدات المنتج المرئية في الصورة.`;

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "أنت مساعد متخصص في عدّ المنتجات في الصور لأغراض الجرد. أعطِ رقماً دقيقاً قدر الإمكان. أجب فقط بصيغة JSON بدون أي شرح إضافي.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${hint}\n\nأجب بصيغة JSON فقط على هذا الشكل:\n{"count": <عدد صحيح>, "confidence": "high"|"medium"|"low", "description": "<وصف موجز جداً للمنتجات المرئية>"}`,
            },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch {}
    const count = Number.isFinite(Number(parsed.count)) ? Math.max(0, Math.floor(Number(parsed.count))) : 0;
    res.json({
      count,
      confidence: parsed.confidence ?? "medium",
      description: typeof parsed.description === "string" ? parsed.description : "",
    });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "AI count failed");
    res.status(500).json({ error: "تعذّر تحليل الصورة. حاول مجدداً." });
  }
});

export default router;
