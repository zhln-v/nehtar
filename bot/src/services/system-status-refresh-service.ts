import type { Api } from "grammy";

import { getTelegramUserByTelegramId } from "./telegram-user-service.js";
import { getTelegramRetryAfterSeconds } from "./telegram-rate-limit-service.js";
import { resolveScreen } from "../navigation/screens/resolver.js";

const SYSTEM_STATUS_REFRESH_INTERVAL_MS = 2_500;
const SYSTEM_STATUS_REFRESH_WINDOW_MS = 5 * 60 * 1_000;

type RefreshHandle = {
  intervalId: ReturnType<typeof setInterval>;
  stopAt: number;
  nextAllowedAt: number;
};

const refreshHandles = new Map<bigint, RefreshHandle>();

export function stopSystemStatusAutoRefresh(telegramId: bigint) {
  const handle = refreshHandles.get(telegramId);

  if (!handle) {
    return;
  }

  clearInterval(handle.intervalId);
  refreshHandles.delete(telegramId);
}

export function startSystemStatusAutoRefresh(params: {
  api: Api;
  telegramId: bigint;
  chatId: number;
  messageId: number;
}) {
  stopSystemStatusAutoRefresh(params.telegramId);

  let isRunning = false;
  const stopAt = Date.now() + SYSTEM_STATUS_REFRESH_WINDOW_MS;
  let intervalId!: ReturnType<typeof setInterval>;
  const handle: RefreshHandle = {
    intervalId,
    stopAt,
    nextAllowedAt: 0,
  };

  intervalId = setInterval(async () => {
    const now = Date.now();

    if (now >= stopAt) {
      stopSystemStatusAutoRefresh(params.telegramId);
      return;
    }

    if (isRunning || now < handle.nextAllowedAt) {
      return;
    }

    isRunning = true;

    try {
      const user = await getTelegramUserByTelegramId(params.telegramId);

      if (!user || user.lastMenuMessageId !== params.messageId) {
        stopSystemStatusAutoRefresh(params.telegramId);
        return;
      }

      const screen = await resolveScreen(user, "admin_system_status");

      await params.api.editMessageText(
        params.chatId,
        params.messageId,
        screen.text,
        {
          parse_mode: "HTML",
          reply_markup: screen.replyMarkup,
        },
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes("message is not modified")
      ) {
        return;
      }

      const retryAfterSeconds = getTelegramRetryAfterSeconds(error);

      if (retryAfterSeconds !== null) {
        handle.nextAllowedAt = Date.now() + retryAfterSeconds * 1_000;
        console.warn(
          `Автообновление системного экрана поставлено на паузу на ${retryAfterSeconds} сек. из-за rate limit`,
        );
        return;
      }

      console.error("Не удалось автообновить экран состояния системы", error);
    } finally {
      isRunning = false;
    }
  }, SYSTEM_STATUS_REFRESH_INTERVAL_MS);

  handle.intervalId = intervalId;
  refreshHandles.set(params.telegramId, handle);
}
