/**
 * PostgreSQL-backed shim that exposes a Firestore-like API.
 *
 * Goal: keep every existing route and the CollectionCache working **unchanged**
 * after migrating from Firebase Firestore to PostgreSQL (JSONB tables).
 *
 * Each Firestore "collection" is one PG table named coll_<name> with columns:
 *   id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ
 *
 * The exported `firestore` object mimics: collection().doc().get/set/update/delete,
 * collection().where().orderBy().limit().get(), runTransaction (for counters).
 *
 * Also exports FieldValue.increment(n) used across the codebase.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { pool, pgQuery, tableForCollection } from "./pg";
import { logger } from "./logger";

// ─── FieldValue (mimics firebase-admin/firestore FieldValue.increment) ────────
class IncrementSentinel {
  readonly __isIncrement = true;
  constructor(public readonly operand: number) {}
}

export const FieldValue = {
  increment(n: number) {
    return new IncrementSentinel(n);
  },
  serverTimestamp() {
    return new Date().toISOString();
  },
  delete() {
    return { __isDelete: true };
  },
};

function isIncrement(v: any): v is IncrementSentinel {
  return v && typeof v === "object" && (v.__isIncrement === true || v.constructor?.name === "IncrementSentinel" || (typeof v.operand === "number" && v.constructor?.name === "NumericIncrementTransform"));
}

function isDelete(v: any) {
  return v && typeof v === "object" && v.__isDelete === true;
}

// ─── Snapshot wrappers ────────────────────────────────────────────────────────
class DocumentSnapshot {
  constructor(public id: string, private value?: Record<string, any>) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value ? structuredClone(this.value) : undefined; }
}

class QuerySnapshot {
  docs: DocumentSnapshot[];
  constructor(docs: DocumentSnapshot[]) { this.docs = docs; }
  get empty() { return this.docs.length === 0; }
  get size() { return this.docs.length; }
  forEach(cb: (d: DocumentSnapshot) => void) { this.docs.forEach(cb); }
}

// ─── Document & Collection refs ───────────────────────────────────────────────
class DocumentReference {
  constructor(public readonly collectionName: string, public readonly id: string) {}

  async get(): Promise<DocumentSnapshot> {
    const table = tableForCollection(this.collectionName);
    const idNum = parseInt(this.id, 10);
    if (!Number.isFinite(idNum)) return new DocumentSnapshot(this.id, undefined);
    const r = await pgQuery<{ data: any }>(`SELECT data FROM ${table} WHERE id = $1`, [idNum]);
    if (r.rowCount === 0) return new DocumentSnapshot(this.id, undefined);
    return new DocumentSnapshot(this.id, r.rows[0].data);
  }

  async set(value: Record<string, any>, opts?: { merge?: boolean }): Promise<void> {
    const table = tableForCollection(this.collectionName);
    const idNum = parseInt(this.id, 10);
    if (!Number.isFinite(idNum)) throw new Error(`Invalid id for ${this.collectionName}: ${this.id}`);
    if (opts?.merge) {
      // merge: existing JSONB || new JSONB
      await pgQuery(
        `INSERT INTO ${table} (id, data, updated_at) VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET data = ${table}.data || EXCLUDED.data, updated_at = NOW()`,
        [idNum, JSON.stringify(value)],
      );
    } else {
      await pgQuery(
        `INSERT INTO ${table} (id, data, updated_at) VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [idNum, JSON.stringify(value)],
      );
    }
  }

  async update(updates: Record<string, any>): Promise<void> {
    const table = tableForCollection(this.collectionName);
    const idNum = parseInt(this.id, 10);
    if (!Number.isFinite(idNum)) throw new Error(`Invalid id for ${this.collectionName}: ${this.id}`);

    // Read–modify–write inside a transaction so increments are atomic.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const r = await client.query(`SELECT data FROM ${table} WHERE id = $1 FOR UPDATE`, [idNum]);
      if (r.rowCount === 0) {
        await client.query("ROLLBACK");
        throw new Error(`Document ${this.collectionName}/${this.id} does not exist`);
      }
      const current = r.rows[0].data ?? {};
      const next: Record<string, any> = { ...current };
      for (const [k, v] of Object.entries(updates)) {
        if (isIncrement(v)) {
          next[k] = (Number(next[k] ?? 0) || 0) + (v as IncrementSentinel).operand;
        } else if (isDelete(v)) {
          delete next[k];
        } else {
          next[k] = v;
        }
      }
      await client.query(
        `UPDATE ${table} SET data = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(next), idNum],
      );
      await client.query("COMMIT");
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      throw e;
    } finally {
      client.release();
    }
  }

  async delete(): Promise<void> {
    const table = tableForCollection(this.collectionName);
    const idNum = parseInt(this.id, 10);
    if (!Number.isFinite(idNum)) return;
    await pgQuery(`DELETE FROM ${table} WHERE id = $1`, [idNum]);
  }
}

type Filter = { field: string; operator: string; value: any };

class Query {
  protected filters: Filter[] = [];
  protected order?: { field: string; direction: "asc" | "desc" };
  protected max?: number;

  constructor(public readonly collectionName: string) {}

  where(field: string, operator: string, value: any): Query {
    const q = this._clone();
    q.filters.push({ field, operator, value });
    return q;
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc"): Query {
    const q = this._clone();
    q.order = { field, direction };
    return q;
  }

  limit(n: number): Query {
    const q = this._clone();
    q.max = n;
    return q;
  }

  protected _clone(): Query {
    const q = new Query(this.collectionName);
    q.filters = this.filters.slice();
    q.order = this.order;
    q.max = this.max;
    return q;
  }

  async get(): Promise<QuerySnapshot> {
    const table = tableForCollection(this.collectionName);
    const params: any[] = [];
    const wheres: string[] = [];

    for (const f of this.filters) {
      const opMap: Record<string, string> = {
        "==": "=", "!=": "<>", ">": ">", ">=": ">=", "<": "<", "<=": "<=",
      };
      const sqlOp = opMap[f.operator];
      if (!sqlOp) {
        if (f.operator === "in" || f.operator === "array-contains") {
          // Fallback: load all and filter in JS for unsupported ops
          return this._jsFilter();
        }
        throw new Error(`Unsupported query operator: ${f.operator}`);
      }
      params.push(f.value);
      // Compare JSONB field as text/number depending on value type
      if (typeof f.value === "number") {
        wheres.push(`(data->>'${f.field.replace(/'/g, "''")}')::numeric ${sqlOp} $${params.length}`);
      } else if (typeof f.value === "boolean") {
        wheres.push(`(data->>'${f.field.replace(/'/g, "''")}')::boolean ${sqlOp} $${params.length}`);
      } else {
        wheres.push(`data->>'${f.field.replace(/'/g, "''")}' ${sqlOp} $${params.length}`);
      }
    }

    let sql = `SELECT id, data FROM ${table}`;
    if (wheres.length) sql += ` WHERE ${wheres.join(" AND ")}`;
    if (this.order) {
      const dir = this.order.direction === "desc" ? "DESC" : "ASC";
      sql += ` ORDER BY data->>'${this.order.field.replace(/'/g, "''")}' ${dir} NULLS LAST, id ASC`;
    } else {
      sql += ` ORDER BY id ASC`;
    }
    if (this.max != null) sql += ` LIMIT ${Math.max(0, Math.floor(this.max))}`;

    const r = await pgQuery<{ id: number; data: any }>(sql, params);
    return new QuerySnapshot(r.rows.map((row) => new DocumentSnapshot(String(row.id), row.data)));
  }

  /** Slow path for unsupported operators — load and filter in JS. */
  private async _jsFilter(): Promise<QuerySnapshot> {
    const table = tableForCollection(this.collectionName);
    const r = await pgQuery<{ id: number; data: any }>(`SELECT id, data FROM ${table}`);
    let rows = r.rows.map((row) => ({ id: row.id, data: row.data }));
    for (const f of this.filters) {
      rows = rows.filter((row) => {
        const v = row.data?.[f.field];
        switch (f.operator) {
          case "==": return v === f.value;
          case "!=": return v !== f.value;
          case ">": return v > f.value;
          case ">=": return v >= f.value;
          case "<": return v < f.value;
          case "<=": return v <= f.value;
          case "in": return Array.isArray(f.value) && f.value.includes(v);
          case "array-contains": return Array.isArray(v) && v.includes(f.value);
          default: throw new Error(`Unsupported operator: ${f.operator}`);
        }
      });
    }
    if (this.order) {
      const { field, direction } = this.order;
      rows.sort((a, b) => {
        const av = a.data?.[field];
        const bv = b.data?.[field];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (av < bv) return direction === "desc" ? 1 : -1;
        if (av > bv) return direction === "desc" ? -1 : 1;
        return a.id - b.id;
      });
    }
    if (this.max != null) rows = rows.slice(0, this.max);
    return new QuerySnapshot(rows.map((row) => new DocumentSnapshot(String(row.id), row.data)));
  }
}

class CollectionReference extends Query {
  constructor(name: string) { super(name); }
  doc(id: string): DocumentReference {
    return new DocumentReference(this.collectionName, id);
  }
}

// ─── Top-level firestore-like object ──────────────────────────────────────────
class Firestore {
  collection(name: string): CollectionReference {
    return new CollectionReference(name);
  }

  /** Minimal transaction shim — only used by `nextId` for atomic counters. */
  async runTransaction<T>(fn: (tx: TransactionShim) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const tx = new TransactionShim(client);
      const result = await fn(tx);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      throw e;
    } finally {
      client.release();
    }
  }
}

class TransactionShim {
  constructor(private client: PoolClient) {}

  // tx.get(docRef) → snapshot
  async get(ref: DocumentReference): Promise<DocumentSnapshot> {
    const table = tableForCollection(ref.collectionName);
    const idNum = parseInt(ref.id, 10);
    const r = await this.client.query(`SELECT data FROM ${table} WHERE id = $1 FOR UPDATE`, [idNum]);
    if (r.rowCount === 0) return new DocumentSnapshot(ref.id, undefined);
    return new DocumentSnapshot(ref.id, r.rows[0].data);
  }

  set(ref: DocumentReference, value: Record<string, any>, opts?: { merge?: boolean }): TransactionShim {
    const table = tableForCollection(ref.collectionName);
    const idNum = parseInt(ref.id, 10);
    const json = JSON.stringify(value);
    const sql = opts?.merge
      ? `INSERT INTO ${table} (id, data, updated_at) VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET data = ${table}.data || EXCLUDED.data, updated_at = NOW()`
      : `INSERT INTO ${table} (id, data, updated_at) VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`;
    // Fire-and-forget within the transaction (queued)
    this.client.query(sql, [idNum, json]).catch(() => {});
    return this;
  }
}

export const firestore: any = new Firestore();

// ─── nextId (atomic counter) ──────────────────────────────────────────────────
export async function nextId(collection: string): Promise<number> {
  const r = await pgQuery<{ next: number }>(
    `INSERT INTO coll_counters (name, next) VALUES ($1, 2)
     ON CONFLICT (name) DO UPDATE SET next = coll_counters.next + 1
     RETURNING next - 1 AS next`,
    [collection],
  );
  return Number(r.rows[0].next);
}

// ─── tsToDate (compat for old Firestore Timestamp objects in JSON) ────────────
export function tsToDate(val: any): any {
  if (!val) return val;
  if (typeof val === "object" && typeof val.toDate === "function") return val.toDate();
  if (typeof val === "object" && typeof val._seconds === "number") {
    return new Date(val._seconds * 1000 + Math.floor((val._nanoseconds ?? 0) / 1e6));
  }
  if (typeof val === "string") {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return val;
}

// ─── Seed: load default users + products on first boot if DB is empty ─────────
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

async function tableCount(table: string): Promise<number> {
  const r = await pgQuery<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table}`);
  return parseInt(r.rows[0].count, 10) || 0;
}

async function seedIfEmpty() {
  const usersCount = await tableCount("coll_users");
  const productsCount = await tableCount("coll_products");
  const now = new Date().toISOString();

  if (usersCount === 0) {
    const seedUsers: Array<[number, Record<string, any>]> = [
      [1, { name: "Aymen Admin", email: "aymenmed25071999@gmail.com", phone: "0555000000", password: "Nova3iNokiac25071999@@", role: "admin", baseSalary: "80000", employeeBarcode: "EMP001", activityPoints: 0, createdAt: now, updatedAt: now }],
      [2, { name: "Cashier", email: "cashier@supermarket.local", phone: "0555000001", password: "cashier123", role: "cashier", baseSalary: "50000", employeeBarcode: "EMP002", activityPoints: 0, createdAt: now, updatedAt: now }],
      [3, { name: "Buyer", email: "buyer@supermarket.local", phone: "0555000002", password: "buyer123", role: "buyer", baseSalary: "55000", employeeBarcode: "EMP003", activityPoints: 0, createdAt: now, updatedAt: now }],
      [4, { name: "Worker", email: "worker@supermarket.local", phone: "0555000003", password: "worker123", role: "worker", baseSalary: "42000", employeeBarcode: "EMP004", activityPoints: 0, createdAt: now, updatedAt: now }],
      [5, { name: "زبون تجريبي", email: "customer@supermarket.local", phone: "0555111222", password: "customer123", role: "customer", baseSalary: null, employeeBarcode: null, activityPoints: 0, createdAt: now, updatedAt: now }],
      [6, { name: "موزع العاصمة", email: "distributor@supermarket.local", phone: "0555444333", password: "distributor123", role: "distributor", baseSalary: null, employeeBarcode: null, activityPoints: 0, createdAt: now, updatedAt: now }],
    ];
    for (const [id, data] of seedUsers) {
      await pgQuery(
        `INSERT INTO coll_users (id, data) VALUES ($1, $2::jsonb) ON CONFLICT DO NOTHING`,
        [id, JSON.stringify(data)],
      );
    }
    await pgQuery(
      `INSERT INTO coll_counters (name, next) VALUES ('users', 7) ON CONFLICT (name) DO UPDATE SET next = GREATEST(coll_counters.next, 7)`,
    );
    logger.info({ count: seedUsers.length }, "Seeded default users");
  }

  if (productsCount === 0) {
    const file = loadSeedProductsFile();
    const entries = Object.entries(file.products);
    if (entries.length > 0) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const [id, value] of entries) {
          const v: Record<string, any> = { ...value };
          if (v.createdAt === "__NOW__") v.createdAt = now;
          if (v.updatedAt === "__NOW__") v.updatedAt = now;
          await client.query(
            `INSERT INTO coll_products (id, data) VALUES ($1, $2::jsonb) ON CONFLICT DO NOTHING`,
            [parseInt(id, 10), JSON.stringify(v)],
          );
        }
        await client.query(
          `INSERT INTO coll_counters (name, next) VALUES ('products', $1) ON CONFLICT (name) DO UPDATE SET next = GREATEST(coll_counters.next, EXCLUDED.next)`,
          [file.nextId ?? entries.length + 1],
        );
        await client.query("COMMIT");
        logger.info({ count: entries.length }, "Seeded products from seed-products.json");
      } catch (e) {
        try { await client.query("ROLLBACK"); } catch {}
        throw e;
      } finally {
        client.release();
      }
    }
  }

  // Initialize counters for other collections if missing
  const defaults: Record<string, number> = {
    customers: 1, sales: 1, shortages: 1, salaries: 1, tasks: 1,
    expenses: 1, advances: 1, shifts: 1, online_orders: 1, distributor_offers: 1,
    audit_logs: 1, price_changes: 1, sale_returns: 1,
  };
  for (const [name, def] of Object.entries(defaults)) {
    const r = await pgQuery<{ max: number | null }>(
      `SELECT COALESCE(MAX(id), 0) AS max FROM coll_${name}`,
    );
    const max = Number(r.rows[0].max ?? 0);
    await pgQuery(
      `INSERT INTO coll_counters (name, next) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET next = GREATEST(coll_counters.next, EXCLUDED.next)`,
      [name, Math.max(def, max + 1)],
    );
  }
}

/** Promise that resolves once seeding is complete; allows caches to wait for it. */
export const seedReady: Promise<void> = (async () => {
  try {
    await seedIfEmpty();
  } catch (e) {
    logger.error({ err: e }, "Seed failed");
  }
})();
