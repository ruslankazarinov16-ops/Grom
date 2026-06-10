import { pgTable, serial, text, integer, boolean, timestamp, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { tiersTable } from "./tiers";

export const keysTable = pgTable("keys", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  tierId: integer("tier_id").references(() => tiersTable.id),
  keyValue: text("key_value").notNull(),
  isSold: boolean("is_sold").notNull().default(false),
  soldTo: bigint("sold_to", { mode: "number" }),
  soldAt: timestamp("sold_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertKeySchema = createInsertSchema(keysTable).omit({ id: true, isSold: true, soldTo: true, soldAt: true, createdAt: true });
export type InsertKey = z.infer<typeof insertKeySchema>;
export type Key = typeof keysTable.$inferSelect;
