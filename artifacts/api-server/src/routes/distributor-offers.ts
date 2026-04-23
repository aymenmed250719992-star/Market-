import { Router, type IRouter, type Request } from "express";
import { nextId, tsToDate } from "../lib/firebase";
import { distributorOffersCache, usersCache } from "../lib/cache";
import { z } from "zod";

const router: IRouter = Router();

const offerSchema = z.object({
  productName: z.string().min(1),
  category: z.string().min(1),
  wholesalePrice: z.number().positive(),
  minimumQuantity: z.number().int().positive().default(1),
  availableQuantity: z.number().int().min(0).default(0),
  deliveryDays: z.number().int().positive().default(1),
  notes: z.string().optional(),
  status: z.enum(["active", "paused", "archived"]).default("active"),
});

const updateOfferSchema = offerSchema.partial();

async function getCurrentUser(req: Request) {
  const token = req.cookies?.session ?? req.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token, "base64").toString());
    const data = await usersCache.get(payload.id);
    if (!data) return null;
    return { ...data, id: payload.id };
  } catch {
    return null;
  }
}

function toOffer(id: number, data: any) {
  return {
    ...data,
    id,
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
    wholesalePrice: parseFloat(data.wholesalePrice),
  };
}

router.get("/distributor-offers", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  let offers = await distributorOffersCache.all();
  offers.sort((a, b) => +tsToDate(b.data.createdAt) - +tsToDate(a.data.createdAt));
  if (req.query.mine === "true" && user) {
    offers = offers.filter(({ data }) => data.distributorId === user.id);
  }
  res.json(offers.map(({ id, data }) => toOffer(id, data)));
});

router.post("/distributor-offers", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (!user || (user.role !== "distributor" && user.role !== "admin")) {
    res.status(403).json({ error: "هذا الحساب غير مسموح له بنشر عروض الموزعين" });
    return;
  }

  const parsed = offerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات العرض غير صحيحة" });
    return;
  }

  const id = await nextId("distributor_offers");
  const now = new Date();
  const data = {
    ...parsed.data,
    distributorId: user.id,
    distributorName: user.name,
    wholesalePrice: parsed.data.wholesalePrice.toString(),
    createdAt: now,
    updatedAt: now,
  };
  await distributorOffersCache.set(id, data);
  res.status(201).json(toOffer(id, data));
});

router.patch("/distributor-offers/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "يجب تسجيل الدخول" });
    return;
  }

  const idNum = parseInt(req.params.id as string, 10);
  const existing = await distributorOffersCache.get(idNum);
  if (!existing) {
    res.status(404).json({ error: "العرض غير موجود" });
    return;
  }
  if (user.role !== "admin" && existing.distributorId !== user.id) {
    res.status(403).json({ error: "غير مسموح بتعديل هذا العرض" });
    return;
  }

  const parsed = updateOfferSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات العرض غير صحيحة" });
    return;
  }

  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.wholesalePrice !== undefined) updates.wholesalePrice = parsed.data.wholesalePrice.toString();

  const merged = await distributorOffersCache.update(idNum, updates);
  res.json(toOffer(idNum, merged ?? { ...existing, ...updates }));
});

export default router;
