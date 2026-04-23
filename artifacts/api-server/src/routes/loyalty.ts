import { Router, type IRouter } from "express";
import { z } from "zod";
import { customersCache } from "../lib/cache";
import { tsToDate } from "../lib/firebase";
import { getRequestUser, logAudit } from "../lib/audit";

const router: IRouter = Router();

// 1 point per 100 DZD spent. 1 point = 1 DZD discount when redeemed.
export const LOYALTY_POINTS_PER_DZD = 1 / 100;
export const LOYALTY_REDEEM_RATE = 1;

export function calcEarnedPoints(amount: number): number {
  return Math.floor(amount * LOYALTY_POINTS_PER_DZD);
}

export async function awardCustomerPoints(customerId: number, amount: number): Promise<number> {
  const customer = await customersCache.get(customerId);
  if (!customer) return 0;
  const points = calcEarnedPoints(amount);
  if (points <= 0) return 0;
  const current = Number(customer.loyaltyPoints ?? 0);
  await customersCache.update(customerId, {
    loyaltyPoints: current + points,
    updatedAt: new Date(),
  });
  return points;
}

const RedeemBody = z.object({
  points: z.number().int().positive(),
  note: z.string().optional(),
});

router.post("/customers/:id/redeem-points", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user || !["admin", "cashier"].includes(user.data.role)) {
    res.status(403).json({ error: "غير مسموح" });
    return;
  }
  const idNum = parseInt(req.params.id as string, 10);
  const parsed = RedeemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }
  const customer = await customersCache.get(idNum);
  if (!customer) {
    res.status(404).json({ error: "الزبون غير موجود" });
    return;
  }
  const current = Number(customer.loyaltyPoints ?? 0);
  if (parsed.data.points > current) {
    res.status(400).json({ error: "النقاط غير كافية" });
    return;
  }
  const remaining = current - parsed.data.points;
  await customersCache.update(idNum, {
    loyaltyPoints: remaining,
    updatedAt: new Date(),
  });
  await logAudit(req, "redeem", "loyalty", idNum, {
    points: parsed.data.points,
    note: parsed.data.note ?? null,
  });
  res.json({
    customerId: idNum,
    redeemed: parsed.data.points,
    discount: parsed.data.points * LOYALTY_REDEEM_RATE,
    loyaltyPoints: remaining,
  });
});

router.get("/loyalty/info", async (_req, res): Promise<void> => {
  res.json({
    pointsPerDzd: LOYALTY_POINTS_PER_DZD,
    redeemRate: LOYALTY_REDEEM_RATE,
    description: "تكسب نقطة واحدة لكل 100 دج. كل نقطة = 1 دج خصم عند الاستبدال.",
  });
});

router.get("/customers/:id/loyalty", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const customer = await customersCache.get(idNum);
  if (!customer) {
    res.status(404).json({ error: "الزبون غير موجود" });
    return;
  }
  res.json({
    customerId: idNum,
    loyaltyPoints: Number(customer.loyaltyPoints ?? 0),
    updatedAt: tsToDate(customer.updatedAt),
  });
});

export default router;
