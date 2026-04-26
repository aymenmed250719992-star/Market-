import { Router, type IRouter } from "express";
import { nextId, tsToDate } from "../lib/firebase";
import { purchaseOrdersCache } from "../lib/cache";
import { logAudit, getRequestUser } from "../lib/audit";
import { productsCacheApi } from "./products";

const router: IRouter = Router();

type POItem = {
  productId: number;
  productName: string;
  barcode?: string | null;
  unitCost: number;
  orderedQty: number;
  receivedQty: number;
};

type PurchaseOrder = {
  id: number;
  supplierName: string;
  supplierPhone?: string | null;
  status: "draft" | "sent" | "partial" | "received" | "cancelled";
  items: POItem[];
  totalCost: number;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
  receivedAt?: Date | null;
};

function calcTotal(items: POItem[]): number {
  return items.reduce((s, i) => s + Number(i.unitCost) * Number(i.orderedQty), 0);
}

function autoStatus(items: POItem[], current: PurchaseOrder["status"]): PurchaseOrder["status"] {
  if (current === "draft" || current === "cancelled") return current;
  if (items.length === 0) return current;
  const allReceived = items.every((i) => i.receivedQty >= i.orderedQty);
  const someReceived = items.some((i) => i.receivedQty > 0);
  if (allReceived) return "received";
  if (someReceived) return "partial";
  return "sent";
}

function toPO(id: number, data: any): PurchaseOrder {
  const items: POItem[] = Array.isArray(data.items) ? data.items : [];
  return {
    id,
    supplierName: String(data.supplierName ?? ""),
    supplierPhone: data.supplierPhone ?? null,
    status: data.status ?? "draft",
    items,
    totalCost: calcTotal(items),
    notes: data.notes ?? null,
    createdBy: data.createdBy ?? null,
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
    receivedAt: data.receivedAt ? tsToDate(data.receivedAt) : null,
  };
}

// LIST
router.get("/purchase-orders", async (_req, res): Promise<void> => {
  const all = await purchaseOrdersCache.all();
  all.sort((a, b) => +tsToDate(b.data.createdAt) - +tsToDate(a.data.createdAt));
  res.json(all.map(({ id, data }) => toPO(id, data)));
});

// GET one
router.get("/purchase-orders/:id", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const data = await purchaseOrdersCache.get(idNum);
  if (!data) {
    res.status(404).json({ error: "طلب الشراء غير موجود" });
    return;
  }
  res.json(toPO(idNum, data));
});

// CREATE
router.post("/purchase-orders", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  const b = req.body ?? {};
  if (!b.supplierName || typeof b.supplierName !== "string") {
    res.status(400).json({ error: "اسم المورد مطلوب" });
    return;
  }
  const id = await nextId("purchase_orders");
  const now = new Date();
  const data = {
    supplierName: b.supplierName,
    supplierPhone: b.supplierPhone ?? null,
    status: "draft",
    items: [],
    notes: b.notes ?? null,
    createdBy: user?.data?.name ?? null,
    createdAt: now,
    updatedAt: now,
    receivedAt: null,
  };
  await purchaseOrdersCache.set(id, data);
  res.status(201).json(toPO(id, data));
});

// ADD/UPDATE item
router.post("/purchase-orders/:id/items", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const order = await purchaseOrdersCache.get(idNum);
  if (!order) {
    res.status(404).json({ error: "طلب الشراء غير موجود" });
    return;
  }
  if (order.status === "received" || order.status === "cancelled") {
    res.status(400).json({ error: "لا يمكن تعديل طلب مغلق" });
    return;
  }
  const productId = Number(req.body?.productId);
  const orderedQty = Number(req.body?.orderedQty);
  const unitCost = Number(req.body?.unitCost);
  if (!productId || !Number.isFinite(orderedQty) || orderedQty <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }
  const product = await productsCacheApi.get(productId);
  if (!product) {
    res.status(404).json({ error: "المنتج غير موجود" });
    return;
  }
  const item: POItem = {
    productId,
    productName: String(product.name ?? ""),
    barcode: product.barcode ?? null,
    unitCost,
    orderedQty,
    receivedQty: 0,
  };
  const items: POItem[] = Array.isArray(order.items) ? [...order.items] : [];
  const idx = items.findIndex((i) => i.productId === productId);
  if (idx >= 0) {
    item.receivedQty = items[idx].receivedQty;
    items[idx] = item;
  } else items.push(item);
  const merged = await purchaseOrdersCache.update(idNum, { items, updatedAt: new Date() });
  res.json(toPO(idNum, merged ?? { ...order, items }));
});

// REMOVE item
router.delete("/purchase-orders/:id/items/:productId", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const productId = parseInt(req.params.productId as string, 10);
  const order = await purchaseOrdersCache.get(idNum);
  if (!order) {
    res.status(404).json({ error: "طلب الشراء غير موجود" });
    return;
  }
  const items = (Array.isArray(order.items) ? order.items : []).filter(
    (i: POItem) => i.productId !== productId,
  );
  const merged = await purchaseOrdersCache.update(idNum, { items, updatedAt: new Date() });
  res.json(toPO(idNum, merged ?? { ...order, items }));
});

// SEND order (move from draft → sent)
router.post("/purchase-orders/:id/send", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const order = await purchaseOrdersCache.get(idNum);
  if (!order) {
    res.status(404).json({ error: "طلب الشراء غير موجود" });
    return;
  }
  if (order.status !== "draft") {
    res.status(400).json({ error: "الطلب ليس في حالة مسودة" });
    return;
  }
  if (!Array.isArray(order.items) || order.items.length === 0) {
    res.status(400).json({ error: "أضف منتجات قبل إرسال الطلب" });
    return;
  }
  const merged = await purchaseOrdersCache.update(idNum, { status: "sent", updatedAt: new Date() });
  await logAudit(req, "send", "purchase_order", idNum, { items: order.items.length });
  res.json(toPO(idNum, merged ?? { ...order, status: "sent" }));
});

// RECEIVE items (partial or full) — auto-updates product stock
router.post("/purchase-orders/:id/receive", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const order = await purchaseOrdersCache.get(idNum);
  if (!order) {
    res.status(404).json({ error: "طلب الشراء غير موجود" });
    return;
  }
  if (order.status === "received" || order.status === "cancelled" || order.status === "draft") {
    res.status(400).json({ error: "لا يمكن استلام هذا الطلب" });
    return;
  }
  // body: { receipts: [{ productId, qty }] }   OR   { receiveAll: true }
  const items: POItem[] = Array.isArray(order.items) ? [...order.items] : [];
  const receipts: Array<{ productId: number; qty: number }> = req.body?.receiveAll
    ? items.map((i) => ({ productId: i.productId, qty: i.orderedQty - i.receivedQty }))
    : Array.isArray(req.body?.receipts) ? req.body.receipts : [];

  let stockUpdated = 0;
  for (const r of receipts) {
    const qty = Number(r.qty);
    if (!qty || qty <= 0) continue;
    const idx = items.findIndex((i) => i.productId === Number(r.productId));
    if (idx < 0) continue;
    const item = items[idx];
    const remaining = item.orderedQty - item.receivedQty;
    const accept = Math.min(qty, remaining);
    if (accept <= 0) continue;
    items[idx] = { ...item, receivedQty: item.receivedQty + accept };
    // Update product stock
    try {
      const product = await productsCacheApi.get(item.productId);
      if (product) {
        const currentStock = Number(product.stock ?? 0);
        await productsCacheApi.update(item.productId, {
          stock: currentStock + accept,
          updatedAt: new Date(),
        });
        stockUpdated++;
      }
    } catch {
      // continue
    }
  }

  const newStatus = autoStatus(items, order.status);
  const updates: Record<string, unknown> = {
    items,
    status: newStatus,
    updatedAt: new Date(),
  };
  if (newStatus === "received") updates.receivedAt = new Date();

  const merged = await purchaseOrdersCache.update(idNum, updates);
  await logAudit(req, "receive", "purchase_order", idNum, {
    receipts: receipts.length,
    stockUpdated,
    newStatus,
  });
  res.json(toPO(idNum, merged ?? { ...order, ...updates }));
});

// CANCEL
router.post("/purchase-orders/:id/cancel", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const order = await purchaseOrdersCache.get(idNum);
  if (!order) {
    res.status(404).json({ error: "طلب الشراء غير موجود" });
    return;
  }
  if (order.status === "received") {
    res.status(400).json({ error: "لا يمكن إلغاء طلب مستلم" });
    return;
  }
  const merged = await purchaseOrdersCache.update(idNum, { status: "cancelled", updatedAt: new Date() });
  await logAudit(req, "cancel", "purchase_order", idNum);
  res.json(toPO(idNum, merged ?? { ...order, status: "cancelled" }));
});

// DELETE
router.delete("/purchase-orders/:id", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  await purchaseOrdersCache.delete(idNum);
  res.status(204).send();
});

export default router;
