import { Router, type IRouter } from "express";
import { db, shortagesTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateShortageBody, ResolveShortageBody } from "@workspace/api-zod";

const router: IRouter = Router();

const toShortage = (s: typeof shortagesTable.$inferSelect) => ({
  ...s,
  quantity: s.quantity ? parseFloat(s.quantity) : null,
});

router.get("/shortages", async (_req, res): Promise<void> => {
  const shortages = await db
    .select()
    .from(shortagesTable)
    .orderBy(sql`${shortagesTable.createdAt} desc`);
  res.json(shortages.map(toShortage));
});

router.post("/shortages", async (req, res): Promise<void> => {
  const parsed = CreateShortageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const token = req.cookies?.session ?? req.headers.authorization?.replace("Bearer ", "");
  let reportedById = 0;
  let reportedByName = "موظف";
  if (token) {
    try {
      const payload = JSON.parse(Buffer.from(token, "base64").toString());
      reportedById = payload.id;
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.id));
      if (user) reportedByName = user.name;
    } catch {}
  }

  const [shortage] = await db
    .insert(shortagesTable)
    .values({
      ...parsed.data,
      reportedById,
      reportedByName,
      quantity: parsed.data.quantity?.toString() ?? null,
    })
    .returning();
  res.status(201).json(toShortage(shortage));
});

router.patch("/shortages/:id/resolve", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = ResolveShortageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const token = req.cookies?.session ?? req.headers.authorization?.replace("Bearer ", "");
  let resolvedById: number | null = null;
  if (token) {
    try {
      const payload = JSON.parse(Buffer.from(token, "base64").toString());
      resolvedById = payload.id;
    } catch {}
  }

  const [shortage] = await db
    .update(shortagesTable)
    .set({
      status: parsed.data.status,
      resolvedById,
      resolvedAt: new Date(),
    })
    .where(eq(shortagesTable.id, id))
    .returning();
  if (!shortage) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  res.json(toShortage(shortage));
});

export default router;
