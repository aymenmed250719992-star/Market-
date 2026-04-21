import { Router, type IRouter } from "express";
import { firestore, nextId, tsToDate } from "../lib/firebase";
import { z } from "zod";
import OpenAI from "openai";

const router: IRouter = Router();

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "dummy",
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

async function callGemini(systemPrompt: string, userQuestion: string): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userQuestion }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 800 },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json: any = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("").trim();
  return text || null;
}

const AiInventoryQueryBody = z.object({
  question: z.string().min(1),
  createTaskIfNeeded: z.boolean().optional().default(false),
  requesterId: z.number().int().optional(),
  requesterName: z.string().optional(),
  role: z.string().optional(),
});

function formatProduct(product: any): string {
  const shelfStock = product.shelfStock ?? 0;
  const warehouseStock = product.warehouseStock ?? 0;
  const lowShelf = product.lowStockThreshold ?? 5;
  const lowWarehouse = product.lowWarehouseThreshold ?? 2;
  const notes: string[] = [];

  if (shelfStock === 0) notes.push("نفد من الرف");
  else if (shelfStock <= lowShelf) notes.push("مخزون الرف منخفض");
  if (warehouseStock === 0) notes.push("المستودع فارغ");
  else if (warehouseStock <= lowWarehouse) notes.push("مخزون المستودع منخفض");
  if (product.expiryDate) {
    const expiryDate = new Date(product.expiryDate);
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - Date.now()) / 86_400_000);
    if (daysUntilExpiry >= 0 && daysUntilExpiry <= 30) notes.push(`ينتهي خلال ${daysUntilExpiry} يوم`);
  }

  const status = notes.length ? ` — ${notes.join("، ")}` : "";
  return `${product.name}: الرف ${shelfStock}، المستودع ${warehouseStock}، السعر ${parseFloat(product.retailPrice)} دج${status}`;
}

function buildLocalInventoryAnswer(question: string, products: any[]) {
  const normalizedQuestion = question.toLowerCase();
  const asksLowStock = ["قليل", "منخفض", "ناقص", "نفد", "مخزون"].some((kw) => normalizedQuestion.includes(kw));
  const asksExpiry = ["انتهاء", "تنتهي", "الصلاحية"].some((kw) => normalizedQuestion.includes(kw));

  let selected = products.filter((product) => {
    const lowShelf = product.shelfStock <= (product.lowStockThreshold ?? 5);
    const lowWarehouse = product.warehouseStock <= (product.lowWarehouseThreshold ?? 2);
    const productMentioned = normalizedQuestion.includes(product.name.toLowerCase()) || normalizedQuestion.includes(product.category.toLowerCase());
    if (productMentioned) return true;
    if (asksLowStock && (lowShelf || lowWarehouse)) return true;
    if (asksExpiry && product.expiryDate) {
      const days = Math.ceil((new Date(product.expiryDate).getTime() - Date.now()) / 86_400_000);
      return days >= 0 && days <= 30;
    }
    return false;
  });

  if (!selected.length && asksLowStock) {
    selected = products.filter((p) => p.shelfStock <= (p.lowStockThreshold ?? 5) || p.warehouseStock <= (p.lowWarehouseThreshold ?? 2)).slice(0, 5);
  }
  if (!selected.length) selected = products.slice(0, 5);

  const lines = selected.slice(0, 5).map(formatProduct);
  const answer = lines.length
    ? `حسب بيانات المخزون الحالية:\n${lines.map((line) => `- ${line}`).join("\n")}\n\nإذا كان مخزون الرف منخفضًا والمستودع يحتوي بضاعة، أنصح بنقل كراتين إلى الرف قبل طلب شراء جديد.`
    : "لا توجد منتجات مطابقة في المخزون الحالي.";

  return { answer, products: selected.slice(0, 5) };
}

router.post("/ai/inventory-query", async (req, res): Promise<void> => {
  const parsed = AiInventoryQueryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "سؤال غير صحيح" });
    return;
  }

  const productsSnap = await firestore.collection("products").orderBy("name").get();
  const products = productsSnap.docs.map((d) => ({ ...d.data(), id: parseInt(d.id, 10) }));

  // Pull operational context too — sales today, open shifts, pending tasks
  const [salesSnap, shiftsSnap, tasksSnap, customersSnap] = await Promise.all([
    firestore.collection("sales").get(),
    firestore.collection("shifts").get(),
    firestore.collection("tasks").get(),
    firestore.collection("customers").get(),
  ]);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todaySales = salesSnap.docs.map((d) => d.data()).filter((s: any) => tsToDate(s.createdAt) >= todayStart);
  const todayRevenue = todaySales.reduce((sum: number, s: any) => sum + parseFloat(s.total ?? "0"), 0);
  const openShifts = shiftsSnap.docs.map((d) => d.data()).filter((s: any) => s.status === "open");
  const pendingTasks = tasksSnap.docs.map((d) => d.data()).filter((t: any) => t.status === "pending");
  const lowStockCount = products.filter((p: any) => (p.shelfStock ?? 0) <= (p.lowStockThreshold ?? 5)).length;
  const outOfStockCount = products.filter((p: any) => (p.shelfStock ?? 0) === 0).length;

  // Cap inventory context to avoid blowing the prompt for 17k+ products
  const inventoryContext = products.slice(0, 200).map((p: any) =>
    `- ${p.name} (${p.category}): رفوف=${p.shelfStock}/${p.unit}، مستودع=${p.warehouseStock} كرتون، سعر=${parseFloat(p.retailPrice)} دج${p.unitsPerCarton ? `، وحدات/كرتون=${p.unitsPerCarton}` : ""}${p.expiryDate ? `، انتهاء=${p.expiryDate}` : ""}${p.shelfStock === 0 ? " [⚠️ نفذ من الرف]" : p.shelfStock <= (p.lowStockThreshold ?? 5) ? " [⚠️ مخزون رف منخفض]" : ""}${p.warehouseStock === 0 ? " [🚫 مستودع فارغ]" : p.warehouseStock <= (p.lowWarehouseThreshold ?? 2) ? " [⚠️ مستودع منخفض]" : ""}`
  ).join("\n");

  const summary = `إحصائيات اليوم:
- إجمالي المنتجات: ${products.length}
- منتجات منخفضة على الرف: ${lowStockCount}
- منتجات نافذة كلياً: ${outOfStockCount}
- مبيعات اليوم: ${todaySales.length} عملية بإجمالي ${todayRevenue.toFixed(2)} دج
- ورديات مفتوحة: ${openShifts.length}
- مهام قيد التنفيذ: ${pendingTasks.length}
- زبائن بحساب كرني: ${customersSnap.docs.length}`;

  const role = parsed.data.role ?? "موظف";
  const systemPrompt = `أنت "مساعد المتجر الذكي" لسوبرماركت جزائري. اسم المستخدم الحالي: ${parsed.data.requesterName ?? "—"} (الدور: ${role}).

${summary}

عيّنة من المخزون (أول 200 منتج):
${inventoryContext}

تعليمات الإجابة:
- أجب بالعربية الفصحى المبسطة، بشكل مختصر ومباشر.
- استخدم العملة دج.
- إن سُئلت عن منتج غير موجود في العيّنة، قل ذلك صراحةً واطلب تحديد الاسم.
- إن لاحظت أن الرف منخفض والمستودع يحتوي بضاعة، اقترح بوضوح نقل كراتين معيّنة من المستودع إلى الرف، وإن أمكن أصدر أمر مهمة بالشكل: [ACTION:RESTOCK:productId:cartons].
- للأدمن قدّم تحليلات وتوصيات إدارية (مبيعات، عجز، أداء قابضين). للقابض/المشتري ركّز على الأسعار والمخزون.
- لا تخترع أرقاماً غير موجودة في السياق.`;

  let usedProvider: "gemini" | "openai" | "local" = "local";
  let answer = "";
  let lastError: any = null;

  // 1) Try Gemini first if configured
  if (GEMINI_API_KEY) {
    try {
      const g = await callGemini(systemPrompt, parsed.data.question);
      if (g) { answer = g; usedProvider = "gemini"; }
    } catch (err: any) {
      lastError = err;
      req.log.warn({ err: err?.message }, "Gemini call failed");
    }
  }

  // 2) Fall back to OpenAI integration if available and Gemini unavailable
  if (!answer && process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-5-mini",
        max_completion_tokens: 600,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: parsed.data.question },
        ],
      });
      answer = completion.choices[0]?.message?.content?.trim() ?? "";
      if (answer) usedProvider = "openai";
    } catch (err: any) {
      lastError = err;
      req.log.warn({ err: err?.message }, "OpenAI call failed");
    }
  }

  try {

    const actionMatch = answer.match(/\[ACTION:RESTOCK:(\d+):(\d+)\]/);
    let taskCreated = null;

    if (!answer) {
      const fallback = buildLocalInventoryAnswer(parsed.data.question, products);
      res.json({ answer: fallback.answer, products: fallback.products.map(toProductResponse), taskCreated: null, provider: "local" });
      return;
    }

    if (actionMatch && parsed.data.createTaskIfNeeded) {
      const productId = parseInt(actionMatch[1]);
      const cartonsToMove = parseInt(actionMatch[2]);
      const product = products.find((p: any) => p.id === productId);
      if (product) {
        const taskId = await nextId("tasks");
        const now = new Date();
        const taskData = {
          title: `نقل كرتون من المستودع للرف: ${(product as any).name}`,
          description: `الرف منخفض. يرجى نقل ${cartonsToMove} كرتون من المستودع إلى الرف.`,
          type: "restock",
          status: "pending",
          points: 5,
          productId,
          productName: (product as any).name,
          reportedById: parsed.data.requesterId ?? null,
          reportedByName: parsed.data.requesterName ?? "القابض",
          assignedToId: null,
          assignedToName: null,
          approvedById: null,
          approvedByName: null,
          approvedAt: null,
          completedAt: null,
          notes: null,
          createdAt: now,
        };
        await firestore.collection("tasks").doc(String(taskId)).set(taskData);
        taskCreated = { ...taskData, id: taskId };
      }
      answer = answer.replace(/\[ACTION:RESTOCK:\d+:\d+\]/, "").trim();
    } else {
      answer = answer.replace(/\[ACTION:RESTOCK:\d+:\d+\]/, "").trim();
    }

    const question = parsed.data.question.toLowerCase();
    const relevantProducts = products
      .filter((p: any) => question.includes(p.name.toLowerCase()) || question.includes(p.category.toLowerCase()))
      .slice(0, 5)
      .map(toProductResponse);

    res.json({ answer, products: relevantProducts, taskCreated, provider: usedProvider });
  } catch (err) {
    req.log.error({ err }, "AI query failed");
    const fallback = buildLocalInventoryAnswer(parsed.data.question, products);
    res.json({ answer: fallback.answer, products: fallback.products.map(toProductResponse), taskCreated: null, provider: "local", error: (lastError as any)?.message });
  }
});

function toProductResponse(p: any) {
  return {
    ...p,
    wholesalePrice: parseFloat(p.wholesalePrice),
    retailPrice: parseFloat(p.retailPrice),
    unitWholesalePrice: p.unitWholesalePrice ? parseFloat(p.unitWholesalePrice) : null,
    createdAt: tsToDate(p.createdAt),
    updatedAt: tsToDate(p.updatedAt),
  };
}

export default router;
