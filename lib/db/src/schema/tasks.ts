import { pgTable, text, serial, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const taskTypeEnum = pgEnum("task_type", ["restock", "report", "damage", "other"]);
export const taskStatusEnum = pgEnum("task_status", ["pending", "completed", "approved", "rejected"]);

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  assignedToId: integer("assigned_to_id"),
  assignedToName: text("assigned_to_name"),
  reportedById: integer("reported_by_id"),
  reportedByName: text("reported_by_name"),
  type: taskTypeEnum("type").notNull().default("other"),
  status: taskStatusEnum("status").notNull().default("pending"),
  points: integer("points").default(0),
  productId: integer("product_id"),
  productName: text("product_name"),
  notes: text("notes"),
  approvedById: integer("approved_by_id"),
  approvedByName: text("approved_by_name"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
