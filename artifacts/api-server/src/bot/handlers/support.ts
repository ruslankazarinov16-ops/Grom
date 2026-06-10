import TelegramBot from "node-telegram-bot-api";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { mainKeyboard } from "../keyboards";
import { setUserState, clearUserState } from "../state";
import { logger } from "../../lib/logger";

const SUPER_ADMIN_ID = 7085601013;

// Maps admin message_id → user chat_id so admin replies reach the right user
const ticketMap = new Map<number, number>();

export async function handleSupportStart(bot: TelegramBot, msg: TelegramBot.Message) {
  setUserState(msg.from!.id, "support_wait_message");
  await bot.sendMessage(
    msg.chat.id,
    `🆘 <b>Поддержка</b>\n\nОпишите вашу проблему или вопрос — мы ответим как можно скорее.\n\nНапишите сообщение:`,
    { parse_mode: "HTML" }
  );
}

export async function handleSupportMessage(bot: TelegramBot, msg: TelegramBot.Message) {
  const userId = msg.from!.id;
  clearUserState(userId);

  const user = await db.select().from(schema.usersTable).where(eq(schema.usersTable.id, userId)).limit(1);
  const u = user[0];
  const username = u?.username ? `@${u.username}` : (u?.firstName ?? "Без имени");

  const ticketText =
    `📩 <b>Новый тикет поддержки</b>\n\n` +
    `👤 Пользователь: ${username}\n` +
    `🆔 ID: <code>${userId}</code>\n\n` +
    `💬 Сообщение:\n${msg.text}`;

  try {
    const sent = await bot.sendMessage(SUPER_ADMIN_ID, ticketText, { parse_mode: "HTML" });
    // Store mapping: admin's received message_id → user's chat_id
    ticketMap.set(sent.message_id, msg.chat.id);
    logger.info({ userId, adminMsgId: sent.message_id }, "Support ticket sent to admin");
  } catch (err) {
    logger.error({ err }, "Failed to send support ticket to admin");
    await bot.sendMessage(
      msg.chat.id,
      "❌ Не удалось отправить обращение. Попробуйте позже или напишите напрямую: @GromVMagic",
      { reply_markup: mainKeyboard }
    );
    return;
  }

  await bot.sendMessage(
    msg.chat.id,
    "✅ Ваше обращение отправлено! Ожидайте ответа от администратора.",
    { reply_markup: mainKeyboard }
  );
}

export async function handleAdminSupportReply(bot: TelegramBot, msg: TelegramBot.Message): Promise<boolean> {
  // Only handle replies from admin
  if (msg.from?.id !== SUPER_ADMIN_ID) return false;
  // Only if it's a reply
  if (!msg.reply_to_message) return false;

  const repliedToId = msg.reply_to_message.message_id;
  const userChatId = ticketMap.get(repliedToId);

  if (!userChatId) return false;

  try {
    await bot.sendMessage(
      userChatId,
      `💬 <b>Ответ от поддержки:</b>\n\n${msg.text}`,
      { parse_mode: "HTML", reply_markup: mainKeyboard }
    );
    await bot.sendMessage(msg.chat.id, "✅ Ответ доставлен пользователю.");
    logger.info({ userChatId, adminMsgId: repliedToId }, "Support reply delivered to user");
  } catch (err) {
    logger.error({ err, userChatId }, "Failed to deliver support reply");
    await bot.sendMessage(msg.chat.id, "❌ Не удалось доставить ответ пользователю.");
  }

  return true;
}
