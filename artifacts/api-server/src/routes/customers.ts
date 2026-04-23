import { Router, type IRouter } from "express";
import { nextId, tsToDate } from "../lib/firebase";
import { customersCache } from "../lib/cache";
import { CreateCustomerBody, UpdateCustomerBody, PayCustomerDebtBody } from "@workspace/api-zod";

const router: IRouter = Router();

function toCustomer(id: number, data: any) {
  return {
    ...data,
    id,
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
    creditLimit: parseFloat(data.creditLimit),
    totalDebt: parseFloat(data.totalDebt),
    loyaltyPoints: Number(data.loyaltyPoints ?? 0),
  };
}

router.get("/customers", async (_req, res): Promise<void> => {
  const all = await customersCache.all();
  all.sort((a, b) => String(a.data.name ?? "").localeCompare(String(b.data.name ?? "")));
  res.json(all.map(({ id, data }) => toCustomer(id, data)));
});

router.post("/customers", async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = await nextId("customers");
  const now = new Date();
  const data = {
    ...parsed.data,
    creditLimit: (parsed.data.creditLimit ?? 2000).toString(),
    totalDebt: "0",
    loyaltyPoints: 0,
    createdAt: now,
    updatedAt: now,
  };
  await customersCache.set(id, data);
  res.status(201).json(toCustomer(id, data));
});

router.get("/customers/:id", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const data = await customersCache.get(idNum);
  if (!data) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json(toCustomer(idNum, data));
});

router.patch("/customers/:id", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await customersCache.get(idNum);
  if (!existing) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const d = parsed.data;
  if (d.name != null) updates.name = d.name;
  if (d.phone !== undefined) updates.phone = d.phone ?? null;
  if (d.address !== undefined) updates.address = d.address ?? null;
  if (d.creditLimit != null) updates.creditLimit = d.creditLimit.toString();

  const merged = await customersCache.update(idNum, updates);
  res.json(toCustomer(idNum, merged ?? { ...existing, ...updates }));
});

router.post("/customers/:id/pay-debt", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const parsed = PayCustomerDebtBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const customer = await customersCache.get(idNum);
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  const newDebt = Math.max(0, parseFloat(customer.totalDebt) - parsed.data.amount);
  const merged = await customersCache.update(idNum, { totalDebt: newDebt.toString(), updatedAt: new Date() });
  res.json(toCustomer(idNum, merged ?? { ...customer, totalDebt: newDebt.toString() }));
});

export default router;
