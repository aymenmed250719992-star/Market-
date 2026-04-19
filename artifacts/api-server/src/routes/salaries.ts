import { Router, type IRouter } from "express";
import { firestore, nextId, tsToDate } from "../lib/firebase";
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
  const snap = await firestore.collection("salaries").orderBy("createdAt", "desc").get();
  let salaries = snap.docs.map((d) => ({ raw: d.data(), id: parseInt(d.id, 10) }));

  if (params.success) {
    if (params.data.userId) salaries = salaries.filter(({ raw }) => raw.userId === params.data.userId);
    if (params.data.month) salaries = salaries.filter(({ raw }) => raw.month === params.data.month);
  }
  res.json(salaries.map(({ raw, id }) => toSalary(id, raw)));
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

  const userSnap = await firestore.collection("users").doc(String(parsed.data.userId)).get();

  const id = await nextId("salaries");
  const now = new Date();
  const data = {
    userId: parsed.data.userId,
    userName: userSnap.exists ? userSnap.data()!.name : "موظف",
    userRole: userSnap.exists ? userSnap.data()!.role : "worker",
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
  await firestore.collection("salaries").doc(String(id)).set(data);
  res.status(201).json(toSalary(id, data));
});

export default router;
