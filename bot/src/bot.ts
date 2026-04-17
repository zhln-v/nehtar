import { Bot } from "grammy";

import { htmlBold } from "./formatters/html.js";
import { config } from "./config.js";
import { registerAdminHandlers } from "./modules/admin/handlers.js";
import { handleAdminTextInput } from "./modules/admin/handlers.js";
import {
  handlePurchaseTextInput,
  registerPurchaseHandlers,
  registerPurchasePaymentHandlers,
} from "./modules/purchase/handlers.js";
import {
  handleSquadTextInput,
  registerSquadHandlers,
} from "./modules/squads/handlers.js";
import {
  openScreenFromCallback,
  openScreenFromCommand,
} from "./navigation/screens/presenter.js";
import { handleTariffTextInput, registerTariffHandlers } from "./modules/tariffs/handlers.js";
import { isScreenId } from "./navigation/screens.js";
import { isAdminTelegramId } from "./services/access-service.js";
import {
  attachReferrerByReferralCode,
  parseReferralStartPayload,
} from "./services/referral-service.js";
import { safeAnswerCallbackQuery } from "./services/telegram-callback-service.js";
import { upsertTelegramUser } from "./services/telegram-user-service.js";

export const bot = new Bot(config.BOT_TOKEN);

async function deleteUserInputMessage(ctx: {
  chat?: { id: number } | undefined;
  message?: { message_id: number } | undefined;
  api: Bot["api"];
}) {
  if (!ctx.chat || !ctx.message) {
    return;
  }

  try {
    await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
  } catch (error) {
    console.error("Не удалось удалить пользовательское сообщение", error);
  }
}

bot.command("start", async (ctx) => {
  if (!ctx.from) {
    throw new Error("Команда /start пришла без пользователя");
  }

  const user = await upsertTelegramUser(ctx);
  const payload = ctx.message?.text.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/)?.[1]?.trim();
  const referralCode = parseReferralStartPayload(payload);

  if (referralCode) {
    await attachReferrerByReferralCode(user.id, referralCode);
  }

  await openScreenFromCommand(
    bot,
    ctx as typeof ctx & { from: NonNullable<typeof ctx.from> },
    "home",
    { forceNewMessage: true },
  );
});

bot.command("ping", async (ctx) => {
  await ctx.reply(htmlBold("Понг"), {
    parse_mode: "HTML",
  });
});

bot.command("admin", async (ctx) => {
  if (!ctx.from) {
    throw new Error("Команда /admin пришла без пользователя");
  }

  await upsertTelegramUser(ctx);
  await openScreenFromCommand(
    bot,
    ctx as typeof ctx & { from: NonNullable<typeof ctx.from> },
    "admin",
  );
});

registerTariffHandlers(bot);
registerAdminHandlers(bot);
registerSquadHandlers(bot);
registerPurchaseHandlers(bot);
registerPurchasePaymentHandlers(bot);

bot.callbackQuery(/^nav:(.+)$/, async (ctx) => {
  const screenId = ctx.match[1];

  if (screenId === undefined || !isScreenId(screenId)) {
    await safeAnswerCallbackQuery(ctx, { text: "Неизвестный экран", show_alert: false });
    return;
  }

  await openScreenFromCallback(ctx, screenId);
});

bot.on("message:text", async (ctx) => {
  if (ctx.from) {
    const telegramId = BigInt(ctx.from.id);
    const input = ctx.message.text.trim();

    if (await handlePurchaseTextInput(bot, telegramId, input)) {
      await deleteUserInputMessage(ctx);
      return;
    }
  }

  if (ctx.from && isAdminTelegramId(BigInt(ctx.from.id))) {
    const telegramId = BigInt(ctx.from.id);
    const input = ctx.message.text.trim();

    if (await handleAdminTextInput(bot, telegramId, input)) {
      await deleteUserInputMessage(ctx);
      return;
    }

    if (await handleSquadTextInput(bot, telegramId, input)) {
      await deleteUserInputMessage(ctx);
      return;
    }

    if (await handleTariffTextInput(bot, telegramId, input)) {
      await deleteUserInputMessage(ctx);
      return;
    }
  }

  await ctx.reply("Используй /start, чтобы открыть меню.", {
    parse_mode: "HTML",
  });
});

bot.catch((error) => {
  console.error("Ошибка Telegram-бота", error.error);
});
