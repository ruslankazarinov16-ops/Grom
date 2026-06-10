import TelegramBot from "node-telegram-bot-api";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { adminKeyboard } from "../keyboards";
import { getAdminState, setAdminState, clearAdminState } from "../state";
import { logger } from "../../lib/logger";

const SUPER_ADMIN_ID = 7085601013;

export async function isAdmin(userId: number): Promise<boolean> {
  if (userId === SUPER_ADMIN_ID) return true;
  const user = await db.select().from(schema.usersTable).where(eq(schema.usersTable.id, userId)).limit(1);
  return user[0]?.isAdmin === true;
}

export async function handleAdminPanel(bot: TelegramBot, msg: TelegramBot.Message) {
  const userId = msg.from!.id;
  if (!(await isAdmin(userId))) {
    await bot.sendMessage(msg.chat.id, "❌ У вас нет доступа к панели администратора.");
    return;
  }
  await bot.sendMessage(msg.chat.id, "🔧 <b>Панель администратора</b>\n\nВыберите действие:", {
    parse_mode: "HTML",
    reply_markup: adminKeyboard,
  });
}

export async function handleAdminCallback(bot: TelegramBot, query: TelegramBot.CallbackQuery) {
  const userId = query.from.id;
  if (!(await isAdmin(userId))) {
    await bot.answerCallbackQuery(query.id, { text: "❌ Нет доступа" });
    return;
  }

  const data = query.data!;
  const chatId = query.message!.chat.id;

  await bot.answerCallbackQuery(query.id);

  switch (data) {
    case "admin_add_admin":
      setAdminState(userId, "add_admin_wait_id");
      await bot.sendMessage(chatId, "👑 Введите Telegram ID пользователя, которому хотите выдать права администратора:");
      break;

    case "admin_add_category":
      setAdminState(userId, "add_category_wait_name");
      await bot.sendMessage(chatId, "📂 Введите название новой категории (игры):");
      break;

    case "admin_add_product": {
      const cats = await db.select().from(schema.categoriesTable);
      if (cats.length === 0) {
        await bot.sendMessage(chatId, "❌ Сначала создайте хотя бы одну категорию.");
        return;
      }
      const list = cats.map((c) => `${c.id}: ${c.name}`).join("\n");
      setAdminState(userId, "add_product_wait_category");
      await bot.sendMessage(chatId, `🎮 Доступные категории:\n${list}\n\nВведите ID категории:`);
      break;
    }

    case "admin_add_tier": {
      const prods = await db.select().from(schema.productsTable);
      if (prods.length === 0) {
        await bot.sendMessage(chatId, "❌ Сначала создайте хотя бы один продукт.");
        return;
      }
      const list = prods.map((p) => `${p.id}: ${p.name}`).join("\n");
      setAdminState(userId, "add_tier_wait_product");
      await bot.sendMessage(chatId, `💲 <b>Добавить тариф</b>\n\nДоступные продукты:\n${list}\n\nВведите ID продукта:`, { parse_mode: "HTML" });
      break;
    }

    case "admin_add_key": {
      const prods = await db.select().from(schema.productsTable);
      if (prods.length === 0) {
        await bot.sendMessage(chatId, "❌ Сначала создайте хотя бы один продукт.");
        return;
      }
      const list = prods.map((p) => `${p.id}: ${p.name}`).join("\n");
      setAdminState(userId, "add_key_wait_product");
      await bot.sendMessage(chatId, `📦 Доступные продукты:\n${list}\n\nВведите ID продукта:`);
      break;
    }

    case "admin_ban_user":
      setAdminState(userId, "ban_user_wait_id");
      await bot.sendMessage(chatId, "🚫 Введите Telegram ID пользователя для блокировки:");
      break;

    case "admin_create_promo":
      setAdminState(userId, "create_promo_wait_code");
      await bot.sendMessage(chatId, "🎁 Введите код промокода (например: SALE2024):");
      break;

    case "admin_list_promos": {
      const promos = await db.select().from(schema.promocodesTable);
      if (promos.length === 0) {
        await bot.sendMessage(chatId, "📋 Промокодов нет.");
        return;
      }
      const lines = promos.map(
        (p) =>
          `🎁 <code>${p.code}</code> — ${p.amount}₽ | Осталось: ${p.usesLeft} | ${p.isActive ? "✅ Активен" : "❌ Неактивен"}`
      );
      await bot.sendMessage(chatId, `📋 <b>Промокоды:</b>\n\n${lines.join("\n")}`, { parse_mode: "HTML" });
      break;
    }

    case "admin_list_users": {
      const users = await db.select().from(schema.usersTable);
      if (users.length === 0) {
        await bot.sendMessage(chatId, "👥 Пользователей нет.");
        return;
      }
      const lines = users.map(
        (u) =>
          `👤 ID: <code>${u.id}</code> | ${u.username ? "@" + u.username : u.firstName ?? "—"} | 💰${u.balance}₽${u.isBanned ? " | 🚫" : ""}${u.isAdmin ? " | 👑" : ""}`
      );
      const chunks: string[] = [];
      let current = `👥 <b>Пользователи (${users.length}):</b>\n\n`;
      for (const line of lines) {
        if ((current + line + "\n").length > 4000) {
          chunks.push(current);
          current = "";
        }
        current += line + "\n";
      }
      if (current) chunks.push(current);
      for (const chunk of chunks) {
        await bot.sendMessage(chatId, chunk, { parse_mode: "HTML" });
      }
      break;
    }

    case "admin_broadcast":
      setAdminState(userId, "broadcast_wait_message");
      await bot.sendMessage(chatId, "📢 Введите текст рассылки (поддерживается HTML):");
      break;

    default:
      break;
  }
}

export async function handleAdminMessage(bot: TelegramBot, msg: TelegramBot.Message): Promise<boolean> {
  const userId = msg.from!.id;
  if (!(await isAdmin(userId))) return false;

  const state = getAdminState(userId);
  if (state.step === "idle") return false;

  const text = msg.text ?? "";
  const chatId = msg.chat.id;

  switch (state.step) {
    case "add_admin_wait_id": {
      const targetId = parseInt(text.trim(), 10);
      if (isNaN(targetId)) {
        await bot.sendMessage(chatId, "❌ Неверный ID. Введите числовой Telegram ID:");
        return true;
      }
      const existing = await db.select().from(schema.usersTable).where(eq(schema.usersTable.id, targetId)).limit(1);
      if (!existing[0]) {
        await bot.sendMessage(chatId, "❌ Пользователь не найден. Он должен сначала написать боту.");
        clearAdminState(userId);
        return true;
      }
      await db.update(schema.usersTable).set({ isAdmin: true }).where(eq(schema.usersTable.id, targetId));
      clearAdminState(userId);
      await bot.sendMessage(chatId, `✅ Пользователь <code>${targetId}</code> назначен администратором.`, { parse_mode: "HTML" });
      return true;
    }

    case "add_category_wait_name":
      setAdminState(userId, "add_category_wait_desc", { name: text });
      await bot.sendMessage(chatId, "📝 Введите описание категории (или отправьте «-» чтобы пропустить):");
      return true;

    case "add_category_wait_desc": {
      const name = state.data.name as string;
      const desc = text === "-" ? null : text;
      await db.insert(schema.categoriesTable).values({ name, description: desc });
      clearAdminState(userId);
      await bot.sendMessage(chatId, `✅ Категория <b>${name}</b> создана.`, { parse_mode: "HTML" });
      return true;
    }

    case "add_product_wait_category": {
      const catId = parseInt(text.trim(), 10);
      if (isNaN(catId)) {
        await bot.sendMessage(chatId, "❌ Введите числовой ID:");
        return true;
      }
      const cat = await db.select().from(schema.categoriesTable).where(eq(schema.categoriesTable.id, catId)).limit(1);
      if (!cat[0]) {
        await bot.sendMessage(chatId, "❌ Категория не найдена. Введите корректный ID:");
        return true;
      }
      setAdminState(userId, "add_product_wait_name", { categoryId: catId });
      await bot.sendMessage(chatId, "📝 Введите название продукта:");
      return true;
    }

    case "add_product_wait_name":
      setAdminState(userId, "add_product_wait_desc", { ...state.data, name: text });
      await bot.sendMessage(chatId, "📝 Введите описание продукта (или «-» чтобы пропустить):");
      return true;

    case "add_product_wait_desc":
      setAdminState(userId, "add_product_wait_price", { ...state.data, description: text === "-" ? "" : text });
      await bot.sendMessage(chatId, "💰 Введите базовую цену в рублях (используется если нет тарифов, например: 299):");
      return true;

    case "add_product_wait_price": {
      const price = parseInt(text.trim(), 10);
      if (isNaN(price) || price <= 0) {
        await bot.sendMessage(chatId, "❌ Введите корректную цену (целое число больше 0):");
        return true;
      }
      const { categoryId, name, description } = state.data;
      await db.insert(schema.productsTable).values({
        categoryId: categoryId as number,
        name: name as string,
        description: (description as string) || null,
        price,
      });
      clearAdminState(userId);
      await bot.sendMessage(
        chatId,
        `✅ Продукт <b>${name}</b> добавлен.\n\n💡 Совет: добавьте тарифы через кнопку «💲 Добавить тариф к продукту», чтобы покупатели видели варианты цен.`,
        { parse_mode: "HTML" }
      );
      return true;
    }

    // --- Tier flow ---
    case "add_tier_wait_product": {
      const prodId = parseInt(text.trim(), 10);
      if (isNaN(prodId)) {
        await bot.sendMessage(chatId, "❌ Введите числовой ID:");
        return true;
      }
      const prod = await db.select().from(schema.productsTable).where(eq(schema.productsTable.id, prodId)).limit(1);
      if (!prod[0]) {
        await bot.sendMessage(chatId, "❌ Продукт не найден. Введите корректный ID:");
        return true;
      }
      setAdminState(userId, "add_tier_wait_name", { productId: prodId, productName: prod[0].name });
      await bot.sendMessage(chatId, `📝 Введите название тарифа для <b>${prod[0].name}</b>:\n\n<i>Пример: «1 месяц», «3 месяца», «Навсегда»</i>`, { parse_mode: "HTML" });
      return true;
    }

    case "add_tier_wait_name":
      setAdminState(userId, "add_tier_wait_price", { ...state.data, tierName: text });
      await bot.sendMessage(chatId, `💰 Введите цену тарифа «<b>${text}</b>» в рублях:`, { parse_mode: "HTML" });
      return true;

    case "add_tier_wait_price": {
      const price = parseInt(text.trim(), 10);
      if (isNaN(price) || price <= 0) {
        await bot.sendMessage(chatId, "❌ Введите корректную цену:");
        return true;
      }
      const { productId, productName, tierName } = state.data;
      await db.insert(schema.tiersTable).values({
        productId: productId as number,
        name: tierName as string,
        price,
      });

      // Show existing tiers and offer to add more
      const existingTiers = await db.select().from(schema.tiersTable).where(eq(schema.tiersTable.productId, productId as number));
      const tierList = existingTiers.map((t) => `• ${t.name} — ${t.price}₽`).join("\n");

      clearAdminState(userId);
      await bot.sendMessage(
        chatId,
        `✅ Тариф <b>${tierName as string}</b> за <b>${price}₽</b> добавлен к продукту <b>${productName as string}</b>!\n\n📋 Текущие тарифы:\n${tierList}\n\n💡 Теперь добавьте ключи для этого тарифа через «🔑 Добавить ключ».`,
        { parse_mode: "HTML" }
      );
      return true;
    }

    // --- Key flow (now tier-aware) ---
    case "add_key_wait_product": {
      const prodId = parseInt(text.trim(), 10);
      if (isNaN(prodId)) {
        await bot.sendMessage(chatId, "❌ Введите числовой ID:");
        return true;
      }
      const prod = await db.select().from(schema.productsTable).where(eq(schema.productsTable.id, prodId)).limit(1);
      if (!prod[0]) {
        await bot.sendMessage(chatId, "❌ Продукт не найден. Введите корректный ID:");
        return true;
      }

      // Check if product has tiers
      const tiers = await db.select().from(schema.tiersTable).where(eq(schema.tiersTable.productId, prodId));
      if (tiers.length === 0) {
        // No tiers — add key directly to product
        setAdminState(userId, "add_key_wait_value", { productId: prodId, productName: prod[0].name, tierId: 0 });
        await bot.sendMessage(chatId, `🔑 Введите ключи для <b>${prod[0].name}</b>:\n\n(По одному на строку — можно несколько сразу)`, { parse_mode: "HTML" });
      } else {
        // Has tiers — ask which tier
        const list = tiers.map((t) => `${t.id}: ${t.name} — ${t.price}₽`).join("\n");
        setAdminState(userId, "add_key_wait_tier", { productId: prodId, productName: prod[0].name });
        await bot.sendMessage(chatId, `💲 Тарифы продукта <b>${prod[0].name}</b>:\n${list}\n\nВведите ID тарифа, к которому добавляем ключи:`, { parse_mode: "HTML" });
      }
      return true;
    }

    case "add_key_wait_tier": {
      const tierId = parseInt(text.trim(), 10);
      if (isNaN(tierId)) {
        await bot.sendMessage(chatId, "❌ Введите числовой ID тарифа:");
        return true;
      }
      const tier = await db.select().from(schema.tiersTable).where(eq(schema.tiersTable.id, tierId)).limit(1);
      if (!tier[0] || tier[0].productId !== (state.data.productId as number)) {
        await bot.sendMessage(chatId, "❌ Тариф не найден. Введите корректный ID:");
        return true;
      }
      setAdminState(userId, "add_key_wait_value", { ...state.data, tierId, tierName: tier[0].name });
      await bot.sendMessage(chatId, `🔑 Введите ключи для тарифа <b>${tier[0].name}</b>:\n\n(По одному на строку — можно несколько сразу)`, { parse_mode: "HTML" });
      return true;
    }

    case "add_key_wait_value": {
      const prodId = state.data.productId as number;
      const productName = state.data.productName as string;
      const tierId = state.data.tierId as number;
      const tierName = state.data.tierName as string | undefined;
      const keys = text.split("\n").map((k) => k.trim()).filter((k) => k.length > 0);
      if (keys.length === 0) {
        await bot.sendMessage(chatId, "❌ Введите хотя бы один ключ:");
        return true;
      }
      for (const key of keys) {
        await db.insert(schema.keysTable).values({
          productId: prodId,
          tierId: tierId > 0 ? tierId : null,
          keyValue: key,
        });
      }
      clearAdminState(userId);
      const target = tierName ? `тарифа <b>${tierName}</b>` : `продукта <b>${productName}</b>`;
      await bot.sendMessage(chatId, `✅ Добавлено <b>${keys.length}</b> ключ(ей) для ${target}.`, { parse_mode: "HTML" });
      return true;
    }

    case "ban_user_wait_id": {
      const targetId = parseInt(text.trim(), 10);
      if (isNaN(targetId)) {
        await bot.sendMessage(chatId, "❌ Введите числовой ID:");
        return true;
      }
      const existing = await db.select().from(schema.usersTable).where(eq(schema.usersTable.id, targetId)).limit(1);
      if (!existing[0]) {
        await bot.sendMessage(chatId, "❌ Пользователь не найден.");
        clearAdminState(userId);
        return true;
      }
      const newBanStatus = !existing[0].isBanned;
      await db.update(schema.usersTable).set({ isBanned: newBanStatus }).where(eq(schema.usersTable.id, targetId));
      clearAdminState(userId);
      await bot.sendMessage(
        chatId,
        newBanStatus
          ? `🚫 Пользователь <code>${targetId}</code> заблокирован.`
          : `✅ Пользователь <code>${targetId}</code> разблокирован.`,
        { parse_mode: "HTML" }
      );
      return true;
    }

    case "create_promo_wait_code":
      setAdminState(userId, "create_promo_wait_amount", { code: text.trim().toUpperCase() });
      await bot.sendMessage(chatId, "💰 Введите сумму в рублях, которую даёт промокод:");
      return true;

    case "create_promo_wait_amount": {
      const amount = parseInt(text.trim(), 10);
      if (isNaN(amount) || amount <= 0) {
        await bot.sendMessage(chatId, "❌ Введите корректную сумму:");
        return true;
      }
      setAdminState(userId, "create_promo_wait_uses", { ...state.data, amount });
      await bot.sendMessage(chatId, "🔢 Сколько раз можно использовать промокод? (введите число):");
      return true;
    }

    case "create_promo_wait_uses": {
      const uses = parseInt(text.trim(), 10);
      if (isNaN(uses) || uses <= 0) {
        await bot.sendMessage(chatId, "❌ Введите корректное число:");
        return true;
      }
      const { code, amount } = state.data;
      try {
        await db.insert(schema.promocodesTable).values({
          code: code as string,
          amount: amount as number,
          usesLeft: uses,
          isActive: true,
        });
        clearAdminState(userId);
        await bot.sendMessage(
          chatId,
          `✅ Промокод <code>${code}</code> создан!\n💰 Сумма: ${amount}₽\n🔢 Использований: ${uses}`,
          { parse_mode: "HTML" }
        );
      } catch {
        clearAdminState(userId);
        await bot.sendMessage(chatId, "❌ Промокод с таким кодом уже существует.");
      }
      return true;
    }

    case "broadcast_wait_message": {
      clearAdminState(userId);
      const users = await db.select().from(schema.usersTable).where(eq(schema.usersTable.isBanned, false));
      let sent = 0;
      let failed = 0;
      for (const user of users) {
        try {
          await bot.sendMessage(user.id, text, { parse_mode: "HTML" });
          sent++;
        } catch {
          failed++;
        }
      }
      await bot.sendMessage(chatId, `📢 Рассылка завершена!\n✅ Доставлено: ${sent}\n❌ Ошибок: ${failed}`);
      logger.info({ sent, failed }, "Broadcast completed");
      return true;
    }

    default:
      return false;
  }
}
