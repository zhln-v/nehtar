import { InlineKeyboard } from "grammy";

import type {
  RemnawaveHwidDevice,
  UserRemnawaveAccount,
} from "../../services/remnawave-users-service.js";
import {
  BACK_BUTTON_TEXT,
  buildPurchaseCheckoutKeyboard,
  buildPurchaseTermsKeyboard,
  buildPurchaseYooKassaKeyboard,
} from "../ui/keyboards.js";
import {
  renderCodeLine,
  renderDate,
  renderOptionalText,
  renderPlainLine,
  renderPurchaseStatus,
  renderScreenLayout,
  renderSection,
  renderStrongCodeLine,
  renderSubscriptionHeadline,
  renderSubscriptionQuotaLines,
  renderUserSubscriptionStatus,
  renderDeviceAvailabilityLines,
} from "../ui/text.js";
import type { RenderedScreen } from "../screens/types.js";
import { formatMoneyMinor } from "../../services/pricing-format-service.js";
import type { TariffDetails } from "../../services/tariff-service.js";
import type { TariffPeriod, PurchaseOrder } from "../../generated/prisma/index.js";
import type { PurchasePricing } from "../../services/purchase-service.js";

type PurchaseScreenFlow = {
  selectPeriodCallback: (tariffId: number, tariffPeriodId: number, extraDeviceCount: number) => string;
  openCheckoutCallback: (tariffId: number, tariffPeriodId: number, extraDeviceCount: number) => string;
  updateExtraDevicesCallback: (
    direction: "inc" | "dec",
    tariffId: number,
    tariffPeriodId: number,
    extraDeviceCount: number,
  ) => string;
  payFromBalanceCallback: (tariffId: number, tariffPeriodId: number, extraDeviceCount: number) => string;
  tariffBackCallback: string;
  termsBackCallback: (tariffId: number) => string;
  checkoutBackCallback: (tariffId: number, tariffPeriodId: number, extraDeviceCount: number) => string;
  topUpBalanceCallback: (tariffId: number, tariffPeriodId: number, extraDeviceCount: number) => string;
};

const purchaseFlow: PurchaseScreenFlow = {
  selectPeriodCallback: (tariffId, tariffPeriodId, extraDeviceCount) =>
    `purchase:terms:${tariffId}:${tariffPeriodId}:${extraDeviceCount}`,
  openCheckoutCallback: (tariffId, tariffPeriodId, extraDeviceCount) =>
    `purchase:checkout:${tariffId}:${tariffPeriodId}:${extraDeviceCount}`,
  updateExtraDevicesCallback: (direction, tariffId, tariffPeriodId, extraDeviceCount) =>
    `purchase:extra:${direction}:${tariffId}:${tariffPeriodId}:${extraDeviceCount}`,
  payFromBalanceCallback: (tariffId, tariffPeriodId, extraDeviceCount) =>
    `purchase:balance:${tariffId}:${tariffPeriodId}:${extraDeviceCount}`,
  tariffBackCallback: "nav:catalog",
  termsBackCallback: (tariffId) => `purchase:tariff:${tariffId}`,
  checkoutBackCallback: (tariffId, tariffPeriodId, extraDeviceCount) =>
    `purchase:terms:${tariffId}:${tariffPeriodId}:${extraDeviceCount}`,
  topUpBalanceCallback: (tariffId, tariffPeriodId, extraDeviceCount) =>
    `purchase:topup:${tariffId}:${tariffPeriodId}:${extraDeviceCount}`,
};

function renewFlow(subscriptionId: number): PurchaseScreenFlow {
  return {
    selectPeriodCallback: (tariffId, tariffPeriodId, extraDeviceCount) =>
      `renew:terms:${subscriptionId}:${tariffId}:${tariffPeriodId}:${extraDeviceCount}`,
    openCheckoutCallback: (tariffId, tariffPeriodId, extraDeviceCount) =>
      `renew:checkout:${subscriptionId}:${tariffId}:${tariffPeriodId}:${extraDeviceCount}`,
    updateExtraDevicesCallback: (direction, tariffId, tariffPeriodId, extraDeviceCount) =>
      `renew:extra:${direction}:${subscriptionId}:${tariffId}:${tariffPeriodId}:${extraDeviceCount}`,
    payFromBalanceCallback: (tariffId, tariffPeriodId, extraDeviceCount) =>
      `renew:balance:${subscriptionId}:${tariffId}:${tariffPeriodId}:${extraDeviceCount}`,
    tariffBackCallback: `mysub:open:${subscriptionId}`,
    termsBackCallback: () => `mysub:renew:${subscriptionId}`,
    checkoutBackCallback: (tariffId, tariffPeriodId, extraDeviceCount) =>
      `renew:terms:${subscriptionId}:${tariffId}:${tariffPeriodId}:${extraDeviceCount}`,
    topUpBalanceCallback: (tariffId, tariffPeriodId, extraDeviceCount) =>
      `renew:topup:${subscriptionId}:${tariffId}:${tariffPeriodId}:${extraDeviceCount}`,
  };
}

function buildUserSubscriptionKeyboard(subscription: UserRemnawaveAccount) {
  const keyboard = new InlineKeyboard();

  if (subscription.subscriptionUrl) {
    keyboard.url("🔗 Подключиться", subscription.subscriptionUrl).row();
  } else {
    keyboard
      .text({ text: "🔗 Подключиться", style: "primary" }, `mysub:connect:${subscription.id}`)
      .row();
  }

  keyboard
    .text({ text: "🔄 Продлить", style: "primary" }, `mysub:renew:${subscription.id}`)
    .text({ text: "📱 Устройства", style: "success" }, `mysub:devices:${subscription.id}`)
    .row()
    .text({ text: "📦 Пакеты ГБ", style: "primary" }, `mysub:gb:${subscription.id}`)
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:my_subscriptions");

  return keyboard;
}

function buildSubscriptionDevicesKeyboard(
  subscription: UserRemnawaveAccount,
  devices: RemnawaveHwidDevice[],
  deviceLimit: number,
) {
  const keyboard = new InlineKeyboard();

  devices.slice(0, deviceLimit).forEach((device, index) => {
    const deviceTitle =
      device.deviceModel ?? device.platform ?? `Устройство ${index + 1}`;

    keyboard
      .text(
        { text: `✅ ${index + 1}. ${deviceTitle}`, style: "success" },
        `mysub:device:${subscription.id}:${index + 1}`,
      )
      .row();
  });

  const emptySlots = Math.max(deviceLimit - devices.length, 0);

  for (let index = 0; index < emptySlots; index += 1) {
    const slotNumber = devices.length + index + 1;

    if (subscription.subscriptionUrl) {
      keyboard.url(`➕ Подключить устройство ${slotNumber}`, subscription.subscriptionUrl).row();
      continue;
    }

    keyboard
      .text(
        { text: `➕ Подключить устройство ${slotNumber}`, style: "primary" },
        `mysub:device_connect_slot:${subscription.id}:${slotNumber}`,
      )
      .row();
  }

  keyboard
    .text({ text: "🔓 Разблокировать устройства", style: "primary" }, `mysub:devices_unlock:${subscription.id}`)
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, `mysub:open:${subscription.id}`);

  return keyboard;
}

export function renderUserSubscriptionScreen(
  subscription: UserRemnawaveAccount,
): RenderedScreen {
  const purchaseOrder = subscription.purchaseOrder;
  const sections = [
    purchaseOrder
      ? renderSection("Покупка", [
          renderCodeLine("Период", `${purchaseOrder.durationDays} дней`),
          renderCodeLine("Доп. устройств", purchaseOrder.extraDeviceCount),
          renderCodeLine("Провайдер оплаты", purchaseOrder.provider),
        ])
      : [],
    renderSection("Серверы и трафик", renderSubscriptionQuotaLines(subscription)),
  ].filter((section) => section.length > 0);

  return {
    text: renderScreenLayout(`🔐 Подписка: ${renderSubscriptionHeadline(subscription)}`, {
      summary: [
        renderPlainLine("Состояние", renderUserSubscriptionStatus(subscription)),
        renderCodeLine("Действует до", renderDate(subscription.expireAt)),
        renderCodeLine("Логин", subscription.username),
      ],
      nextStep: [
        subscription.subscriptionUrl
          ? "🔗 Подключение доступно по кнопке ниже."
          : "• Ссылка подключения пока недоступна.",
      ],
      sections,
    }),
    replyMarkup: buildUserSubscriptionKeyboard(subscription),
  };
}

export function renderSubscriptionDevicesScreen(
  subscription: UserRemnawaveAccount,
  devices: RemnawaveHwidDevice[],
  deviceLimit: number,
): RenderedScreen {
  const connectedDevices = devices.slice(0, deviceLimit);

  return {
    text: renderScreenLayout("📱 Устройства подписки", {
      summary: [
        renderCodeLine("Подключено", `${connectedDevices.length} из ${deviceLimit}`),
      ],
      nextStep: [
        connectedDevices.length > 0
          ? "Ниже можно открыть нужное устройство или подключить новое в свободный слот."
          : "Пока нет подключенных устройств. Можно занять свободный слот ниже.",
      ],
    }),
    replyMarkup: buildSubscriptionDevicesKeyboard(subscription, connectedDevices, deviceLimit),
  };
}

export function renderSubscriptionDeviceScreen(
  subscription: UserRemnawaveAccount,
  device: RemnawaveHwidDevice,
  deviceIndex: number,
): RenderedScreen {
  const deviceTitle =
    device.deviceModel ?? device.platform ?? `Устройство ${deviceIndex}`;
  const platform =
    [device.platform, device.osVersion].filter(Boolean).join(" ") || "не определена";

  const keyboard = new InlineKeyboard();

  if (subscription.subscriptionUrl) {
    keyboard.url("🔗 Открыть подключение", subscription.subscriptionUrl).row();
  }

  keyboard
    .text({ text: "🗑 Удалить", style: "danger" }, `mysub:device_delete_confirm:${subscription.id}:${deviceIndex}`)
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, `mysub:devices:${subscription.id}`);

  return {
    text: renderScreenLayout(`📱 ${deviceTitle}`, {
      summary: [
        renderCodeLine("Слот", deviceIndex),
        renderPlainLine("Платформа", platform),
        renderCodeLine("HWID", device.hwid),
      ],
      sections: [
        renderSection("ℹ️ Детали устройства", [
          renderPlainLine("Модель", device.deviceModel || "не определена"),
          renderPlainLine("IP", device.requestIp || "не определен"),
          renderPlainLine("User-Agent", device.userAgent || "не определен"),
          renderCodeLine("Добавлено", renderDate(device.createdAt)),
          renderCodeLine("Обновлено", renderDate(device.updatedAt)),
          ...(device.userId == null ? [] : [renderCodeLine("ID пользователя Remnawave", device.userId)]),
        ]),
      ],
      nextStep: [
        "Вернись назад, чтобы открыть другой слот устройства или подключить новое устройство.",
      ],
    }),
    replyMarkup: keyboard,
  };
}

export function renderSubscriptionDeviceDeleteConfirmScreen(
  subscription: UserRemnawaveAccount,
  device: RemnawaveHwidDevice,
  deviceIndex: number,
): RenderedScreen {
  const deviceTitle =
    device.deviceModel ?? device.platform ?? `Устройство ${deviceIndex}`;

  return {
    text: renderScreenLayout("🗑 Удалить устройство", {
      summary: [
        renderPlainLine("Устройство", deviceTitle),
        renderCodeLine("Слот", deviceIndex),
        renderCodeLine("HWID", device.hwid),
      ],
      sections: [
        renderSection("⚠️ Подтверждение", [
          "Будет удалено только выбранное устройство.",
          "После удаления его нужно будет подключить заново.",
        ]),
      ],
      nextStep: [
        "Подтверди удаление, если хочешь отвязать именно это устройство.",
      ],
    }),
    replyMarkup: new InlineKeyboard()
      .text({ text: "Да, удалить", style: "danger" }, `mysub:device_delete_apply:${subscription.id}:${deviceIndex}`)
      .row()
      .text({ text: BACK_BUTTON_TEXT, style: "primary" }, `mysub:device:${subscription.id}:${deviceIndex}`),
  };
}

export function renderSubscriptionDevicePurchaseScreen(
  subscription: UserRemnawaveAccount,
  deviceLimit: number,
  userBalanceMinor: number,
  selectedExtraDeviceCount?: number,
): RenderedScreen {
  const purchaseOrder = subscription.purchaseOrder;
  const tariff = purchaseOrder?.tariff ?? null;
  const includedDevices = tariff?.freeDevicesPerUser ?? 0;
  const currentExtraDevices = Math.max(0, deviceLimit - includedDevices);
  const targetExtraDevices = Math.max(
    currentExtraDevices,
    selectedExtraDeviceCount ?? currentExtraDevices,
  );
  const extraDevicesToAdd = Math.max(0, targetExtraDevices - currentExtraDevices);
  const remainingDays = Math.max(
    1,
    Math.ceil((subscription.expireAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
  );
  const totalPriceMinor = (tariff?.deviceDailyPriceMinor ?? 0) * extraDevicesToAdd * remainingDays;
  const canPay =
    Boolean(tariff) &&
    (tariff?.deviceDailyPriceMinor ?? 0) > 0 &&
    extraDevicesToAdd > 0;

  const keyboard = new InlineKeyboard()
    .text(
      { text: "−1 устройство", style: "danger" },
      `mysub:devices_unlock_adjust:dec:${subscription.id}:${targetExtraDevices}`,
    )
    .text(
      { text: "+1 устройство", style: "success" },
      `mysub:devices_unlock_adjust:inc:${subscription.id}:${targetExtraDevices}`,
    )
    .row();

  if (canPay && userBalanceMinor >= totalPriceMinor) {
    keyboard
      .text(
        { text: "💰 Оплатить с баланса", style: "success" },
        `mysub:devices_unlock_pay:${subscription.id}:${targetExtraDevices}`,
      )
      .row();
  } else if (canPay) {
    keyboard
      .text(
        { text: "➕ Пополнить баланс", style: "primary" },
        `mysub:devices_unlock_topup:${subscription.id}:${targetExtraDevices}`,
      )
      .row();
  }

  keyboard.text({ text: BACK_BUTTON_TEXT, style: "danger" }, `mysub:devices:${subscription.id}`);

  return {
    text: renderScreenLayout("🔓 Разблокировать устройства", {
      summary: [
        renderStrongCodeLine("Баланс", formatMoneyMinor(userBalanceMinor, tariff?.currencyCode ?? "RUB")),
        renderCodeLine("Текущий лимит устройств", deviceLimit),
        renderCodeLine("Включено в тариф", includedDevices),
        renderCodeLine("Уже оплачено сверх лимита", currentExtraDevices),
      ],
      sections: tariff
        ? [
            renderSection("📱 Подписка", [
              renderPlainLine("Тариф", tariff.name),
              renderCodeLine(
                "Цена 1 доп. устройства в день",
                formatMoneyMinor(tariff.deviceDailyPriceMinor, tariff.currencyCode),
              ),
              renderCodeLine("Осталось дней подписки", remainingDays),
            ]),
            renderSection("➕ Выбор устройств", [
              renderCodeLine("Будет сверх лимита", targetExtraDevices),
              renderCodeLine("Добавится сейчас", extraDevicesToAdd),
              renderCodeLine("Новый лимит устройств", includedDevices + targetExtraDevices),
            ]),
            renderSection("💳 Итог", [
              renderStrongCodeLine(
                "К оплате",
                formatMoneyMinor(totalPriceMinor, tariff.currencyCode),
              ),
            ]),
          ]
        : undefined,
      nextStep: [
        canPay
          ? userBalanceMinor >= totalPriceMinor
            ? "Измени количество кнопками ниже и оплати с баланса."
            : "На балансе недостаточно средств. Сначала пополни баланс."
          : "Выбери количество дополнительных устройств кнопками ниже.",
      ],
    }),
    replyMarkup: keyboard,
  };
}

export function renderPurchaseTariffScreen(
  tariff: TariffDetails,
  flow: PurchaseScreenFlow = purchaseFlow,
  initialExtraDeviceCount = 0,
): RenderedScreen {
  const keyboard = new InlineKeyboard();

  for (const period of tariff.periods) {
    const totalPriceMinor = Math.round(
      tariff.dailyPriceMinor * period.durationDays * ((100 - period.discountPercent) / 100),
    );
    const effectiveDailyPriceMinor = Math.round(totalPriceMinor / period.durationDays);

    keyboard
      .text(
        {
          text: `${period.durationDays} дн. · ${formatMoneyMinor(effectiveDailyPriceMinor, tariff.currencyCode)}/день`,
          style: "primary",
        },
        flow.selectPeriodCallback(tariff.id, period.id, initialExtraDeviceCount),
      )
      .row();
  }

  keyboard.text({ text: "← Назад", style: "danger" }, flow.tariffBackCallback);

  return {
    text: renderScreenLayout(`💳 Тариф: ${tariff.name}`, {
      summary: [
        renderCodeLine("Периодов доступно", tariff.periods.length),
        renderCodeLine("Цена за 1 день", formatMoneyMinor(tariff.dailyPriceMinor, tariff.currencyCode)),
      ],
      nextStep: [
        tariff.periods.length > 0
          ? "↓ Выбери подходящий срок кнопкой ниже."
          : "• Периоды пока не настроены.",
      ],
      sections: [
        renderSection("📄 Описание", [
          renderOptionalText(tariff.description, "не заполнено"),
        ]),
        renderSection("⚙️ Параметры", [
          renderCodeLine("Включено в тариф", tariff.freeDevicesPerUser),
          ...renderDeviceAvailabilityLines(tariff),
        ]),
      ],
    }),
    replyMarkup: keyboard,
  };
}

export function renderPurchaseTermsScreen(
  tariff: TariffDetails,
  tariffPeriod: TariffPeriod,
  pricing: PurchasePricing,
  flow: PurchaseScreenFlow = purchaseFlow,
): RenderedScreen {
  const trafficLines =
    tariff.squads.length > 0
      ? tariff.squads.map((tariffSquad, index) => {
          const squadName = tariffSquad.squad.displayName ?? tariffSquad.squad.name;
          const totalTrafficGb = tariffSquad.trafficIncludedGbPerDay * pricing.durationDays;

          return [
            `${index + 1}. ${squadName}`,
            renderCodeLine("Трафик на весь срок подписки", `${totalTrafficGb} ГБ`),
          ].join("\n");
        })
      : ["• В тарифе пока не настроены серверы."];

  return {
    text: renderScreenLayout(`📜 Условия: ${tariff.name}`, {
      summary: [
        renderStrongCodeLine("Период", `${pricing.durationDays} дней`),
        renderStrongCodeLine(
          "Стоимость периода",
          formatMoneyMinor(pricing.basePriceMinor, tariff.currencyCode),
        ),
        ...(tariffPeriod.discountPercent > 0
          ? [renderStrongCodeLine("Скидка", `${tariffPeriod.discountPercent}%`)]
          : []),
      ],
      nextStep: [
        "✅ Если все подходит, подтверди принятие условий кнопкой ниже.",
      ],
      sections: [
        renderSection("📆 Параметры периода", [
          renderCodeLine("Период", `${pricing.durationDays} дней`),
          renderCodeLine(
            "Стоимость периода",
            formatMoneyMinor(pricing.basePriceMinor, tariff.currencyCode),
          ),
          ...(tariffPeriod.discountPercent > 0
            ? [renderCodeLine("Скидка", `${tariffPeriod.discountPercent}%`)]
            : []),
        ]),
        renderSection("📜 Условия использования", [
          renderOptionalText(tariff.usageTerms, "не указаны"),
        ]),
        renderSection("🛰️ Что получишь по серверам", trafficLines),
      ],
    }),
    replyMarkup: buildPurchaseTermsKeyboard({
      acceptCallback: flow.openCheckoutCallback(
        tariff.id,
        tariffPeriod.id,
        pricing.extraDeviceCount,
      ),
      backCallback: flow.termsBackCallback(tariff.id),
    }),
  };
}

export function renderPurchaseCheckoutScreen(
  tariff: TariffDetails,
  tariffPeriod: TariffPeriod,
  pricing: PurchasePricing,
  userBalanceMinor: number,
  flow: PurchaseScreenFlow = purchaseFlow,
): RenderedScreen {
  const canPay = pricing.totalPriceMinor > 0;
  const hasEnoughBalance = userBalanceMinor >= pricing.totalPriceMinor;

  return {
    text: renderScreenLayout(`🧾 Покупка: ${tariff.name}`, {
      summary: [
        renderStrongCodeLine("Баланс", formatMoneyMinor(userBalanceMinor, tariff.currencyCode)),
      ],
      nextStep: canPay
        ? hasEnoughBalance
          ? undefined
          : ["⚠️ На балансе недостаточно средств. Сначала пополни баланс."]
        : ["• Стоимость заказа равна 0. Оплата недоступна."],
      sections: [
        [
          renderStrongCodeLine("Период", `${pricing.durationDays} дней`),
          renderStrongCodeLine(
            "Базовая цена тарифа",
            formatMoneyMinor(pricing.basePriceMinor, tariff.currencyCode),
          ),
          ...(tariffPeriod.discountPercent > 0
            ? [renderStrongCodeLine("Скидка периода", `${tariffPeriod.discountPercent}%`)]
            : []),
        ],
        renderSection("📱 Устройства", [
          renderCodeLine("Включено в тариф", tariff.freeDevicesPerUser),
          renderPlainLine(
            "Доп. устройства",
            pricing.extraDeviceAllowed ? "можно добавить" : "нельзя добавить",
          ),
          renderCodeLine("Выбрано доп. устройств", pricing.extraDeviceCount),
          renderCodeLine(
            "Стоимость доп. устройств",
            formatMoneyMinor(pricing.extraDevicesPriceMinor, tariff.currencyCode),
          ),
        ]),
        renderSection("💳 Итог", [
          renderStrongCodeLine("К оплате", formatMoneyMinor(pricing.totalPriceMinor, tariff.currencyCode)),
          renderStrongCodeLine("Итог в звёздах", pricing.totalPriceStars),
        ]),
      ],
    }),
    replyMarkup: buildPurchaseCheckoutKeyboard({
      extraDeviceCount: pricing.extraDeviceCount,
      extraDeviceAllowed: pricing.extraDeviceAllowed,
      canPayFromBalance: canPay && hasEnoughBalance,
      decrementCallback: flow.updateExtraDevicesCallback(
        "dec",
        tariff.id,
        tariffPeriod.id,
        pricing.extraDeviceCount,
      ),
      incrementCallback: flow.updateExtraDevicesCallback(
        "inc",
        tariff.id,
        tariffPeriod.id,
        pricing.extraDeviceCount,
      ),
      payFromBalanceCallback: flow.payFromBalanceCallback(
        tariff.id,
        tariffPeriod.id,
        pricing.extraDeviceCount,
      ),
      topUpCallback: flow.topUpBalanceCallback(
        tariff.id,
        tariffPeriod.id,
        pricing.extraDeviceCount,
      ),
      backCallback: flow.checkoutBackCallback(
        tariff.id,
        tariffPeriod.id,
        pricing.extraDeviceCount,
      ),
    }),
  };
}

export function renderRenewTariffScreen(
  subscription: UserRemnawaveAccount,
  tariff: TariffDetails,
  initialExtraDeviceCount: number,
): RenderedScreen {
  const baseScreen = renderPurchaseTariffScreen(
    tariff,
    renewFlow(subscription.id),
    initialExtraDeviceCount,
  );

  return {
    ...baseScreen,
    text: renderScreenLayout(`🔄 Продление: ${renderSubscriptionHeadline(subscription)}`, {
      summary: [
        renderCodeLine("Сейчас действует до", renderDate(subscription.expireAt)),
        renderCodeLine("Периодов доступно", tariff.periods.length),
        renderCodeLine("Продлевается доп. устройств", initialExtraDeviceCount),
      ],
      nextStep: [
        tariff.periods.length > 0
          ? "↓ Выбери срок продления. Это продлит текущую подписку, а не создаст новую."
          : "• Периоды пока не настроены.",
      ],
      sections: [
        renderSection("📄 Что изменится", [
          "Продлится срок действия текущей подписки.",
          "Трафик по серверам добавится к уже активному остатку.",
        ]),
      ],
    }),
  };
}

export function renderRenewTermsScreen(
  subscription: UserRemnawaveAccount,
  tariff: TariffDetails,
  tariffPeriod: TariffPeriod,
  pricing: PurchasePricing,
): RenderedScreen {
  const trafficLines =
    tariff.squads.length > 0
      ? tariff.squads.map((tariffSquad, index) => {
          const squadName = tariffSquad.squad.displayName ?? tariffSquad.squad.name;
          const totalTrafficGb = tariffSquad.trafficIncludedGbPerDay * pricing.durationDays;

          return [
            `${index + 1}. ${squadName}`,
            renderCodeLine("Трафик добавится", `${totalTrafficGb} ГБ`),
          ].join("\n");
        })
      : ["• В тарифе пока не настроены серверы."];

  return {
    text: renderScreenLayout(`📜 Продление: ${renderSubscriptionHeadline(subscription)}`, {
      summary: [
        renderStrongCodeLine("Сейчас действует до", renderDate(subscription.expireAt)),
        renderStrongCodeLine("Продление", `на ${pricing.durationDays} дней`),
        renderStrongCodeLine(
          "Стоимость периода",
          formatMoneyMinor(pricing.basePriceMinor, tariff.currencyCode),
        ),
        ...(tariffPeriod.discountPercent > 0
          ? [renderStrongCodeLine("Скидка", `${tariffPeriod.discountPercent}%`)]
          : []),
      ],
      sections: [
        renderSection("🔄 Что произойдет", [
          "Текущая подписка останется той же.",
          "Срок действия увеличится на выбранный период.",
          "Трафик по серверам добавится к текущему остатку.",
        ]),
        renderSection("📜 Условия использования", [
          renderOptionalText(tariff.usageTerms, "не указаны"),
        ]),
        renderSection("🛰️ Что добавится по серверам", trafficLines),
      ],
      nextStep: [
        "✅ Подтверди условия, чтобы перейти к оплате продления.",
      ],
    }),
    replyMarkup: buildPurchaseTermsKeyboard({
      acceptCallback: renewFlow(subscription.id).openCheckoutCallback(
        tariff.id,
        tariffPeriod.id,
        pricing.extraDeviceCount,
      ),
      backCallback: renewFlow(subscription.id).termsBackCallback(tariff.id),
    }),
  };
}

export function renderRenewCheckoutScreen(
  subscription: UserRemnawaveAccount,
  tariff: TariffDetails,
  tariffPeriod: TariffPeriod,
  pricing: PurchasePricing,
  userBalanceMinor: number,
): RenderedScreen {
  const flow = renewFlow(subscription.id);
  const canPay = pricing.totalPriceMinor > 0;
  const hasEnoughBalance = userBalanceMinor >= pricing.totalPriceMinor;

  return {
    text: renderScreenLayout(`🔄 Продление: ${renderSubscriptionHeadline(subscription)}`, {
      summary: [
        renderCodeLine("Сейчас действует до", renderDate(subscription.expireAt)),
        renderStrongCodeLine("Баланс", formatMoneyMinor(userBalanceMinor, tariff.currencyCode)),
      ],
      sections: [
        renderSection("🔄 Продление", [
          "Ты продлеваешь текущую подписку.",
          "Новый срок будет добавлен к уже активному периоду.",
          "Трафик по серверам добавится к текущему остатку.",
        ]),
        [
          renderStrongCodeLine("Период", `${pricing.durationDays} дней`),
          renderStrongCodeLine(
            "Базовая цена тарифа",
            formatMoneyMinor(pricing.basePriceMinor, tariff.currencyCode),
          ),
          ...(tariffPeriod.discountPercent > 0
            ? [renderStrongCodeLine("Скидка периода", `${tariffPeriod.discountPercent}%`)]
            : []),
        ],
        renderSection("📱 Устройства", [
          renderCodeLine("Включено в тариф", tariff.freeDevicesPerUser),
          renderPlainLine(
            "Доп. устройства",
            pricing.extraDeviceAllowed ? "можно добавить" : "нельзя добавить",
          ),
          renderCodeLine("Выбрано доп. устройств", pricing.extraDeviceCount),
          renderCodeLine(
            "Стоимость доп. устройств",
            formatMoneyMinor(pricing.extraDevicesPriceMinor, tariff.currencyCode),
          ),
        ]),
        renderSection("💳 Итог", [
          renderStrongCodeLine("К оплате", formatMoneyMinor(pricing.totalPriceMinor, tariff.currencyCode)),
          renderStrongCodeLine("Итог в звёздах", pricing.totalPriceStars),
        ]),
      ],
      nextStep: canPay
        ? hasEnoughBalance
          ? undefined
          : ["⚠️ На балансе недостаточно средств. Сначала пополни баланс."]
        : ["• Стоимость заказа равна 0. Оплата недоступна."],
    }),
    replyMarkup: buildPurchaseCheckoutKeyboard({
      extraDeviceCount: pricing.extraDeviceCount,
      extraDeviceAllowed: pricing.extraDeviceAllowed,
      canPayFromBalance: canPay && hasEnoughBalance,
      decrementCallback: flow.updateExtraDevicesCallback(
        "dec",
        tariff.id,
        tariffPeriod.id,
        pricing.extraDeviceCount,
      ),
      incrementCallback: flow.updateExtraDevicesCallback(
        "inc",
        tariff.id,
        tariffPeriod.id,
        pricing.extraDeviceCount,
      ),
      payFromBalanceCallback: flow.payFromBalanceCallback(
        tariff.id,
        tariffPeriod.id,
        pricing.extraDeviceCount,
      ),
      topUpCallback: flow.topUpBalanceCallback(
        tariff.id,
        tariffPeriod.id,
        pricing.extraDeviceCount,
      ),
      backCallback: flow.checkoutBackCallback(
        tariff.id,
        tariffPeriod.id,
        pricing.extraDeviceCount,
      ),
    }),
  };
}

export function renderYooKassaOrderScreen(order: PurchaseOrder): RenderedScreen {
  return {
    text: renderScreenLayout("💳 Оплата: СБП", {
      summary: [
        renderCodeLine("Заказ", order.id),
        renderPlainLine("Статус", renderPurchaseStatus(order.status)),
        renderCodeLine("Период", `${order.durationDays} дней`),
        renderCodeLine("Доп. устройств", order.extraDeviceCount),
        renderCodeLine("Сумма", formatMoneyMinor(order.totalPriceMinor, order.currencyCode)),
      ],
      nextStep: [
        order.providerConfirmationUrl
          ? "🔗 Перейди по кнопке ниже, чтобы завершить оплату."
          : "• Ссылка на оплату пока недоступна.",
      ],
    }),
    replyMarkup: buildPurchaseYooKassaKeyboard(order),
  };
}
