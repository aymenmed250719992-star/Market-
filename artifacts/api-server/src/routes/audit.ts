import { Router, type IRouter } from "express";
import { auditCache, getRequestUser } from "../lib/audit";
import { tsToDate } from "../lib/firebase";

const router: IRouter = Router();

router.get("/audit", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user || user.data.role !== "admin") {
    res.status(403).json({ error: "غير مسموح" });
    return;
  }
  const { entity, action, userId, from, to, limit } = req.query as Record<string, string | undefined>;
  let logs = await auditCache.all();
  if (entity) logs = logs.filter(({ data }) => data.entity === entity);
  if (action) logs = logs.filter(({ data }) => data.action === action);
  if (userId) logs = logs.filter(({ data }) => String(data.userId) === userId);
  if (from) {
    const d = new Date(from);
    logs = logs.filter(({ data }) => +tsToDate(data.createdAt) >= +d);
  }
  if (to) {
    const d = new Date(to);
    logs = logs.filter(({ data }) => +tsToDate(data.createdAt) <= +d);
  }
  logs.sort((a, b) => +tsToDate(b.data.createdAt) - +tsToDate(a.data.createdAt));
  const max = parseInt(limit ?? "200", 10) || 200;
  logs = logs.slice(0, max);
  res.json(
    logs.map(({ id, data }) => ({
      id,
      ...data,
      createdAt: tsToDate(data.createdAt),
    })),
  );
});

export default router;
