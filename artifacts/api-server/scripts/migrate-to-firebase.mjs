#!/usr/bin/env node
/**
 * One-shot migration: pushes local JSON store (.data/firestore-local.json)
 * into the live Firestore database (using FIREBASE_SERVICE_ACCOUNT).
 *
 * Idempotent: skips a collection if it already has documents in Firestore,
 * unless run with --force.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const force = process.argv.includes("--force");

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccount) {
  console.error("✗ FIREBASE_SERVICE_ACCOUNT is not set");
  process.exit(1);
}
let parsed;
try { parsed = JSON.parse(serviceAccount.replace(/\\n/g, "\n")); }
catch {
  try { parsed = JSON.parse(serviceAccount); }
  catch { throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON"); }
}
if (parsed.private_key && typeof parsed.private_key === "string") {
  parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
}

if (!getApps().length) {
  initializeApp({ credential: cert(parsed), projectId: parsed.project_id });
}
const db = getFirestore();

const storePath = path.resolve(__dirname, "../.data/firestore-local.json");
if (!fs.existsSync(storePath)) {
  console.error("✗ Local store not found:", storePath);
  process.exit(1);
}
const store = JSON.parse(fs.readFileSync(storePath, "utf8"));

const collections = Object.keys(store).filter((k) => k !== "_counters");
console.log(`→ migrating ${collections.length} collections from local store`);

async function migrateCollection(name, docs) {
  const ids = Object.keys(docs);
  if (!ids.length) {
    console.log(`  · ${name}: empty, skipping`);
    return;
  }
  if (!force) {
    const probe = await db.collection(name).limit(1).get();
    if (!probe.empty) {
      console.log(`  · ${name}: already has data in Firestore, skipping (use --force to overwrite)`);
      return;
    }
  }
  console.log(`  ↑ ${name}: uploading ${ids.length} docs ...`);
  const BATCH = 400;
  let written = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const batch = db.batch();
    for (const id of slice) {
      const doc = docs[id];
      // Convert ISO strings back to Date for createdAt/updatedAt fields
      const cleaned = { ...doc };
      for (const k of Object.keys(cleaned)) {
        if (typeof cleaned[k] === "string" && /^\d{4}-\d{2}-\d{2}T/.test(cleaned[k]) && /(At|Date)$/i.test(k)) {
          const d = new Date(cleaned[k]);
          if (!isNaN(d.getTime())) cleaned[k] = d;
        }
      }
      batch.set(db.collection(name).doc(String(id)), cleaned);
    }
    await batch.commit();
    written += slice.length;
    process.stdout.write(`    ${written}/${ids.length}\r`);
  }
  console.log(`  ✓ ${name}: ${written} docs uploaded`);
}

async function migrateCounters(counters) {
  if (!counters || !Object.keys(counters).length) return;
  console.log(`  ↑ _counters: ${Object.keys(counters).length} entries`);
  const batch = db.batch();
  for (const [name, val] of Object.entries(counters)) {
    batch.set(db.collection("_counters").doc(name), val);
  }
  await batch.commit();
  console.log(`  ✓ _counters uploaded`);
}

(async () => {
  for (const name of collections) {
    await migrateCollection(name, store[name]);
  }
  await migrateCounters(store._counters);
  console.log("\n✅ Migration complete");
  process.exit(0);
})().catch((err) => {
  console.error("\n✗ Migration failed:", err);
  process.exit(1);
});
