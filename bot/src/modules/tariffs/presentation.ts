import type { Bot, Context } from "grammy";

import { showRenderedScreen } from "../../navigation/screens/presenter.js";
import {
  renderTariffCreatePrompt,
  renderTariffInputPrompt,
  renderTariffPeriodScreen,
  renderTariffScreen,
  renderTariffSquadScreen,
  type RenderedScreen,
} from "../../navigation/cards.js";
import type { AdminInputKind } from "../../services/admin-input-session-service.js";
import {
  getTariffById,
  getTariffPeriodById,
  getTariffSquadById,
} from "../../services/tariff-service.js";
import {
  getTelegramUserByTelegramId,
  updateTelegramUserMenuMessage,
} from "../../services/telegram-user-service.js";
import type { TariffSection } from "./types.js";

export async function getAdminUser(telegramId: bigint) {
  return getTelegramUserByTelegramId(telegramId);
}

function isMessageNotModifiedError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("message is not modified")
  );
}

export async function showRenderedScreenFromCallback(
  ctx: Context,
  screen: RenderedScreen,
) {
  try {
    await ctx.editMessageText(screen.text, {
      parse_mode: "HTML",
      reply_markup: screen.replyMarkup,
    });
  } catch (error) {
    if (!isMessageNotModifiedError(error)) {
      throw error;
    }
  }

  const callbackMessage = ctx.callbackQuery?.message;

  if (ctx.from && ctx.chat?.type === "private" && callbackMessage) {
    await updateTelegramUserMenuMessage(
      BigInt(ctx.from.id),
      callbackMessage.message_id,
    );
  }

  return true;
}

export async function showTariffCard(
  bot: Bot,
  telegramId: bigint,
  tariffId: number,
) {
  const [user, tariff] = await Promise.all([
    getAdminUser(telegramId),
    getTariffById(tariffId),
  ]);

  if (!user || !tariff) {
    return false;
  }

  await showRenderedScreen(bot, user, renderTariffScreen(tariff));
  return true;
}

export async function showTariffCardFromCallback(
  ctx: Context,
  tariffId: number,
) {
  const tariff = await getTariffById(tariffId);

  if (!tariff) {
    return false;
  }

  await showRenderedScreenFromCallback(ctx, renderTariffScreen(tariff));
  return true;
}

export async function showTariffSection(
  bot: Bot,
  telegramId: bigint,
  tariffId: number,
  section: TariffSection,
) {
  const [user, tariff] = await Promise.all([
    getAdminUser(telegramId),
    getTariffById(tariffId),
  ]);

  if (!user || !tariff) {
    return false;
  }

  await showRenderedScreen(bot, user, renderTariffScreen(tariff, section));
  return true;
}

export async function showTariffSectionFromCallback(
  ctx: Context,
  tariffId: number,
  section: TariffSection,
) {
  const tariff = await getTariffById(tariffId);

  if (!tariff) {
    return false;
  }

  await showRenderedScreenFromCallback(ctx, renderTariffScreen(tariff, section));
  return true;
}

export async function showTariffSquadCard(
  bot: Bot,
  telegramId: bigint,
  tariffSquadId: number,
) {
  const tariffSquad = await getTariffSquadById(tariffSquadId);

  if (!tariffSquad) {
    return false;
  }

  const [user, tariff] = await Promise.all([
    getAdminUser(telegramId),
    getTariffById(tariffSquad.tariffId),
  ]);

  if (!user || !tariff) {
    return false;
  }

  await showRenderedScreen(bot, user, renderTariffSquadScreen(tariff, tariffSquadId));
  return true;
}

export async function showTariffSquadCardFromCallback(
  ctx: Context,
  tariffSquadId: number,
) {
  const tariffSquad = await getTariffSquadById(tariffSquadId);

  if (!tariffSquad) {
    return false;
  }

  const tariff = await getTariffById(tariffSquad.tariffId);

  if (!tariff) {
    return false;
  }

  await showRenderedScreenFromCallback(
    ctx,
    renderTariffSquadScreen(tariff, tariffSquadId),
  );
  return true;
}

export async function showTariffPeriodCard(
  bot: Bot,
  telegramId: bigint,
  tariffPeriodId: number,
) {
  const tariffPeriod = await getTariffPeriodById(tariffPeriodId);

  if (!tariffPeriod) {
    return false;
  }

  const [user, tariff] = await Promise.all([
    getAdminUser(telegramId),
    getTariffById(tariffPeriod.tariffId),
  ]);

  if (!user || !tariff) {
    return false;
  }

  await showRenderedScreen(bot, user, renderTariffPeriodScreen(tariff, tariffPeriodId));
  return true;
}

export async function showTariffPeriodCardFromCallback(
  ctx: Context,
  tariffPeriodId: number,
) {
  const tariffPeriod = await getTariffPeriodById(tariffPeriodId);

  if (!tariffPeriod) {
    return false;
  }

  const tariff = await getTariffById(tariffPeriod.tariffId);

  if (!tariff) {
    return false;
  }

  await showRenderedScreenFromCallback(
    ctx,
    renderTariffPeriodScreen(tariff, tariffPeriodId),
  );
  return true;
}

export function buildTariffPrompt(
  kind: AdminInputKind,
  tariff: Awaited<ReturnType<typeof getTariffById>>,
  errorMessage?: string,
) {
  if (!tariff) {
    return null;
  }

  switch (kind) {
    case "tariff_name":
      return renderTariffInputPrompt(
        tariff,
        "Изменение названия",
        [
          "Отправь следующим сообщением новое название тарифа.",
          "Минимум 2 символа.",
        ],
        "basic",
        {
          currentValue: tariff.name,
          errorMessage,
        },
      );
    case "tariff_description":
      return renderTariffInputPrompt(
        tariff,
        "Изменение описания",
        [
          "Отправь следующим сообщением описание тарифа.",
          "Отправь <code>-</code>, если поле нужно очистить.",
        ],
        "basic",
        {
          currentValue: tariff.description,
          errorMessage,
        },
      );
    case "tariff_usage_terms":
      return renderTariffInputPrompt(
        tariff,
        "Изменение условий использования",
        [
          "Отправь следующим сообщением условия использования тарифа.",
          "Отправь <code>-</code>, если поле нужно очистить.",
        ],
        "basic",
        {
          currentValue: tariff.usageTerms,
          errorMessage,
        },
      );
    case "tariff_daily_price":
      return renderTariffInputPrompt(
        tariff,
        "Изменение цены за 1 день",
        [
          "Отправь следующим сообщением цену тарифа за 1 день.",
          "Например: <code>99.90</code>",
        ],
        "basic",
        {
          currentValue: `${(tariff.dailyPriceMinor / 100).toFixed(2)} ${tariff.currencyCode}`,
          errorMessage,
        },
      );
    case "tariff_period_create_days":
      return renderTariffInputPrompt(
        tariff,
        "Добавление периода",
        [
          "Отправь следующим сообщением количество дней для нового периода.",
          "Например: <code>30</code>",
        ],
        "duration",
        {
          errorMessage,
        },
      );
    case "tariff_period_duration_days":
      return renderTariffInputPrompt(
        tariff,
        "Изменение количества дней",
        [
          "Отправь следующим сообщением количество дней.",
          "Например: <code>30</code>",
        ],
        "duration",
        {
          errorMessage,
        },
      );
    case "tariff_period_discount_percent":
      return renderTariffInputPrompt(
        tariff,
        "Изменение скидки",
        [
          "Отправь следующим сообщением скидку в процентах.",
          "Например: <code>15</code>",
        ],
        "duration",
        {
          errorMessage,
        },
      );
    case "tariff_free_devices":
      return renderTariffInputPrompt(
        tariff,
        "Изменение устройств",
        [
          "Отправь следующим сообщением число бесплатных устройств.",
          "Например: <code>1</code>",
        ],
        "devices",
        {
          currentValue: String(tariff.freeDevicesPerUser),
          errorMessage,
        },
      );
    case "tariff_device_daily_price":
      return renderTariffInputPrompt(
        tariff,
        "Изменение цены устройства",
        [
          "Отправь следующим сообщением цену устройства в день.",
          "Например: <code>49.90</code>",
        ],
        "devices",
        {
          currentValue: `${(tariff.deviceDailyPriceMinor / 100).toFixed(2)} ${tariff.currencyCode}`,
          errorMessage,
        },
      );
    default:
      return null;
  }
}

export { renderTariffCreatePrompt };
