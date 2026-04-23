import { Router, type IRouter } from "express";
import { nextId, tsToDate } from "../lib/firebase";
import { onlineOrdersCache, customersCache, salesCache, usersCache } from "../lib/cache";
import { z } from "zod";

const router: IRouter = Router();

const orderItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive(),
});

const createOrderSchema = z.object({
  customerName: z.string().min(1),
  phone: z.string().min(4),
  address: z.string().optional(),
  notes: z.string().optional(),
  paymentMethod: z.enum(["cash_on_delivery", "karni", "store_pickup"]).default("cash_on_delivery"),
  items: z.array(orderItemSchema).min(1),
});

const updateOrderSchema = z.object({
  status: z.enum(["pending", "confirmed", "preparing", "delivering", "completed", "cancelled"]).optional(),
  assignedDistributorId: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
});

function toOrder(id: number, data: any) {
  return {
    ...data,
    id,
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
    subtotal: parseFloat(data.subtotal),
    deliveryFee: parseFloat(data.deliveryFee),
    total: parseFloat(data.total),
  };
}

async function getProductsApi() {
  const mod = await import("./products");
  return mod.productsCacheApi;
}

router.get("/online-orders", async (_req, res): Promise<void> => {
  const all = await onlineOrdersCache.all();
  all.sort((a, b) => +tsToDate(b.data.createdAt) - +tsToDate(a.data.createdAt));
  res.json(all.map(({ id, data }) => toOrder(id, data)));
});

router.get("/online-orders/lookup", async (req, res): Promise<void> => {
  const phone = String(req.query.phone ?? "").trim();
  if (!phone) {
    res.status(400).json({ error: "رقم الهاتف مطلوب" });
    return;
  }

  const customerFound = await customersCache.findOne((c) => c.phone === phone);
  const orders = (await onlineOrdersCache.filter((o) => o.phone === phone))
    .sort((a, b) => +tsToDate(b.data.createdAt) - +tsToDate(a.data.createdAt));

  let invoices: any[] = [];
  if (customerFound) {
    const sales = (await salesCache.filter((s) => s.customerId === customerFound.id))
      .sort((a, b) => +tsToDate(b.data.createdAt) - +tsToDate(a.data.createdAt));
    invoices = sales.map(({ id, data: s }) => ({
      ...s,
      id,
      createdAt: tsToDate(s.createdAt),
      subtotal: parseFloat(s.subtotal),
      discount: parseFloat(s.discount),
      total: parseFloat(s.total),
    }));
  }

  res.json({
    customer: customerFound
      ? {
          ...customerFound.data,
          id: customerFound.id,
          createdAt: tsToDate(customerFound.data.createdAt),
          updatedAt: tsToDate(customerFound.data.updatedAt),
          creditLimit: parseFloat(customerFound.data.creditLimit),
          totalDebt: parseFloat(customerFound.data.totalDebt),
        }
      : null,
    orders: orders.map(({ id, data }) => toOrder(id, data)),
    invoices,
  });
});

router.post("/online-orders", async (req, res): Promise<void> => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات الطلب غير صحيحة" });
    return;
  }

  const data = parsed.data;
  const customerFound = await customersCache.findOne((c) => c.phone === data.phone);
  const productsApi = await getProductsApi();

  const items = [];
  let subtotal = 0;

  for (const item of data.items) {
    const product = await productsApi.get(item.productId);
    if (!product) {
      res.status(400).json({ error: "يوجد منتج غير متوفر في الطلب" });
      return;
    }
    if (product.stock < item.quantity) {
      res.status(400).json({ error: `الكمية غير كافية من ${product.name}` });
      return;
    }
    const price = parseFloat(product.retailPrice);
    const lineTotal = price * item.quantity;
    subtotal += lineTotal;
    items.push({ productId: item.productId, productName: product.name, price, quantity: item.quantity, subtotal: lineTotal });
  }

  const deliveryFee = data.paymentMethod === "store_pickup" ? 0 : 200;
  const total = subtotal + deliveryFee;
  const id = await nextId("online_orders");
  const now = new Date();
  const orderData = {
    customerId: customerFound ? customerFound.id : null,
    customerName: data.customerName,
    phone: data.phone,
    address: data.address ?? null,
    notes: data.notes ?? null,
    items,
    subtotal: subtotal.toString(),
    deliveryFee: deliveryFee.toString(),
    total: total.toString(),
    paymentMethod: data.paymentMethod,
    status: "pending",
    assignedDistributorId: null,
    assignedDistributorName: null,
    createdAt: now,
    updatedAt: now,
  };
  await onlineOrdersCache.set(id, orderData);
  res.status(201).json(toOrder(id, orderData));
});

router.patch("/online-orders/:id", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const parsed = updateOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات التحديث غير صحيحة" });
    return;
  }

  const existing = await onlineOrdersCache.get(idNum);
  if (!existing) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.status) updates.status = parsed.data.status;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;

  if (parsed.data.assignedDistributorId !== undefined) {
    updates.assignedDistributorId = parsed.data.assignedDistributorId;
    updates.assignedDistributorName = null;
    if (parsed.data.assignedDistributorId) {
      const dist = await usersCache.get(parsed.data.assignedDistributorId);
      if (dist) updates.assignedDistributorName = dist.name;
    }
  }

  const merged = await onlineOrdersCache.update(idNum, updates);
  res.json(toOrder(idNum, merged ?? { ...existing, ...updates }));
});

export default router;
