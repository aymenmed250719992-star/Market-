import { Router, type IRouter } from "express";
import { nextId, tsToDate } from "../lib/firebase";
import { stocktakesCache } from "../lib/cache";
import { logAudit, getRequestUser } from "../lib/audit";
import { productsCacheApi } from "./products";

const router: IRouter = Router();

type StocktakeItem = {
  productId: number;
  productName: string;
  barcode?: string | null;
  expectedQty: number;
  actualQty: number;
  difference: number;
};

type Stocktake = {
  id: number;
  title: string;
  status: "open" | "closed";
  items: StocktakeItem[];
  startedBy?: string | null;
  closedBy?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date | null;
};

function toStocktake(id: number, data: any): Stocktake {
  return {
    id,
    title: String(data.title ?? `جرد رقم ${id}`),
    status: data.status === "closed" ? "closed" : "open",
    items: Array.isArray(data.items) ? data.items : [],
    startedBy: data.startedBy ?? null,
    closedBy: data.closedBy ?? null,
    notes: data.notes ?? null,
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
    closedAt: data.closedAt ? tsToDate(data.closedAt) : null,
  };
}

// LIST sessions
router.get("/stocktakes", async (_req, res): Promise<void> => {
  const all = await stocktakesCache.all();
  all.sort((a, b) => +tsToDate(b.data.createdAt) - +tsToDate(a.data.createdAt));
  res.json(all.map(({ id, data }) => toStocktake(id, data)));
});

// GET one
router.get("/stocktakes/:id", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const data = await stocktakesCache.get(idNum);
  if (!data) {
    res.status(404).json({ error: "جلسة الجرد غير موجودة" });
    return;
  }
  res.json(toStocktake(idNum, data));
});

// CREATE new session
router.post("/stocktakes", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  const id = await nextId("stocktakes");
  const now = new Date();
  const data = {
    title: String(req.body?.title ?? `جرد ${now.toLocaleDateString("ar-DZ")}`),
    status: "open",
    items: [],
    startedBy: user?.data?.name ?? null,
    notes: req.body?.notes ?? null,
    createdAt: now,
    updatedAt: now,
    closedAt: null,
  };
  await stocktakesCache.set(id, data);
  res.status(201).json(toStocktake(id, data));
});

// ADD/UPDATE an item in a session (idempotent by productId — overwrites the existing line)
router.post("/stocktakes/:id/items", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const session = await stocktakesCache.get(idNum);
  if (!session) {
    res.status(404).json({ error: "جلسة الجرد غير موجودة" });
    return;
  }
  if (session.status !== "open") {
    res.status(400).json({ error: "الجلسة مغلقة، لا يمكن التعديل" });
    return;
  }
  const productId = Number(req.body?.productId);
  const actualQty = Number(req.body?.actualQty);
  if (!productId || !Number.isFinite(actualQty) || actualQty < 0) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }
  const product = await productsCacheApi.get(productId);
  if (!product) {
    res.status(404).json({ error: "المنتج غير موجود" });
    return;
  }
  const expectedQty = Number(product.stock ?? 0);
  const item: StocktakeItem = {
    productId,
    productName: String(product.name ?? ""),
    barcode: product.barcode ?? null,
    expectedQty,
    actualQty,
    difference: actualQty - expectedQty,
  };
  const items: StocktakeItem[] = Array.isArray(session.items) ? [...session.items] : [];
  const idx = items.findIndex((i) => i.productId === productId);
  if (idx >= 0) items[idx] = item;
  else items.push(item);
  const merged = await stocktakesCache.update(idNum, { items, updatedAt: new Date() });
  res.json(toStocktake(idNum, merged ?? { ...session, items }));
});

// REMOVE an item
router.delete("/stocktakes/:id/items/:productId", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const productId = parseInt(req.params.productId as string, 10);
  const session = await stocktakesCache.get(idNum);
  if (!session) {
    res.status(404).json({ error: "جلسة الجرد غير موجودة" });
    return;
  }
  if (session.status !== "open") {
    res.status(400).json({ error: "الجلسة مغلقة" });
    return;
  }
  const items = (Array.isArray(session.items) ? session.items : []).filter(
    (i: StocktakeItem) => i.productId !== productId,
  );
  const merged = await stocktakesCache.update(idNum, { items, updatedAt: new Date() });
  res.json(toStocktake(idNum, merged ?? { ...session, items }));
});

// CLOSE session: optionally apply adjustments to actual product stock
router.post("/stocktakes/:id/close", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  const idNum = parseInt(req.params.id as string, 10);
  const session = await stocktakesCache.get(idNum);
  if (!session) {
    res.status(404).json({ error: "جلسة الجرد غير موجودة" });
    return;
  }
  if (session.status === "closed") {
    res.status(400).json({ error: "الجلسة مغلقة بالفعل" });
    return;
  }
  const applyAdjustments = req.body?.applyAdjustments !== false;
  const items: StocktakeItem[] = Array.isArray(session.items) ? session.items : [];
  let adjustedCount = 0;

  if (applyAdjustments) {
    for (const it of items) {
      if (it.actualQty === it.expectedQty) continue;
      try {
        await productsCacheApi.update(it.productId, {
          stock: it.actualQty,
          updatedAt: new Date(),
        });
        adjustedCount++;
      } catch (e: any) {
        // continue with remaining items
      }
    }
  }

  const now = new Date();
  const merged = await stocktakesCache.update(idNum, {
    status: "closed",
    closedBy: user?.data?.name ?? null,
    closedAt: now,
    updatedAt: now,
  });
  await logAudit(req, "close", "stocktake", idNum, {
    items: items.length,
    adjustedCount,
    applyAdjustments,
  });
  res.json({
    ...toStocktake(idNum, merged ?? { ...session, status: "closed", closedAt: now }),
    adjustedCount,
  });
});

// DELETE a session (only if open and empty, or always for admin cleanup)
router.delete("/stocktakes/:id", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  await stocktakesCache.delete(idNum);
  res.status(204).send();
});

export default router;
