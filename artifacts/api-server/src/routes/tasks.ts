import { Router, type IRouter } from "express";
import { firestore, nextId, tsToDate } from "../lib/firebase";
import { FieldValue } from "firebase-admin/firestore";
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
  const snap = await firestore.collection("tasks").orderBy("createdAt", "desc").get();
  let tasks = snap.docs.map((d) => ({ raw: d.data(), id: parseInt(d.id, 10) }));

  const { status, type, assignedToId } = req.query as Record<string, string | undefined>;
  if (status) tasks = tasks.filter(({ raw }) => raw.status === status);
  if (type) tasks = tasks.filter(({ raw }) => raw.type === type);
  if (assignedToId) tasks = tasks.filter(({ raw }) => raw.assignedToId === parseInt(assignedToId, 10));

  res.json(tasks.map(({ raw, id }) => toTask(id, raw)));
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
      const userSnap = await firestore.collection("users").doc(String(payload.id)).get();
      if (userSnap.exists) reportedByName = userSnap.data()!.name;
    } catch {}
  }

  let assignedToName: string | null = null;
  if (parsed.data.assignedToId) {
    const assigneeSnap = await firestore.collection("users").doc(String(parsed.data.assignedToId)).get();
    if (assigneeSnap.exists) assignedToName = assigneeSnap.data()!.name;
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
  await firestore.collection("tasks").doc(String(id)).set(data);
  res.status(201).json(toTask(id, data));
});

router.patch("/tasks/:id/complete", async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const parsed = CompleteTaskBody.safeParse(req.body);
  const snap = await firestore.collection("tasks").doc(id).get();
  if (!snap.exists) {
    res.status(404).json({ error: "المهمة غير موجودة" });
    return;
  }
  await firestore.collection("tasks").doc(id).update({
    status: "completed",
    notes: parsed.success && parsed.data.notes ? parsed.data.notes : null,
    completedAt: new Date(),
  });
  const updated = await firestore.collection("tasks").doc(id).get();
  res.json(toTask(parseInt(updated.id, 10), updated.data()!));
});

router.patch("/tasks/:id/approve", async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const parsed = ApproveTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }

  const snap = await firestore.collection("tasks").doc(id).get();
  if (!snap.exists) {
    res.status(404).json({ error: "المهمة غير موجودة" });
    return;
  }
  const existing = snap.data()!;

  const token = req.cookies?.session ?? req.headers.authorization?.replace("Bearer ", "");
  let approvedById: number | null = null;
  let approvedByName = "أدمن";
  if (token) {
    try {
      const payload = JSON.parse(Buffer.from(token, "base64").toString());
      approvedById = payload.id;
      const userSnap = await firestore.collection("users").doc(String(payload.id)).get();
      if (userSnap.exists) approvedByName = userSnap.data()!.name;
    } catch {}
  }

  const newStatus = parsed.data.approved ? "approved" : "rejected";
  await firestore.collection("tasks").doc(id).update({
    status: newStatus,
    approvedById,
    approvedByName,
    approvedAt: new Date(),
    notes: parsed.data.notes ?? existing.notes ?? null,
  });

  if (parsed.data.approved && existing.points > 0 && existing.assignedToId) {
    await firestore.collection("users").doc(String(existing.assignedToId)).update({
      activityPoints: FieldValue.increment(existing.points),
    });
  }

  const updated = await firestore.collection("tasks").doc(id).get();
  res.json(toTask(parseInt(updated.id, 10), updated.data()!));
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const snap = await firestore.collection("tasks").doc(id).get();
  if (!snap.exists) {
    res.status(404).json({ error: "المهمة غير موجودة" });
    return;
  }
  await firestore.collection("tasks").doc(id).delete();
  res.sendStatus(204);
});

export default router;
