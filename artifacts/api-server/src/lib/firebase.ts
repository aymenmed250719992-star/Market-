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
      products: { next: 16 },
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
      "1": { barcode: "6130001000011", cartonBarcode: "6130001001018", name: "حليب كامل الدسم", category: "ألبان", wholesalePrice: "90", unitWholesalePrice: "90", retailPrice: "120", profitMargin: "15", stock: 30, shelfStock: 12, warehouseStock: 3, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: soon, supplier: "ملبنة الجزائر", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "2": { barcode: "6130001000028", cartonBarcode: "6130001001025", name: "خبز تقليدي", category: "مخبوزات", wholesalePrice: "20", unitWholesalePrice: "20", retailPrice: "30", profitMargin: "15", stock: 50, shelfStock: 50, warehouseStock: 0, unit: "piece", unitsPerCarton: 1, cartonSize: 1, expiryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), supplier: "مخبزة الحي", lowStockThreshold: 10, lowWarehouseThreshold: 0, createdAt: now, updatedAt: now },
      "3": { barcode: "6130001000035", cartonBarcode: "6130001001032", name: "سميد متوسط", category: "مواد غذائية", wholesalePrice: "130", unitWholesalePrice: "130", retailPrice: "165", profitMargin: "20", stock: 18, shelfStock: 6, warehouseStock: 2, unit: "kg", unitsPerCarton: 10, cartonSize: 10, expiryDate: null, supplier: "مطاحن الشرق", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "4": { barcode: "6130001000042", cartonBarcode: "6130001001049", name: "زيت نباتي 1ل", category: "مواد غذائية", wholesalePrice: "350", unitWholesalePrice: "350", retailPrice: "430", profitMargin: "18", stock: 8, shelfStock: 3, warehouseStock: 1, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "مصنع الزيوت", lowStockThreshold: 5, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "5": { barcode: "6130001000059", cartonBarcode: "6130001001056", name: "سكر أبيض 1كغ", category: "مواد غذائية", wholesalePrice: "120", unitWholesalePrice: "120", retailPrice: "150", profitMargin: "15", stock: 40, shelfStock: 18, warehouseStock: 4, unit: "kg", unitsPerCarton: 10, cartonSize: 10, expiryDate: null, supplier: "تعاونية السكر", lowStockThreshold: 8, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "6": { barcode: "6130001000066", cartonBarcode: "6130001001063", name: "قهوة مطحونة 250غ", category: "مشروبات", wholesalePrice: "210", unitWholesalePrice: "210", retailPrice: "280", profitMargin: "25", stock: 24, shelfStock: 10, warehouseStock: 14, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "قهوة الساحل", lowStockThreshold: 6, lowWarehouseThreshold: 4, createdAt: now, updatedAt: now },
      "7": { barcode: "6130001000073", cartonBarcode: "6130001001070", name: "أرز بسمتي 1كغ", category: "مواد غذائية", wholesalePrice: "240", unitWholesalePrice: "240", retailPrice: "310", profitMargin: "22", stock: 33, shelfStock: 9, warehouseStock: 24, unit: "kg", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "مستورد الجنوب", lowStockThreshold: 6, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "8": { barcode: "6130001000080", cartonBarcode: "6130001001087", name: "معجون طماطم 800غ", category: "معلبات", wholesalePrice: "145", unitWholesalePrice: "145", retailPrice: "195", profitMargin: "25", stock: 26, shelfStock: 8, warehouseStock: 18, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: null, supplier: "مصبرات الهضاب", lowStockThreshold: 6, lowWarehouseThreshold: 4, createdAt: now, updatedAt: now },
      "9": { barcode: "6130001000097", cartonBarcode: "6130001001094", name: "ماء معدني 1.5ل", category: "مشروبات", wholesalePrice: "45", unitWholesalePrice: "45", retailPrice: "70", profitMargin: "30", stock: 55, shelfStock: 25, warehouseStock: 30, unit: "piece", unitsPerCarton: 6, cartonSize: 6, expiryDate: null, supplier: "منابع الأطلس", lowStockThreshold: 12, lowWarehouseThreshold: 6, createdAt: now, updatedAt: now },
      "10": { barcode: "6130001000103", cartonBarcode: "6130001001100", name: "لبن رائب 1ل", category: "ألبان", wholesalePrice: "95", unitWholesalePrice: "95", retailPrice: "130", profitMargin: "22", stock: 16, shelfStock: 5, warehouseStock: 11, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), supplier: "ملبنة الجزائر", lowStockThreshold: 5, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "11": { barcode: "6130001000110", cartonBarcode: "6130001001117", name: "جبن مثلثات", category: "ألبان", wholesalePrice: "180", unitWholesalePrice: "180", retailPrice: "240", profitMargin: "24", stock: 14, shelfStock: 4, warehouseStock: 10, unit: "piece", unitsPerCarton: 24, cartonSize: 24, expiryDate: soon, supplier: "أجبان المتوسط", lowStockThreshold: 5, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "12": { barcode: "6130001000127", cartonBarcode: "6130001001124", name: "مسحوق غسيل 1كغ", category: "تنظيف", wholesalePrice: "330", unitWholesalePrice: "330", retailPrice: "420", profitMargin: "20", stock: 18, shelfStock: 7, warehouseStock: 11, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "منظفات النور", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "13": { barcode: "6130001000134", cartonBarcode: "6130001001131", name: "حفاضات أطفال مقاس 4", category: "أطفال", wholesalePrice: "780", unitWholesalePrice: "780", retailPrice: "980", profitMargin: "18", stock: 9, shelfStock: 3, warehouseStock: 6, unit: "piece", unitsPerCarton: 6, cartonSize: 6, expiryDate: null, supplier: "رعاية الطفل", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
      "14": { barcode: "6130001000141", cartonBarcode: "6130001001148", name: "شامبو 400مل", category: "عناية", wholesalePrice: "260", unitWholesalePrice: "260", retailPrice: "350", profitMargin: "26", stock: 22, shelfStock: 9, warehouseStock: 13, unit: "piece", unitsPerCarton: 12, cartonSize: 12, expiryDate: null, supplier: "عناية الجزائر", lowStockThreshold: 5, lowWarehouseThreshold: 3, createdAt: now, updatedAt: now },
      "15": { barcode: "6130001000158", cartonBarcode: "6130001001155", name: "تمر دقلة نور", category: "مواد غذائية", wholesalePrice: "520", unitWholesalePrice: "520", retailPrice: "690", profitMargin: "24", stock: 12, shelfStock: 2, warehouseStock: 10, unit: "kg", unitsPerCarton: 10, cartonSize: 10, expiryDate: null, supplier: "واحات بسكرة", lowStockThreshold: 4, lowWarehouseThreshold: 2, createdAt: now, updatedAt: now },
    },
    customers: {
      "1": { name: "محمد بن علي", phone: "0555123456", address: "الجزائر العاصمة", totalDebt: "2500", creditLimit: "10000", createdAt: now, updatedAt: now },
      "2": { name: "فاطمة زروقي", phone: "0555987654", address: "وهران", totalDebt: "0", creditLimit: "8000", createdAt: now, updatedAt: now },
      "3": { name: "عائلة مراد", phone: "0555765432", address: "البليدة", totalDebt: "6800", creditLimit: "12000", createdAt: now, updatedAt: now },
      "4": { name: "أمينة قادري", phone: "0555345678", address: "قسنطينة", totalDebt: "1200", creditLimit: "9000", createdAt: now, updatedAt: now },
    },
    sales: {
      "1": { cashierId: 2, cashierName: "Cashier", customerId: null, customerName: null, items: [{ productId: 1, productName: "حليب كامل الدسم", price: 120, quantity: 2, unit: "piece", subtotal: 240 }, { productId: 2, productName: "خبز تقليدي", price: 30, quantity: 4, unit: "piece", subtotal: 120 }], subtotal: "360", discount: "0", total: "360", paid: true, paymentMethod: "cash", createdAt: day(0) },
      "2": { cashierId: 2, cashierName: "Cashier", customerId: 1, customerName: "محمد بن علي", items: [{ productId: 4, productName: "زيت نباتي 1ل", price: 430, quantity: 2, unit: "piece", subtotal: 860 }, { productId: 5, productName: "سكر أبيض 1كغ", price: 150, quantity: 3, unit: "kg", subtotal: 450 }], subtotal: "1310", discount: "10", total: "1300", paid: false, paymentMethod: "karni", createdAt: day(0) },
      "3": { cashierId: 2, cashierName: "Cashier", customerId: null, customerName: null, items: [{ productId: 8, productName: "معجون طماطم 800غ", price: 195, quantity: 4, unit: "piece", subtotal: 780 }, { productId: 9, productName: "ماء معدني 1.5ل", price: 70, quantity: 6, unit: "piece", subtotal: 420 }], subtotal: "1200", discount: "0", total: "1200", paid: true, paymentMethod: "cash", createdAt: day(-1) },
      "4": { cashierId: 2, cashierName: "Cashier", customerId: 3, customerName: "عائلة مراد", items: [{ productId: 13, productName: "حفاضات أطفال مقاس 4", price: 980, quantity: 1, unit: "piece", subtotal: 980 }, { productId: 10, productName: "لبن رائب 1ل", price: 130, quantity: 2, unit: "piece", subtotal: 260 }], subtotal: "1240", discount: "40", total: "1200", paid: false, paymentMethod: "karni", createdAt: day(-2) },
      "5": { cashierId: 2, cashierName: "Cashier", customerId: null, customerName: null, items: [{ productId: 6, productName: "قهوة مطحونة 250غ", price: 280, quantity: 2, unit: "piece", subtotal: 560 }, { productId: 15, productName: "تمر دقلة نور", price: 690, quantity: 1, unit: "kg", subtotal: 690 }], subtotal: "1250", discount: "50", total: "1200", paid: true, paymentMethod: "cash", createdAt: day(-3) },
    },
    shortages: {
      "1": { productId: 4, productName: "زيت نباتي 1ل", quantity: 6, type: "shortage", status: "pending", reportedById: 2, reportedByName: "Cashier", notes: "الرف شبه فارغ في جهة الزيوت", createdAt: day(0), resolvedAt: null },
      "2": { productId: 15, productName: "تمر دقلة نور", quantity: 8, type: "shortage", status: "pending", reportedById: 4, reportedByName: "Worker", notes: "يحتاج تعبئة من المستودع", createdAt: day(-1), resolvedAt: null },
      "3": { productId: 10, productName: "لبن رائب 1ل", quantity: 2, type: "expired", status: "resolved", reportedById: 4, reportedByName: "Worker", notes: "تم عزل العبوات القريبة من الانتهاء", createdAt: day(-2), resolvedAt: day(-1) },
    },
    tasks: {
      "1": { title: "تعبئة رف الزيوت", description: "نقل كرتون زيت نباتي من المستودع إلى الرف", assignedToId: 4, assignedToName: "Worker", reportedById: 2, reportedByName: "Cashier", type: "restock", productId: 4, productName: "زيت نباتي 1ل", status: "pending", points: 10, approvedById: null, approvedByName: null, approvedAt: null, completedAt: null, notes: null, createdAt: day(0) },
      "2": { title: "فحص صلاحية الألبان", description: "مراجعة الحليب واللبن والجبن قبل نهاية اليوم", assignedToId: 4, assignedToName: "Worker", reportedById: 1, reportedByName: "Aymen Admin", type: "report", productId: 10, productName: "لبن رائب 1ل", status: "pending", points: 12, approvedById: null, approvedByName: null, approvedAt: null, completedAt: null, notes: null, createdAt: day(0) },
      "3": { title: "مراجعة عرض الموزع", description: "مقارنة سعر القهوة الجديد مع متوسط السوق", assignedToId: 3, assignedToName: "Buyer", reportedById: 1, reportedByName: "Aymen Admin", type: "other", productId: 6, productName: "قهوة مطحونة 250غ", status: "pending", points: 8, approvedById: null, approvedByName: null, approvedAt: null, completedAt: null, notes: null, createdAt: day(-1) },
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
      "1": { customerId: 1, customerName: "محمد بن علي", phone: "0555123456", address: "الجزائر العاصمة", notes: "التوصيل بعد العصر", items: [{ productId: 9, productName: "ماء معدني 1.5ل", price: 70, quantity: 6, subtotal: 420 }, { productId: 2, productName: "خبز تقليدي", price: 30, quantity: 5, subtotal: 150 }], subtotal: "570", deliveryFee: "200", total: "770", paymentMethod: "cash_on_delivery", status: "pending", assignedDistributorId: 6, assignedDistributorName: "موزع العاصمة", createdAt: day(0), updatedAt: day(0) },
      "2": { customerId: 3, customerName: "عائلة مراد", phone: "0555765432", address: "البليدة", notes: "إضافة على الكرني", items: [{ productId: 13, productName: "حفاضات أطفال مقاس 4", price: 980, quantity: 1, subtotal: 980 }], subtotal: "980", deliveryFee: "200", total: "1180", paymentMethod: "karni", status: "confirmed", assignedDistributorId: null, assignedDistributorName: null, createdAt: day(-1), updatedAt: day(-1) },
      "3": { customerId: 4, customerName: "أمينة قادري", phone: "0555345678", address: "قسنطينة", notes: "استلام من المتجر", items: [{ productId: 6, productName: "قهوة مطحونة 250غ", price: 280, quantity: 2, subtotal: 560 }], subtotal: "560", deliveryFee: "0", total: "560", paymentMethod: "store_pickup", status: "preparing", assignedDistributorId: null, assignedDistributorName: null, createdAt: day(-2), updatedAt: day(-2) },
    },
    distributor_offers: {
      "1": { productName: "قهوة مطحونة 250غ", category: "مشروبات", wholesalePrice: "205", minimumQuantity: 24, availableQuantity: 240, deliveryDays: 2, notes: "سعر خاص للكمية الكبيرة", status: "active", distributorId: 6, distributorName: "موزع العاصمة", createdAt: day(-1), updatedAt: day(-1) },
      "2": { productName: "زيت نباتي 1ل", category: "مواد غذائية", wholesalePrice: "340", minimumQuantity: 12, availableQuantity: 96, deliveryDays: 1, notes: "متوفر للتسليم السريع", status: "active", distributorId: 6, distributorName: "موزع العاصمة", createdAt: day(-2), updatedAt: day(-2) },
      "3": { productName: "حفاضات أطفال مقاس 4", category: "أطفال", wholesalePrice: "760", minimumQuantity: 6, availableQuantity: 48, deliveryDays: 3, notes: "دفعة جديدة", status: "paused", distributorId: 6, distributorName: "موزع العاصمة", createdAt: day(-3), updatedAt: day(-1) },
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
