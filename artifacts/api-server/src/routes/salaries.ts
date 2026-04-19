import { Router, type IRouter } from "express";
import { db, salariesTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateSalaryRecordBody, ListSalariesQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

const toSalary = (s: typeof salariesTable.$inferSelect) => ({
  ...s,
  baseSalary: parseFloat(s.baseSalary),
  bonus: parseFloat(s.bonus),
  deduction: parseFloat(s.deduction),
  netSalary: parseFloat(s.netSalary),
});

router.get("/salaries", async (req, res): Promise<void> => {
  const params = ListSalariesQueryParams.safeParse(req.query);
  let salaries = await db
    .select()
    .from(salariesTable)
    .orderBy(sql`${salariesTable.createdAt} desc`);

  if (params.success) {
    if (params.data.userId) {
      salaries = salaries.filter((s) => s.userId === params.data.userId);
    }
    if (params.data.month) {
      salaries = salaries.filter((s) => s.month === params.data.month);
    }
  }

  res.json(salaries.map(toSalary));
});

router.post("/salaries", async (req, res): Promise<void> => {
  const parsed = CreateSalaryRecordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const bonus = parsed.data.bonus ?? 0;
  const deduction = parsed.data.deduction ?? 0;
  const netSalary = parsed.data.baseSalary + bonus - deduction;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.userId));

  const [salary] = await db
    .insert(salariesTable)
    .values({
      userId: parsed.data.userId,
      userName: user?.name ?? "موظف",
      userRole: user?.role ?? "worker",
      month: parsed.data.month,
      baseSalary: parsed.data.baseSalary.toString(),
      bonus: bonus.toString(),
      deduction: deduction.toString(),
      netSalary: netSalary.toString(),
      paid: parsed.data.paid ?? false,
      paidAt: parsed.data.paid ? new Date() : null,
      notes: parsed.data.notes ?? null,
    })
    .returning();
  res.status(201).json(toSalary(salary));
});

export default router;
