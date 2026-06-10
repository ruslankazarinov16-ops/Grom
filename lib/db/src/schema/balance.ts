import { pgTable, serial, bigint, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const balanceTopupsTable = pgTable("balance_topups", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => usersTable.id),
  amount: integer("amount").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBalanceTopupSchema = createInsertSchema(balanceTopupsTable).omit({ id: true, createdAt: true });
export type InsertBalanceTopup = z.infer<typeof insertBalanceTopupSchema>;
export type BalanceTopup = typeof balanceTopupsTable.$inferSelect;
