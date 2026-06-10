import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const promocodesTable = pgTable("promocodes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  amount: integer("amount").notNull(),
  usesLeft: integer("uses_left").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPromocodeSchema = createInsertSchema(promocodesTable).omit({ id: true, createdAt: true });
export type InsertPromocode = z.infer<typeof insertPromocodeSchema>;
export type Promocode = typeof promocodesTable.$inferSelect;
