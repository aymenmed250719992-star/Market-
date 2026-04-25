import { pool, pgQuery } from "./pg";
import { logger } from "./logger";

const COLLECTIONS = [
  "users",
  "products",
  "customers",
  "sales",
  "shortages",
  "expenses",
  "advances",
  "shifts",
  "tasks",
  "salaries",
  "online_orders",
  "distributor_offers",
  "audit_logs",
  "price_changes",
  "sale_returns",
  "returns",
  "promotions",
] as const;

const JSONB_INDEXES: Array<{ table: string; field: string; type?: "text" | "numeric" }> = [
  { table: "users", field: "email" },
  { table: "users", field: "phone" },
  { table: "users", field: "role" },
  { table: "products", field: "barcode" },
  { table: "products", field: "name" },
  { table: "products", field: "category" },
  { table: "customers", field: "phone" },
  { table: "customers", field: "name" },
  { table: "sales", field: "createdAt" },
  { table: "sales", field: "cashierId" },
  { table: "sales", field: "customerId" },
  { table: "online_orders", field: "status" },
  { table: "online_orders", field: "createdAt" },
  { table: "audit_logs", field: "createdAt" },
  { table: "audit_logs", field: "entity" },
  { table: "promotions", field: "active" },
];

export async function migrateSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Counters table for collection auto-increment
    await client.query(`
      CREATE TABLE IF NOT EXISTS coll_counters (
        name TEXT PRIMARY KEY,
        next BIGINT NOT NULL DEFAULT 1
      )
    `);

    // One JSONB-backed table per collection
    for (const name of COLLECTIONS) {
      const table = `coll_${name}`;
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id INTEGER PRIMARY KEY,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      // Generic GIN index on full JSONB for ad-hoc queries
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_${table}_data_gin ON ${table} USING GIN (data jsonb_path_ops)
      `);
    }

    // Targeted btree indexes on hot lookup paths
    for (const ix of JSONB_INDEXES) {
      const table = `coll_${ix.table}`;
      const idxName = `idx_${table}_${ix.field}`;
      await client.query(
        `CREATE INDEX IF NOT EXISTS ${idxName} ON ${table} ((data->>'${ix.field}'))`,
      );
    }

    await client.query("COMMIT");
    logger.info({ count: COLLECTIONS.length }, "Schema migration complete");
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    logger.error({ err: e }, "Schema migration failed");
    throw e;
  } finally {
    client.release();
  }
}
