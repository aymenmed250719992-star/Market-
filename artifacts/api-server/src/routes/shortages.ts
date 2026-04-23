import { Router, type IRouter } from "express";
import { nextId, tsToDate } from "../lib/firebase";
import { shortagesCache, usersCache } from "../lib/cache";
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
  const all = await shortagesCache.all();
  all.sort((a, b) => +tsToDate(b.data.createdAt) - +tsToDate(a.data.createdAt));
  res.json(all.map(({ id, data }) => toShortage(id, data)));
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
      const user = await usersCache.get(payload.id);
      if (user) reportedByName = user.name;
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
  await shortagesCache.set(id, data);
  res.status(201).json(toShortage(id, data));
});

router.patch("/shortages/:id/resolve", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const parsed = ResolveShortageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await shortagesCache.get(idNum);
  if (!existing) {
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

  const merged = await shortagesCache.update(idNum, {
    status: parsed.data.status,
    resolvedById,
    resolvedAt: new Date(),
  });
  res.json(toShortage(idNum, merged ?? { ...existing, status: parsed.data.status, resolvedById, resolvedAt: new Date() }));
});

export default router;
