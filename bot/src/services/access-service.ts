import { config } from "../config.js";

export function isAdminTelegramId(telegramId: bigint) {
  return config.adminTelegramIds.includes(telegramId);
}
