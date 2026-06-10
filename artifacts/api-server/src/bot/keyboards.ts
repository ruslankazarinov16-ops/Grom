import TelegramBot from "node-telegram-bot-api";

export const mainKeyboard: TelegramBot.ReplyKeyboardMarkup = {
  keyboard: [
    [{ text: "🎮 Каталог" }, { text: "📰 Новости" }],
    [{ text: "⭐️ Отзывы" }, { text: "🛒 Как купить" }],
    [{ text: "👤 Мой кабинет" }, { text: "🆘 Поддержка" }],
  ],
  resize_keyboard: true,
};

export const cabinetKeyboard: TelegramBot.InlineKeyboardMarkup = {
  inline_keyboard: [
    [{ text: "🛍 Мои покупки", callback_data: "cabinet_purchases" }],
    [{ text: "💰 Пополнить баланс", callback_data: "cabinet_topup" }],
    [{ text: "🎁 Активировать промокод", callback_data: "cabinet_promo" }],
    [
      { text: "📜 Пользовательское соглашение", url: "https://telegra.ph/Polzovatelskoe-soglashenie-04-01-19" },
    ],
    [
      { text: "🔒 Политика конфиденциальности", url: "https://telegra.ph/Politika-konfidencialnosti-04-01-26" },
    ],
  ],
};

export const adminKeyboard: TelegramBot.InlineKeyboardMarkup = {
  inline_keyboard: [
    [{ text: "👑 Добавить админа", callback_data: "admin_add_admin" }],
    [{ text: "📂 Добавить категорию", callback_data: "admin_add_category" }],
    [{ text: "🎮 Добавить продукт", callback_data: "admin_add_product" }],
    [{ text: "🔑 Добавить ключ", callback_data: "admin_add_key" }],
    [{ text: "🚫 Забанить пользователя", callback_data: "admin_ban_user" }],
    [{ text: "🎁 Создать промокод", callback_data: "admin_create_promo" }],
    [{ text: "📋 Список промокодов", callback_data: "admin_list_promos" }],
    [{ text: "👥 Список пользователей", callback_data: "admin_list_users" }],
    [{ text: "📢 Рассылка", callback_data: "admin_broadcast" }],
  ],
};

export function backToMainKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [[{ text: "🔙 Назад", callback_data: "back_main" }]],
  };
}
