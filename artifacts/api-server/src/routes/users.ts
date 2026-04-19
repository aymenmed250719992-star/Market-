import { Router, type IRouter } from "express";
import { firestore, nextId, tsToDate } from "../lib/firebase";
import { z } from "zod";

const router: IRouter = Router();

const UserBody = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1).optional(),
  role: z.enum(["admin", "cashier", "buyer", "worker", "customer", "distributor"]),
  baseSalary: z.number().nullable().optional(),
  phone: z.string().nullable().optional(),
  employeeBarcode: z.string().nullable().optional(),
});

const CreateUserBody = UserBody.extend({ password: z.string().min(1) });
const UpdateUserBody = UserBody.partial();

function toUser(id: number, data: any) {
  const { password: _pw, ...rest } = data;
  return {
    ...rest,
    id,
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
    baseSalary: data.baseSalary != null ? parseFloat(data.baseSalary) : null,
  };
}

router.get("/users", async (_req, res): Promise<void> => {
  const snap = await firestore.collection("users").orderBy("createdAt").get();
  res.json(snap.docs.map((d) => toUser(parseInt(d.id, 10), d.data())));
});

router.post("/users", async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = await nextId("users");
  const now = new Date();
  const data = {
    ...parsed.data,
    baseSalary: parsed.data.baseSalary?.toString() ?? null,
    activityPoints: 0,
    createdAt: now,
    updatedAt: now,
  };
  await firestore.collection("users").doc(String(id)).set(data);
  res.status(201).json(toUser(id, data));
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const snap = await firestore.collection("users").doc(id).get();
  if (!snap.exists) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(toUser(parseInt(snap.id, 10), snap.data()!));
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const snap = await firestore.collection("users").doc(id).get();
  if (!snap.exists) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const d = parsed.data;
  if (d.name != null) updates.name = d.name;
  if (d.email != null) updates.email = d.email;
  if (d.password != null) updates.password = d.password;
  if (d.role != null) updates.role = d.role;
  if (d.baseSalary !== undefined) updates.baseSalary = d.baseSalary?.toString() ?? null;
  if (d.phone !== undefined) updates.phone = d.phone ?? null;
  if (d.employeeBarcode !== undefined) updates.employeeBarcode = d.employeeBarcode ?? null;

  await firestore.collection("users").doc(id).update(updates);
  const updated = await firestore.collection("users").doc(id).get();
  res.json(toUser(parseInt(updated.id, 10), updated.data()!));
});

router.delete("/users/:id", async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const snap = await firestore.collection("users").doc(id).get();
  if (!snap.exists) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await firestore.collection("users").doc(id).delete();
  res.sendStatus(204);
});

export default router;
