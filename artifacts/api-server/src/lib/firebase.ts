import { initializeApp, cert, getApps } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";
import { logger } from "./logger";

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
      products: { next: 151 },
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
    products: {
      "1":   { barcode: "ART001", name: "دقيق مطحون ممتاز - قنطارة 5 كغ", category: "مواد غذائية", wholesalePrice: "280", unitWholesalePrice: "280", retailPrice: "320", profitMargin: "13", stock: 40, shelfStock: 10, warehouseStock: 30, unit: "piece", unitsPerCarton: 10, cartonSize: 10, expiryDate: null, supplier: "مطاحن قنطارة", lowStockThreshold: 8, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "2":   { barcode: "ART002", name: "دقيق مطحون عادي - غليزان 5 كغ", category: "مواد غذائية", wholesalePrice: "260", unitWholesalePrice: "260", retailPrice: "300", profitMargin: "13", stock: 35, shelfStock: 8, warehouseStock: 27, unit: "piece", unitsPerCarton: 10, cartonSize: 10, expiryDate: null, supplier: "مطاحن غليزان", lowStockThreshold: 8, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "3":   { barcode: "ART003", name: "سميد خشن - الحضنة 1 كغ", category: "مواد غذائية", wholesalePrice: "65", unitWholesalePrice: "65", retailPrice: "80", profitMargin: "18", stock: 30, shelfStock: 8, warehouseStock: 22, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "مطاحن الحضنة", lowStockThreshold: 6, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "4":   { barcode: "ART004", name: "سميد ناعم - الحضنة 1 كغ", category: "مواد غذائية", wholesalePrice: "65", unitWholesalePrice: "65", retailPrice: "80", profitMargin: "18", stock: 30, shelfStock: 8, warehouseStock: 22, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "مطاحن الحضنة", lowStockThreshold: 6, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "5":   { barcode: "ART005", name: "زيت سفينة 1 لتر", category: "مواد غذائية", wholesalePrice: "195", unitWholesalePrice: "195", retailPrice: "225", profitMargin: "13", stock: 48, shelfStock: 12, warehouseStock: 36, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "مصنع سفينة", lowStockThreshold: 8, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "6":   { barcode: "ART006", name: "زيت سفينة 5 لتر", category: "مواد غذائية", wholesalePrice: "950", unitWholesalePrice: "950", retailPrice: "1100", profitMargin: "13", stock: 20, shelfStock: 5, warehouseStock: 15, unit: "piece", unitsPerCarton: 6, cartonSize: 6, expiryDate: null, supplier: "مصنع سفينة", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "7":   { barcode: "ART007", name: "زيت زيتون - بجاية 1 لتر", category: "مواد غذائية", wholesalePrice: "650", unitWholesalePrice: "650", retailPrice: "780", profitMargin: "16", stock: 18, shelfStock: 5, warehouseStock: 13, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "زيوت بجاية", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "8":   { barcode: "ART008", name: "سكر أبيض حبة 1 كغ", category: "مواد غذائية", wholesalePrice: "95", unitWholesalePrice: "95", retailPrice: "115", profitMargin: "17", stock: 60, shelfStock: 15, warehouseStock: 45, unit: "piece", unitsPerCarton: 10, cartonSize: 10, expiryDate: null, supplier: "تعاونية السكر", lowStockThreshold: 10, lowWarehouseThreshold: 5, createdAt: now, updatedAt: now },
      "9":   { barcode: "ART009", name: "سكر أبيض حبة 5 كغ", category: "مواد غذائية", wholesalePrice: "460", unitWholesalePrice: "460", retailPrice: "550", profitMargin: "16", stock: 25, shelfStock: 6, warehouseStock: 19, unit: "piece", unitsPerCarton: 5, cartonSize: 5, expiryDate: null, supplier: "تعاونية السكر", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "10":  { barcode: "ART010", name: "شعيرية - بورج بوعريريج 500 غ", category: "مواد غذائية", wholesalePrice: "75", unitWholesalePrice: "75", retailPrice: "95", profitMargin: "20", stock: 36, shelfStock: 10, warehouseStock: 26, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "مصنع بورج", lowStockThreshold: 6, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "11":  { barcode: "ART011", name: "معكرونة حلزون - ليزي 500 غ", category: "مواد غذائية", wholesalePrice: "80", unitWholesalePrice: "80", retailPrice: "100", profitMargin: "20", stock: 36, shelfStock: 10, warehouseStock: 26, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "ليزي", lowStockThreshold: 6, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "12":  { barcode: "ART012", name: "معكرونة ريشة - ليزي 500 غ", category: "مواد غذائية", wholesalePrice: "80", unitWholesalePrice: "80", retailPrice: "100", profitMargin: "20", stock: 36, shelfStock: 10, warehouseStock: 26, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "ليزي", lowStockThreshold: 6, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "13":  { barcode: "ART013", name: "كسكس متوسط - الزيتونة 1 كغ", category: "مواد غذائية", wholesalePrice: "140", unitWholesalePrice: "140", retailPrice: "170", profitMargin: "17", stock: 30, shelfStock: 8, warehouseStock: 22, unit: "piece", unitsPerCarton: 10, cartonSize: 10, expiryDate: null, supplier: "الزيتونة", lowStockThreshold: 6, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "14":  { barcode: "ART014", name: "كسكس خشن - الزيتونة 1 كغ", category: "مواد غذائية", wholesalePrice: "140", unitWholesalePrice: "140", retailPrice: "170", profitMargin: "17", stock: 30, shelfStock: 8, warehouseStock: 22, unit: "piece", unitsPerCarton: 10, cartonSize: 10, expiryDate: null, supplier: "الزيتونة", lowStockThreshold: 6, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "15":  { barcode: "ART015", name: "أرز مصري 1 كغ", category: "مواد غذائية", wholesalePrice: "185", unitWholesalePrice: "185", retailPrice: "220", profitMargin: "16", stock: 35, shelfStock: 9, warehouseStock: 26, unit: "piece", unitsPerCarton: 10, cartonSize: 10, expiryDate: null, supplier: "مستورد الجنوب", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "16":  { barcode: "ART016", name: "أرز هندي بسمتي 1 كغ", category: "مواد غذائية", wholesalePrice: "280", unitWholesalePrice: "280", retailPrice: "340", profitMargin: "17", stock: 25, shelfStock: 6, warehouseStock: 19, unit: "piece", unitsPerCarton: 10, cartonSize: 10, expiryDate: null, supplier: "مستورد الجنوب", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "17":  { barcode: "ART017", name: "عدس أصفر 1 كغ", category: "مواد غذائية", wholesalePrice: "195", unitWholesalePrice: "195", retailPrice: "240", profitMargin: "18", stock: 25, shelfStock: 6, warehouseStock: 19, unit: "piece", unitsPerCarton: 10, cartonSize: 10, expiryDate: null, supplier: "موردو البقوليات", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "18":  { barcode: "ART018", name: "حمص حب 1 كغ", category: "مواد غذائية", wholesalePrice: "210", unitWholesalePrice: "210", retailPrice: "260", profitMargin: "19", stock: 25, shelfStock: 6, warehouseStock: 19, unit: "piece", unitsPerCarton: 10, cartonSize: 10, expiryDate: null, supplier: "موردو البقوليات", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "19":  { barcode: "ART019", name: "فول مدمس 800 غ", category: "مواد غذائية", wholesalePrice: "165", unitWholesalePrice: "165", retailPrice: "200", profitMargin: "17", stock: 30, shelfStock: 8, warehouseStock: 22, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "مصبرات الجزائر", lowStockThreshold: 6, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "20":  { barcode: "ART020", name: "ملح طعام - جيجل 1 كغ", category: "مواد غذائية", wholesalePrice: "35", unitWholesalePrice: "35", retailPrice: "50", profitMargin: "30", stock: 50, shelfStock: 12, warehouseStock: 38, unit: "piece", unitsPerCarton: 20, cartonSize: 20, expiryDate: null, supplier: "ملاحة جيجل", lowStockThreshold: 8, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "21":  { barcode: "ART021", name: "مياه معدنية ليلى 1.5 لتر", category: "مشروبات", wholesalePrice: "35", unitWholesalePrice: "35", retailPrice: "50", profitMargin: "30", stock: 72, shelfStock: 24, warehouseStock: 48, unit: "piece", unitsPerCarton: 6, cartonSize: 6, expiryDate: null, supplier: "ليلى", lowStockThreshold: 12, lowWarehouseThreshold: 6, createdAt: now, updatedAt: now },
      "22":  { barcode: "ART022", name: "مياه معدنية ليلى 0.5 لتر", category: "مشروبات", wholesalePrice: "20", unitWholesalePrice: "20", retailPrice: "30", profitMargin: "33", stock: 72, shelfStock: 24, warehouseStock: 48, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "ليلى", lowStockThreshold: 12, lowWarehouseThreshold: 6, createdAt: now, updatedAt: now },
      "23":  { barcode: "ART023", name: "مياه معدنية سيدي الدشيش 1.5 لتر", category: "مشروبات", wholesalePrice: "38", unitWholesalePrice: "38", retailPrice: "55", profitMargin: "31", stock: 60, shelfStock: 20, warehouseStock: 40, unit: "piece", unitsPerCarton: 6, cartonSize: 6, expiryDate: null, supplier: "سيدي الدشيش", lowStockThreshold: 12, lowWarehouseThreshold: 6, createdAt: now, updatedAt: now },
      "24":  { barcode: "ART024", name: "مياه معدنية تالة 1.5 لتر", category: "مشروبات", wholesalePrice: "36", unitWholesalePrice: "36", retailPrice: "52", profitMargin: "30", stock: 60, shelfStock: 20, warehouseStock: 40, unit: "piece", unitsPerCarton: 6, cartonSize: 6, expiryDate: null, supplier: "تالة", lowStockThreshold: 12, lowWarehouseThreshold: 6, createdAt: now, updatedAt: now },
      "25":  { barcode: "ART025", name: "مياه معدنية أميزور 1.5 لتر", category: "مشروبات", wholesalePrice: "40", unitWholesalePrice: "40", retailPrice: "58", profitMargin: "31", stock: 60, shelfStock: 18, warehouseStock: 42, unit: "piece", unitsPerCarton: 6, cartonSize: 6, expiryDate: null, supplier: "أميزور", lowStockThreshold: 12, lowWarehouseThreshold: 6, createdAt: now, updatedAt: now },
      "26":  { barcode: "ART026", name: "مشروب كوكاكولا 1.25 لتر", category: "مشروبات", wholesalePrice: "145", unitWholesalePrice: "145", retailPrice: "175", profitMargin: "17", stock: 36, shelfStock: 12, warehouseStock: 24, unit: "piece", unitsPerCarton: 6, cartonSize: 6, expiryDate: null, supplier: "كوكاكولا", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "27":  { barcode: "ART027", name: "مشروب بيبسي 1.25 لتر", category: "مشروبات", wholesalePrice: "140", unitWholesalePrice: "140", retailPrice: "170", profitMargin: "17", stock: 36, shelfStock: 12, warehouseStock: 24, unit: "piece", unitsPerCarton: 6, cartonSize: 6, expiryDate: null, supplier: "بيبسي", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "28":  { barcode: "ART028", name: "مشروب سبرايت 1.25 لتر", category: "مشروبات", wholesalePrice: "140", unitWholesalePrice: "140", retailPrice: "170", profitMargin: "17", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 6, cartonSize: 6, expiryDate: null, supplier: "كوكاكولا", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "29":  { barcode: "ART029", name: "مشروب 7UP 1.25 لتر", category: "مشروبات", wholesalePrice: "140", unitWholesalePrice: "140", retailPrice: "170", profitMargin: "17", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 6, cartonSize: 6, expiryDate: null, supplier: "بيبسي", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "30":  { barcode: "ART030", name: "عصير هاناء برتقال 1 لتر", category: "مشروبات", wholesalePrice: "115", unitWholesalePrice: "115", retailPrice: "145", profitMargin: "20", stock: 30, shelfStock: 10, warehouseStock: 20, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "هاناء", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "31":  { barcode: "ART031", name: "عصير هاناء مشمش 1 لتر", category: "مشروبات", wholesalePrice: "115", unitWholesalePrice: "115", retailPrice: "145", profitMargin: "20", stock: 30, shelfStock: 10, warehouseStock: 20, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "هاناء", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "32":  { barcode: "ART032", name: "عصير نارنجينا 0.33 لتر", category: "مشروبات", wholesalePrice: "65", unitWholesalePrice: "65", retailPrice: "85", profitMargin: "23", stock: 48, shelfStock: 12, warehouseStock: 36, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "نارنجينا", lowStockThreshold: 8, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "33":  { barcode: "ART033", name: "حليب سائل - جيجل 1 لتر", category: "مشروبات", wholesalePrice: "95", unitWholesalePrice: "95", retailPrice: "115", profitMargin: "17", stock: 36, shelfStock: 12, warehouseStock: 24, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: soon, supplier: "ملبنة جيجل", lowStockThreshold: 8, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "34":  { barcode: "ART034", name: "حليب UHT - فلفل 1 لتر", category: "مشروبات", wholesalePrice: "110", unitWholesalePrice: "110", retailPrice: "135", profitMargin: "18", stock: 48, shelfStock: 12, warehouseStock: 36, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "فلفل", lowStockThreshold: 8, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "35":  { barcode: "ART035", name: "حليب مكثف محلى - عين وارة 397 غ", category: "مشروبات", wholesalePrice: "145", unitWholesalePrice: "145", retailPrice: "175", profitMargin: "17", stock: 36, shelfStock: 10, warehouseStock: 26, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "عين وارة", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "36":  { barcode: "ART036", name: "شاي أخضر - الشروق 100 غ", category: "مشروبات", wholesalePrice: "185", unitWholesalePrice: "185", retailPrice: "225", profitMargin: "17", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "الشروق", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "37":  { barcode: "ART037", name: "شاي أحمر - القصبة 100 غ", category: "مشروبات", wholesalePrice: "175", unitWholesalePrice: "175", retailPrice: "215", profitMargin: "18", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "القصبة", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "38":  { barcode: "ART038", name: "قهوة مطحونة - المعلم 250 غ", category: "مشروبات", wholesalePrice: "420", unitWholesalePrice: "420", retailPrice: "500", profitMargin: "16", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "المعلم", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "39":  { barcode: "ART039", name: "نسكافيه كلاسيك 200 غ", category: "مشروبات", wholesalePrice: "680", unitWholesalePrice: "680", retailPrice: "820", profitMargin: "17", stock: 18, shelfStock: 6, warehouseStock: 12, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "نستله", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "40":  { barcode: "ART040", name: "ريد بول 250 مل", category: "مشروبات", wholesalePrice: "195", unitWholesalePrice: "195", retailPrice: "245", profitMargin: "20", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "ريد بول", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "41":  { barcode: "ART041", name: "جبن مثلثات - كيري 8 قطع", category: "ألبان", wholesalePrice: "195", unitWholesalePrice: "195", retailPrice: "240", profitMargin: "18", stock: 30, shelfStock: 10, warehouseStock: 20, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: soon, supplier: "كيري", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "42":  { barcode: "ART042", name: "جبن مثلثات - لافاش 8 قطع", category: "ألبان", wholesalePrice: "185", unitWholesalePrice: "185", retailPrice: "230", profitMargin: "19", stock: 30, shelfStock: 10, warehouseStock: 20, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: soon, supplier: "لافاش كي ري", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "43":  { barcode: "ART043", name: "جبن أبيض - إيغيل 500 غ", category: "ألبان", wholesalePrice: "320", unitWholesalePrice: "320", retailPrice: "390", profitMargin: "18", stock: 20, shelfStock: 6, warehouseStock: 14, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: soon, supplier: "إيغيل", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "44":  { barcode: "ART044", name: "زبدة نورما 200 غ", category: "ألبان", wholesalePrice: "280", unitWholesalePrice: "280", retailPrice: "340", profitMargin: "17", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: soon, supplier: "نورما", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "45":  { barcode: "ART045", name: "زبادي طبيعي - دانون 125 غ", category: "ألبان", wholesalePrice: "55", unitWholesalePrice: "55", retailPrice: "70", profitMargin: "21", stock: 48, shelfStock: 16, warehouseStock: 32, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: soon, supplier: "دانون", lowStockThreshold: 8, lowWarehouseThreshold: 4, createdAt: now, updatedAt: now },
      "46":  { barcode: "ART046", name: "زبادي بالفواكه - يوبلاي 125 غ", category: "ألبان", wholesalePrice: "65", unitWholesalePrice: "65", retailPrice: "82", profitMargin: "20", stock: 48, shelfStock: 16, warehouseStock: 32, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: soon, supplier: "يوبلاي", lowStockThreshold: 8, lowWarehouseThreshold: 4, createdAt: now, updatedAt: now },
      "47":  { barcode: "ART047", name: "جبن مبشور - رامي 200 غ", category: "ألبان", wholesalePrice: "350", unitWholesalePrice: "350", retailPrice: "425", profitMargin: "17", stock: 18, shelfStock: 6, warehouseStock: 12, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: soon, supplier: "رامي", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "48":  { barcode: "ART048", name: "لبن رائب 1 لتر", category: "ألبان", wholesalePrice: "85", unitWholesalePrice: "85", retailPrice: "105", profitMargin: "19", stock: 36, shelfStock: 10, warehouseStock: 26, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: soon, supplier: "ملبنة الجزائر", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "49":  { barcode: "ART049", name: "قشطة طازجة 200 مل", category: "ألبان", wholesalePrice: "145", unitWholesalePrice: "145", retailPrice: "180", profitMargin: "19", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: soon, supplier: "ملبنة الجزائر", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "50":  { barcode: "ART050", name: "أيس كريم - أطلس كوب", category: "ألبان", wholesalePrice: "65", unitWholesalePrice: "65", retailPrice: "85", profitMargin: "23", stock: 30, shelfStock: 10, warehouseStock: 20, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "أطلس", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "51":  { barcode: "ART051", name: "لحم بقري مفروم 1 كغ", category: "لحوم", wholesalePrice: "1400", unitWholesalePrice: "1400", retailPrice: "1700", profitMargin: "17", stock: 10, shelfStock: 4, warehouseStock: 6, unit: "kg", unitsPerCarton: 1, cartonSize: 1, expiryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), supplier: "مذبح الحي", lowStockThreshold: 3, lowWarehouseThreshold: 1, createdAt: now, updatedAt: now },
      "52":  { barcode: "ART052", name: "لحم بقري مقطع 1 كغ", category: "لحوم", wholesalePrice: "1600", unitWholesalePrice: "1600", retailPrice: "1950", profitMargin: "17", stock: 8, shelfStock: 3, warehouseStock: 5, unit: "kg", unitsPerCarton: 1, cartonSize: 1, expiryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), supplier: "مذبح الحي", lowStockThreshold: 3, lowWarehouseThreshold: 1, createdAt: now, updatedAt: now },
      "53":  { barcode: "ART053", name: "لحم غنمي مقطع 1 كغ", category: "لحوم", wholesalePrice: "1800", unitWholesalePrice: "1800", retailPrice: "2200", profitMargin: "17", stock: 6, shelfStock: 2, warehouseStock: 4, unit: "kg", unitsPerCarton: 1, cartonSize: 1, expiryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), supplier: "مذبح الحي", lowStockThreshold: 2, lowWarehouseThreshold: 1, createdAt: now, updatedAt: now },
      "54":  { barcode: "ART054", name: "دجاج كامل مذبوح 1 كغ", category: "لحوم", wholesalePrice: "380", unitWholesalePrice: "380", retailPrice: "460", profitMargin: "17", stock: 15, shelfStock: 5, warehouseStock: 10, unit: "kg", unitsPerCarton: 1, cartonSize: 1, expiryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), supplier: "مزرعة الدجاج", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "55":  { barcode: "ART055", name: "صدور دجاج 1 كغ", category: "لحوم", wholesalePrice: "520", unitWholesalePrice: "520", retailPrice: "640", profitMargin: "18", stock: 12, shelfStock: 4, warehouseStock: 8, unit: "kg", unitsPerCarton: 1, cartonSize: 1, expiryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), supplier: "مزرعة الدجاج", lowStockThreshold: 3, lowWarehouseThreshold: 1, createdAt: now, updatedAt: now },
      "56":  { barcode: "ART056", name: "سمك سردين طازج 1 كغ", category: "لحوم", wholesalePrice: "280", unitWholesalePrice: "280", retailPrice: "360", profitMargin: "22", stock: 10, shelfStock: 4, warehouseStock: 6, unit: "kg", unitsPerCarton: 1, cartonSize: 1, expiryDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), supplier: "صياد السمك", lowStockThreshold: 3, lowWarehouseThreshold: 1, createdAt: now, updatedAt: now },
      "57":  { barcode: "ART057", name: "سمك مرجان 1 كغ", category: "لحوم", wholesalePrice: "650", unitWholesalePrice: "650", retailPrice: "820", profitMargin: "20", stock: 8, shelfStock: 3, warehouseStock: 5, unit: "kg", unitsPerCarton: 1, cartonSize: 1, expiryDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), supplier: "صياد السمك", lowStockThreshold: 2, lowWarehouseThreshold: 1, createdAt: now, updatedAt: now },
      "58":  { barcode: "ART058", name: "بيض دجاج بلدي 30 بيضة", category: "لحوم", wholesalePrice: "380", unitWholesalePrice: "380", retailPrice: "460", profitMargin: "17", stock: 20, shelfStock: 6, warehouseStock: 14, unit: "piece", unitsPerCarton: 6, cartonSize: 6, expiryDate: soon, supplier: "مزرعة محلية", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "59":  { barcode: "ART059", name: "بيض دجاج عادي 30 بيضة", category: "لحوم", wholesalePrice: "280", unitWholesalePrice: "280", retailPrice: "350", profitMargin: "20", stock: 30, shelfStock: 10, warehouseStock: 20, unit: "piece", unitsPerCarton: 6, cartonSize: 6, expiryDate: soon, supplier: "مزرعة الدجاج", lowStockThreshold: 6, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "60":  { barcode: "ART060", name: "تونة معلبة - جيفي 160 غ", category: "لحوم", wholesalePrice: "195", unitWholesalePrice: "195", retailPrice: "240", profitMargin: "18", stock: 48, shelfStock: 12, warehouseStock: 36, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "جيفي", lowStockThreshold: 8, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "61":  { barcode: "ART061", name: "طماطم طازجة 1 كغ", category: "خضر وفواكه", wholesalePrice: "80", unitWholesalePrice: "80", retailPrice: "110", profitMargin: "27", stock: 20, shelfStock: 10, warehouseStock: 10, unit: "kg", unitsPerCarton: 1, cartonSize: 1, expiryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), supplier: "سوق الجملة", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "62":  { barcode: "ART062", name: "بطاطا 1 كغ", category: "خضر وفواكه", wholesalePrice: "65", unitWholesalePrice: "65", retailPrice: "90", profitMargin: "27", stock: 30, shelfStock: 15, warehouseStock: 15, unit: "kg", unitsPerCarton: 1, cartonSize: 1, expiryDate: null, supplier: "سوق الجملة", lowStockThreshold: 6, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "63":  { barcode: "ART063", name: "بصل 1 كغ", category: "خضر وفواكه", wholesalePrice: "55", unitWholesalePrice: "55", retailPrice: "75", profitMargin: "27", stock: 30, shelfStock: 15, warehouseStock: 15, unit: "kg", unitsPerCarton: 1, cartonSize: 1, expiryDate: null, supplier: "سوق الجملة", lowStockThreshold: 6, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "64":  { barcode: "ART064", name: "فلفل أحمر 1 كغ", category: "خضر وفواكه", wholesalePrice: "95", unitWholesalePrice: "95", retailPrice: "130", profitMargin: "27", stock: 15, shelfStock: 8, warehouseStock: 7, unit: "kg", unitsPerCarton: 1, cartonSize: 1, expiryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), supplier: "سوق الجملة", lowStockThreshold: 4, lowWarehouseThreshold: 1, createdAt: now, updatedAt: now },
      "65":  { barcode: "ART065", name: "كوسة 1 كغ", category: "خضر وفواكه", wholesalePrice: "75", unitWholesalePrice: "75", retailPrice: "100", profitMargin: "25", stock: 15, shelfStock: 8, warehouseStock: 7, unit: "kg", unitsPerCarton: 1, cartonSize: 1, expiryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), supplier: "سوق الجملة", lowStockThreshold: 4, lowWarehouseThreshold: 1, createdAt: now, updatedAt: now },
      "66":  { barcode: "ART066", name: "جزر 1 كغ", category: "خضر وفواكه", wholesalePrice: "70", unitWholesalePrice: "70", retailPrice: "95", profitMargin: "26", stock: 20, shelfStock: 10, warehouseStock: 10, unit: "kg", unitsPerCarton: 1, cartonSize: 1, expiryDate: null, supplier: "سوق الجملة", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "67":  { barcode: "ART067", name: "ثوم 1 كغ", category: "خضر وفواكه", wholesalePrice: "380", unitWholesalePrice: "380", retailPrice: "480", profitMargin: "21", stock: 10, shelfStock: 4, warehouseStock: 6, unit: "kg", unitsPerCarton: 1, cartonSize: 1, expiryDate: null, supplier: "سوق الجملة", lowStockThreshold: 3, lowWarehouseThreshold: 1, createdAt: now, updatedAt: now },
      "68":  { barcode: "ART068", name: "برتقال 1 كغ", category: "خضر وفواكه", wholesalePrice: "85", unitWholesalePrice: "85", retailPrice: "115", profitMargin: "26", stock: 20, shelfStock: 10, warehouseStock: 10, unit: "kg", unitsPerCarton: 1, cartonSize: 1, expiryDate: null, supplier: "سوق الجملة", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "69":  { barcode: "ART069", name: "تفاح 1 كغ", category: "خضر وفواكه", wholesalePrice: "145", unitWholesalePrice: "145", retailPrice: "185", profitMargin: "21", stock: 15, shelfStock: 6, warehouseStock: 9, unit: "kg", unitsPerCarton: 1, cartonSize: 1, expiryDate: null, supplier: "سوق الجملة", lowStockThreshold: 4, lowWarehouseThreshold: 1, createdAt: now, updatedAt: now },
      "70":  { barcode: "ART070", name: "موز 1 كغ", category: "خضر وفواكه", wholesalePrice: "195", unitWholesalePrice: "195", retailPrice: "250", profitMargin: "21", stock: 12, shelfStock: 5, warehouseStock: 7, unit: "kg", unitsPerCarton: 1, cartonSize: 1, expiryDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), supplier: "سوق الجملة", lowStockThreshold: 3, lowWarehouseThreshold: 1, createdAt: now, updatedAt: now },
      "71":  { barcode: "ART071", name: "بطيخ 1 كغ", category: "خضر وفواكه", wholesalePrice: "55", unitWholesalePrice: "55", retailPrice: "80", profitMargin: "31", stock: 25, shelfStock: 12, warehouseStock: 13, unit: "kg", unitsPerCarton: 1, cartonSize: 1, expiryDate: null, supplier: "سوق الجملة", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "72":  { barcode: "ART072", name: "عنب 1 كغ", category: "خضر وفواكه", wholesalePrice: "180", unitWholesalePrice: "180", retailPrice: "235", profitMargin: "23", stock: 10, shelfStock: 5, warehouseStock: 5, unit: "kg", unitsPerCarton: 1, cartonSize: 1, expiryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), supplier: "سوق الجملة", lowStockThreshold: 3, lowWarehouseThreshold: 1, createdAt: now, updatedAt: now },
      "73":  { barcode: "ART073", name: "تمر دقلة نور 1 كغ", category: "خضر وفواكه", wholesalePrice: "580", unitWholesalePrice: "580", retailPrice: "720", profitMargin: "19", stock: 20, shelfStock: 6, warehouseStock: 14, unit: "kg", unitsPerCarton: 10, cartonSize: 10, expiryDate: null, supplier: "واحات بسكرة", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "74":  { barcode: "ART074", name: "تمر غرس 1 كغ", category: "خضر وفواكه", wholesalePrice: "380", unitWholesalePrice: "380", retailPrice: "480", profitMargin: "21", stock: 20, shelfStock: 6, warehouseStock: 14, unit: "kg", unitsPerCarton: 10, cartonSize: 10, expiryDate: null, supplier: "واحات بسكرة", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "75":  { barcode: "ART075", name: "ليمون 1 كغ", category: "خضر وفواكه", wholesalePrice: "120", unitWholesalePrice: "120", retailPrice: "160", profitMargin: "25", stock: 15, shelfStock: 6, warehouseStock: 9, unit: "kg", unitsPerCarton: 1, cartonSize: 1, expiryDate: null, supplier: "سوق الجملة", lowStockThreshold: 3, lowWarehouseThreshold: 1, createdAt: now, updatedAt: now },
      "76":  { barcode: "ART076", name: "طماطم معلبة مركزة - أيدا 800 غ", category: "معلبات", wholesalePrice: "145", unitWholesalePrice: "145", retailPrice: "180", profitMargin: "19", stock: 36, shelfStock: 10, warehouseStock: 26, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "أيدا", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "77":  { barcode: "ART077", name: "طماطم معلبة مركزة - حمود 400 غ", category: "معلبات", wholesalePrice: "85", unitWholesalePrice: "85", retailPrice: "110", profitMargin: "22", stock: 48, shelfStock: 12, warehouseStock: 36, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "حمود بوعلام", lowStockThreshold: 8, lowWarehouseThreshold: 4, createdAt: now, updatedAt: now },
      "78":  { barcode: "ART078", name: "زيتون أخضر - بجاية 350 غ", category: "معلبات", wholesalePrice: "185", unitWholesalePrice: "185", retailPrice: "230", profitMargin: "19", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "مصبرات بجاية", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "79":  { barcode: "ART079", name: "زيتون أسود - الشلف 350 غ", category: "معلبات", wholesalePrice: "175", unitWholesalePrice: "175", retailPrice: "220", profitMargin: "20", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "مصبرات الشلف", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "80":  { barcode: "ART080", name: "فول سوداني محمص 200 غ", category: "معلبات", wholesalePrice: "145", unitWholesalePrice: "145", retailPrice: "185", profitMargin: "21", stock: 30, shelfStock: 10, warehouseStock: 20, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "محمصة الجزائر", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "81":  { barcode: "ART081", name: "مربى مشمش - رمضان 400 غ", category: "معلبات", wholesalePrice: "195", unitWholesalePrice: "195", retailPrice: "245", profitMargin: "20", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "رمضان", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "82":  { barcode: "ART082", name: "مربى تين - القبائل 400 غ", category: "معلبات", wholesalePrice: "210", unitWholesalePrice: "210", retailPrice: "265", profitMargin: "20", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "مصبرات القبائل", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "83":  { barcode: "ART083", name: "خردل فرنسي 200 غ", category: "معلبات", wholesalePrice: "145", unitWholesalePrice: "145", retailPrice: "185", profitMargin: "21", stock: 18, shelfStock: 6, warehouseStock: 12, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "مستورد الغرب", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "84":  { barcode: "ART084", name: "كاتشب طماطم 500 غ", category: "معلبات", wholesalePrice: "185", unitWholesalePrice: "185", retailPrice: "230", profitMargin: "19", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "هاينز", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "85":  { barcode: "ART085", name: "مايونيز 500 غ", category: "معلبات", wholesalePrice: "210", unitWholesalePrice: "210", retailPrice: "265", profitMargin: "20", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "هاينز", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "86":  { barcode: "ART086", name: "مسحوق غسيل - تيد 3 كغ", category: "تنظيف", wholesalePrice: "780", unitWholesalePrice: "780", retailPrice: "950", profitMargin: "17", stock: 15, shelfStock: 5, warehouseStock: 10, unit: "piece", unitsPerCarton: 6, cartonSize: 6, expiryDate: null, supplier: "بروكتر", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "87":  { barcode: "ART087", name: "مسحوق غسيل - أوما 3 كغ", category: "تنظيف", wholesalePrice: "620", unitWholesalePrice: "620", retailPrice: "760", profitMargin: "18", stock: 15, shelfStock: 5, warehouseStock: 10, unit: "piece", unitsPerCarton: 6, cartonSize: 6, expiryDate: null, supplier: "منظفات الجزائر", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "88":  { barcode: "ART088", name: "مسحوق غسيل - برص 1 كغ", category: "تنظيف", wholesalePrice: "195", unitWholesalePrice: "195", retailPrice: "245", profitMargin: "20", stock: 30, shelfStock: 8, warehouseStock: 22, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "منظفات الجزائر", lowStockThreshold: 6, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "89":  { barcode: "ART089", name: "صابون غسيل - نابولي 400 غ", category: "تنظيف", wholesalePrice: "95", unitWholesalePrice: "95", retailPrice: "125", profitMargin: "24", stock: 30, shelfStock: 10, warehouseStock: 20, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "نابولي", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "90":  { barcode: "ART090", name: "صابون حمام - عرعار 100 غ", category: "تنظيف", wholesalePrice: "65", unitWholesalePrice: "65", retailPrice: "85", profitMargin: "23", stock: 48, shelfStock: 12, warehouseStock: 36, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "عرعار", lowStockThreshold: 8, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "91":  { barcode: "ART091", name: "شامبو - هيد آند شولدرز 400 مل", category: "تنظيف", wholesalePrice: "580", unitWholesalePrice: "580", retailPrice: "720", profitMargin: "19", stock: 18, shelfStock: 6, warehouseStock: 12, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "بروكتر", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "92":  { barcode: "ART092", name: "شامبو - بانتين 400 مل", category: "تنظيف", wholesalePrice: "560", unitWholesalePrice: "560", retailPrice: "700", profitMargin: "20", stock: 18, shelfStock: 6, warehouseStock: 12, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "بروكتر", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "93":  { barcode: "ART093", name: "سائل تنظيف الأواني - فيري 750 مل", category: "تنظيف", wholesalePrice: "245", unitWholesalePrice: "245", retailPrice: "305", profitMargin: "19", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "بروكتر", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "94":  { barcode: "ART094", name: "مبيض جافيل - كلور 1 لتر", category: "تنظيف", wholesalePrice: "95", unitWholesalePrice: "95", retailPrice: "125", profitMargin: "24", stock: 36, shelfStock: 10, warehouseStock: 26, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "كلور", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "95":  { barcode: "ART095", name: "منظف متعدد الأغراض - مستر موسكل 750 مل", category: "تنظيف", wholesalePrice: "285", unitWholesalePrice: "285", retailPrice: "360", profitMargin: "20", stock: 18, shelfStock: 6, warehouseStock: 12, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "جونسون", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "96":  { barcode: "ART096", name: "معطر جو - أير ويك 300 مل", category: "تنظيف", wholesalePrice: "345", unitWholesalePrice: "345", retailPrice: "435", profitMargin: "20", stock: 18, shelfStock: 6, warehouseStock: 12, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "ريكيت", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "97":  { barcode: "ART097", name: "ورق تواليت - كلينيكس 12 رول", category: "تنظيف", wholesalePrice: "320", unitWholesalePrice: "320", retailPrice: "400", profitMargin: "20", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 6, cartonSize: 6, expiryDate: null, supplier: "كيمبرلي", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "98":  { barcode: "ART098", name: "مناديل ورقية - كلينيكس 100 قطعة", category: "تنظيف", wholesalePrice: "145", unitWholesalePrice: "145", retailPrice: "185", profitMargin: "21", stock: 36, shelfStock: 10, warehouseStock: 26, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "كيمبرلي", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "99":  { barcode: "ART099", name: "كيس قمامة كبير 20 قطعة", category: "تنظيف", wholesalePrice: "95", unitWholesalePrice: "95", retailPrice: "125", profitMargin: "24", stock: 30, shelfStock: 10, warehouseStock: 20, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "محلي", lowStockThreshold: 6, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "100": { barcode: "ART100", name: "إسفنجة تنظيف - سكوتش برايت", category: "تنظيف", wholesalePrice: "65", unitWholesalePrice: "65", retailPrice: "90", profitMargin: "27", stock: 48, shelfStock: 12, warehouseStock: 36, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "3M", lowStockThreshold: 8, lowWarehouseThreshold: 4, createdAt: now, updatedAt: now },
      "101": { barcode: "ART101", name: "كريم يدين - نيفيا 100 مل", category: "تجميل", wholesalePrice: "245", unitWholesalePrice: "245", retailPrice: "310", profitMargin: "20", stock: 18, shelfStock: 6, warehouseStock: 12, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "نيفيا", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "102": { barcode: "ART102", name: "مزيل تعرق - دوف 150 مل", category: "تجميل", wholesalePrice: "320", unitWholesalePrice: "320", retailPrice: "400", profitMargin: "20", stock: 18, shelfStock: 6, warehouseStock: 12, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "يونيليفر", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "103": { barcode: "ART103", name: "معجون أسنان - كولغيت 100 مل", category: "تجميل", wholesalePrice: "185", unitWholesalePrice: "185", retailPrice: "235", profitMargin: "21", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "كولغيت", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "104": { barcode: "ART104", name: "فرشاة أسنان - كولغيت", category: "تجميل", wholesalePrice: "95", unitWholesalePrice: "95", retailPrice: "125", profitMargin: "24", stock: 30, shelfStock: 10, warehouseStock: 20, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "كولغيت", lowStockThreshold: 6, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "105": { barcode: "ART105", name: "كريم حلاقة - جيليت 200 مل", category: "تجميل", wholesalePrice: "285", unitWholesalePrice: "285", retailPrice: "360", profitMargin: "20", stock: 18, shelfStock: 6, warehouseStock: 12, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "جيليت", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "106": { barcode: "ART106", name: "شفرة حلاقة - جيليت 5 قطع", category: "تجميل", wholesalePrice: "245", unitWholesalePrice: "245", retailPrice: "310", profitMargin: "20", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "جيليت", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "107": { barcode: "ART107", name: "مناديل مبللة - هيبيز 72 قطعة", category: "تجميل", wholesalePrice: "185", unitWholesalePrice: "185", retailPrice: "235", profitMargin: "21", stock: 30, shelfStock: 10, warehouseStock: 20, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "هيبيز", lowStockThreshold: 6, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "108": { barcode: "ART108", name: "حفاضات - هيبيز مقاس 3", category: "تجميل", wholesalePrice: "680", unitWholesalePrice: "680", retailPrice: "850", profitMargin: "20", stock: 15, shelfStock: 5, warehouseStock: 10, unit: "piece", unitsPerCarton: 6, cartonSize: 6, expiryDate: null, supplier: "هيبيز", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "109": { barcode: "ART109", name: "حفاضات - هيبيز مقاس 4", category: "تجميل", wholesalePrice: "720", unitWholesalePrice: "720", retailPrice: "900", profitMargin: "20", stock: 15, shelfStock: 5, warehouseStock: 10, unit: "piece", unitsPerCarton: 6, cartonSize: 6, expiryDate: null, supplier: "هيبيز", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "110": { barcode: "ART110", name: "لوسيون جسم - نيفيا 250 مل", category: "تجميل", wholesalePrice: "380", unitWholesalePrice: "380", retailPrice: "480", profitMargin: "21", stock: 18, shelfStock: 6, warehouseStock: 12, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "نيفيا", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "111": { barcode: "ART111", name: "شوكولاتة - ميلكا 100 غ", category: "حلويات", wholesalePrice: "245", unitWholesalePrice: "245", retailPrice: "310", profitMargin: "20", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "موندليز", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "112": { barcode: "ART112", name: "شوكولاتة - كيندر 50 غ", category: "حلويات", wholesalePrice: "145", unitWholesalePrice: "145", retailPrice: "185", profitMargin: "21", stock: 30, shelfStock: 10, warehouseStock: 20, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "فيريرو", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "113": { barcode: "ART113", name: "بسكويت - لو 200 غ", category: "حلويات", wholesalePrice: "145", unitWholesalePrice: "145", retailPrice: "185", profitMargin: "21", stock: 36, shelfStock: 10, warehouseStock: 26, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "لو", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "114": { barcode: "ART114", name: "بسكويت ماريا - سامي 200 غ", category: "حلويات", wholesalePrice: "95", unitWholesalePrice: "95", retailPrice: "125", profitMargin: "24", stock: 48, shelfStock: 12, warehouseStock: 36, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "سامي", lowStockThreshold: 8, lowWarehouseThreshold: 4, createdAt: now, updatedAt: now },
      "115": { barcode: "ART115", name: "حلوى كراميل - وريدة 200 غ", category: "حلويات", wholesalePrice: "85", unitWholesalePrice: "85", retailPrice: "115", profitMargin: "26", stock: 36, shelfStock: 10, warehouseStock: 26, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "وريدة", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "116": { barcode: "ART116", name: "علكة - بيج باب", category: "حلويات", wholesalePrice: "15", unitWholesalePrice: "15", retailPrice: "25", profitMargin: "40", stock: 60, shelfStock: 20, warehouseStock: 40, unit: "piece", unitsPerCarton: 100, cartonSize: 100, expiryDate: null, supplier: "علك", lowStockThreshold: 10, lowWarehouseThreshold: 5, createdAt: now, updatedAt: now },
      "117": { barcode: "ART117", name: "مقرمشات شيبس - جوكر 30 غ", category: "حلويات", wholesalePrice: "55", unitWholesalePrice: "55", retailPrice: "75", profitMargin: "27", stock: 48, shelfStock: 12, warehouseStock: 36, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "جوكر", lowStockThreshold: 8, lowWarehouseThreshold: 4, createdAt: now, updatedAt: now },
      "118": { barcode: "ART118", name: "مقرمشات شيبس - فريتو 50 غ", category: "حلويات", wholesalePrice: "85", unitWholesalePrice: "85", retailPrice: "110", profitMargin: "22", stock: 48, shelfStock: 12, warehouseStock: 36, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "فريتو لاي", lowStockThreshold: 8, lowWarehouseThreshold: 4, createdAt: now, updatedAt: now },
      "119": { barcode: "ART119", name: "فول سوداني محمص مملح 100 غ", category: "حلويات", wholesalePrice: "75", unitWholesalePrice: "75", retailPrice: "100", profitMargin: "25", stock: 48, shelfStock: 12, warehouseStock: 36, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "محمصة الجزائر", lowStockThreshold: 8, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "120": { barcode: "ART120", name: "كعك بالتمر - غرداية 250 غ", category: "حلويات", wholesalePrice: "285", unitWholesalePrice: "285", retailPrice: "360", profitMargin: "20", stock: 20, shelfStock: 6, warehouseStock: 14, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "غرداية", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "121": { barcode: "ART121", name: "فلفل أحمر مطحون 100 غ", category: "توابل", wholesalePrice: "95", unitWholesalePrice: "95", retailPrice: "125", profitMargin: "24", stock: 36, shelfStock: 10, warehouseStock: 26, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "توابل الجزائر", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "122": { barcode: "ART122", name: "كمون مطحون 100 غ", category: "توابل", wholesalePrice: "85", unitWholesalePrice: "85", retailPrice: "115", profitMargin: "26", stock: 36, shelfStock: 10, warehouseStock: 26, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "توابل الجزائر", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "123": { barcode: "ART123", name: "قرفة مطحونة 50 غ", category: "توابل", wholesalePrice: "75", unitWholesalePrice: "75", retailPrice: "100", profitMargin: "25", stock: 30, shelfStock: 8, warehouseStock: 22, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "توابل الجزائر", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "124": { barcode: "ART124", name: "كركم 100 غ", category: "توابل", wholesalePrice: "110", unitWholesalePrice: "110", retailPrice: "145", profitMargin: "24", stock: 30, shelfStock: 8, warehouseStock: 22, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "توابل الجزائر", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "125": { barcode: "ART125", name: "بهارات مشكلة - راس الحانوت 100 غ", category: "توابل", wholesalePrice: "145", unitWholesalePrice: "145", retailPrice: "185", profitMargin: "21", stock: 30, shelfStock: 8, warehouseStock: 22, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "توابل الجزائر", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "126": { barcode: "ART126", name: "خميرة الخبز - لولو 11 غ", category: "توابل", wholesalePrice: "35", unitWholesalePrice: "35", retailPrice: "50", profitMargin: "30", stock: 60, shelfStock: 15, warehouseStock: 45, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "لولو", lowStockThreshold: 10, lowWarehouseThreshold: 4, createdAt: now, updatedAt: now },
      "127": { barcode: "ART127", name: "صودا الخبز 200 غ", category: "توابل", wholesalePrice: "65", unitWholesalePrice: "65", retailPrice: "90", profitMargin: "27", stock: 30, shelfStock: 8, warehouseStock: 22, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "محلي", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "128": { barcode: "ART128", name: "خل أبيض 1 لتر", category: "توابل", wholesalePrice: "85", unitWholesalePrice: "85", retailPrice: "115", profitMargin: "26", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "محلي", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "129": { barcode: "ART129", name: "صلصة حارة هريسة 200 غ", category: "توابل", wholesalePrice: "95", unitWholesalePrice: "95", retailPrice: "130", profitMargin: "27", stock: 30, shelfStock: 10, warehouseStock: 20, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "مصبرات الجزائر", lowStockThreshold: 6, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "130": { barcode: "ART130", name: "مرق جاهز - ماجي 10 مكعبات", category: "توابل", wholesalePrice: "85", unitWholesalePrice: "85", retailPrice: "115", profitMargin: "26", stock: 48, shelfStock: 12, warehouseStock: 36, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "نستله", lowStockThreshold: 8, lowWarehouseThreshold: 4, createdAt: now, updatedAt: now },
      "131": { barcode: "ART131", name: "خبز بلدي", category: "مخبوزات", wholesalePrice: "18", unitWholesalePrice: "18", retailPrice: "25", profitMargin: "28", stock: 50, shelfStock: 50, warehouseStock: 0, unit: "piece", unitsPerCarton: 1, cartonSize: 1, expiryDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), supplier: "مخبزة الحي", lowStockThreshold: 10, lowWarehouseThreshold: 0, createdAt: now, updatedAt: now },
      "132": { barcode: "ART132", name: "باقيت فرنسي", category: "مخبوزات", wholesalePrice: "22", unitWholesalePrice: "22", retailPrice: "30", profitMargin: "27", stock: 40, shelfStock: 40, warehouseStock: 0, unit: "piece", unitsPerCarton: 1, cartonSize: 1, expiryDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), supplier: "مخبزة الحي", lowStockThreshold: 10, lowWarehouseThreshold: 0, createdAt: now, updatedAt: now },
      "133": { barcode: "ART133", name: "خبز الطابون 1 كغ", category: "مخبوزات", wholesalePrice: "85", unitWholesalePrice: "85", retailPrice: "110", profitMargin: "22", stock: 20, shelfStock: 20, warehouseStock: 0, unit: "piece", unitsPerCarton: 1, cartonSize: 1, expiryDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), supplier: "فرن محلي", lowStockThreshold: 5, lowWarehouseThreshold: 0, createdAt: now, updatedAt: now },
      "134": { barcode: "ART134", name: "كعك بالسمسم", category: "مخبوزات", wholesalePrice: "35", unitWholesalePrice: "35", retailPrice: "50", profitMargin: "30", stock: 30, shelfStock: 30, warehouseStock: 0, unit: "piece", unitsPerCarton: 1, cartonSize: 1, expiryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), supplier: "مخبزة الحي", lowStockThreshold: 8, lowWarehouseThreshold: 0, createdAt: now, updatedAt: now },
      "135": { barcode: "ART135", name: "مسمن", category: "مخبوزات", wholesalePrice: "45", unitWholesalePrice: "45", retailPrice: "65", profitMargin: "31", stock: 20, shelfStock: 20, warehouseStock: 0, unit: "piece", unitsPerCarton: 1, cartonSize: 1, expiryDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), supplier: "مخبزة الحي", lowStockThreshold: 5, lowWarehouseThreshold: 0, createdAt: now, updatedAt: now },
      "136": { barcode: "ART136", name: "بغرير 6 قطع", category: "مخبوزات", wholesalePrice: "95", unitWholesalePrice: "95", retailPrice: "130", profitMargin: "27", stock: 15, shelfStock: 15, warehouseStock: 0, unit: "piece", unitsPerCarton: 1, cartonSize: 1, expiryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), supplier: "مخبزة الحي", lowStockThreshold: 4, lowWarehouseThreshold: 0, createdAt: now, updatedAt: now },
      "137": { barcode: "ART137", name: "قرص هرشة", category: "مخبوزات", wholesalePrice: "55", unitWholesalePrice: "55", retailPrice: "75", profitMargin: "27", stock: 20, shelfStock: 20, warehouseStock: 0, unit: "piece", unitsPerCarton: 1, cartonSize: 1, expiryDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), supplier: "مخبزة الحي", lowStockThreshold: 5, lowWarehouseThreshold: 0, createdAt: now, updatedAt: now },
      "138": { barcode: "ART138", name: "زلابية 250 غ", category: "مخبوزات", wholesalePrice: "95", unitWholesalePrice: "95", retailPrice: "130", profitMargin: "27", stock: 15, shelfStock: 15, warehouseStock: 0, unit: "piece", unitsPerCarton: 1, cartonSize: 1, expiryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), supplier: "حلواني الحي", lowStockThreshold: 4, lowWarehouseThreshold: 0, createdAt: now, updatedAt: now },
      "139": { barcode: "ART139", name: "قالب حلوى عيد 500 غ", category: "مخبوزات", wholesalePrice: "380", unitWholesalePrice: "380", retailPrice: "480", profitMargin: "21", stock: 10, shelfStock: 10, warehouseStock: 0, unit: "piece", unitsPerCarton: 1, cartonSize: 1, expiryDate: soon, supplier: "حلواني الحي", lowStockThreshold: 3, lowWarehouseThreshold: 0, createdAt: now, updatedAt: now },
      "140": { barcode: "ART140", name: "تشاراك 250 غ", category: "مخبوزات", wholesalePrice: "220", unitWholesalePrice: "220", retailPrice: "280", profitMargin: "21", stock: 15, shelfStock: 15, warehouseStock: 0, unit: "piece", unitsPerCarton: 1, cartonSize: 1, expiryDate: soon, supplier: "حلواني الحي", lowStockThreshold: 4, lowWarehouseThreshold: 0, createdAt: now, updatedAt: now },
      "141": { barcode: "ART141", name: "علبة كبريت - نافطة", category: "أدوات", wholesalePrice: "35", unitWholesalePrice: "35", retailPrice: "50", profitMargin: "30", stock: 60, shelfStock: 15, warehouseStock: 45, unit: "piece", unitsPerCarton: 50, cartonSize: 50, expiryDate: null, supplier: "محلي", lowStockThreshold: 10, lowWarehouseThreshold: 5, createdAt: now, updatedAt: now },
      "142": { barcode: "ART142", name: "شمعة بيضاء 4 قطع", category: "أدوات", wholesalePrice: "65", unitWholesalePrice: "65", retailPrice: "90", profitMargin: "27", stock: 30, shelfStock: 10, warehouseStock: 20, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "محلي", lowStockThreshold: 6, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "143": { barcode: "ART143", name: "بطارية AA - دوراسيل 4 قطع", category: "أدوات", wholesalePrice: "245", unitWholesalePrice: "245", retailPrice: "310", profitMargin: "20", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "دوراسيل", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "144": { barcode: "ART144", name: "بطارية AAA - دوراسيل 4 قطع", category: "أدوات", wholesalePrice: "225", unitWholesalePrice: "225", retailPrice: "290", profitMargin: "22", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "دوراسيل", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "145": { barcode: "ART145", name: "لمبة LED 9W", category: "أدوات", wholesalePrice: "185", unitWholesalePrice: "185", retailPrice: "240", profitMargin: "22", stock: 20, shelfStock: 6, warehouseStock: 14, unit: "piece", unitsPerCarton: 10, cartonSize: 10, expiryDate: null, supplier: "فيليبس", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "146": { barcode: "ART146", name: "شريط لاصق شفاف", category: "أدوات", wholesalePrice: "55", unitWholesalePrice: "55", retailPrice: "80", profitMargin: "31", stock: 36, shelfStock: 10, warehouseStock: 26, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "محلي", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "147": { barcode: "ART147", name: "قلم حبر جاف - بيك", category: "أدوات", wholesalePrice: "25", unitWholesalePrice: "25", retailPrice: "40", profitMargin: "37", stock: 60, shelfStock: 15, warehouseStock: 45, unit: "piece", unitsPerCarton: 50, cartonSize: 50, expiryDate: null, supplier: "بيك", lowStockThreshold: 10, lowWarehouseThreshold: 5, createdAt: now, updatedAt: now },
      "148": { barcode: "ART148", name: "دفتر 100 صفحة", category: "أدوات", wholesalePrice: "95", unitWholesalePrice: "95", retailPrice: "130", profitMargin: "27", stock: 24, shelfStock: 8, warehouseStock: 16, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "مكتبة", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "149": { barcode: "ART149", name: "خيط خياطة 500 م", category: "أدوات", wholesalePrice: "45", unitWholesalePrice: "45", retailPrice: "70", profitMargin: "35", stock: 20, shelfStock: 8, warehouseStock: 12, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "خردوات", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "150": { barcode: "ART150", name: "إبرة خياطة 10 قطع", category: "أدوات", wholesalePrice: "25", unitWholesalePrice: "25", retailPrice: "45", profitMargin: "44", stock: 30, shelfStock: 10, warehouseStock: 20, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "خردوات", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
    },
    customers: {
      "1": { name: "محمد بن علي", phone: "0555123456", address: "الجزائر العاصمة", totalDebt: "2500", creditLimit: "10000", createdAt: now, updatedAt: now },
      "2": { name: "فاطمة زروقي", phone: "0555987654", address: "وهران", totalDebt: "0", creditLimit: "8000", createdAt: now, updatedAt: now },
      "3": { name: "عائلة مراد", phone: "0555765432", address: "البليدة", totalDebt: "6800", creditLimit: "12000", createdAt: now, updatedAt: now },
      "4": { name: "أمينة قادري", phone: "0555345678", address: "قسنطينة", totalDebt: "1200", creditLimit: "9000", createdAt: now, updatedAt: now },
    },
    sales: {
      "1": { cashierId: 2, cashierName: "Cashier", customerId: null, customerName: null, items: [{ productId: 8, productName: "سكر أبيض حبة 1 كغ", price: 115, quantity: 3, unit: "piece", subtotal: 345 }, { productId: 21, productName: "مياه معدنية ليلى 1.5 لتر", price: 50, quantity: 6, unit: "piece", subtotal: 300 }], subtotal: "645", discount: "0", total: "645", paid: true, paymentMethod: "cash", createdAt: day(0) },
      "2": { cashierId: 2, cashierName: "Cashier", customerId: 1, customerName: "محمد بن علي", items: [{ productId: 5, productName: "زيت سفينة 1 لتر", price: 225, quantity: 2, unit: "piece", subtotal: 450 }, { productId: 1, productName: "دقيق مطحون ممتاز - قنطارة 5 كغ", price: 320, quantity: 1, unit: "piece", subtotal: 320 }], subtotal: "770", discount: "20", total: "750", paid: false, paymentMethod: "karni", createdAt: day(0) },
      "3": { cashierId: 2, cashierName: "Cashier", customerId: null, customerName: null, items: [{ productId: 76, productName: "طماطم معلبة مركزة - أيدا 800 غ", price: 180, quantity: 4, unit: "piece", subtotal: 720 }, { productId: 26, productName: "مشروب كوكاكولا 1.25 لتر", price: 175, quantity: 3, unit: "piece", subtotal: 525 }], subtotal: "1245", discount: "0", total: "1245", paid: true, paymentMethod: "cash", createdAt: day(-1) },
      "4": { cashierId: 2, cashierName: "Cashier", customerId: 3, customerName: "عائلة مراد", items: [{ productId: 109, productName: "حفاضات - هيبيز مقاس 4", price: 900, quantity: 1, unit: "piece", subtotal: 900 }, { productId: 48, productName: "لبن رائب 1 لتر", price: 105, quantity: 2, unit: "piece", subtotal: 210 }], subtotal: "1110", discount: "10", total: "1100", paid: false, paymentMethod: "karni", createdAt: day(-2) },
      "5": { cashierId: 2, cashierName: "Cashier", customerId: null, customerName: null, items: [{ productId: 38, productName: "قهوة مطحونة - المعلم 250 غ", price: 500, quantity: 1, unit: "piece", subtotal: 500 }, { productId: 73, productName: "تمر دقلة نور 1 كغ", price: 720, quantity: 1, unit: "kg", subtotal: 720 }], subtotal: "1220", discount: "20", total: "1200", paid: true, paymentMethod: "cash", createdAt: day(-3) },
    },
    shortages: {
      "1": { productId: 5, productName: "زيت سفينة 1 لتر", quantity: 6, type: "shortage", status: "pending", reportedById: 2, reportedByName: "Cashier", notes: "الرف شبه فارغ في جهة الزيوت", createdAt: day(0), resolvedAt: null },
      "2": { productId: 73, productName: "تمر دقلة نور 1 كغ", quantity: 8, type: "shortage", status: "pending", reportedById: 4, reportedByName: "Worker", notes: "يحتاج تعبئة من المستودع", createdAt: day(-1), resolvedAt: null },
      "3": { productId: 48, productName: "لبن رائب 1 لتر", quantity: 2, type: "expired", status: "resolved", reportedById: 4, reportedByName: "Worker", notes: "تم عزل العبوات القريبة من الانتهاء", createdAt: day(-2), resolvedAt: day(-1) },
    },
    tasks: {
      "1": { title: "تعبئة رف الزيوت", description: "نقل زيت سفينة من المستودع إلى الرف", assignedToId: 4, assignedToName: "Worker", reportedById: 2, reportedByName: "Cashier", type: "restock", productId: 5, productName: "زيت سفينة 1 لتر", status: "pending", points: 10, approvedById: null, approvedByName: null, approvedAt: null, completedAt: null, notes: null, createdAt: day(0) },
      "2": { title: "فحص صلاحية الألبان", description: "مراجعة الحليب واللبن والجبن قبل نهاية اليوم", assignedToId: 4, assignedToName: "Worker", reportedById: 1, reportedByName: "Aymen Admin", type: "report", productId: 48, productName: "لبن رائب 1 لتر", status: "pending", points: 12, approvedById: null, approvedByName: null, approvedAt: null, completedAt: null, notes: null, createdAt: day(0) },
      "3": { title: "مراجعة عرض الموزع", description: "مقارنة سعر القهوة الجديد مع متوسط السوق", assignedToId: 3, assignedToName: "Buyer", reportedById: 1, reportedByName: "Aymen Admin", type: "other", productId: 38, productName: "قهوة مطحونة - المعلم 250 غ", status: "pending", points: 8, approvedById: null, approvedByName: null, approvedAt: null, completedAt: null, notes: null, createdAt: day(-1) },
    },
    expenses: {
      "1": { name: "كراء المحل", category: "إيجار", amount: "120000", type: "monthly", month: currentMonth, daysInMonth: 30, dailyAmount: "4000", createdAt: now, updatedAt: now },
      "2": { name: "كهرباء وتبريد", category: "خدمات", amount: "36000", type: "monthly", month: currentMonth, daysInMonth: 30, dailyAmount: "1200", createdAt: now, updatedAt: now },
      "3": { name: "صيانة قارئ الباركود", category: "صيانة", amount: "6500", type: "one_time", month: currentMonth, daysInMonth: null, dailyAmount: null, createdAt: now, updatedAt: now },
    },
    advances: {
      "1": { userId: 4, userName: "Worker", amount: "5000", type: "advance", month: currentMonth, reason: "تسبيق شهري", createdAt: day(-4), updatedAt: day(-4) },
      "2": { userId: 2, userName: "Cashier", amount: "1200", type: "penalty", month: currentMonth, reason: "فرق صندوق سابق", createdAt: day(-6), updatedAt: day(-6) },
    },
    shifts: {
      "1": { cashierId: 2, cashierName: "Cashier", startingFloat: "5000", systemTotal: "2760", totalSales: "4060", closingCash: "7760", deficit: "0", notes: "وردية تجريبية مغلقة", status: "closed", openedAt: day(-1), closedAt: day(-1) },
    },
    online_orders: {
      "1": { customerId: 1, customerName: "محمد بن علي", phone: "0555123456", address: "الجزائر العاصمة", notes: "التوصيل بعد العصر", items: [{ productId: 21, productName: "مياه معدنية ليلى 1.5 لتر", price: 50, quantity: 6, subtotal: 300 }, { productId: 131, productName: "خبز بلدي", price: 25, quantity: 5, subtotal: 125 }], subtotal: "425", deliveryFee: "200", total: "625", paymentMethod: "cash_on_delivery", status: "pending", assignedDistributorId: 6, assignedDistributorName: "موزع العاصمة", createdAt: day(0), updatedAt: day(0) },
      "2": { customerId: 3, customerName: "عائلة مراد", phone: "0555765432", address: "البليدة", notes: "إضافة على الكرني", items: [{ productId: 109, productName: "حفاضات - هيبيز مقاس 4", price: 900, quantity: 1, subtotal: 900 }], subtotal: "900", deliveryFee: "200", total: "1100", paymentMethod: "karni", status: "confirmed", assignedDistributorId: null, assignedDistributorName: null, createdAt: day(-1), updatedAt: day(-1) },
      "3": { customerId: 4, customerName: "أمينة قادري", phone: "0555345678", address: "قسنطينة", notes: "استلام من المتجر", items: [{ productId: 38, productName: "قهوة مطحونة - المعلم 250 غ", price: 500, quantity: 2, subtotal: 1000 }], subtotal: "1000", deliveryFee: "0", total: "1000", paymentMethod: "store_pickup", status: "preparing", assignedDistributorId: null, assignedDistributorName: null, createdAt: day(-2), updatedAt: day(-2) },
    },
    distributor_offers: {
      "1": { productName: "قهوة مطحونة - المعلم 250 غ", category: "مشروبات", wholesalePrice: "400", minimumQuantity: 24, availableQuantity: 240, deliveryDays: 2, notes: "سعر خاص للكمية الكبيرة", status: "active", distributorId: 6, distributorName: "موزع العاصمة", createdAt: day(-1), updatedAt: day(-1) },
      "2": { productName: "زيت سفينة 1 لتر", category: "مواد غذائية", wholesalePrice: "185", minimumQuantity: 12, availableQuantity: 96, deliveryDays: 1, notes: "متوفر للتسليم السريع", status: "active", distributorId: 6, distributorName: "موزع العاصمة", createdAt: day(-2), updatedAt: day(-2) },
      "3": { productName: "حفاضات - هيبيز مقاس 4", category: "تجميل", wholesalePrice: "700", minimumQuantity: 6, availableQuantity: 48, deliveryDays: 3, notes: "دفعة جديدة", status: "paused", distributorId: 6, distributorName: "موزع العاصمة", createdAt: day(-3), updatedAt: day(-1) },
    },
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
