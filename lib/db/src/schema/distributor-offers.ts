import { pgTable, text, serial, timestamp, numeric, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const distributorOfferStatusEnum = pgEnum("distributor_offer_status", ["active", "paused", "archived"]);

export const distributorOffersTable = pgTable("distributor_offers", {
  id: serial("id").primaryKey(),
  distributorId: integer("distributor_id").notNull(),
  distributorName: text("distributor_name").notNull(),
  productName: text("product_name").notNull(),
  category: text("category").notNull(),
  wholesalePrice: numeric("wholesale_price", { precision: 10, scale: 2 }).notNull(),
  minimumQuantity: integer("minimum_quantity").notNull().default(1),
  availableQuantity: integer("available_quantity").notNull().default(0),
  deliveryDays: integer("delivery_days").notNull().default(1),
  notes: text("notes"),
  status: distributorOfferStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDistributorOfferSchema = createInsertSchema(distributorOffersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDistributorOffer = z.infer<typeof insertDistributorOfferSchema>;
export type DistributorOffer = typeof distributorOffersTable.$inferSelect;