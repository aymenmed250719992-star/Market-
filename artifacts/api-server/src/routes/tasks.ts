import { Router, type IRouter } from "express";
import { db, tasksTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const toTask = (t: typeof tasksTable.$inferSelect) => ({ ...t });

const CreateTaskBody = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assignedToId: z.number().int().optional(),
  type: z.enum(["restock", "report", "damage", "other"]).default("other"),
  points: z.number().int().min(0).default(0),
  productId: z.number().int().optional(),
  productName: z.string().optional(),
  notes: z.string().optional(),
});

const CompleteTaskBody = z.object({
  notes: z.string().optional(),
});

const ApproveTaskBody = z.object({
  approved: z.boolean(),
  notes: z.string().optional(),
});

router.get("/tasks", async (req, res): Promise<void> => {
  const status = req.query.status as string | undefined;
  const type = req.query.type as string | undefined;
  const assignedToId = req.query.assignedToId ? parseInt(req.query.assignedToId as string) : undefined;

  let tasks = await db
    .select()
    .from(tasksTable)
    .orderBy(sql`${tasksTable.createdAt} desc`);

  if (status) tasks = tasks.filter((t) => t.status === status);
  if (type) tasks = tasks.filter((t) => t.type === type);
  if (assignedToId) tasks = tasks.filter((t) => t.assignedToId === assignedToId);

  res.json(tasks.map(toTask));
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }

  const token = req.cookies?.session ?? req.headers.authorization?.replace("Bearer ", "");
  let reportedById: number | undefined;
  let reportedByName = "موظف";
  if (token) {
    try {
      const payload = JSON.parse(Buffer.from(token, "base64").toString());
      reportedById = payload.id;
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.id));
      if (user) reportedByName = user.name;
    } catch {}
  }

  let assignedToName: string | undefined;
  if (parsed.data.assignedToId) {
    const [assignee] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.assignedToId));
    if (assignee) assignedToName = assignee.name;
  }

  const [task] = await db
    .insert(tasksTable)
    .values({
      ...parsed.data,
      reportedById: reportedById ?? null,
      reportedByName,
      assignedToName: assignedToName ?? null,
      status: "pending",
    })
    .returning();
  res.status(201).json(toTask(task));
});

// Worker marks task as completed
router.patch("/tasks/:id/complete", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const parsed = CompleteTaskBody.safeParse(req.body);

  const [task] = await db
    .update(tasksTable)
    .set({
      status: "completed",
      notes: parsed.success ? parsed.data.notes ?? null : null,
      completedAt: new Date(),
    })
    .where(eq(tasksTable.id, id))
    .returning();

  if (!task) {
    res.status(404).json({ error: "المهمة غير موجودة" });
    return;
  }
  res.json(toTask(task));
});

// Admin approves or rejects task (and awards/cancels points)
router.patch("/tasks/:id/approve", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const parsed = ApproveTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }

  const token = req.cookies?.session ?? req.headers.authorization?.replace("Bearer ", "");
  let approvedById: number | null = null;
  let approvedByName = "أدمن";
  if (token) {
    try {
      const payload = JSON.parse(Buffer.from(token, "base64").toString());
      approvedById = payload.id;
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.id));
      if (user) approvedByName = user.name;
    } catch {}
  }

  const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "المهمة غير موجودة" });
    return;
  }

  const newStatus = parsed.data.approved ? "approved" : "rejected";

  const [task] = await db
    .update(tasksTable)
    .set({
      status: newStatus,
      approvedById,
      approvedByName,
      approvedAt: new Date(),
      notes: parsed.data.notes ?? existing.notes,
    })
    .where(eq(tasksTable.id, id))
    .returning();

  // If approved and has points, add to worker's activity_points
  if (parsed.data.approved && existing.points && existing.points > 0 && existing.assignedToId) {
    await db
      .update(usersTable)
      .set({ activityPoints: sql`${usersTable.activityPoints} + ${existing.points}` })
      .where(eq(usersTable.id, existing.assignedToId));
  }

  res.json(toTask(task));
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const [task] = await db.delete(tasksTable).where(eq(tasksTable.id, id)).returning();
  if (!task) {
    res.status(404).json({ error: "المهمة غير موجودة" });
    return;
  }
  res.sendStatus(204);
});

export default router;
