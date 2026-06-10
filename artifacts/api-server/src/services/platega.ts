import { logger } from "../lib/logger";

const BASE_URL = "https://app.platega.io";

// ─── ВСТАВЬ СВОИ КЛЮЧИ СЮДА ─────────────────────────────────────────────────
// Merchant UUID и секрет из личного кабинета https://platega.io
const MERCHANT_ID = process.env.PLATEGA_MERCHANT_ID ?? "ВАШ_MERCHANT_ID";
const SECRET_KEY  = process.env.PLATEGA_SECRET_KEY  ?? "ВАШ_SECRET_KEY";
// ────────────────────────────────────────────────────────────────────────────

export interface CreateInvoiceResult {
  ok: true;
  transactionId: string;
  paymentUrl: string;
  expiresIn: string;
}

export interface CreateInvoiceError {
  ok: false;
  error: string;
}

export async function createInvoice(
  amount: number,
  userId: number,
  paymentMethod: number = 2
): Promise<CreateInvoiceResult | CreateInvoiceError> {
  if (!MERCHANT_ID || !SECRET_KEY) {
    logger.warn("Platega credentials not configured");
    return { ok: false, error: "Платёжная система не настроена. Обратитесь к администратору." };
  }

  try {
    const res = await fetch(`${BASE_URL}/transaction/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MerchantId": MERCHANT_ID,
        "X-Secret": SECRET_KEY,
      },
      body: JSON.stringify({
        paymentMethod,
        paymentDetails: {
          amount,
          currency: "RUB",
        },
        description: `Пополнение баланса в боте — ${amount}₽`,
        payload: String(userId),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error({ status: res.status, body: text }, "Platega API error");
      return { ok: false, error: "Ошибка при создании платежа. Попробуйте позже." };
    }

    const data = await res.json() as {
      transactionId: string;
      redirect: string;
      expiresIn: string;
      status: string;
    };

    return {
      ok: true,
      transactionId: data.transactionId,
      paymentUrl: data.redirect,
      expiresIn: data.expiresIn,
    };
  } catch (err) {
    logger.error({ err }, "Platega fetch error");
    return { ok: false, error: "Не удалось подключиться к платёжной системе." };
  }
}

export function verifyWebhook(merchantId: string, secret: string): boolean {
  return merchantId === MERCHANT_ID && secret === SECRET_KEY;
}
