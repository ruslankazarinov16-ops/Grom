import { pgTable, bigint, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  balance: integer("balance").notNull().default(0),
  isBanned: boolean("is_banned").notNull().default(false),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
