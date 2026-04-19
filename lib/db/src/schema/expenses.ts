import { pgTable, text, serial, timestamp, numeric, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const expenseTypeEnum = pgEnum("expense_type", ["monthly", "daily", "one_time"]);

export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  month: text("month").notNull(),
  type: expenseTypeEnum("type").notNull().default("monthly"),
  daysInMonth: integer("days_in_month").default(30),
  dailyAmount: numeric("daily_amount", { precision: 10, scale: 2 }),
  notes: text("notes"),
  addedById: integer("added_by_id"),
  addedByName: text("added_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ id: true, createdAt: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expensesTable.$inferSelect;
