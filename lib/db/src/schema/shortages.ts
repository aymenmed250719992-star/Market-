import { pgTable, text, serial, timestamp, numeric, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shortageTypeEnum = pgEnum("shortage_type", ["shortage", "damage", "expired"]);
export const shortageStatusEnum = pgEnum("shortage_status", ["pending", "resolved", "dismissed"]);

export const shortagesTable = pgTable("shortages", {
  id: serial("id").primaryKey(),
  productId: integer("product_id"),
  productName: text("product_name").notNull(),
  reportedById: integer("reported_by_id").notNull(),
  reportedByName: text("reported_by_name").notNull(),
  type: shortageTypeEnum("type").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }),
  notes: text("notes"),
  status: shortageStatusEnum("status").notNull().default("pending"),
  resolvedById: integer("resolved_by_id"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertShortageSchema = createInsertSchema(shortagesTable).omit({ id: true, createdAt: true });
export type InsertShortage = z.infer<typeof insertShortageSchema>;
export type Shortage = typeof shortagesTable.$inferSelect;
