import { pgTable, text, serial, timestamp, numeric, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shiftStatusEnum = pgEnum("shift_status", ["open", "closed"]);

export const shiftsTable = pgTable("shifts", {
  id: serial("id").primaryKey(),
  cashierId: integer("cashier_id").notNull(),
  cashierName: text("cashier_name").notNull(),
  startingFloat: numeric("starting_float", { precision: 10, scale: 2 }).notNull().default("0"),
  closingCash: numeric("closing_cash", { precision: 10, scale: 2 }),
  systemTotal: numeric("system_total", { precision: 10, scale: 2 }).notNull().default("0"),
  totalSales: numeric("total_sales", { precision: 10, scale: 2 }).notNull().default("0"),
  deficit: numeric("deficit", { precision: 10, scale: 2 }),
  notes: text("notes"),
  status: shiftStatusEnum("status").notNull().default("open"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const insertShiftSchema = createInsertSchema(shiftsTable).omit({ id: true, openedAt: true });
export type InsertShift = z.infer<typeof insertShiftSchema>;
export type Shift = typeof shiftsTable.$inferSelect;
