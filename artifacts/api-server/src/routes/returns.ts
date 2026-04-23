import { Router, type IRouter } from "express";
import { z } from "zod";
import { CollectionCache, customersCache, salesCache } from "../lib/cache";
import { nextId, tsToDate } from "../lib/firebase";
import { getRequestUser, logAudit } from "../lib/audit";

const router: IRouter = Router();
export const returnsCache = new CollectionCache("returns");

const ReturnBody = z.object({
  saleId: z.number().int().positive(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().positive(),
      }),
    )
    .min(1),
  reason: z.string().optional(),
});

async function getProductsCache() {
  const mod = await import("./products");
  return mod.productsCacheApi;
}

router.get("/returns", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user || !["admin", "cashier"].includes(user.data.role)) {
    res.status(403).json({ error: "غير مسموح" });
    return;
  }
  const all = await returnsCache.all();
  all.sort((a, b) => +tsToDate(b.data.createdAt) - +tsToDate(a.data.createdAt));
  res.json(
    all.map(({ id, data }) => ({
      id,
      ...data,
      createdAt: tsToDate(data.createdAt),
      total: Number(data.total),
    })),
  );
});

router.post("/returns", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user || !["admin", "cashier"].includes(user.data.role)) {
    res.status(403).json({ error: "غير مسموح" });
    return;
  }
  const parsed = ReturnBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات الإرجاع غير صحيحة" });
    return;
  }
  const sale = await salesCache.get(parsed.data.saleId);
  if (!sale) {
    res.status(404).json({ error: "الفاتورة غير موجودة" });
    return;
  }

  const productsApi = await getProductsCache();

  // compute previous returns to enforce remaining qty per item
  const previous = await returnsCache.filter((d) => d.saleId === parsed.data.saleId);
  const alreadyReturned = new Map<number, number>();
  for (const { data } of previous) {
    for (const item of data.items as any[]) {
      alreadyReturned.set(item.productId, (alreadyReturned.get(item.productId) ?? 0) + Number(item.quantity));
    }
  }

  const returnItems: any[] = [];
  let returnTotal = 0;

  for (const item of parsed.data.items) {
    const original = (sale.items as any[]).find((s) => s.productId === item.productId);
    if (!original) {
      res.status(400).json({ error: `المنتج ${item.productId} ليس في الفاتورة` });
      return;
    }
    const remaining = Number(original.quantity) - (alreadyReturned.get(item.productId) ?? 0);
    if (item.quantity > remaining) {
      res.status(400).json({
        error: `الكمية المرجعة (${item.quantity}) تتجاوز المتاح (${remaining}) من ${original.productName}`,
      });
      return;
    }
    const lineTotal = Number(original.price) * item.quantity;
    returnTotal += lineTotal;
    returnItems.push({
      productId: item.productId,
      productName: original.productName,
      price: Number(original.price),
      quantity: item.quantity,
      subtotal: lineTotal,
    });
  }

  // restore stock
  for (const item of returnItems) {
    const product = await productsApi.get(item.productId);
    if (!product) continue;
    const currentStock = Number(product.stock ?? 0);
    const currentShelf = Number(product.shelfStock ?? currentStock);
    await productsApi.update(item.productId, {
      stock: currentStock + item.quantity,
      shelfStock: currentShelf + item.quantity,
      updatedAt: new Date(),
    });
  }

  // refund: if karni sale, reduce customer debt; otherwise record cash refund
  let refundMethod: "cash" | "karni" = "cash";
  if (sale.paymentMethod === "karni" && sale.customerId) {
    const customer = await customersCache.get(Number(sale.customerId));
    if (customer) {
      const newDebt = Math.max(0, parseFloat(customer.totalDebt) - returnTotal);
      await customersCache.update(Number(sale.customerId), {
        totalDebt: newDebt.toString(),
        updatedAt: new Date(),
      });
      refundMethod = "karni";
    }
  }

  const id = await nextId("returns");
  const now = new Date();
  const entry = {
    saleId: parsed.data.saleId,
    customerId: sale.customerId ?? null,
    customerName: sale.customerName ?? null,
    cashierId: user.id,
    cashierName: user.data.name,
    items: returnItems,
    total: returnTotal.toString(),
    reason: parsed.data.reason ?? null,
    refundMethod,
    createdAt: now,
  };
  await returnsCache.set(id, entry);
  await logAudit(req, "create", "return", id, {
    saleId: parsed.data.saleId,
    total: returnTotal,
    refundMethod,
  });

  res.status(201).json({
    id,
    ...entry,
    createdAt: now,
    total: returnTotal,
  });
});

router.get("/returns/by-sale/:saleId", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user || !["admin", "cashier"].includes(user.data.role)) {
    res.status(403).json({ error: "غير مسموح" });
    return;
  }
  const saleId = parseInt(req.params.saleId as string, 10);
  const items = await returnsCache.filter((d) => d.saleId === saleId);
  items.sort((a, b) => +tsToDate(b.data.createdAt) - +tsToDate(a.data.createdAt));
  res.json(
    items.map(({ id, data }) => ({
      id,
      ...data,
      createdAt: tsToDate(data.createdAt),
      total: Number(data.total),
    })),
  );
});

export default router;
