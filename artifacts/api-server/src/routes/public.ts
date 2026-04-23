import { Router, type IRouter } from "express";
import { productsCacheApi } from "./products";
import { distributorOffersCache } from "../lib/cache";

const router: IRouter = Router();

// Public daily offers — no auth required, safe data only
router.get("/public/offers", async (_req, res): Promise<void> => {
  const all = await productsCacheApi.all();
  const featured = all
    .map(({ raw: p }: any) => ({
      id: p.id ?? null,
      name: p.name,
      barcode: p.barcode,
      category: p.category,
      retailPrice: Number(p.retailPrice ?? 0),
      shelfStock: Number(p.shelfStock ?? 0),
    }))
    .filter((p: any) => p.shelfStock > 0 && p.retailPrice > 0)
    .sort(() => Math.random() - 0.5)
    .slice(0, 24);

  const offers = await distributorOffersCache.all();
  const distributorOffers = offers
    .map(({ id, data }: any) => ({ id, ...data }))
    .filter((o: any) => o.status === "approved" || o.status === "active")
    .slice(0, 10);

  res.json({ featured, distributorOffers, generatedAt: new Date().toISOString() });
});

export default router;
