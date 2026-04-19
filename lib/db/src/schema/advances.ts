import { pgTable, text, serial, timestamp, numeric, integer, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const advanceTypeEnum = pgEnum("advance_type", ["advance", "penalty"]);

export const advancesTable = pgTable("advances_penalties", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  userName: text("user_name").notNull(),
  type: advanceTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason"),
  month: text("month").notNull(),
  deductedFromPayroll: boolean("deducted_from_payroll").notNull().default(false),
  addedById: integer("added_by_id"),
  addedByName: text("added_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAdvanceSchema = createInsertSchema(advancesTable).omit({ id: true, createdAt: true });
export type InsertAdvance = z.infer<typeof insertAdvanceSchema>;
export type Advance = typeof advancesTable.$inferSelect;
