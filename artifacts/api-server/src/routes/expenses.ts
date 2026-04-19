import { Router, type IRouter } from "express";
import { db, expensesTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const toExpense = (e: typeof expensesTable.$inferSelect) => ({
  ...e,
  amount: parseFloat(e.amount),
  dailyAmount: e.dailyAmount ? parseFloat(e.dailyAmount) : null,
});

const CreateExpenseBody = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  amount: z.number().positive(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  type: z.enum(["monthly", "daily", "one_time"]).default("monthly"),
  daysInMonth: z.number().int().min(1).max(31).optional(),
  notes: z.string().optional(),
});

function calcDailyAmount(type: string, amount: number, daysInMonth: number): number | null {
  if (type === "monthly") return amount / daysInMonth;
  if (type === "daily") return amount;
  return null; // one_time — not amortized
}

router.get("/expenses", async (req, res): Promise<void> => {
  const month = req.query.month as string | undefined;
  let expenses = await db
    .select()
    .from(expensesTable)
    .orderBy(sql`${expensesTable.createdAt} desc`);

  if (month) expenses = expenses.filter((e) => e.month === month);
  res.json(expenses.map(toExpense));
});

// Get total daily allocated expenses for today / a specific date
router.get("/expenses/daily-total", async (req, res): Promise<void> => {
  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
  const expenses = await db.select().from(expensesTable);
  const monthExpenses = expenses.filter((e) => e.month === month);

  const total = monthExpenses.reduce((sum, e) => {
    const daily = e.dailyAmount ? parseFloat(e.dailyAmount) : 0;
    return sum + daily;
  }, 0);

  res.json({ month, dailyTotal: total });
});

router.post("/expenses", async (req, res): Promise<void> => {
  const parsed = CreateExpenseBody.safeParse(req.body);
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
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.id));
      if (user) addedByName = user.name;
    } catch {}
  }

  const days = parsed.data.daysInMonth ?? 30;
  const dailyAmount = calcDailyAmount(parsed.data.type, parsed.data.amount, days);

  const [expense] = await db
    .insert(expensesTable)
    .values({
      ...parsed.data,
      amount: parsed.data.amount.toString(),
      daysInMonth: days,
      dailyAmount: dailyAmount !== null ? dailyAmount.toString() : null,
      addedById,
      addedByName,
    })
    .returning();

  res.status(201).json(toExpense(expense));
});

router.delete("/expenses/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const [expense] = await db.delete(expensesTable).where(eq(expensesTable.id, id)).returning();
  if (!expense) {
    res.status(404).json({ error: "المصروف غير موجود" });
    return;
  }
  res.sendStatus(204);
});

export default router;
