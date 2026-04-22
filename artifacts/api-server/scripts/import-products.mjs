import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import XLSX from "xlsx";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = process.argv[2];
if (!filePath) {
  console.error("usage: node import-products.mjs <xlsx-path>");
  process.exit(1);
}

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
const db = getFirestore(undefined, "default");

const wb = XLSX.readFile(filePath);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });

const seen = new Map();
const products = [];
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  const barcode = (r["__EMPTY"] ?? "").toString().trim();
  const name = (r["__EMPTY_1"] ?? "").toString().trim();
  const price = Number(r["Liste des produits"]);
  if (!name || !barcode || !Number.isFinite(price) || price <= 0) continue;
  if (name === "désignation" || barcode === "Code produit") continue;
  if (seen.has(barcode)) continue;
  seen.set(barcode, true);
  products.push({ barcode, name, retailPrice: price });
}
console.log("parsed valid products:", products.length);

console.log("deleting existing...");
const snap = await db.collection("products").get();
console.log("existing:", snap.size);
{
  let batch = db.batch();
  let n = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    n++;
    if (n % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (n % 400 !== 0) await batch.commit();
  console.log("deleted:", n);
}

const counterRef = db.collection("_counters").doc("products");
let nextId = 1;
console.log("inserting", products.length, "products...");
{
  let batch = db.batch();
  let n = 0;
  for (const p of products) {
    const id = nextId++;
    const ref = db.collection("products").doc(String(id));
    batch.set(ref, {
      id,
      name: p.name,
      barcode: p.barcode,
      category: "عام",
      wholesalePrice: p.retailPrice,
      retailPrice: p.retailPrice,
      profitMargin: 0,
      stock: 0,
      shelfStock: 0,
      warehouseStock: 0,
      unit: "piece",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    n++;
    if (n % 400 === 0) {
      await batch.commit();
      batch = db.batch();
      console.log("  inserted", n);
    }
  }
  if (n % 400 !== 0) await batch.commit();
  console.log("inserted total:", n);
}

await counterRef.set({ next: nextId }, { merge: true });
console.log("counter updated to:", nextId - 1);
process.exit(0);
