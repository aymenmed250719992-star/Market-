import { Router, type IRouter } from "express";
import { nextId, tsToDate } from "../lib/firebase";
import { advancesCache, usersCache } from "../lib/cache";
import { z } from "zod";

const router: IRouter = Router();

function toAdvance(id: number, data: any) {
  return {
    ...data,
    id,
    createdAt: tsToDate(data.createdAt),
    amount: parseFloat(data.amount),
  };
}

const CreateAdvanceBody = z.object({
  userId: z.number().int(),
  type: z.enum(["advance", "penalty"]),
  amount: z.number().positive(),
  reason: z.string().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

router.get("/advances", async (req, res): Promise<void> => {
  let advances = await advancesCache.all();
  advances.sort((a, b) => +tsToDate(b.data.createdAt) - +tsToDate(a.data.createdAt));

  const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
  const month = req.query.month as string | undefined;
  const type = req.query.type as string | undefined;
  if (userId) advances = advances.filter(({ data }) => data.userId === userId);
  if (month) advances = advances.filter(({ data }) => data.month === month);
  if (type) advances = advances.filter(({ data }) => data.type === type);

  res.json(advances.map(({ id, data }) => toAdvance(id, data)));
});

router.get("/advances/summary/:month", async (req, res): Promise<void> => {
  const month = req.params.month as string;
  const all = await advancesCache.all();
  const monthData = all.filter(({ data }) => data.month === month);

  const summary: Record<number, { userId: number; userName: string; totalAdvances: number; totalPenalties: number; net: number }> = {};
  for (const { data: a } of monthData) {
    if (!summary[a.userId]) {
      summary[a.userId] = { userId: a.userId, userName: a.userName, totalAdvances: 0, totalPenalties: 0, net: 0 };
    }
    const amt = parseFloat(a.amount);
    if (a.type === "advance") summary[a.userId].totalAdvances += amt;
    else summary[a.userId].totalPenalties += amt;
    summary[a.userId].net = summary[a.userId].totalAdvances + summary[a.userId].totalPenalties;
  }
  res.json(Object.values(summary));
});

router.post("/advances", async (req, res): Promise<void> => {
  const parsed = CreateAdvanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }

  const token = req.cookies?.session ?? req.headers.authorization?.replace("Bearer ", "");
  let addedById: number | null = null;
  let addedByName = "أدمن";
  if (token) {
    try {
      const payload = JSON.parse(Buffer.from(token, "base64").toString());
      addedById = payload.id;
      const admin = await usersCache.get(payload.id);
      if (admin) addedByName = admin.name;
    } catch {}
  }

  const targetUser = await usersCache.get(parsed.data.userId);
  if (!targetUser) {
    res.status(404).json({ error: "الموظف غير موجود" });
    return;
  }

  const id = await nextId("advances");
  const now = new Date();
  const data = {
    ...parsed.data,
    userName: targetUser.name,
    amount: parsed.data.amount.toString(),
    addedById,
    addedByName,
    deductedFromPayroll: false,
    createdAt: now,
  };
  await advancesCache.set(id, data);
  res.status(201).json(toAdvance(id, data));
});

router.patch("/advances/:id/mark-deducted", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const existing = await advancesCache.get(idNum);
  if (!existing) {
    res.status(404).json({ error: "السجل غير موجود" });
    return;
  }
  const merged = await advancesCache.update(idNum, { deductedFromPayroll: true });
  res.json(toAdvance(idNum, merged ?? { ...existing, deductedFromPayroll: true }));
});

router.delete("/advances/:id", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const existing = await advancesCache.get(idNum);
  if (!existing) {
    res.status(404).json({ error: "السجل غير موجود" });
    return;
  }
  await advancesCache.delete(idNum);
  res.sendStatus(204);
});

export default router;
