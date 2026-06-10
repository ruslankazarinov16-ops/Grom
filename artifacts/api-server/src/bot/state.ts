export type AdminStep =
  | "idle"
  | "add_admin_wait_id"
  | "add_category_wait_name"
  | "add_category_wait_desc"
  | "add_product_wait_category"
  | "add_product_wait_name"
  | "add_product_wait_desc"
  | "add_product_wait_price"
  | "add_key_wait_product"
  | "add_key_wait_value"
  | "ban_user_wait_id"
  | "create_promo_wait_code"
  | "create_promo_wait_amount"
  | "create_promo_wait_uses"
  | "broadcast_wait_message"
  | "topup_wait_user_id"
  | "topup_wait_amount";

export type UserStep =
  | "idle"
  | "promo_wait_code"
  | "topup_wait_amount"
  | "support_wait_message";

interface AdminState {
  step: AdminStep;
  data: Record<string, string | number>;
}

interface UserState {
  step: UserStep;
  data: Record<string, string | number>;
}

const adminStates = new Map<number, AdminState>();
const userStates = new Map<number, UserState>();

export function getAdminState(userId: number): AdminState {
  if (!adminStates.has(userId)) {
    adminStates.set(userId, { step: "idle", data: {} });
  }
  return adminStates.get(userId)!;
}

export function setAdminState(userId: number, step: AdminStep, data: Record<string, string | number> = {}) {
  adminStates.set(userId, { step, data });
}

export function clearAdminState(userId: number) {
  adminStates.set(userId, { step: "idle", data: {} });
}

export function getUserState(userId: number): UserState {
  if (!userStates.has(userId)) {
    userStates.set(userId, { step: "idle", data: {} });
  }
  return userStates.get(userId)!;
}

export function setUserState(userId: number, step: UserStep, data: Record<string, string | number> = {}) {
  userStates.set(userId, { step, data });
}

export function clearUserState(userId: number) {
  userStates.set(userId, { step: "idle", data: {} });
}
