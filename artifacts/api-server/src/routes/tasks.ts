import { Router, type IRouter } from "express";
import { nextId, tsToDate, FieldValue } from "../lib/firebase";
import { tasksCache, usersCache } from "../lib/cache";
import { z } from "zod";

const router: IRouter = Router();

function toTask(id: number, data: any) {
  return {
    ...data,
    id,
    createdAt: tsToDate(data.createdAt),
    completedAt: tsToDate(data.completedAt),
    approvedAt: tsToDate(data.approvedAt),
  };
}

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

const CompleteTaskBody = z.object({ notes: z.string().optional() });
const ApproveTaskBody = z.object({ approved: z.boolean(), notes: z.string().optional() });

router.get("/tasks", async (req, res): Promise<void> => {
  let tasks = await tasksCache.all();
  tasks.sort((a, b) => +tsToDate(b.data.createdAt) - +tsToDate(a.data.createdAt));

  const { status, type, assignedToId } = req.query as Record<string, string | undefined>;
  if (status) tasks = tasks.filter(({ data }) => data.status === status);
  if (type) tasks = tasks.filter(({ data }) => data.type === type);
  if (assignedToId) tasks = tasks.filter(({ data }) => data.assignedToId === parseInt(assignedToId, 10));

  res.json(tasks.map(({ id, data }) => toTask(id, data)));
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }

  const token = req.cookies?.session ?? req.headers.authorization?.replace("Bearer ", "");
  let reportedById: number | null = null;
  let reportedByName = "موظف";
  if (token) {
    try {
      const payload = JSON.parse(Buffer.from(token, "base64").toString());
      reportedById = payload.id;
      const user = await usersCache.get(payload.id);
      if (user) reportedByName = user.name;
    } catch {}
  }

  let assignedToName: string | null = null;
  if (parsed.data.assignedToId) {
    const assignee = await usersCache.get(parsed.data.assignedToId);
    if (assignee) assignedToName = assignee.name;
  }

  const id = await nextId("tasks");
  const now = new Date();
  const data = {
    ...parsed.data,
    reportedById,
    reportedByName,
    assignedToName,
    status: "pending",
    approvedById: null,
    approvedByName: null,
    approvedAt: null,
    completedAt: null,
    createdAt: now,
  };
  await tasksCache.set(id, data);
  res.status(201).json(toTask(id, data));
});

router.patch("/tasks/:id/complete", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const parsed = CompleteTaskBody.safeParse(req.body);
  const existing = await tasksCache.get(idNum);
  if (!existing) {
    res.status(404).json({ error: "المهمة غير موجودة" });
    return;
  }
  const merged = await tasksCache.update(idNum, {
    status: "completed",
    notes: parsed.success && parsed.data.notes ? parsed.data.notes : null,
    completedAt: new Date(),
  });
  res.json(toTask(idNum, merged ?? existing));
});

router.patch("/tasks/:id/approve", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const parsed = ApproveTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }

  const existing = await tasksCache.get(idNum);
  if (!existing) {
    res.status(404).json({ error: "المهمة غير موجودة" });
    return;
  }

  const token = req.cookies?.session ?? req.headers.authorization?.replace("Bearer ", "");
  let approvedById: number | null = null;
  let approvedByName = "أدمن";
  if (token) {
    try {
      const payload = JSON.parse(Buffer.from(token, "base64").toString());
      approvedById = payload.id;
      const user = await usersCache.get(payload.id);
      if (user) approvedByName = user.name;
    } catch {}
  }

  const newStatus = parsed.data.approved ? "approved" : "rejected";
  const merged = await tasksCache.update(idNum, {
    status: newStatus,
    approvedById,
    approvedByName,
    approvedAt: new Date(),
    notes: parsed.data.notes ?? existing.notes ?? null,
  });

  if (parsed.data.approved && existing.points > 0 && existing.assignedToId) {
    await usersCache.update(existing.assignedToId, {
      activityPoints: FieldValue.increment(existing.points),
    });
  }

  res.json(toTask(idNum, merged ?? existing));
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const existing = await tasksCache.get(idNum);
  if (!existing) {
    res.status(404).json({ error: "المهمة غير موجودة" });
    return;
  }
  await tasksCache.delete(idNum);
  res.sendStatus(204);
});

export default router;
