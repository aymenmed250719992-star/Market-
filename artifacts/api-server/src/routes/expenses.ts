import { Router, type IRouter } from "express";
import { nextId, tsToDate } from "../lib/firebase";
import { expensesCache, usersCache } from "../lib/cache";
import { z } from "zod";

const router: IRouter = Router();

function toExpense(id: number, data: any) {
  return {
    ...data,
    id,
    createdAt: tsToDate(data.createdAt),
    amount: parseFloat(data.amount),
    dailyAmount: data.dailyAmount != null ? parseFloat(data.dailyAmount) : null,
  };
}

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
  return null;
}

router.get("/expenses", async (req, res): Promise<void> => {
  let expenses = await expensesCache.all();
  expenses.sort((a, b) => +tsToDate(b.data.createdAt) - +tsToDate(a.data.createdAt));
  const month = req.query.month as string | undefined;
  if (month) expenses = expenses.filter(({ data }) => data.month === month);
  res.json(expenses.map(({ id, data }) => toExpense(id, data)));
});

router.get("/expenses/daily-total", async (req, res): Promise<void> => {
  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
  const all = await expensesCache.all();
  const monthExpenses = all.filter(({ data }) => data.month === month);
  const total = monthExpenses.reduce((sum, { data }) => {
    const daily = data.dailyAmount ? parseFloat(data.dailyAmount) : 0;
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
      const user = await usersCache.get(payload.id);
      if (user) addedByName = user.name;
    } catch {}
  }

  const days = parsed.data.daysInMonth ?? 30;
  const dailyAmount = calcDailyAmount(parsed.data.type, parsed.data.amount, days);
  const id = await nextId("expenses");
  const now = new Date();
  const data = {
    ...parsed.data,
    amount: parsed.data.amount.toString(),
    daysInMonth: days,
    dailyAmount: dailyAmount !== null ? dailyAmount.toString() : null,
    addedById,
    addedByName,
    createdAt: now,
  };
  await expensesCache.set(id, data);
  res.status(201).json(toExpense(id, data));
});

router.delete("/expenses/:id", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const existing = await expensesCache.get(idNum);
  if (!existing) {
    res.status(404).json({ error: "المصروف غير موجود" });
    return;
  }
  await expensesCache.delete(idNum);
  res.sendStatus(204);
});

export default router;
