import { pgTable, serial, bigint, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { productsTable } from "./products";

export const purchasesTable = pgTable("purchases", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => usersTable.id),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  keyValue: text("key_value").notNull(),
  pricePaid: integer("price_paid").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPurchaseSchema = createInsertSchema(purchasesTable).omit({ id: true, createdAt: true });
export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;
export type Purchase = typeof purchasesTable.$inferSelect;
