import { Router, type IRouter } from "express";
import { db, customersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateCustomerBody, UpdateCustomerBody, PayCustomerDebtBody } from "@workspace/api-zod";

const router: IRouter = Router();

const toCustomer = (c: typeof customersTable.$inferSelect) => ({
  ...c,
  creditLimit: parseFloat(c.creditLimit),
  totalDebt: parseFloat(c.totalDebt),
});

router.get("/customers", async (_req, res): Promise<void> => {
  const customers = await db.select().from(customersTable).orderBy(customersTable.name);
  res.json(customers.map(toCustomer));
});

router.post("/customers", async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [customer] = await db
    .insert(customersTable)
    .values({
      ...parsed.data,
      creditLimit: (parsed.data.creditLimit ?? 2000).toString(),
    })
    .returning();
  res.status(201).json(toCustomer(customer));
});

router.get("/customers/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json(toCustomer(customer));
});

router.patch("/customers/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Record<string, unknown> = {};
  const d = parsed.data;
  if (d.name != null) updates.name = d.name;
  if (d.phone !== undefined) updates.phone = d.phone;
  if (d.address !== undefined) updates.address = d.address;
  if (d.creditLimit != null) updates.creditLimit = d.creditLimit.toString();

  const [customer] = await db
    .update(customersTable)
    .set(updates)
    .where(eq(customersTable.id, id))
    .returning();
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json(toCustomer(customer));
});

router.post("/customers/:id/pay-debt", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = PayCustomerDebtBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  const newDebt = Math.max(0, parseFloat(customer.totalDebt) - parsed.data.amount);
  const [updated] = await db
    .update(customersTable)
    .set({ totalDebt: newDebt.toString() })
    .where(eq(customersTable.id, id))
    .returning();
  res.json(toCustomer(updated));
});

export default router;
