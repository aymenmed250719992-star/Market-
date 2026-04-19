import { Router, type IRouter } from "express";
import { firestore, nextId, tsToDate } from "../lib/firebase";
import { z } from "zod";

const router: IRouter = Router();

function toAdvance(id: number, data: any) {
  return {
    ...data,
    id,
    createdAt: tsToDate(data.createdAt),
    amount: parseFloat(data.amount),
  };
}

const CreateAdvanceBody = z.object({
  userId: z.number().int(),
  type: z.enum(["advance", "penalty"]),
  amount: z.number().positive(),
  reason: z.string().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

router.get("/advances", async (req, res): Promise<void> => {
  const snap = await firestore.collection("advances").orderBy("createdAt", "desc").get();
  let advances = snap.docs.map((d) => ({ raw: d.data(), id: parseInt(d.id, 10) }));

  const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
  const month = req.query.month as string | undefined;
  const type = req.query.type as string | undefined;
  if (userId) advances = advances.filter(({ raw }) => raw.userId === userId);
  if (month) advances = advances.filter(({ raw }) => raw.month === month);
  if (type) advances = advances.filter(({ raw }) => raw.type === type);

  res.json(advances.map(({ raw, id }) => toAdvance(id, raw)));
});

router.get("/advances/summary/:month", async (req, res): Promise<void> => {
  const month = req.params.month as string;
  const snap = await firestore.collection("advances").get();
  const monthData = snap.docs.filter((d) => d.data().month === month);

  const summary: Record<number, { userId: number; userName: string; totalAdvances: number; totalPenalties: number; net: number }> = {};
  for (const doc of monthData) {
    const a = doc.data();
    if (!summary[a.userId]) {
      summary[a.userId] = { userId: a.userId, userName: a.userName, totalAdvances: 0, totalPenalties: 0, net: 0 };
    }
    const amt = parseFloat(a.amount);
    if (a.type === "advance") summary[a.userId].totalAdvances += amt;
    else summary[a.userId].totalPenalties += amt;
    summary[a.userId].net = summary[a.userId].totalAdvances + summary[a.userId].totalPenalties;
  }
  res.json(Object.values(summary));
});

router.post("/advances", async (req, res): Promise<void> => {
  const parsed = CreateAdvanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }

  const token = req.cookies?.session ?? req.headers.authorization?.replace("Bearer ", "");
  let addedById: number | null = null;
  let addedByName = "أدمن";
  if (token) {
    try {
      const payload = JSON.parse(Buffer.from(token, "base64").toString());
      addedById = payload.id;
      const adminSnap = await firestore.collection("users").doc(String(payload.id)).get();
      if (adminSnap.exists) addedByName = adminSnap.data()!.name;
    } catch {}
  }

  const userSnap = await firestore.collection("users").doc(String(parsed.data.userId)).get();
  if (!userSnap.exists) {
    res.status(404).json({ error: "الموظف غير موجود" });
    return;
  }

  const id = await nextId("advances");
  const now = new Date();
  const data = {
    ...parsed.data,
    userName: userSnap.data()!.name,
    amount: parsed.data.amount.toString(),
    addedById,
    addedByName,
    deductedFromPayroll: false,
    createdAt: now,
  };
  await firestore.collection("advances").doc(String(id)).set(data);
  res.status(201).json(toAdvance(id, data));
});

router.patch("/advances/:id/mark-deducted", async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const snap = await firestore.collection("advances").doc(id).get();
  if (!snap.exists) {
    res.status(404).json({ error: "السجل غير موجود" });
    return;
  }
  await firestore.collection("advances").doc(id).update({ deductedFromPayroll: true });
  const updated = await firestore.collection("advances").doc(id).get();
  res.json(toAdvance(parseInt(updated.id, 10), updated.data()!));
});

router.delete("/advances/:id", async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const snap = await firestore.collection("advances").doc(id).get();
  if (!snap.exists) {
    res.status(404).json({ error: "السجل غير موجود" });
    return;
  }
  await firestore.collection("advances").doc(id).delete();
  res.sendStatus(204);
});

export default router;
