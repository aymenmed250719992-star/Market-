import { Router, type IRouter } from "express";
import { firestore, nextId, tsToDate } from "../lib/firebase";
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
  };
}

router.get("/customers", async (_req, res): Promise<void> => {
  const snap = await firestore.collection("customers").orderBy("name").get();
  res.json(snap.docs.map((d) => toCustomer(parseInt(d.id, 10), d.data())));
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
    createdAt: now,
    updatedAt: now,
  };
  await firestore.collection("customers").doc(String(id)).set(data);
  res.status(201).json(toCustomer(id, data));
});

router.get("/customers/:id", async (req, res): Promise<void> => {
  const snap = await firestore.collection("customers").doc(req.params.id as string).get();
  if (!snap.exists) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json(toCustomer(parseInt(snap.id, 10), snap.data()!));
});

router.patch("/customers/:id", async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const snap = await firestore.collection("customers").doc(id).get();
  if (!snap.exists) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const d = parsed.data;
  if (d.name != null) updates.name = d.name;
  if (d.phone !== undefined) updates.phone = d.phone ?? null;
  if (d.address !== undefined) updates.address = d.address ?? null;
  if (d.creditLimit != null) updates.creditLimit = d.creditLimit.toString();

  await firestore.collection("customers").doc(id).update(updates);
  const updated = await firestore.collection("customers").doc(id).get();
  res.json(toCustomer(parseInt(updated.id, 10), updated.data()!));
});

router.post("/customers/:id/pay-debt", async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const parsed = PayCustomerDebtBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const snap = await firestore.collection("customers").doc(id).get();
  if (!snap.exists) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  const customer = snap.data()!;
  const newDebt = Math.max(0, parseFloat(customer.totalDebt) - parsed.data.amount);
  await firestore.collection("customers").doc(id).update({ totalDebt: newDebt.toString(), updatedAt: new Date() });
  const updated = await firestore.collection("customers").doc(id).get();
  res.json(toCustomer(parseInt(updated.id, 10), updated.data()!));
});

export default router;
