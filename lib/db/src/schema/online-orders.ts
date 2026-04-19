import { pgTable, text, serial, timestamp, numeric, integer, boolean, json, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const onlineOrderStatusEnum = pgEnum("online_order_status", ["pending", "confirmed", "preparing", "delivering", "completed", "cancelled"]);
export const onlineOrderPaymentEnum = pgEnum("online_order_payment", ["cash_on_delivery", "karni", "store_pickup"]);

export const onlineOrdersTable = pgTable("online_orders", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id"),
  customerName: text("customer_name").notNull(),
  phone: text("phone").notNull(),
  address: text("address"),
  items: json("items").notNull(),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: onlineOrderPaymentEnum("payment_method").notNull().default("cash_on_delivery"),
  status: onlineOrderStatusEnum("status").notNull().default("pending"),
  notes: text("notes"),
  assignedDistributorId: integer("assigned_distributor_id"),
  assignedDistributorName: text("assigned_distributor_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOnlineOrderSchema = createInsertSchema(onlineOrdersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOnlineOrder = z.infer<typeof insertOnlineOrderSchema>;
export type OnlineOrder = typeof onlineOrdersTable.$inferSelect;