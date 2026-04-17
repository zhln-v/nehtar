import type { Bot } from "grammy";

import { showRenderedScreen } from "../../navigation/screens/presenter.js";
import {
  renderTariffAddSquadScreen,
  renderTariffInputPrompt,
} from "../../navigation/cards.js";
import {
  clearAdminInputSession,
  getAdminInputSession,
  setAdminInputSession,
} from "../../services/admin-input-session-service.js";
import { isAdminTelegramId } from "../../services/access-service.js";
import { getInternalSquads } from "../../services/remnawave-squads-service.js";
import { safeAnswerCallbackQuery } from "../../services/telegram-callback-service.js";
import { clearUserInputSession } from "../../services/user-input-session-service.js";
import {
  addSquadToTariff,
  createTariffPeriod,
  createTariffFromDefaults,
  getTariffById,
  getTariffPeriodById,
  getTariffSquadById,
  removeTariffPeriod,
  removeTariffSquad,
  toggleTariffActive,
  updateTariff,
  updateTariffPeriod,
  updateTariffSquad,
} from "../../services/tariff-service.js";
import type { TariffDetails } from "../../services/tariff-service.js";
import {
  buildTariffPrompt,
  getAdminUser,
  renderTariffCreatePrompt,
  showTariffCard,
  showTariffCardFromCallback,
  showTariffPeriodCard,
  showTariffPeriodCardFromCallback,
  showRenderedScreenFromCallback,
  showTariffSection,
  showTariffSectionFromCallback,
  showTariffSquadCard,
  showTariffSquadCardFromCallback,
} from "./presentation.js";
import {
  isTariffEditableKind,
  isTariffPeriodEditableKind,
  isTariffSquadEditableKind,
  tariffInputKindMap,
  tariffPeriodInputKindMap,
  tariffSquadInputKindMap,
  type TariffInputType,
  type TariffPeriodInputType,
  type TariffSection,
  type TariffSquadInputType,
} from "./types.js";

function isAdminContext(ctx: { from?: { id: number } | undefined }) {
  return Boolean(ctx.from && isAdminTelegramId(BigInt(ctx.from.id)));
}

function resolveTariffSection(kind: string): Exclude<TariffSection, "servers"> {
  if (
    kind === "tariff_name" ||
    kind === "tariff_description" ||
    kind === "tariff_usage_terms" ||
    kind === "tariff_daily_price"
  ) {
    return "basic";
  }

  return "devices";
}

async function showTariffSquadInputPrompt(
  bot: Bot,
  telegramId: bigint,
  inputType: TariffSquadInputType,
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

  const prompt =
    inputType === "traffic_gb"
        ? renderTariffInputPrompt(
            tariff,
            "ГБ в день для сквада",
            [
              "Отправь следующим сообщением количество ГБ в день.",
              "Например: <code>10</code>",
            ],
            "servers",
            {
              currentValue: String(tariffSquad.trafficIncludedGbPerDay),
            },
          )
        : renderTariffInputPrompt(
            tariff,
            "Стоимость 1 ГБ для сквада",
            [
              "Отправь следующим сообщением стоимость 1 ГБ.",
              "Например: <code>9.90</code>",
            ],
            "servers",
            {
              currentValue: `${(tariffSquad.trafficPricePerGbMinor / 100).toFixed(2)} ${tariff.currencyCode}`,
            },
          );

  await showRenderedScreen(bot, user, prompt);
  return true;
}

async function handleTariffInputSession(
  bot: Bot,
  telegramId: bigint,
  kind: (typeof import("./types.js").tariffEditableKinds)[number],
  tariffId: number,
  input: string,
) {
  const [user, tariff] = await Promise.all([
    getAdminUser(telegramId),
    getTariffById(tariffId),
  ]);

  if (!user || !tariff) {
    await clearAdminInputSession(telegramId);
    return true;
  }

  try {
    switch (kind) {
      case "tariff_name":
        if (input.length < 2) {
          throw new Error("Название должно содержать минимум 2 символа");
        }
        await updateTariff(tariff.id, { name: input });
        break;
      case "tariff_description":
        await updateTariff(tariff.id, { description: input === "-" ? null : input });
        break;
      case "tariff_usage_terms":
        await updateTariff(tariff.id, { usageTerms: input === "-" ? null : input });
        break;
      case "tariff_daily_price": {
        const parsed = Number(input.replace(",", "."));
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new Error("Цена должна быть числом не меньше 0");
        }
        await updateTariff(tariff.id, {
          dailyPriceMinor: Math.round(parsed * 100),
        });
        break;
      }
      case "tariff_free_devices": {
        const parsed = Number(input);
        if (!Number.isInteger(parsed) || parsed < 0) {
          throw new Error("Количество устройств должно быть целым числом от 0");
        }
        await updateTariff(tariff.id, { freeDevicesPerUser: parsed });
        break;
      }
      case "tariff_device_daily_price": {
        const parsed = Number(input.replace(",", "."));
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new Error("Цена должна быть числом не меньше 0");
        }
        await updateTariff(tariff.id, {
          deviceDailyPriceMinor: Math.round(parsed * 100),
        });
        break;
      }
    }
  } catch (error) {
    const prompt = buildTariffPrompt(
      kind,
      tariff,
      error instanceof Error ? error.message : "некорректное значение",
    );

    if (prompt) {
      await showRenderedScreen(bot, user, prompt);
    }
    return true;
  }

  await clearAdminInputSession(telegramId);
  await showTariffSection(bot, telegramId, tariff.id, resolveTariffSection(kind));
  return true;
}

async function handleTariffPeriodInputSession(
  bot: Bot,
  telegramId: bigint,
  session:
    | {
        kind: "tariff_period_create_days";
        tariffId: number;
        tariffPeriodId?: number | null;
      }
    | {
        kind: "tariff_period_duration_days" | "tariff_period_discount_percent";
        tariffId: number;
        tariffPeriodId?: number | null;
      },
  input: string,
) {
  const [user, tariff] = await Promise.all([
    getAdminUser(telegramId),
    getTariffById(session.tariffId),
  ]);

  if (!user || !tariff) {
    await clearAdminInputSession(telegramId);
    return true;
  }

  try {
    if (session.kind === "tariff_period_create_days") {
      const parsed = Number(input);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error("Количество дней должно быть положительным целым числом");
      }

      const period = await createTariffPeriod(session.tariffId, parsed);
      await clearAdminInputSession(telegramId);
      await showTariffPeriodCard(bot, telegramId, period.id);
      return true;
    }

    if (!session.tariffPeriodId) {
      await clearAdminInputSession(telegramId);
      return true;
    }

    if (session.kind === "tariff_period_duration_days") {
      const parsed = Number(input);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error("Количество дней должно быть положительным целым числом");
      }

      await updateTariffPeriod(session.tariffPeriodId, {
        durationDays: parsed,
      });
    }

    if (session.kind === "tariff_period_discount_percent") {
      const parsed = Number(input);

      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
        throw new Error("Скидка должна быть целым числом от 0 до 100");
      }

      await updateTariffPeriod(session.tariffPeriodId, {
        discountPercent: parsed,
      });
    }
  } catch (error) {
    const prompt = buildTariffPrompt(
      session.kind,
      tariff,
      error instanceof Error ? error.message : "некорректное значение",
    );

    if (prompt) {
      await showRenderedScreen(bot, user, prompt);
    }
    return true;
  }

  await clearAdminInputSession(telegramId);
  await showTariffPeriodCard(bot, telegramId, session.tariffPeriodId!);
  return true;
}

async function handleTariffSquadInputSession(
  bot: Bot,
  telegramId: bigint,
  kind: (typeof import("./types.js").tariffSquadEditableKinds)[number],
  tariffSquadId: number,
  input: string,
) {
  const tariffSquad = await getTariffSquadById(tariffSquadId);

  if (!tariffSquad) {
    await clearAdminInputSession(telegramId);
    return true;
  }

  try {
    if (kind === "tariff_squad_traffic_gb") {
      const parsed = Number(input);

      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error("Количество ГБ должно быть целым числом от 0");
      }

      await updateTariffSquad(tariffSquad.id, {
        trafficIncludedGbPerDay: parsed,
      });
    }

    if (kind === "tariff_squad_traffic_price") {
      const parsed = Number(input.replace(",", "."));

      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error("Цена должна быть числом не меньше 0");
      }

      await updateTariffSquad(tariffSquad.id, {
        trafficPricePerGbMinor: Math.round(parsed * 100),
      });
    }
  } catch {
    await showTariffSquadCard(bot, telegramId, tariffSquad.id);
    return true;
  }

  await clearAdminInputSession(telegramId);
  await showTariffSquadCard(bot, telegramId, tariffSquad.id);
  return true;
}

export function registerTariffHandlers(bot: Bot) {
  bot.callbackQuery(/^tariff:create$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const telegramId = BigInt(ctx.from.id);
    const user = await getAdminUser(telegramId);

    if (!user) {
      await safeAnswerCallbackQuery(ctx, { text: "Пользователь не найден", show_alert: false });
      return;
    }

    await clearUserInputSession(telegramId);
    await setAdminInputSession(telegramId, { kind: "tariff_create_name" });

    await showRenderedScreen(bot, user, renderTariffCreatePrompt());

    await safeAnswerCallbackQuery(ctx, { text: "Жду название тарифа", show_alert: false });
  });

  bot.callbackQuery(/^tariff:open:(\d+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const ok = await showTariffCardFromCallback(ctx, Number(ctx.match[1]));
    await safeAnswerCallbackQuery(ctx, 
      ok ? undefined : { text: "Тариф не найден", show_alert: false },
    );
  });

  bot.callbackQuery(/^tariff:toggle_active:(\d+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const tariffId = Number(ctx.match[1]);
    await toggleTariffActive(tariffId);
    const ok = await showTariffCardFromCallback(ctx, tariffId);

    await safeAnswerCallbackQuery(ctx, {
      text: ok ? "Статус тарифа обновлен" : "Тариф не найден",
      show_alert: false,
    });
  });

  bot.callbackQuery(/^tariffnav:(basic|servers|duration|devices):(\d+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const section = ctx.match[1] as TariffSection;
    const tariffId = Number(ctx.match[2]);
    const ok = await showTariffSectionFromCallback(ctx, tariffId, section);

    await safeAnswerCallbackQuery(ctx, 
      ok ? undefined : { text: "Тариф не найден", show_alert: false },
    );
  });

  bot.callbackQuery(
    /^tariffinput:(name|description|usage_terms|daily_price|free_devices|device_daily_price):(\d+)$/,
    async (ctx) => {
      if (!isAdminContext(ctx)) {
        await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
        return;
      }

      const telegramId = BigInt(ctx.from.id);
      const tariffId = Number(ctx.match[2]);
      const [user, tariff] = await Promise.all([
        getAdminUser(telegramId),
        getTariffById(tariffId),
      ]);

      if (!user || !tariff) {
        await safeAnswerCallbackQuery(ctx, { text: "Тариф не найден", show_alert: false });
        return;
      }

      const inputType = ctx.match[1] as TariffInputType;

      await clearUserInputSession(telegramId);
      await setAdminInputSession(telegramId, {
        kind: tariffInputKindMap[inputType],
        tariffId,
      });

      const prompt = buildTariffPrompt(tariffInputKindMap[inputType], tariff);

      if (prompt) {
        await showRenderedScreenFromCallback(ctx, prompt);
      }

      await safeAnswerCallbackQuery(ctx, { text: "Жду ввод в чат", show_alert: false });
    },
  );

  bot.callbackQuery(/^tariffperiod:create:(\d+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const telegramId = BigInt(ctx.from.id);
    const tariffId = Number(ctx.match[1]);
    const [user, tariff] = await Promise.all([
      getAdminUser(telegramId),
      getTariffById(tariffId),
    ]);

    if (!user || !tariff) {
      await safeAnswerCallbackQuery(ctx, { text: "Тариф не найден", show_alert: false });
      return;
    }

    await clearUserInputSession(telegramId);
    await setAdminInputSession(telegramId, {
      kind: "tariff_period_create_days",
      tariffId,
    });

    const prompt = buildTariffPrompt("tariff_period_create_days", tariff);

    if (prompt) {
      await showRenderedScreenFromCallback(ctx, prompt);
    }

    await safeAnswerCallbackQuery(ctx, { text: "Жду ввод в чат", show_alert: false });
  });

  bot.callbackQuery(/^tariffperiod:open:(\d+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const ok = await showTariffPeriodCardFromCallback(ctx, Number(ctx.match[1]));
    await safeAnswerCallbackQuery(ctx, 
      ok ? undefined : { text: "Период не найден", show_alert: false },
    );
  });

  bot.callbackQuery(/^tariffperiod:remove:(\d+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const tariffPeriodId = Number(ctx.match[1]);
    const tariffPeriod = await getTariffPeriodById(tariffPeriodId);

    if (!tariffPeriod) {
      await safeAnswerCallbackQuery(ctx, { text: "Период не найден", show_alert: false });
      return;
    }

    await removeTariffPeriod(tariffPeriodId);
    const ok = await showTariffSectionFromCallback(ctx, tariffPeriod.tariffId, "duration");

    await safeAnswerCallbackQuery(ctx, {
      text: ok ? "Период удален" : "Тариф не найден",
      show_alert: false,
    });
  });

  bot.callbackQuery(
    /^tariffperiodinput:(duration_days|discount_percent):(\d+)$/,
    async (ctx) => {
      if (!isAdminContext(ctx)) {
        await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
        return;
      }

      const telegramId = BigInt(ctx.from.id);
      const tariffPeriodId = Number(ctx.match[2]);
      const tariffPeriod = await getTariffPeriodById(tariffPeriodId);

      if (!tariffPeriod) {
        await safeAnswerCallbackQuery(ctx, { text: "Период не найден", show_alert: false });
        return;
      }

      const tariff = await getTariffById(tariffPeriod.tariffId);

      if (!tariff) {
        await safeAnswerCallbackQuery(ctx, { text: "Тариф не найден", show_alert: false });
        return;
      }

      const inputType = ctx.match[1] as Exclude<TariffPeriodInputType, "create_days">;
      const kind = tariffPeriodInputKindMap[inputType];

      await clearUserInputSession(telegramId);
      await setAdminInputSession(telegramId, {
        kind,
        tariffId: tariffPeriod.tariffId,
        tariffPeriodId: tariffPeriod.id,
      });

      const prompt = buildTariffPrompt(kind, tariff);

      if (prompt) {
        await showRenderedScreenFromCallback(ctx, prompt);
      }

      await safeAnswerCallbackQuery(ctx, { text: "Жду ввод в чат", show_alert: false });
    },
  );

  bot.callbackQuery(/^tariffservers:add:(\d+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const tariffId = Number(ctx.match[1]);
    const telegramId = BigInt(ctx.from.id);
    const [user, tariff, internalSquads] = await Promise.all([
      getAdminUser(telegramId),
      getTariffById(tariffId),
      getInternalSquads(),
    ]);

    if (!user || !tariff) {
      await safeAnswerCallbackQuery(ctx, { text: "Тариф не найден", show_alert: false });
      return;
    }

    const selected = new Set(tariff.squads.map((item) => item.squadUuid));
    const availableSquads = internalSquads.filter((item) => !selected.has(item.uuid));

    await showRenderedScreenFromCallback(
      ctx,
      renderTariffAddSquadScreen(tariff, availableSquads),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^tariffservers:addsquad:(\d+):(.+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const tariffId = Number(ctx.match[1]);
    const squadUuid = ctx.match[2];

    if (!squadUuid) {
      await safeAnswerCallbackQuery(ctx, { text: "Сквад не найден", show_alert: false });
      return;
    }

    const tariffSquad = await addSquadToTariff(tariffId, squadUuid);

    if (!tariffSquad) {
      await safeAnswerCallbackQuery(ctx, {
        text: "Не удалось добавить сервер",
        show_alert: false,
      });
      return;
    }

    const ok = await showTariffSquadCardFromCallback(ctx, tariffSquad.id);

    await safeAnswerCallbackQuery(ctx, {
      text: ok ? "Сервер добавлен" : "Не удалось открыть сервер",
      show_alert: false,
    });
  });

  bot.callbackQuery(/^tariffsquad:open:(\d+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const ok = await showTariffSquadCardFromCallback(ctx, Number(ctx.match[1]));
    await safeAnswerCallbackQuery(ctx, 
      ok ? undefined : { text: "Сквад тарифа не найден", show_alert: false },
    );
  });

  bot.callbackQuery(/^tariffsquad:remove:(\d+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const tariffSquadId = Number(ctx.match[1]);
    const tariffSquad = await getTariffSquadById(tariffSquadId);

    if (!tariffSquad) {
      await safeAnswerCallbackQuery(ctx, { text: "Сквад тарифа не найден", show_alert: false });
      return;
    }

    await removeTariffSquad(tariffSquadId);
    const ok = await showTariffSectionFromCallback(ctx, tariffSquad.tariffId, "servers");

    await safeAnswerCallbackQuery(ctx, {
      text: ok ? "Сквад удален" : "Тариф не найден",
      show_alert: false,
    });
  });

  bot.callbackQuery(/^tariffsquadinput:(traffic_gb|traffic_price):(\d+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const ok = await showTariffSquadInputPrompt(
      bot,
      BigInt(ctx.from.id),
      ctx.match[1] as TariffSquadInputType,
      Number(ctx.match[2]),
    );

    if (!ok) {
      await safeAnswerCallbackQuery(ctx, { text: "Сквад тарифа не найден", show_alert: false });
      return;
    }

    const tariffSquad = await getTariffSquadById(Number(ctx.match[2]));
    if (!tariffSquad) {
      await safeAnswerCallbackQuery(ctx, { text: "Сквад тарифа не найден", show_alert: false });
      return;
    }

    await clearUserInputSession(BigInt(ctx.from.id));
    await setAdminInputSession(BigInt(ctx.from.id), {
      kind: tariffSquadInputKindMap[ctx.match[1] as TariffSquadInputType],
      tariffId: tariffSquad.tariffId,
      tariffSquadId: tariffSquad.id,
    });

    await safeAnswerCallbackQuery(ctx, { text: "Жду ввод в чат", show_alert: false });
  });
}

export async function handleTariffTextInput(
  bot: Bot,
  telegramId: bigint,
  input: string,
) {
  const session = await getAdminInputSession(telegramId);

  if (!session) {
    return false;
  }

  if (session.kind === "tariff_create_name") {
    const user = await getAdminUser(telegramId);

    if (!user) {
      await clearAdminInputSession(telegramId);
      return true;
    }

    if (input.length < 2) {
      await showRenderedScreen(
        bot,
        user,
        renderTariffCreatePrompt("Название должно содержать минимум 2 символа"),
      );
      return true;
    }

    try {
      const tariff = await createTariffFromDefaults(input);
      await clearAdminInputSession(telegramId);
      await showTariffCard(bot, telegramId, tariff.id);
    } catch {
      await showRenderedScreen(
        bot,
        user,
        renderTariffCreatePrompt(
          "Не удалось создать тариф. Возможно, название уже занято",
        ),
      );
    }

    return true;
  }

  if (session.tariffId && isTariffEditableKind(session.kind)) {
    await handleTariffInputSession(
      bot,
      telegramId,
      session.kind,
      session.tariffId,
      input,
    );
    return true;
  }

  if (session.tariffId && isTariffPeriodEditableKind(session.kind)) {
    await handleTariffPeriodInputSession(
      bot,
      telegramId,
      {
        kind: session.kind,
        tariffId: session.tariffId,
        tariffPeriodId: session.tariffPeriodId,
      },
      input,
    );
    return true;
  }

  if (session.tariffSquadId && isTariffSquadEditableKind(session.kind)) {
    await handleTariffSquadInputSession(
      bot,
      telegramId,
      session.kind,
      session.tariffSquadId,
      input,
    );
    return true;
  }

  return false;
}
