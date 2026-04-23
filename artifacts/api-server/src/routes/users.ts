import { Router, type IRouter } from "express";
import { nextId, tsToDate } from "../lib/firebase";
import { usersCache } from "../lib/cache";
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
  const all = await usersCache.all();
  all.sort((a, b) => +tsToDate(a.data.createdAt) - +tsToDate(b.data.createdAt));
  res.json(all.map(({ id, data }) => toUser(id, data)));
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
  await usersCache.set(id, data);
  res.status(201).json(toUser(id, data));
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const data = await usersCache.get(idNum);
  if (!data) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(toUser(idNum, data));
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await usersCache.get(idNum);
  if (!existing) {
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

  const merged = await usersCache.update(idNum, updates);
  res.json(toUser(idNum, merged ?? { ...existing, ...updates }));
});

router.delete("/users/:id", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const existing = await usersCache.get(idNum);
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await usersCache.delete(idNum);
  res.sendStatus(204);
});

export default router;
