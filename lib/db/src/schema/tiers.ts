import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";

export const tiersTable = pgTable("tiers", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  name: text("name").notNull(),
  price: integer("price").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTierSchema = createInsertSchema(tiersTable).omit({ id: true, createdAt: true });
export type InsertTier = z.infer<typeof insertTierSchema>;
export type Tier = typeof tiersTable.$inferSelect;
