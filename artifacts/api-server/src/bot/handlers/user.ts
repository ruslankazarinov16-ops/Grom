import TelegramBot from "node-telegram-bot-api";
import { eq, and, isNull } from "drizzle-orm";
import { db, schema } from "../db";
import { mainKeyboard, cabinetKeyboard } from "../keyboards";
import { getUserState, setUserState, clearUserState } from "../state";
import { logger } from "../../lib/logger";

export async function ensureUser(msg: TelegramBot.Message) {
  const userId = msg.from!.id;
  await db.insert(schema.usersTable).values({
    id: userId,
    username: msg.from!.username ?? null,
    firstName: msg.from!.first_name ?? null,
    lastName: msg.from!.last_name ?? null,
  }).onConflictDoNothing();
  const rows = await db.select().from(schema.usersTable).where(eq(schema.usersTable.id, userId)).limit(1);
  return rows[0];
}

export async function handleStart(bot: TelegramBot, msg: TelegramBot.Message) {
  const user = await ensureUser(msg);
  if (user?.isBanned) {
    await bot.sendMessage(msg.chat.id, "❌ Вы заблокированы в этом боте.");
    return;
  }
  await bot.sendMessage(
    msg.chat.id,
    `👋 Привет, <b>${msg.from!.first_name}</b>!\n\nДобро пожаловать в магазин игровых ключей. Используйте меню ниже.`,
    { parse_mode: "HTML", reply_markup: mainKeyboard }
  );
}

export async function handleCatalog(bot: TelegramBot, msg: TelegramBot.Message) {
  const categories = await db.select().from(schema.categoriesTable);
  if (categories.length === 0) {
    await bot.sendMessage(msg.chat.id, "📭 Каталог пока пуст. Загляните позже!", { reply_markup: mainKeyboard });
    return;
  }
  const buttons: TelegramBot.InlineKeyboardButton[][] = categories.map((c) => [
    { text: c.name, callback_data: `cat_${c.id}` },
  ]);
  await bot.sendMessage(msg.chat.id, "🎮 <b>Выберите вашу игру:</b>", {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons },
  });
}

export async function handleCategoryCallback(bot: TelegramBot, query: TelegramBot.CallbackQuery, catId: number) {
  const category = await db.select().from(schema.categoriesTable).where(eq(schema.categoriesTable.id, catId)).limit(1);
  if (!category[0]) {
    await bot.answerCallbackQuery(query.id, { text: "Категория не найдена" });
    return;
  }

  const products = await db.select().from(schema.productsTable).where(eq(schema.productsTable.categoryId, catId));
  if (products.length === 0) {
    await bot.answerCallbackQuery(query.id, { text: "Нет товаров в этой категории" });
    await bot.sendMessage(query.message!.chat.id, `📭 В категории <b>${category[0].name}</b> пока нет товаров.`, { parse_mode: "HTML" });
    return;
  }

  const buttons: TelegramBot.InlineKeyboardButton[][] = products.map((p) => [
    { text: p.name, callback_data: `prod_${p.id}` },
  ]);
  buttons.push([{ text: "🔙 Назад к категориям", callback_data: "back_catalog" }]);

  await bot.editMessageText(`📂 <b>${category[0].name}</b>\n\nВыберите товар:`, {
    chat_id: query.message!.chat.id,
    message_id: query.message!.message_id,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons },
  });
  await bot.answerCallbackQuery(query.id);
}

export async function handleProductCallback(bot: TelegramBot, query: TelegramBot.CallbackQuery, prodId: number) {
  const product = await db.select().from(schema.productsTable).where(eq(schema.productsTable.id, prodId)).limit(1);
  if (!product[0]) {
    await bot.answerCallbackQuery(query.id, { text: "Товар не найден" });
    return;
  }

  const p = product[0];
  const tiers = await db.select().from(schema.tiersTable).where(eq(schema.tiersTable.productId, prodId));

  if (tiers.length > 0) {
    // Product has tiers — count available keys per tier
    const tierRows = await Promise.all(
      tiers.map(async (t) => {
        const available = await db
          .select()
          .from(schema.keysTable)
          .where(and(eq(schema.keysTable.tierId, t.id), eq(schema.keysTable.isSold, false)));
        return { tier: t, count: available.length };
      })
    );

    const header =
      `🎮 <b>${p.name}</b>\n\n` +
      (p.description ? `📝 ${p.description}\n\n` : "") +
      `💲 <b>Выберите тариф:</b>`;

    const buttons: TelegramBot.InlineKeyboardButton[][] = tierRows.map(({ tier, count }) => [
      {
        text: `${tier.name} — ${tier.price}₽ ${count > 0 ? `(${count} шт.)` : "❌ нет"}`,
        callback_data: count > 0 ? `tier_${tier.id}` : `tier_empty_${tier.id}`,
      },
    ]);
    buttons.push([{ text: "🔙 Назад", callback_data: `cat_${p.categoryId}` }]);

    await bot.editMessageText(header, {
      chat_id: query.message!.chat.id,
      message_id: query.message!.message_id,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons },
    });
  } else {
    // No tiers — show single price view (legacy)
    const availableKeys = await db
      .select()
      .from(schema.keysTable)
      .where(and(eq(schema.keysTable.productId, prodId), eq(schema.keysTable.isSold, false), isNull(schema.keysTable.tierId)));

    const count = availableKeys.length;
    const text =
      `🎮 <b>${p.name}</b>\n\n` +
      (p.description ? `📝 ${p.description}\n\n` : "") +
      `💰 Цена: <b>${p.price}₽</b>\n` +
      `🔑 Доступно ключей: <b>${count}</b>`;

    const buttons: TelegramBot.InlineKeyboardButton[][] = [];
    if (count > 0) {
      buttons.push([{ text: "🛒 Купить", callback_data: `buy_${prodId}` }]);
    }
    buttons.push([{ text: "🔙 Назад", callback_data: `cat_${p.categoryId}` }]);

    await bot.editMessageText(text, {
      chat_id: query.message!.chat.id,
      message_id: query.message!.message_id,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons },
    });
  }

  await bot.answerCallbackQuery(query.id);
}

export async function handleTierCallback(bot: TelegramBot, query: TelegramBot.CallbackQuery, tierId: number) {
  // tier_empty_ prefix — just notify, no action
  if (query.data?.startsWith("tier_empty_")) {
    await bot.answerCallbackQuery(query.id, { text: "❌ Ключи для этого тарифа закончились", show_alert: true });
    return;
  }

  const tier = await db.select().from(schema.tiersTable).where(eq(schema.tiersTable.id, tierId)).limit(1);
  if (!tier[0]) {
    await bot.answerCallbackQuery(query.id, { text: "Тариф не найден" });
    return;
  }

  const product = await db.select().from(schema.productsTable).where(eq(schema.productsTable.id, tier[0].productId)).limit(1);
  const available = await db
    .select()
    .from(schema.keysTable)
    .where(and(eq(schema.keysTable.tierId, tierId), eq(schema.keysTable.isSold, false)));

  const t = tier[0];
  const count = available.length;
  const text =
    `🎮 <b>${product[0]?.name ?? ""}</b>\n` +
    `💲 Тариф: <b>${t.name}</b>\n\n` +
    `💰 Цена: <b>${t.price}₽</b>\n` +
    `🔑 Доступно ключей: <b>${count}</b>`;

  const buttons: TelegramBot.InlineKeyboardButton[][] = [];
  if (count > 0) {
    buttons.push([{ text: `🛒 Купить — ${t.price}₽`, callback_data: `buy_tier_${tierId}` }]);
  }
  buttons.push([{ text: "🔙 Назад к тарифам", callback_data: `prod_${t.productId}` }]);

  await bot.editMessageText(text, {
    chat_id: query.message!.chat.id,
    message_id: query.message!.message_id,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons },
  });
  await bot.answerCallbackQuery(query.id);
}

export async function handleBuyTierCallback(bot: TelegramBot, query: TelegramBot.CallbackQuery, tierId: number) {
  const userId = query.from.id;

  const tier = await db.select().from(schema.tiersTable).where(eq(schema.tiersTable.id, tierId)).limit(1);
  if (!tier[0]) {
    await bot.answerCallbackQuery(query.id, { text: "Тариф не найден" });
    return;
  }

  const product = await db.select().from(schema.productsTable).where(eq(schema.productsTable.id, tier[0].productId)).limit(1);
  const user = await db.select().from(schema.usersTable).where(eq(schema.usersTable.id, userId)).limit(1);

  if (!user[0]) {
    await bot.answerCallbackQuery(query.id, { text: "Пользователь не найден" });
    return;
  }

  if (user[0].balance < tier[0].price) {
    await bot.answerCallbackQuery(query.id, { text: "❌ Недостаточно средств!" });
    await bot.sendMessage(
      query.message!.chat.id,
      `💸 Недостаточно средств!\n\nВаш баланс: <b>${user[0].balance}₽</b>\nЦена тарифа: <b>${tier[0].price}₽</b>\n\nПополните баланс в разделе «Мой кабинет».`,
      { parse_mode: "HTML" }
    );
    return;
  }

  const availableKey = await db
    .select()
    .from(schema.keysTable)
    .where(and(eq(schema.keysTable.tierId, tierId), eq(schema.keysTable.isSold, false)))
    .limit(1);

  if (!availableKey[0]) {
    await bot.answerCallbackQuery(query.id, { text: "❌ Ключи закончились!" });
    return;
  }

  await db.update(schema.keysTable)
    .set({ isSold: true, soldTo: userId, soldAt: new Date() })
    .where(eq(schema.keysTable.id, availableKey[0].id));

  await db.update(schema.usersTable)
    .set({ balance: user[0].balance - tier[0].price })
    .where(eq(schema.usersTable.id, userId));

  await db.insert(schema.purchasesTable).values({
    userId,
    productId: tier[0].productId,
    keyValue: availableKey[0].keyValue,
    pricePaid: tier[0].price,
  });

  await bot.answerCallbackQuery(query.id, { text: "✅ Покупка успешна!" });
  await bot.sendMessage(
    query.message!.chat.id,
    `✅ <b>Покупка успешна!</b>\n\nТовар: <b>${product[0]?.name ?? ""}</b>\nТариф: <b>${tier[0].name}</b>\nСписано: <b>${tier[0].price}₽</b>\nОстаток баланса: <b>${user[0].balance - tier[0].price}₽</b>\n\n🔑 Ваш ключ:\n<code>${availableKey[0].keyValue}</code>`,
    { parse_mode: "HTML" }
  );
  logger.info({ userId, tierId, productId: tier[0].productId }, "Tier purchase completed");
}

export async function handleBuyCallback(bot: TelegramBot, query: TelegramBot.CallbackQuery, prodId: number) {
  const userId = query.from.id;
  const product = await db.select().from(schema.productsTable).where(eq(schema.productsTable.id, prodId)).limit(1);
  if (!product[0]) {
    await bot.answerCallbackQuery(query.id, { text: "Товар не найден" });
    return;
  }

  const user = await db.select().from(schema.usersTable).where(eq(schema.usersTable.id, userId)).limit(1);
  if (!user[0]) {
    await bot.answerCallbackQuery(query.id, { text: "Пользователь не найден" });
    return;
  }

  if (user[0].balance < product[0].price) {
    await bot.answerCallbackQuery(query.id, { text: "❌ Недостаточно средств на балансе!" });
    await bot.sendMessage(
      query.message!.chat.id,
      `💸 Недостаточно средств!\n\nВаш баланс: <b>${user[0].balance}₽</b>\nЦена: <b>${product[0].price}₽</b>\n\nПополните баланс в разделе «Мой кабинет».`,
      { parse_mode: "HTML" }
    );
    return;
  }

  const availableKey = await db
    .select()
    .from(schema.keysTable)
    .where(and(eq(schema.keysTable.productId, prodId), eq(schema.keysTable.isSold, false), isNull(schema.keysTable.tierId)))
    .limit(1);

  if (!availableKey[0]) {
    await bot.answerCallbackQuery(query.id, { text: "❌ Ключи закончились!" });
    return;
  }

  await db.update(schema.keysTable)
    .set({ isSold: true, soldTo: userId, soldAt: new Date() })
    .where(eq(schema.keysTable.id, availableKey[0].id));

  await db.update(schema.usersTable)
    .set({ balance: user[0].balance - product[0].price })
    .where(eq(schema.usersTable.id, userId));

  await db.insert(schema.purchasesTable).values({
    userId,
    productId: prodId,
    keyValue: availableKey[0].keyValue,
    pricePaid: product[0].price,
  });

  await bot.answerCallbackQuery(query.id, { text: "✅ Покупка успешна!" });
  await bot.sendMessage(
    query.message!.chat.id,
    `✅ <b>Покупка успешна!</b>\n\nТовар: <b>${product[0].name}</b>\nСписано: <b>${product[0].price}₽</b>\nОстаток баланса: <b>${user[0].balance - product[0].price}₽</b>\n\n🔑 Ваш ключ:\n<code>${availableKey[0].keyValue}</code>`,
    { parse_mode: "HTML" }
  );
  logger.info({ userId, productId: prodId }, "Purchase completed");
}

export async function handleCabinet(bot: TelegramBot, msg: TelegramBot.Message) {
  const userId = msg.from!.id;
  const user = await db.select().from(schema.usersTable).where(eq(schema.usersTable.id, userId)).limit(1);
  const balance = user[0]?.balance ?? 0;

  await bot.sendMessage(
    msg.chat.id,
    `👤 <b>Мой кабинет</b>\n\n💰 Баланс: <b>${balance}₽</b>\n\nВыберите действие:`,
    { parse_mode: "HTML", reply_markup: cabinetKeyboard }
  );
}

export async function handlePurchases(bot: TelegramBot, query: TelegramBot.CallbackQuery) {
  const userId = query.from.id;
  const purchases = await db
    .select({ purchase: schema.purchasesTable, product: schema.productsTable })
    .from(schema.purchasesTable)
    .leftJoin(schema.productsTable, eq(schema.purchasesTable.productId, schema.productsTable.id))
    .where(eq(schema.purchasesTable.userId, userId));

  if (purchases.length === 0) {
    await bot.answerCallbackQuery(query.id);
    await bot.sendMessage(query.message!.chat.id, "🛍 У вас пока нет покупок.");
    return;
  }

  const lines = purchases.map((r, i) => {
    const date = r.purchase.createdAt.toLocaleDateString("ru-RU");
    return `${i + 1}. <b>${r.product?.name ?? "Товар"}</b> — ${r.purchase.pricePaid}₽\n🔑 <code>${r.purchase.keyValue}</code>\n📅 ${date}`;
  });

  await bot.answerCallbackQuery(query.id);
  await bot.sendMessage(
    query.message!.chat.id,
    `🛍 <b>Мои покупки:</b>\n\n${lines.join("\n\n")}`,
    { parse_mode: "HTML" }
  );
}

export async function handleTopupStart(bot: TelegramBot, query: TelegramBot.CallbackQuery) {
  await bot.answerCallbackQuery(query.id);
  await bot.sendMessage(
    query.message!.chat.id,
    `💰 <b>Пополнение баланса</b>\n\nДля пополнения баланса напишите нашему администратору или напишите желаемую сумму (в рублях), и мы выставим счёт.\n\nВведите сумму пополнения:`,
    { parse_mode: "HTML" }
  );
  setUserState(query.from.id, "topup_wait_amount");
}

export async function handlePromoStart(bot: TelegramBot, query: TelegramBot.CallbackQuery) {
  await bot.answerCallbackQuery(query.id);
  await bot.sendMessage(query.message!.chat.id, "🎁 Введите промокод:");
  setUserState(query.from.id, "promo_wait_code");
}

export async function handlePromoActivate(bot: TelegramBot, msg: TelegramBot.Message, code: string) {
  const userId = msg.from!.id;
  clearUserState(userId);

  const promo = await db
    .select()
    .from(schema.promocodesTable)
    .where(and(eq(schema.promocodesTable.code, code.trim().toUpperCase()), eq(schema.promocodesTable.isActive, true)))
    .limit(1);

  if (!promo[0] || promo[0].usesLeft <= 0) {
    await bot.sendMessage(msg.chat.id, "❌ Промокод не найден или уже использован.", { reply_markup: mainKeyboard });
    return;
  }

  const user = await db.select().from(schema.usersTable).where(eq(schema.usersTable.id, userId)).limit(1);
  const newBalance = (user[0]?.balance ?? 0) + promo[0].amount;

  await db.update(schema.usersTable).set({ balance: newBalance }).where(eq(schema.usersTable.id, userId));

  const newUses = promo[0].usesLeft - 1;
  if (newUses <= 0) {
    await db.update(schema.promocodesTable).set({ usesLeft: 0, isActive: false }).where(eq(schema.promocodesTable.id, promo[0].id));
  } else {
    await db.update(schema.promocodesTable).set({ usesLeft: newUses }).where(eq(schema.promocodesTable.id, promo[0].id));
  }

  await bot.sendMessage(
    msg.chat.id,
    `✅ Промокод активирован!\n💰 На ваш баланс зачислено <b>${promo[0].amount}₽</b>\nТекущий баланс: <b>${newBalance}₽</b>`,
    { parse_mode: "HTML", reply_markup: mainKeyboard }
  );
}
