import type { Bot } from "grammy";
import type { TrafficUnit } from "../../generated/prisma/index.js";

import { htmlBold } from "../../formatters/html.js";
import { openScreenFromCallback, showRenderedScreen } from "../../navigation/screens/presenter.js";
import {
  renderInternalSquadScreen,
  renderSquadInputPrompt,
  renderSquadUnitPrompt,
} from "../../navigation/cards.js";
import {
  clearAdminInputSession,
  getAdminInputSession,
  setAdminInputSession,
} from "../../services/admin-input-session-service.js";
import { getBillingSettings } from "../../services/billing-settings-service.js";
import { isAdminTelegramId } from "../../services/access-service.js";
import {
  getInternalSquadByUuid,
  syncInternalSquadsFromRemnawave,
  updateInternalSquadSettings,
} from "../../services/remnawave-squads-service.js";
import { safeAnswerCallbackQuery } from "../../services/telegram-callback-service.js";
import { getTelegramUserByTelegramId } from "../../services/telegram-user-service.js";
import { clearUserInputSession } from "../../services/user-input-session-service.js";

function isAdminContext(ctx: { from?: { id: number } | undefined }) {
  return Boolean(ctx.from && isAdminTelegramId(BigInt(ctx.from.id)));
}

async function showSquadScreen(
  bot: Bot,
  telegramId: bigint,
  squadUuid: string,
) {
  const [user, squad, settings] = await Promise.all([
    getTelegramUserByTelegramId(telegramId),
    getInternalSquadByUuid(squadUuid),
    getBillingSettings(),
  ]);

  if (!user || !squad) {
    return false;
  }

  await showRenderedScreen(bot, user, renderInternalSquadScreen(squad, settings.currencyCode));
  return true;
}

export function registerSquadHandlers(bot: Bot) {
  bot.callbackQuery(/^squads:sync$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const syncedCount = await syncInternalSquadsFromRemnawave();

    await safeAnswerCallbackQuery(ctx, {
      text: `Синхронизировано сквадов: ${syncedCount}`,
      show_alert: false,
    });

    await openScreenFromCallback(ctx, "admin_squads");
  });

  bot.callbackQuery(/^squad:open:(.+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const squadUuid = ctx.match[1];

    if (!squadUuid) {
      await safeAnswerCallbackQuery(ctx, { text: "Сквад не найден", show_alert: false });
      return;
    }

    const ok = await showSquadScreen(bot, BigInt(ctx.from.id), squadUuid);

    await safeAnswerCallbackQuery(ctx, 
      ok ? undefined : { text: "Сквад не найден", show_alert: false },
    );
  });

  bot.callbackQuery(/^squadunit:open:(.+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const squadUuid = ctx.match[1];

    if (!squadUuid) {
      await safeAnswerCallbackQuery(ctx, { text: "Сквад не найден", show_alert: false });
      return;
    }

    const [user, squad, settings] = await Promise.all([
      getTelegramUserByTelegramId(BigInt(ctx.from.id)),
      getInternalSquadByUuid(squadUuid),
      getBillingSettings(),
    ]);

    if (!user || !squad) {
      await safeAnswerCallbackQuery(ctx, { text: "Сквад не найден", show_alert: false });
      return;
    }

    await showRenderedScreen(bot, user, renderSquadUnitPrompt(squad, settings.currencyCode));
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^squadunit:set:(MB|GB|TB):(.+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const unit = ctx.match[1] as TrafficUnit;
    const squadUuid = ctx.match[2];

    if (!squadUuid) {
      await safeAnswerCallbackQuery(ctx, { text: "Сквад не найден", show_alert: false });
      return;
    }

    const [user, squad, settings] = await Promise.all([
      getTelegramUserByTelegramId(BigInt(ctx.from.id)),
      getInternalSquadByUuid(squadUuid),
      getBillingSettings(),
    ]);

    if (!user || !squad) {
      await safeAnswerCallbackQuery(ctx, { text: "Сквад не найден", show_alert: false });
      return;
    }

    await updateInternalSquadSettings(squad.uuid, {
      trafficPriceUnit: unit,
    });

    const updatedSquad = await getInternalSquadByUuid(squad.uuid);

    if (!updatedSquad) {
      await safeAnswerCallbackQuery(ctx, { text: "Сквад не найден", show_alert: false });
      return;
    }

    await showRenderedScreen(bot, user, renderInternalSquadScreen(updatedSquad, settings.currencyCode));
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^squadinput:(display_name|traffic_price):(.+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const inputType = ctx.match[1] as "display_name" | "traffic_price";
    const squadUuid = ctx.match[2];

    if (!squadUuid) {
      await safeAnswerCallbackQuery(ctx, { text: "Некорректное действие", show_alert: false });
      return;
    }

    const [user, squad] = await Promise.all([
      getTelegramUserByTelegramId(BigInt(ctx.from.id)),
      getInternalSquadByUuid(squadUuid),
    ]);

    if (!user || !squad) {
      await safeAnswerCallbackQuery(ctx, { text: "Сквад не найден", show_alert: false });
      return;
    }

    await clearUserInputSession(BigInt(ctx.from.id));
    await setAdminInputSession(
      BigInt(ctx.from.id),
      {
        kind: inputType === "display_name" ? "squad_display_name" : "squad_traffic_price",
        squadUuid: squad.uuid,
      },
    );

    await showRenderedScreen(bot, user, renderSquadInputPrompt(squad, inputType));
    await safeAnswerCallbackQuery(ctx, { text: "Жду ввод в чат", show_alert: false });
  });
}

export async function handleSquadTextInput(
  bot: Bot,
  telegramId: bigint,
  input: string,
) {
  const session = await getAdminInputSession(telegramId);

  if (!session || (session.kind !== "squad_display_name" && session.kind !== "squad_traffic_price")) {
    return false;
  }

  const [user, squad, settings] = await Promise.all([
    getTelegramUserByTelegramId(telegramId),
    getInternalSquadByUuid(session.squadUuid),
    getBillingSettings(),
  ]);

  if (!user || !squad) {
    await clearAdminInputSession(telegramId);
    return true;
  }

  if (session.kind === "squad_display_name") {
    const displayName = input === "-" ? null : input;

    if (displayName !== null && displayName.length === 0) {
      await showRenderedScreen(bot, user, {
        text: [
          htmlBold(`Сквад: ${squad.name}`),
          "",
          "Название не может быть пустым.",
          "Введи название для пользователя или отправь <code>-</code>, чтобы вернуть системное название.",
        ].join("\n"),
        replyMarkup: renderSquadInputPrompt(squad, "display_name").replyMarkup,
      });
      return true;
    }

    await updateInternalSquadSettings(squad.uuid, {
      displayName,
    });
    await clearAdminInputSession(telegramId);

    const updatedSquad = await getInternalSquadByUuid(squad.uuid);

    if (updatedSquad) {
      await showRenderedScreen(bot, user, renderInternalSquadScreen(updatedSquad, settings.currencyCode));
    }

    return true;
  }

  const parsed = Number(input.replace(",", "."));

  if (!Number.isFinite(parsed) || parsed < 0) {
    await showRenderedScreen(bot, user, {
      text: [
        htmlBold(`Сквад: ${squad.name}`),
        "",
        "Не удалось распознать себестоимость.",
        "Введи число в формате <code>49.90</code>.",
      ].join("\n"),
      replyMarkup: renderSquadInputPrompt(squad, "traffic_price").replyMarkup,
    });
    return true;
  }

  await updateInternalSquadSettings(squad.uuid, {
    trafficPricePerGbMinor: Math.round(parsed * 100),
  });

  await clearAdminInputSession(telegramId);

  const updatedSquad = await getInternalSquadByUuid(squad.uuid);

  if (updatedSquad) {
    await showRenderedScreen(bot, user, renderInternalSquadScreen(updatedSquad, settings.currencyCode));
  }

  return true;
}
