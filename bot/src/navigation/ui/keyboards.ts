import { InlineKeyboard } from "grammy";

import type { PurchaseOrder, RemnawaveInternalSquad, TariffPeriod } from "../../generated/prisma/index.js";
import type { TariffDetails } from "../../services/tariff-service.js";

export const BACK_BUTTON_TEXT = "← Назад";

export function buildSecondaryKeyboard() {
  return new InlineKeyboard().text(
    { text: BACK_BUTTON_TEXT, style: "danger" },
    "nav:home",
  );
}

export function buildPromptKeyboard(backCallback: string) {
  return new InlineKeyboard().text(
    { text: BACK_BUTTON_TEXT, style: "danger" },
    backCallback,
  );
}

export function buildSquadDetailsKeyboard(squadUuid: string) {
  return new InlineKeyboard()
    .text({ text: "✏️ Название для пользователя", style: "success" }, `squadinput:display_name:${squadUuid}`)
    .row()
    .text({ text: "💸 Себестоимость", style: "primary" }, `squadinput:traffic_price:${squadUuid}`)
    .row()
    .text({ text: "📏 Единицы измерения", style: "success" }, `squadunit:open:${squadUuid}`)
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:admin_squads");
}

export function buildSquadUnitKeyboard(squadUuid: string) {
  return new InlineKeyboard()
    .text({ text: "MB", style: "primary" }, `squadunit:set:MB:${squadUuid}`)
    .text({ text: "GB", style: "success" }, `squadunit:set:GB:${squadUuid}`)
    .text({ text: "TB", style: "primary" }, `squadunit:set:TB:${squadUuid}`)
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, `squad:open:${squadUuid}`);
}

export function buildSquadInputKeyboard(squadUuid: string) {
  return new InlineKeyboard()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, `squad:open:${squadUuid}`);
}

export function buildTariffMainKeyboard(tariff: TariffDetails) {
  return new InlineKeyboard()
    .text(
      {
        text: tariff.isActive ? "🚫 Скрыть из каталога" : "✅ Показать в каталоге",
        style: tariff.isActive ? "danger" : "success",
      },
      `tariff:toggle_active:${tariff.id}`,
    )
    .row()
    .text({ text: "📝 Базовые", style: "primary" }, `tariffnav:basic:${tariff.id}`)
    .text({ text: "🖥️ Сервера", style: "success" }, `tariffnav:servers:${tariff.id}`)
    .row()
    .text({ text: "📆 Длительность", style: "primary" }, `tariffnav:duration:${tariff.id}`)
    .text({ text: "📱 Устройства", style: "success" }, `tariffnav:devices:${tariff.id}`)
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:admin_tariffs");
}

export function buildTariffBasicKeyboard(tariffId: number) {
  return new InlineKeyboard()
    .text({ text: "✏️ Название", style: "primary" }, `tariffinput:name:${tariffId}`)
    .row()
    .text({ text: "📄 Описание", style: "success" }, `tariffinput:description:${tariffId}`)
    .row()
    .text({ text: "📜 Условия использования", style: "primary" }, `tariffinput:usage_terms:${tariffId}`)
    .row()
    .text({ text: "💰 Цена за 1 день", style: "success" }, `tariffinput:daily_price:${tariffId}`)
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, `tariff:open:${tariffId}`);
}

export function buildTariffDurationKeyboard(tariff: TariffDetails) {
  const keyboard = new InlineKeyboard()
    .text({ text: "➕ Добавить период", style: "success" }, `tariffperiod:create:${tariff.id}`)
    .row();

  for (const period of tariff.periods) {
    keyboard
      .text(
        {
          text: `${period.durationDays} дн. · ${period.discountPercent}%`,
          style: "primary",
        },
        `tariffperiod:open:${period.id}`,
      )
      .row();
  }

  keyboard.text({ text: BACK_BUTTON_TEXT, style: "danger" }, `tariff:open:${tariff.id}`);
  return keyboard;
}

export function buildTariffDevicesKeyboard(tariffId: number) {
  return new InlineKeyboard()
    .text({ text: "🆓 Бесплатный лимит", style: "primary" }, `tariffinput:free_devices:${tariffId}`)
    .row()
    .text({ text: "💸 Цена доп. устройства", style: "success" }, `tariffinput:device_daily_price:${tariffId}`)
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, `tariff:open:${tariffId}`);
}

export function buildTariffServersKeyboard(tariff: TariffDetails) {
  const keyboard = new InlineKeyboard()
    .text({ text: "➕ Добавить сервер", style: "success" }, `tariffservers:add:${tariff.id}`)
    .row();

  for (const tariffSquad of tariff.squads) {
    keyboard
      .text(
        {
          text: tariffSquad.squad.displayName ?? tariffSquad.squad.name,
          style: "primary",
        },
        `tariffsquad:open:${tariffSquad.id}`,
      )
      .row();
  }

  keyboard.text({ text: BACK_BUTTON_TEXT, style: "danger" }, `tariff:open:${tariff.id}`);
  return keyboard;
}

export function buildTariffAddSquadKeyboard(
  tariffId: number,
  availableSquads: RemnawaveInternalSquad[],
) {
  const keyboard = new InlineKeyboard();

  for (const squad of availableSquads) {
    keyboard
      .text(
        { text: squad.displayName ?? squad.name, style: "primary" },
        `tariffservers:addsquad:${tariffId}:${squad.uuid}`,
      )
      .row();
  }

  keyboard.text({ text: BACK_BUTTON_TEXT, style: "danger" }, `tariffnav:servers:${tariffId}`);
  return keyboard;
}

export function buildTariffSquadKeyboard(tariffId: number, tariffSquadId: number) {
  return new InlineKeyboard()
    .text({ text: "📦 Лимит ГБ/день", style: "success" }, `tariffsquadinput:traffic_gb:${tariffSquadId}`)
    .row()
    .text({ text: "💸 Цена 1 ГБ", style: "primary" }, `tariffsquadinput:traffic_price:${tariffSquadId}`)
    .row()
    .text({ text: "🗑️ Удалить сервер", style: "danger" }, `tariffsquad:remove:${tariffSquadId}`)
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, `tariffnav:servers:${tariffId}`);
}

export function buildTariffPeriodKeyboard(tariffId: number, tariffPeriodId: number) {
  return new InlineKeyboard()
    .text({ text: "📆 Срок периода", style: "primary" }, `tariffperiodinput:duration_days:${tariffPeriodId}`)
    .row()
    .text({ text: "🏷️ Скидка", style: "success" }, `tariffperiodinput:discount_percent:${tariffPeriodId}`)
    .row()
    .text({ text: "🗑️ Удалить период", style: "danger" }, `tariffperiod:remove:${tariffPeriodId}`)
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, `tariffnav:duration:${tariffId}`);
}

export function buildPurchaseTermsKeyboard(
  options: {
    acceptCallback: string;
    backCallback: string;
  },
) {
  return new InlineKeyboard()
    .text(
      { text: "✅ Принимаю условия", style: "success" },
      options.acceptCallback,
    )
    .row()
    .text(
      { text: BACK_BUTTON_TEXT, style: "danger" },
      options.backCallback,
    );
}

export function buildPurchaseCheckoutKeyboard(
  options: {
    extraDeviceCount: number;
    extraDeviceAllowed: boolean;
    canPayFromBalance: boolean;
    decrementCallback: string;
    incrementCallback: string;
    payFromBalanceCallback: string;
    topUpCallback: string;
    backCallback: string;
  },
) {
  const keyboard = new InlineKeyboard();

  if (options.extraDeviceAllowed) {
    keyboard
      .text(
        { text: "−1 устройство", style: "danger" },
        options.decrementCallback,
      )
      .text(
        { text: "+1 устройство", style: "success" },
        options.incrementCallback,
      )
      .row();
  }

  if (options.canPayFromBalance) {
    keyboard
      .text(
        { text: "💰 Оплатить с баланса", style: "success" },
        options.payFromBalanceCallback,
      )
      .row();
  } else {
    keyboard
      .text({ text: "➕ Пополнить баланс", style: "primary" }, options.topUpCallback)
      .row();
  }

  keyboard
    .text(
      { text: BACK_BUTTON_TEXT, style: "danger" },
      options.backCallback,
    );

  return keyboard;
}

export function buildPurchaseYooKassaKeyboard(order: PurchaseOrder) {
  const keyboard = new InlineKeyboard();

  if (order.providerConfirmationUrl) {
    keyboard.url("🔗 Перейти к оплате", order.providerConfirmationUrl).row();
  }

  keyboard
    .text({ text: "🔄 Проверить оплату", style: "primary" }, `purchase:yookassa_check:${order.id}`)
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:catalog");

  return keyboard;
}
