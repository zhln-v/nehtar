import type { Bot, Context } from "grammy";

import { escapeHtml } from "../../formatters/html.js";
import type { TelegramUser } from "../../generated/prisma/index.js";
import { safeAnswerCallbackQuery } from "../../services/telegram-callback-service.js";
import {
  startSystemStatusAutoRefresh,
  stopSystemStatusAutoRefresh,
} from "../../services/system-status-refresh-service.js";
import {
  getTelegramUserByTelegramId,
  updateTelegramUserMenuMessage,
} from "../../services/telegram-user-service.js";
import { getTelegramRetryAfterSeconds } from "../../services/telegram-rate-limit-service.js";
import { clearUserInputSession } from "../../services/user-input-session-service.js";
import { clearAdminInputSession as clearAdminSession } from "../../services/admin-input-session-service.js";
import type { RenderedScreen } from "../cards.js";
import { resolveScreen } from "./resolver.js";
import type { ScreenId } from "../screens.js";

type BotContext = Context & {
  from: NonNullable<Context["from"]>;
};

type OpenScreenOptions = {
  forceNewMessage?: boolean;
};

async function clearInteractiveInputSessions(telegramId: bigint) {
  await Promise.all([
    clearUserInputSession(telegramId),
    clearAdminSession(telegramId),
  ]);
}

function stopLiveScreenFeatures(telegramId: bigint) {
  stopSystemStatusAutoRefresh(telegramId);
}

function isMessageNotModifiedError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("message is not modified")
  );
}

function isRateLimitError(error: unknown) {
  return getTelegramRetryAfterSeconds(error) !== null;
}

export async function showRenderedScreen(
  bot: Bot,
  user: TelegramUser,
  screen: RenderedScreen,
) {
  if (!user.privateChatId || !user.lastMenuMessageId) {
    return false;
  }

  try {
    await bot.api.editMessageText(
      Number(user.privateChatId),
      user.lastMenuMessageId,
      screen.text,
      {
        parse_mode: "HTML",
        reply_markup: screen.replyMarkup,
      },
    );

    return true;
  } catch (error) {
    if (isMessageNotModifiedError(error)) {
      return true;
    }

    if (isRateLimitError(error)) {
      console.warn("Telegram rate limit while updating menu", error);
      return false;
    }

    console.error("Не удалось обновить меню", error);
    return false;
  }
}

async function editExistingMenuMessage(
  bot: Bot,
  user: TelegramUser,
  screenId: ScreenId,
) {
  const screen = await resolveScreen(user, screenId);
  return showRenderedScreen(bot, user, screen);
}

export async function openScreenFromCommand(
  bot: Bot,
  ctx: BotContext,
  screenId: ScreenId,
  options: OpenScreenOptions = {},
) {
  const user = await getTelegramUserByTelegramId(BigInt(ctx.from.id));

  if (!user) {
    throw new Error("Пользователь не найден в базе данных");
  }

  stopLiveScreenFeatures(user.telegramId);
  await clearInteractiveInputSessions(user.telegramId);

  const reusedExistingMessage = options.forceNewMessage
    ? false
    : await editExistingMenuMessage(bot, user, screenId);

  if (!reusedExistingMessage) {
    const screen = await resolveScreen(user, screenId);
    const sentMessage = await ctx.reply(screen.text, {
      parse_mode: "HTML",
      reply_markup: screen.replyMarkup,
    });

    await updateTelegramUserMenuMessage(
      BigInt(ctx.from.id),
      sentMessage.message_id,
    );

    if (screenId === "admin_system_status") {
      startSystemStatusAutoRefresh({
        api: bot.api,
        telegramId: user.telegramId,
        chatId: sentMessage.chat.id,
        messageId: sentMessage.message_id,
      });
    }
  } else if (screenId === "admin_system_status" && user.privateChatId && user.lastMenuMessageId) {
    startSystemStatusAutoRefresh({
      api: bot.api,
      telegramId: user.telegramId,
      chatId: Number(user.privateChatId),
      messageId: user.lastMenuMessageId,
    });
  }
}

export async function openScreenFromCallback(
  ctx: Context,
  screenId: ScreenId,
) {
  if (!ctx.from) {
    throw new Error("Пользователь callback-запроса не найден");
  }

  const user = await getTelegramUserByTelegramId(BigInt(ctx.from.id));

  if (!user) {
    throw new Error("Пользователь не найден в базе данных");
  }

  stopLiveScreenFeatures(user.telegramId);
  await clearInteractiveInputSessions(user.telegramId);

  const screen = await resolveScreen(user, screenId);

  try {
    await ctx.editMessageText(screen.text, {
      parse_mode: "HTML",
      reply_markup: screen.replyMarkup,
    });
  } catch (error) {
    if (isMessageNotModifiedError(error)) {
      // no-op
    } else if (isRateLimitError(error)) {
      console.warn("Telegram rate limit while opening screen", error);
      await safeAnswerCallbackQuery(ctx, {
        text: "Telegram временно ограничил обновления. Попробуй через пару секунд.",
        show_alert: false,
      });
      return;
    } else {
      throw error;
    }
  }

  const callbackMessage = ctx.callbackQuery?.message;

  if (ctx.chat?.type === "private" && callbackMessage) {
    await updateTelegramUserMenuMessage(
      BigInt(ctx.from.id),
      callbackMessage.message_id,
    );

    if (screenId === "admin_system_status") {
      startSystemStatusAutoRefresh({
        api: ctx.api,
        telegramId: user.telegramId,
        chatId: callbackMessage.chat.id,
        messageId: callbackMessage.message_id,
      });
    }
  }

  await safeAnswerCallbackQuery(ctx);
}

export async function renderValidationErrorOnCurrentMenu(
  bot: Bot,
  user: TelegramUser,
  message: string,
) {
  const adminScreen = await resolveScreen(user, "admin");

  return showRenderedScreen(bot, user, {
    text: `Ошибка ввода: ${escapeHtml(message)}`,
    replyMarkup: adminScreen.replyMarkup,
  });
}
