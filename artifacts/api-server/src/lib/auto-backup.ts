import fs from "node:fs/promises";
import path from "node:path";
import { firestore } from "./firebase";
import { productsCacheApi } from "../routes/products";
import {
  usersCache, customersCache, salesCache, shortagesCache, expensesCache,
  advancesCache, shiftsCache, tasksCache, salariesCache, onlineOrdersCache,
  distributorOffersCache,
} from "./cache";
import { auditCache } from "./audit";
import { returnsCache } from "../routes/returns";
import { logger } from "./logger";

const BACKUP_DIR = path.join(process.cwd(), "data", "backups");
const KEEP_DAYS = 7;
const ONE_DAY = 86_400_000;

const allCaches = [
  ["users", usersCache], ["customers", customersCache], ["sales", salesCache],
  ["shortages", shortagesCache], ["expenses", expensesCache], ["advances", advancesCache],
  ["shifts", shiftsCache], ["tasks", tasksCache], ["salaries", salariesCache],
  ["online_orders", onlineOrdersCache], ["distributor_offers", distributorOffersCache],
  ["audit_logs", auditCache], ["returns", returnsCache],
] as const;

async function snapshotAll(): Promise<Record<string, any>> {
  const data: Record<string, any> = { _meta: { exportedAt: new Date().toISOString(), version: 1, source: "auto" } };
  for (const [name, cache] of allCaches) {
    const all = await cache.all();
    const obj: Record<string, any> = {};
    for (const { id, data: doc } of all) obj[String(id)] = doc;
    data[name] = obj;
  }
  const products: Record<string, any> = {};
  for (const { id, raw } of await productsCacheApi.all()) products[String(id)] = raw;
  data.products = products;
  void firestore;
  return data;
}

async function pruneOld() {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const cutoff = Date.now() - KEEP_DAYS * ONE_DAY;
    for (const f of files) {
      if (!f.startsWith("auto-") || !f.endsWith(".json")) continue;
      const full = path.join(BACKUP_DIR, f);
      const stat = await fs.stat(full);
      if (+stat.mtime < cutoff) await fs.unlink(full).catch(() => null);
    }
  } catch { /* ignore */ }
}

export async function runAutoBackup() {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const data = await snapshotAll();
    const stamp = new Date().toISOString().slice(0, 10);
    const file = path.join(BACKUP_DIR, `auto-${stamp}.json`);
    await fs.writeFile(file, JSON.stringify(data));
    await pruneOld();
    logger.info({ file, sizeBytes: (await fs.stat(file)).size }, "auto-backup written");
  } catch (err: any) {
    logger.error({ err: err?.message }, "auto-backup failed");
  }
}

export function startAutoBackupScheduler() {
  // Run once at startup if today's snapshot doesn't exist, then every 24h
  const stamp = new Date().toISOString().slice(0, 10);
  const todayFile = path.join(BACKUP_DIR, `auto-${stamp}.json`);
  fs.access(todayFile).catch(() => runAutoBackup());
  setInterval(runAutoBackup, ONE_DAY);
}

export async function listAutoBackups() {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const files = await fs.readdir(BACKUP_DIR);
    const out: { file: string; size: number; mtime: string }[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const full = path.join(BACKUP_DIR, f);
      const stat = await fs.stat(full);
      out.push({ file: f, size: stat.size, mtime: stat.mtime.toISOString() });
    }
    return out.sort((a, b) => b.mtime.localeCompare(a.mtime));
  } catch { return []; }
}

export async function readAutoBackup(file: string): Promise<Buffer | null> {
  if (!/^[\w.-]+\.json$/.test(file)) return null;
  try { return await fs.readFile(path.join(BACKUP_DIR, file)); } catch { return null; }
}
