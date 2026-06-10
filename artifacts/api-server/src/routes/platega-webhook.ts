import { Router } from "express";
import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { paymentsTable, usersTable } from "@workspace/db";
import { verifyWebhook } from "../services/platega";
import { logger } from "../lib/logger";

const router = Router();

let botInstance: { sendMessage: (chatId: number, text: string, opts?: object) => Promise<unknown> } | null = null;

export function registerBot(bot: typeof botInstance) {
  botInstance = bot;
}

router.post("/platega/webhook", async (req: Request, res: Response) => {
  const merchantId = req.headers["x-merchantid"] as string ?? req.headers["x-merchantId"] as string ?? "";
  const secret = req.headers["x-secret"] as string ?? "";

  if (!verifyWebhook(merchantId, secret)) {
    logger.warn({ merchantId }, "Platega webhook: invalid credentials");
    res.status(401).json({ ok: false });
    return;
  }

  const body = req.body as {
    id: string;
    status: string;
    amount: number;
    currency: string;
    payload: string;
  };

  const { id: transactionId, status, amount, payload } = body;
  const userId = parseInt(payload ?? "", 10);

  logger.info({ transactionId, status, amount, userId }, "Platega webhook received");

  if (!transactionId || !status) {
    res.status(400).json({ ok: false });
    return;
  }

  const payment = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.transactionId, transactionId))
    .limit(1);

  if (!payment[0]) {
    logger.warn({ transactionId }, "Platega webhook: payment not found");
    res.json({ ok: true });
    return;
  }

  if (payment[0].status === "CONFIRMED") {
    res.json({ ok: true });
    return;
  }

  await db
    .update(paymentsTable)
    .set({ status })
    .where(eq(paymentsTable.transactionId, transactionId));

  if (status === "CONFIRMED") {
    const actualAmount = Math.round(amount);
    const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (user[0]) {
      const newBalance = user[0].balance + actualAmount;
      await db.update(usersTable).set({ balance: newBalance }).where(eq(usersTable.id, userId));

      logger.info({ userId, amount: actualAmount, newBalance }, "Balance credited after payment");

      if (botInstance) {
        try {
          await botInstance.sendMessage(
            userId,
            `✅ <b>Оплата прошла успешно!</b>\n\n💰 На ваш баланс зачислено <b>${actualAmount}₽</b>\nТекущий баланс: <b>${newBalance}₽</b>`,
            { parse_mode: "HTML" }
          );
        } catch (err) {
          logger.error({ err, userId }, "Failed to notify user about payment");
        }
      }
    }
  } else if (status === "FAILED" || status === "EXPIRED") {
    if (botInstance && !isNaN(userId)) {
      try {
        await botInstance.sendMessage(
          userId,
          `❌ Платёж на сумму <b>${payment[0].amount}₽</b> ${status === "EXPIRED" ? "истёк" : "не прошёл"}.\n\nПопробуйте снова через раздел «Мой кабинет».`,
          { parse_mode: "HTML" }
        );
      } catch {}
    }
  }

  res.json({ ok: true });
});

export default router;
