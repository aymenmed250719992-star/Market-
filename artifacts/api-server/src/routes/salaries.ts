import { Router, type IRouter } from "express";
import { nextId, tsToDate } from "../lib/firebase";
import { salariesCache, usersCache } from "../lib/cache";
import { CreateSalaryRecordBody, ListSalariesQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

function toSalary(id: number, data: any) {
  return {
    ...data,
    id,
    createdAt: tsToDate(data.createdAt),
    paidAt: tsToDate(data.paidAt),
    baseSalary: parseFloat(data.baseSalary),
    bonus: parseFloat(data.bonus),
    deduction: parseFloat(data.deduction),
    netSalary: parseFloat(data.netSalary),
  };
}

router.get("/salaries", async (req, res): Promise<void> => {
  const params = ListSalariesQueryParams.safeParse(req.query);
  let salaries = await salariesCache.all();
  salaries.sort((a, b) => +tsToDate(b.data.createdAt) - +tsToDate(a.data.createdAt));

  if (params.success) {
    if (params.data.userId) salaries = salaries.filter(({ data }) => data.userId === params.data.userId);
    if (params.data.month) salaries = salaries.filter(({ data }) => data.month === params.data.month);
  }
  res.json(salaries.map(({ id, data }) => toSalary(id, data)));
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

  const user = await usersCache.get(parsed.data.userId);

  const id = await nextId("salaries");
  const now = new Date();
  const data = {
    userId: parsed.data.userId,
    userName: user ? user.name : "موظف",
    userRole: user ? user.role : "worker",
    month: parsed.data.month,
    baseSalary: parsed.data.baseSalary.toString(),
    bonus: bonus.toString(),
    deduction: deduction.toString(),
    netSalary: netSalary.toString(),
    paid: parsed.data.paid ?? false,
    paidAt: parsed.data.paid ? now : null,
    notes: parsed.data.notes ?? null,
    createdAt: now,
  };
  await salariesCache.set(id, data);
  res.status(201).json(toSalary(id, data));
});

export default router;
