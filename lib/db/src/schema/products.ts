import { pgTable, text, serial, timestamp, numeric, integer, pgEnum, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productUnitEnum = pgEnum("product_unit", ["piece", "carton", "kg"]);

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  barcode: text("barcode").unique(),
  cartonBarcode: text("carton_barcode").unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  unitWholesalePrice: numeric("unit_wholesale_price", { precision: 10, scale: 2 }),
  wholesalePrice: numeric("wholesale_price", { precision: 10, scale: 2 }).notNull(),
  retailPrice: numeric("retail_price", { precision: 10, scale: 2 }).notNull(),
  profitMargin: numeric("profit_margin", { precision: 5, scale: 2 }).default("15"),
  stock: integer("stock").notNull().default(0),
  shelfStock: integer("shelf_stock").notNull().default(0),
  warehouseStock: integer("warehouse_stock").notNull().default(0),
  unit: productUnitEnum("unit").notNull().default("piece"),
  unitsPerCarton: integer("units_per_carton"),
  cartonSize: integer("carton_size"),
  expiryDate: date("expiry_date"),
  supplier: text("supplier"),
  lowStockThreshold: integer("low_stock_threshold").default(5),
  lowWarehouseThreshold: integer("low_warehouse_threshold").default(2),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
