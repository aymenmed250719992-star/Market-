import { Router, type IRouter } from "express";
import { nextId, tsToDate } from "../lib/firebase";
import { promotionsCache } from "../lib/cache";

const router: IRouter = Router();

type Promotion = {
  id: number;
  title: string;
  description?: string | null;
  discountType: "percent" | "amount";
  discountValue: number;
  startsAt?: string | null;
  endsAt?: string | null;
  active: boolean;
  productIds?: number[];
  imageUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toPromotion(id: number, data: any): Promotion {
  return {
    id,
    title: String(data.title ?? ""),
    description: data.description ?? null,
    discountType: data.discountType === "amount" ? "amount" : "percent",
    discountValue: Number(data.discountValue ?? 0),
    startsAt: data.startsAt ?? null,
    endsAt: data.endsAt ?? null,
    active: Boolean(data.active),
    productIds: Array.isArray(data.productIds) ? data.productIds : [],
    imageUrl: data.imageUrl ?? null,
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
  };
}

// LIST — all promotions (admin)
router.get("/promotions", async (_req, res): Promise<void> => {
  const all = await promotionsCache.all();
  all.sort((a, b) => Number(b.id) - Number(a.id));
  res.json(all.map(({ id, data }) => toPromotion(id, data)));
});

// PUBLIC — only currently-active promotions, no auth required
router.get("/promotions/active", async (_req, res): Promise<void> => {
  const all = await promotionsCache.all();
  const now = Date.now();
  const active = all
    .filter(({ data }) => {
      if (!data.active) return false;
      if (data.startsAt && new Date(data.startsAt).getTime() > now) return false;
      if (data.endsAt && new Date(data.endsAt).getTime() < now) return false;
      return true;
    })
    .map(({ id, data }) => toPromotion(id, data));
  res.json(active);
});

// CREATE
router.post("/promotions", async (req, res): Promise<void> => {
  const b = req.body ?? {};
  if (!b.title || typeof b.title !== "string") {
    res.status(400).json({ error: "title is required" });
    return;
  }
  const id = await nextId("promotions");
  const now = new Date();
  const data = {
    title: b.title,
    description: b.description ?? null,
    discountType: b.discountType === "amount" ? "amount" : "percent",
    discountValue: Number(b.discountValue ?? 0),
    startsAt: b.startsAt ?? null,
    endsAt: b.endsAt ?? null,
    active: b.active !== false,
    productIds: Array.isArray(b.productIds) ? b.productIds : [],
    imageUrl: b.imageUrl ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await promotionsCache.set(id, data);
  res.status(201).json(toPromotion(id, data));
});

// UPDATE
router.patch("/promotions/:id", async (req, res): Promise<void> => {
  const idNum = parseInt(String(req.params.id), 10);
  const existing = await promotionsCache.get(idNum);
  if (!existing) {
    res.status(404).json({ error: "Promotion not found" });
    return;
  }
  const b = req.body ?? {};
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (b.title != null) updates.title = String(b.title);
  if (b.description !== undefined) updates.description = b.description ?? null;
  if (b.discountType != null) updates.discountType = b.discountType === "amount" ? "amount" : "percent";
  if (b.discountValue != null) updates.discountValue = Number(b.discountValue);
  if (b.startsAt !== undefined) updates.startsAt = b.startsAt ?? null;
  if (b.endsAt !== undefined) updates.endsAt = b.endsAt ?? null;
  if (b.active != null) updates.active = Boolean(b.active);
  if (b.productIds !== undefined) updates.productIds = Array.isArray(b.productIds) ? b.productIds : [];
  if (b.imageUrl !== undefined) updates.imageUrl = b.imageUrl ?? null;
  const merged = await promotionsCache.update(idNum, updates);
  res.json(toPromotion(idNum, merged ?? { ...existing, ...updates }));
});

// DELETE
router.delete("/promotions/:id", async (req, res): Promise<void> => {
  const idNum = parseInt(String(req.params.id), 10);
  await promotionsCache.delete(idNum);
  res.status(204).send();
});

export default router;
