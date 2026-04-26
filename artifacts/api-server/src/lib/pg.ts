import pg from "pg";
import { logger } from "./logger";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. PostgreSQL is required for this app.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  logger.error({ err }, "PostgreSQL pool error");
});

export async function pgQuery<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

const ALLOWED_COLLECTIONS = new Set([
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
  "stocktakes",
]);

export function tableForCollection(name: string): string {
  if (!ALLOWED_COLLECTIONS.has(name)) {
    throw new Error(`Unknown collection: ${name}. Add it to ALLOWED_COLLECTIONS in pg.ts and create coll_${name} table.`);
  }
  return `coll_${name}`;
}

export function isCollectionAllowed(name: string) {
  return ALLOWED_COLLECTIONS.has(name);
}
