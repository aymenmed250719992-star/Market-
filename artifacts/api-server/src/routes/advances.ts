import { Router, type IRouter } from "express";
import { db, advancesTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const toAdvance = (a: typeof advancesTable.$inferSelect) => ({
  ...a,
  amount: parseFloat(a.amount),
});

const CreateAdvanceBody = z.object({
  userId: z.number().int(),
  type: z.enum(["advance", "penalty"]),
  amount: z.number().positive(),
  reason: z.string().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

router.get("/advances", async (req, res): Promise<void> => {
  const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
  const month = req.query.month as string | undefined;
  const type = req.query.type as string | undefined;

  let advances = await db
    .select()
    .from(advancesTable)
    .orderBy(sql`${advancesTable.createdAt} desc`);

  if (userId) advances = advances.filter((a) => a.userId === userId);
  if (month) advances = advances.filter((a) => a.month === month);
  if (type) advances = advances.filter((a) => a.type === type);

  res.json(advances.map(toAdvance));
});

// Summary per employee per month
router.get("/advances/summary/:month", async (req, res): Promise<void> => {
  const month = req.params.month as string;
  const advances = await db.select().from(advancesTable);
  const monthData = advances.filter((a) => a.month === month);

  const summary: Record<number, { userId: number; userName: string; totalAdvances: number; totalPenalties: number; net: number }> = {};
  for (const a of monthData) {
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
      const [admin] = await db.select().from(usersTable).where(eq(usersTable.id, payload.id));
      if (admin) addedByName = admin.name;
    } catch {}
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.userId));
  if (!user) {
    res.status(404).json({ error: "الموظف غير موجود" });
    return;
  }

  const [advance] = await db
    .insert(advancesTable)
    .values({
      ...parsed.data,
      userName: user.name,
      amount: parsed.data.amount.toString(),
      addedById,
      addedByName,
    })
    .returning();

  res.status(201).json(toAdvance(advance));
});

router.patch("/advances/:id/mark-deducted", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const [advance] = await db
    .update(advancesTable)
    .set({ deductedFromPayroll: true })
    .where(eq(advancesTable.id, id))
    .returning();
  if (!advance) {
    res.status(404).json({ error: "السجل غير موجود" });
    return;
  }
  res.json(toAdvance(advance));
});

router.delete("/advances/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const [advance] = await db.delete(advancesTable).where(eq(advancesTable.id, id)).returning();
  if (!advance) {
    res.status(404).json({ error: "السجل غير موجود" });
    return;
  }
  res.sendStatus(204);
});

export default router;
