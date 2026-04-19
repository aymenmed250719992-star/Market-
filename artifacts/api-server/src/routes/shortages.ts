import { Router, type IRouter } from "express";
import { firestore, nextId, tsToDate } from "../lib/firebase";
import { CreateShortageBody, ResolveShortageBody } from "@workspace/api-zod";

const router: IRouter = Router();

function toShortage(id: number, data: any) {
  return {
    ...data,
    id,
    createdAt: tsToDate(data.createdAt),
    resolvedAt: tsToDate(data.resolvedAt),
    quantity: data.quantity != null ? parseFloat(data.quantity) : null,
  };
}

router.get("/shortages", async (_req, res): Promise<void> => {
  const snap = await firestore.collection("shortages").orderBy("createdAt", "desc").get();
  res.json(snap.docs.map((d) => toShortage(parseInt(d.id, 10), d.data())));
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
      const userSnap = await firestore.collection("users").doc(String(payload.id)).get();
      if (userSnap.exists) reportedByName = userSnap.data()!.name;
    } catch {}
  }

  const id = await nextId("shortages");
  const now = new Date();
  const data = {
    ...parsed.data,
    reportedById,
    reportedByName,
    quantity: parsed.data.quantity?.toString() ?? null,
    status: "pending",
    resolvedById: null,
    resolvedAt: null,
    createdAt: now,
  };
  await firestore.collection("shortages").doc(String(id)).set(data);
  res.status(201).json(toShortage(id, data));
});

router.patch("/shortages/:id/resolve", async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const parsed = ResolveShortageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const snap = await firestore.collection("shortages").doc(id).get();
  if (!snap.exists) {
    res.status(404).json({ error: "Report not found" });
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

  await firestore.collection("shortages").doc(id).update({
    status: parsed.data.status,
    resolvedById,
    resolvedAt: new Date(),
  });
  const updated = await firestore.collection("shortages").doc(id).get();
  res.json(toShortage(parseInt(updated.id, 10), updated.data()!));
});

export default router;
