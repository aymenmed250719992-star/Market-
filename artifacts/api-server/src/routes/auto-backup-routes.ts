import { Router, type IRouter } from "express";
import { listAutoBackups, readAutoBackup, runAutoBackup } from "../lib/auto-backup";
import { getRequestUser } from "../lib/audit";

const router: IRouter = Router();

router.get("/auto-backup/list", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user || user.data.role !== "admin") {
    res.status(403).json({ error: "غير مسموح" });
    return;
  }
  res.json({ backups: await listAutoBackups() });
});

router.get("/auto-backup/download/:file", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user || user.data.role !== "admin") {
    res.status(403).json({ error: "غير مسموح" });
    return;
  }
  const buf = await readAutoBackup(req.params.file);
  if (!buf) { res.status(404).json({ error: "ملف غير موجود" }); return; }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${req.params.file}"`);
  res.send(buf);
});

router.post("/auto-backup/run-now", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user || user.data.role !== "admin") {
    res.status(403).json({ error: "غير مسموح" });
    return;
  }
  await runAutoBackup();
  res.json({ ok: true, backups: await listAutoBackups() });
});

export default router;
