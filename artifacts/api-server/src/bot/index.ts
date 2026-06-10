import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger";
import { mainKeyboard } from "./keyboards";
import {
  ensureUser,
  handleStart,
  handleCatalog,
  handleCategoryCallback,
  handleProductCallback,
  handleBuyCallback,
  handleCabinet,
  handlePurchases,
  handleTopupStart,
  handlePromoStart,
  handlePromoActivate,
} from "./handlers/user";
import { handleAdminPanel, handleAdminCallback, handleAdminMessage } from "./handlers/admin";
import { getUserState, clearUserState } from "./state";

export function startBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.error("TELEGRAM_BOT_TOKEN is not set");
    return;
  }

  const bot = new TelegramBot(token, { polling: true });

  bot.on("polling_error", (err) => {
    logger.error({ err }, "Telegram polling error");
  });

  bot.onText(/\/start/, async (msg) => {
    try {
      await handleStart(bot, msg);
    } catch (err) {
      logger.error({ err }, "Error in /start");
    }
  });

  bot.onText(/\/admin/, async (msg) => {
    try {
      await handleAdminPanel(bot, msg);
    } catch (err) {
      logger.error({ err }, "Error in /admin");
    }
  });

  bot.on("message", async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;
    const userId = msg.from?.id;
    if (!userId) return;

    try {
      const user = await ensureUser(msg);
      if (user?.isBanned) {
        await bot.sendMessage(msg.chat.id, "❌ Вы заблокированы.");
        return;
      }

      // Check admin message handlers first
      const handledByAdmin = await handleAdminMessage(bot, msg);
      if (handledByAdmin) return;

      // Check user state handlers
      const userState = getUserState(userId);

      if (userState.step === "promo_wait_code") {
        await handlePromoActivate(bot, msg, msg.text);
        return;
      }

      if (userState.step === "topup_wait_amount") {
        clearUserState(userId);
        const amount = parseInt(msg.text.trim(), 10);
        if (isNaN(amount) || amount <= 0) {
          await bot.sendMessage(msg.chat.id, "❌ Введите корректную сумму.", { reply_markup: mainKeyboard });
          return;
        }
        await bot.sendMessage(
          msg.chat.id,
          `💰 Для пополнения баланса на <b>${amount}₽</b> свяжитесь с администратором: @GromVMagic\n\nУкажите ваш ID: <code>${userId}</code>`,
          { parse_mode: "HTML", reply_markup: mainKeyboard }
        );
        return;
      }

      // Main menu handlers
      switch (msg.text) {
        case "🎮 Каталог":
          await handleCatalog(bot, msg);
          break;
        case "📰 Новости":
          await bot.sendMessage(
            msg.chat.id,
            `📰 <b>Наши каналы с новостями:</b>\n\n📢 Основной канал:\nhttps://t.me/GromVMagic\n\n📢 Резервный канал:\nhttps://t.me/MagicVgromV2`,
            { parse_mode: "HTML", reply_markup: mainKeyboard }
          );
          break;
        case "⭐️ Отзывы":
          await bot.sendMessage(
            msg.chat.id,
            `⭐️ <b>Отзывы наших клиентов:</b>\n\nhttps://t.me/otzivmagich`,
            { parse_mode: "HTML", reply_markup: mainKeyboard }
          );
          break;
        case "🛒 Как купить":
          await bot.sendMessage(
            msg.chat.id,
            `🛒 <b>Как купить:</b>\n\nПодробная инструкция по покупке:\nhttps://t.me/YRSinf`,
            { parse_mode: "HTML", reply_markup: mainKeyboard }
          );
          break;
        case "👤 Мой кабинет":
          await handleCabinet(bot, msg);
          break;
        default:
          await bot.sendMessage(msg.chat.id, "Используйте кнопки меню ниже 👇", { reply_markup: mainKeyboard });
      }
    } catch (err) {
      logger.error({ err }, "Error handling message");
    }
  });

  bot.on("callback_query", async (query) => {
    if (!query.data) return;
    const data = query.data;

    try {
      if (data.startsWith("admin_")) {
        await handleAdminCallback(bot, query);
        return;
      }

      if (data.startsWith("cat_")) {
        const catId = parseInt(data.replace("cat_", ""), 10);
        await handleCategoryCallback(bot, query, catId);
        return;
      }

      if (data.startsWith("prod_")) {
        const prodId = parseInt(data.replace("prod_", ""), 10);
        await handleProductCallback(bot, query, prodId);
        return;
      }

      if (data.startsWith("buy_")) {
        const prodId = parseInt(data.replace("buy_", ""), 10);
        await handleBuyCallback(bot, query, prodId);
        return;
      }

      switch (data) {
        case "back_catalog":
          await handleCatalog(bot, { ...query.message!, from: query.from });
          await bot.answerCallbackQuery(query.id);
          break;
        case "cabinet_purchases":
          await handlePurchases(bot, query);
          break;
        case "cabinet_topup":
          await handleTopupStart(bot, query);
          break;
        case "cabinet_promo":
          await handlePromoStart(bot, query);
          break;
        case "back_main":
          await bot.answerCallbackQuery(query.id);
          await bot.sendMessage(query.message!.chat.id, "Главное меню 👇", { reply_markup: mainKeyboard });
          break;
        default:
          await bot.answerCallbackQuery(query.id);
      }
    } catch (err) {
      logger.error({ err }, "Error handling callback query");
      try {
        await bot.answerCallbackQuery(query.id, { text: "Произошла ошибка" });
      } catch {}
    }
  });

  logger.info("Telegram bot started");
  return bot;
}
