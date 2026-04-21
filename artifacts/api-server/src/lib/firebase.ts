import { initializeApp, cert, getApps } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./logger";

type SeedProductsFile = {
  count: number;
  nextId: number;
  products: Record<string, Record<string, any>>;
};

let cachedSeedProducts: SeedProductsFile | null = null;

function loadSeedProductsFile(): SeedProductsFile {
  if (cachedSeedProducts) return cachedSeedProducts;
  const candidates = [
    path.resolve(process.cwd(), "src/data/seed-products.json"),
    path.resolve(process.cwd(), "data/seed-products.json"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/seed-products.json"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/data/seed-products.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      cachedSeedProducts = JSON.parse(fs.readFileSync(p, "utf8")) as SeedProductsFile;
      return cachedSeedProducts;
    }
  }
  logger.warn("seed-products.json not found; products will start empty");
  cachedSeedProducts = { count: 0, nextId: 1, products: {} };
  return cachedSeedProducts;
}

function getSeedProducts(now: string): Record<string, Record<string, any>> {
  const file = loadSeedProductsFile();
  const out: Record<string, Record<string, any>> = {};
  for (const [id, value] of Object.entries(file.products)) {
    const v: Record<string, any> = { ...value };
    if (v.createdAt === "__NOW__") v.createdAt = now;
    if (v.updatedAt === "__NOW__") v.updatedAt = now;
    out[id] = v;
  }
  return out;
}

function getSeedProductsNextId(): number {
  return loadSeedProductsFile().nextId;
}

type CollectionData = Record<string, Record<string, any>>;
type StoreData = Record<string, CollectionData>;

class LocalDocumentSnapshot {
  constructor(public id: string, private value?: Record<string, any>) {}

  get exists() {
    return this.value !== undefined;
  }

  data() {
    return this.value ? structuredClone(this.value) : undefined;
  }
}

class LocalQuerySnapshot {
  docs: LocalDocumentSnapshot[];

  constructor(docs: LocalDocumentSnapshot[]) {
    this.docs = docs;
  }

  get empty() {
    return this.docs.length === 0;
  }
}

class LocalDocumentReference {
  constructor(private db: LocalFirestore, private collectionName: string, public id: string) {}

  async get() {
    return new LocalDocumentSnapshot(this.id, this.db.getDocument(this.collectionName, this.id));
  }

  async set(value: Record<string, any>) {
    this.db.setDocument(this.collectionName, this.id, value);
  }

  async update(updates: Record<string, any>) {
    const current = this.db.getDocument(this.collectionName, this.id);
    if (!current) throw new Error(`Document ${this.collectionName}/${this.id} does not exist`);
    const next = { ...current };
    for (const [key, value] of Object.entries(updates)) {
      if (value && typeof value === "object" && value.constructor?.name === "NumericIncrementTransform" && typeof value.operand === "number") {
        next[key] = (Number(next[key] ?? 0) || 0) + value.operand;
      } else {
        next[key] = value;
      }
    }
    this.db.setDocument(this.collectionName, this.id, next);
  }

  async delete() {
    this.db.deleteDocument(this.collectionName, this.id);
  }
}

class LocalCollectionReference {
  constructor(private db: LocalFirestore, private collectionName: string) {}

  doc(id: string) {
    return new LocalDocumentReference(this.db, this.collectionName, id);
  }

  where(field: string, operator: string, value: any) {
    return new LocalQuery(this.db, this.collectionName).where(field, operator, value);
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc") {
    return new LocalQuery(this.db, this.collectionName).orderBy(field, direction);
  }

  limit(count: number) {
    return new LocalQuery(this.db, this.collectionName).limit(count);
  }

  async get() {
    return new LocalQuery(this.db, this.collectionName).get();
  }
}

class LocalQuery {
  private filters: Array<{ field: string; operator: string; value: any }> = [];
  private order?: { field: string; direction: "asc" | "desc" };
  private max?: number;

  constructor(private db: LocalFirestore, private collectionName: string) {}

  where(field: string, operator: string, value: any) {
    this.filters.push({ field, operator, value });
    return this;
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc") {
    this.order = { field, direction };
    return this;
  }

  limit(count: number) {
    this.max = count;
    return this;
  }

  async get() {
    let entries = Object.entries(this.db.getCollection(this.collectionName));
    for (const filter of this.filters) {
      if (filter.operator !== "==") throw new Error(`Unsupported local Firestore operator: ${filter.operator}`);
      entries = entries.filter(([, value]) => value[filter.field] === filter.value);
    }
    if (this.order) {
      const { field, direction } = this.order;
      entries.sort((a, b) => {
        const av = a[1][field];
        const bv = b[1][field];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (av < bv) return direction === "desc" ? 1 : -1;
        if (av > bv) return direction === "desc" ? -1 : 1;
        return Number(a[0]) - Number(b[0]);
      });
    }
    if (this.max !== undefined) entries = entries.slice(0, this.max);
    return new LocalQuerySnapshot(entries.map(([id, value]) => new LocalDocumentSnapshot(id, value)));
  }
}

class LocalFirestore {
  private data: StoreData;

  constructor(private filePath: string) {
    this.data = this.load();
  }

  collection(name: string) {
    this.ensureCollection(name);
    return new LocalCollectionReference(this, name);
  }

  getCollection(name: string) {
    this.ensureCollection(name);
    return this.data[name];
  }

  getDocument(collection: string, id: string) {
    this.ensureCollection(collection);
    return this.data[collection][id];
  }

  setDocument(collection: string, id: string, value: Record<string, any>) {
    this.ensureCollection(collection);
    this.data[collection][id] = structuredClone(value);
    this.save();
  }

  deleteDocument(collection: string, id: string) {
    this.ensureCollection(collection);
    delete this.data[collection][id];
    this.save();
  }

  nextId(collection: string) {
    this.ensureCollection("_counters");
    const counter = this.data._counters[collection];
    const next = typeof counter?.next === "number" ? counter.next : this.highestId(collection) + 1;
    this.data._counters[collection] = { next: next + 1 };
    this.save();
    return next;
  }

  private ensureCollection(name: string) {
    if (!this.data[name]) this.data[name] = {};
  }

  private highestId(collection: string) {
    this.ensureCollection(collection);
    return Object.keys(this.data[collection]).reduce((max, id) => Math.max(max, Number(id) || 0), 0);
  }

  private load(): StoreData {
    if (fs.existsSync(this.filePath)) {
      const existing = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      const merged = mergeSeedData(existing);
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(merged, null, 2));
      return merged;
    }
    const seeded = createSeedData();
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(seeded, null, 2));
    return seeded;
  }

  private save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
}

function highestExistingId(collection: CollectionData | undefined) {
  if (!collection) return 0;
  return Object.keys(collection).reduce((max, id) => Math.max(max, Number(id) || 0), 0);
}

function mergeSeedData(existing: StoreData): StoreData {
  const seed = createSeedData();
  const next: StoreData = existing && typeof existing === "object" ? existing : {};

  for (const [collection, docs] of Object.entries(seed)) {
    if (!next[collection]) next[collection] = {};
    if (collection === "_counters") continue;
    for (const [id, value] of Object.entries(docs)) {
      if (!next[collection][id]) {
        next[collection][id] = value;
      }
    }
  }

  if (!next._counters) next._counters = {};
  for (const collection of Object.keys(seed._counters)) {
    const current = next._counters[collection]?.next;
    const seeded = seed._counters[collection]?.next;
    const highest = highestExistingId(next[collection]) + 1;
    next._counters[collection] = {
      next: Math.max(typeof current === "number" ? current : 1, typeof seeded === "number" ? seeded : 1, highest),
    };
  }

  return next;
}

function createSeedData(): StoreData {
  const now = new Date().toISOString();
  const day = (offset: number) => new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString();
  const soon = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const currentMonth = new Date().toISOString().slice(0, 7);
  return {
    _counters: {
      users: { next: 7 },
      products: { next: getSeedProductsNextId() },
      customers: { next: 5 },
      sales: { next: 6 },
      shortages: { next: 4 },
      salaries: { next: 1 },
      tasks: { next: 4 },
      expenses: { next: 4 },
      advances: { next: 3 },
      shifts: { next: 2 },
      online_orders: { next: 4 },
      distributor_offers: { next: 4 },
    },
    users: {
      "1": { name: "Aymen Admin", email: "aymenmed25071999@gmail.com", phone: "0555000000", password: "Nova3iNokiac25071999@@", role: "admin", baseSalary: "80000", employeeBarcode: "EMP001", activityPoints: 0, createdAt: now, updatedAt: now },
      "2": { name: "Cashier", email: "cashier@supermarket.local", phone: "0555000001", password: "cashier123", role: "cashier", baseSalary: "50000", employeeBarcode: "EMP002", activityPoints: 0, createdAt: now, updatedAt: now },
      "3": { name: "Buyer", email: "buyer@supermarket.local", phone: "0555000002", password: "buyer123", role: "buyer", baseSalary: "55000", employeeBarcode: "EMP003", activityPoints: 0, createdAt: now, updatedAt: now },
      "4": { name: "Worker", email: "worker@supermarket.local", phone: "0555000003", password: "worker123", role: "worker", baseSalary: "42000", employeeBarcode: "EMP004", activityPoints: 0, createdAt: now, updatedAt: now },
      "5": { name: "زبون تجريبي", email: "customer@supermarket.local", phone: "0555111222", password: "customer123", role: "customer", baseSalary: null, employeeBarcode: null, activityPoints: 0, createdAt: now, updatedAt: now },
      "6": { name: "موزع العاصمة", email: "distributor@supermarket.local", phone: "0555444333", password: "distributor123", role: "distributor", baseSalary: null, employeeBarcode: null, activityPoints: 0, createdAt: now, updatedAt: now },
    },
    products: getSeedProducts(now),
    customers: {},
    sales: {},
    shortages: {},
    tasks: {},
    expenses: {},
    advances: {},
    shifts: {},
    online_orders: {},
    distributor_offers: {},
    salaries: {},
  };
}

function initFirebase() {
  if (getApps().length > 0) return;

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) {
    return;
  }

  const rawJson = serviceAccount.replace(/\\n/g, "\n");

  let parsed: any;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    try {
      parsed = JSON.parse(serviceAccount);
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON");
    }
  }

  if (parsed.private_key && typeof parsed.private_key === "string") {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }

  initializeApp({
    credential: cert(parsed),
    projectId: parsed.project_id ?? process.env.FIREBASE_PROJECT_ID,
  });

  logger.info("Firebase Admin initialized");
}

initFirebase();

const localFirestore = !process.env.FIREBASE_SERVICE_ACCOUNT
  ? new LocalFirestore(path.resolve(process.cwd(), ".data", "firestore-local.json"))
  : null;

if (localFirestore) {
  logger.warn("FIREBASE_SERVICE_ACCOUNT is not set; using local Replit-compatible JSON persistence");
}

export const firestore = localFirestore ?? getFirestore(undefined as any, "default");
export { FieldValue };

export async function nextId(collection: string): Promise<number> {
  if (localFirestore) {
    return localFirestore.nextId(collection);
  }

  const counterRef = firestore.collection("_counters").doc(collection);
  const id = await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists ? (snap.data()!.next as number) : 1;
    tx.set(counterRef, { next: current + 1 }, { merge: true });
    return current;
  });
  return id;
}

export function tsToDate(val: any): any {
  if (!val) return val;
  if (typeof val.toDate === "function") return val.toDate();
  if (typeof val === "string") {
    const parsed = new Date(val);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return val;
}
