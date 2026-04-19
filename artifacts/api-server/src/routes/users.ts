import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const UserBody = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1).optional(),
  role: z.enum(["admin", "cashier", "buyer", "worker", "customer", "distributor"]),
  baseSalary: z.number().nullable().optional(),
  phone: z.string().nullable().optional(),
});

const CreateUserBody = UserBody.extend({
  password: z.string().min(1),
});

const UpdateUserBody = UserBody.partial();

router.get("/users", async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  res.json(
    users.map(({ password: _pw, ...u }) => ({
      ...u,
      baseSalary: u.baseSalary ? parseFloat(u.baseSalary) : null,
    }))
  );
});

router.post("/users", async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [user] = await db
    .insert(usersTable)
    .values({
      ...parsed.data,
      baseSalary: parsed.data.baseSalary?.toString(),
    })
    .returning();
  const { password: _pw, ...safeUser } = user;
  res.status(201).json({
    ...safeUser,
    baseSalary: safeUser.baseSalary ? parseFloat(safeUser.baseSalary) : null,
  });
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const { password: _pw, ...safeUser } = user;
  res.json({
    ...safeUser,
    baseSalary: safeUser.baseSalary ? parseFloat(safeUser.baseSalary) : null,
  });
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Record<string, unknown> = {};
  if (parsed.data.name != null) updates.name = parsed.data.name;
  if (parsed.data.email != null) updates.email = parsed.data.email;
  if (parsed.data.password != null) updates.password = parsed.data.password;
  if (parsed.data.role != null) updates.role = parsed.data.role;
  if (parsed.data.baseSalary !== undefined) updates.baseSalary = parsed.data.baseSalary?.toString();
  if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone;

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const { password: _pw, ...safeUser } = user;
  res.json({
    ...safeUser,
    baseSalary: safeUser.baseSalary ? parseFloat(safeUser.baseSalary) : null,
  });
});

router.delete("/users/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [user] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
