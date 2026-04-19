import { Router, type IRouter, type Request } from "express";
import { db, distributorOffersTable, usersTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
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
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.id));
    return user ?? null;
  } catch {
    return null;
  }
}

const toOffer = (offer: typeof distributorOffersTable.$inferSelect) => ({
  ...offer,
  wholesalePrice: parseFloat(offer.wholesalePrice),
});

router.get("/distributor-offers", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  let offers = await db.select().from(distributorOffersTable).orderBy(desc(distributorOffersTable.createdAt));
  if (req.query.mine === "true" && user) {
    offers = offers.filter((offer) => offer.distributorId === user.id);
  }
  res.json(offers.map(toOffer));
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

  const [offer] = await db.insert(distributorOffersTable).values({
    ...parsed.data,
    distributorId: user.id,
    distributorName: user.name,
    wholesalePrice: parsed.data.wholesalePrice.toString(),
  }).returning();

  res.status(201).json(toOffer(offer));
});

router.patch("/distributor-offers/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "يجب تسجيل الدخول" });
    return;
  }

  const id = parseInt(req.params.id as string, 10);
  const [existing] = await db.select().from(distributorOffersTable).where(eq(distributorOffersTable.id, id));
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

  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.wholesalePrice !== undefined) updates.wholesalePrice = parsed.data.wholesalePrice.toString();

  const [offer] = await db.update(distributorOffersTable).set(updates).where(eq(distributorOffersTable.id, id)).returning();
  res.json(toOffer(offer));
});

export default router;