import { pgTable, text, serial, timestamp, numeric, integer, boolean, json, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const paymentMethodEnum = pgEnum("payment_method", ["cash", "karni", "card"]);

export const salesTable = pgTable("sales", {
  id: serial("id").primaryKey(),
  cashierId: integer("cashier_id").notNull(),
  cashierName: text("cashier_name").notNull(),
  customerId: integer("customer_id"),
  customerName: text("customer_name"),
  items: json("items").notNull(),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  discount: numeric("discount", { precision: 10, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  paid: boolean("paid").notNull().default(true),
  paymentMethod: paymentMethodEnum("payment_method").notNull().default("cash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSaleSchema = createInsertSchema(salesTable).omit({ id: true, createdAt: true });
export type InsertSale = z.infer<typeof insertSaleSchema>;
export type Sale = typeof salesTable.$inferSelect;
