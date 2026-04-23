import { Router, type IRouter } from "express";
import { firestore } from "../lib/firebase";
import { productsCacheApi } from "./products";
import {
  usersCache,
  customersCache,
  salesCache,
  shortagesCache,
  expensesCache,
  advancesCache,
  shiftsCache,
  tasksCache,
  salariesCache,
  onlineOrdersCache,
  distributorOffersCache,
} from "../lib/cache";
import { auditCache, getRequestUser, logAudit } from "../lib/audit";
import { returnsCache } from "./returns";

const router: IRouter = Router();

const allCaches = [
  ["users", usersCache],
  ["customers", customersCache],
  ["sales", salesCache],
  ["shortages", shortagesCache],
  ["expenses", expensesCache],
  ["advances", advancesCache],
  ["shifts", shiftsCache],
  ["tasks", tasksCache],
  ["salaries", salariesCache],
  ["online_orders", onlineOrdersCache],
  ["distributor_offers", distributorOffersCache],
  ["audit_logs", auditCache],
  ["returns", returnsCache],
] as const;

async function snapshotProducts(): Promise<Record<string, any>> {
  const all = await productsCacheApi.all();
  const out: Record<string, any> = {};
  for (const { id, raw } of all) out[String(id)] = raw;
  return out;
}

router.get("/backup/export", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user || user.data.role !== "admin") {
    res.status(403).json({ error: "غير مسموح" });
    return;
  }

  const data: Record<string, any> = { _meta: { exportedAt: new Date().toISOString(), version: 1 } };
  for (const [name, cache] of allCaches) {
    const all = await cache.all();
    const obj: Record<string, any> = {};
    for (const { id, data: doc } of all) obj[String(id)] = doc;
    data[name] = obj;
  }
  data.products = await snapshotProducts();

  await logAudit(req, "export", "backup", null, {
    collections: Object.keys(data).filter((k) => k !== "_meta").length,
  });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="supermarket-backup-${stamp}.json"`);
  res.send(JSON.stringify(data, null, 2));
});

router.post("/backup/import", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user || user.data.role !== "admin") {
    res.status(403).json({ error: "غير مسموح" });
    return;
  }
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    res.status(400).json({ error: "بيانات النسخة الاحتياطية غير صحيحة" });
    return;
  }

  let restored = 0;
  for (const [name, cache] of allCaches) {
    const docs = body[name];
    if (!docs || typeof docs !== "object") continue;
    for (const [id, doc] of Object.entries(docs)) {
      const idNum = Number(id);
      if (!Number.isFinite(idNum)) continue;
      await cache.set(idNum, doc as any);
      restored++;
    }
  }

  // products are stored directly in Firestore, restore via doc.set
  if (body.products && typeof body.products === "object") {
    for (const [id, doc] of Object.entries(body.products)) {
      await firestore.collection("products").doc(id).set(doc as any);
      restored++;
    }
  }

  await logAudit(req, "import", "backup", null, { restored });
  res.json({ ok: true, restored });
});

router.get("/backup/info", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user || user.data.role !== "admin") {
    res.status(403).json({ error: "غير مسموح" });
    return;
  }

  const counts: Record<string, number> = {};
  for (const [name, cache] of allCaches) {
    counts[name] = (await cache.all()).length;
  }
  counts.products = (await productsCacheApi.all()).length;

  res.json({ exists: true, counts });
  void firestore;
});

export default router;
