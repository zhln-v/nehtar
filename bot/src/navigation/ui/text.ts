import { escapeHtml, htmlBold, htmlCode } from "../../formatters/html.js";
import type { BalanceTopUpOrder, PurchaseOrder } from "../../generated/prisma/index.js";
import { formatMoneyMinor } from "../../services/pricing-format-service.js";
import { calculateBalanceTopUpStars, type PurchasePricing } from "../../services/purchase-service.js";
import type { UserRemnawaveAccount } from "../../services/remnawave-users-service.js";
import type { TariffDetails } from "../../services/tariff-service.js";
import type { RenderedScreen } from "../screens/types.js";
import type { TariffSection } from "../cards/tariff-types.js";
import { buildPromptKeyboard } from "./keyboards.js";

type PromptOptions = {
  currentValue?: string | null | undefined;
  backCallback: string;
  errorMessage?: string | undefined;
};

type ScreenLayoutOptions = {
  summary?: string[] | undefined;
  nextStep?: string[] | undefined;
  actions?: string[] | undefined;
  sections?: string[][] | undefined;
};

export function renderOptionalText(value: string | null | undefined, emptyText: string) {
  return value ? escapeHtml(value) : escapeHtml(emptyText);
}

export function renderPlainLine(label: string, value: string) {
  return `${escapeHtml(label)}: ${escapeHtml(value)}`;
}

export function renderCodeLine(label: string, value: string | number | bigint) {
  return `${escapeHtml(label)}: ${htmlCode(value)}`;
}

export function renderStrongCodeLine(label: string, value: string | number | bigint) {
  return `${htmlBold(label)}: ${htmlCode(value)}`;
}

export function renderSection(title: string, lines: string[]) {
  return [htmlBold(title), "", ...lines];
}

export function renderSeparatedSections(sections: string[][]) {
  return sections.flatMap((section, index) => [
    ...section,
    ...(index < sections.length - 1 ? [""] : []),
  ]);
}

export function renderScreenLayout(
  title: string,
  options: ScreenLayoutOptions = {},
) {
  const sections = [
    ...(options.summary?.length ? [options.summary] : []),
    ...(options.sections ?? []),
    ...(options.actions?.length ? [options.actions] : []),
    ...(options.nextStep?.length ? [options.nextStep] : []),
  ];

  return [
    htmlBold(title),
    "",
    ...renderSeparatedSections(sections),
  ].join("\n");
}

export function renderCurrentValueLine(value: string | null | undefined) {
  if (value == null || value.length === 0) {
    return renderPlainLine("Текущее значение", "не задано");
  }

  return `${escapeHtml("Текущее значение")}: ${escapeHtml(value)}`;
}

export function renderDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function formatTrafficBytes(bytes: bigint) {
  const gb = Number(bytes) / (1024 ** 3);

  if (gb >= 1024) {
    return `${(gb / 1024).toFixed(2)} ТБ`;
  }

  if (gb >= 1) {
    return `${gb.toFixed(2)} ГБ`;
  }

  return `${(Number(bytes) / (1024 ** 2)).toFixed(2)} МБ`;
}

export function renderUserSubscriptionStatus(subscription: UserRemnawaveAccount) {
  return subscription.expireAt > new Date() ? "активна" : "истекла";
}

export function renderSubscriptionHeadline(subscription: UserRemnawaveAccount) {
  return subscription.purchaseOrder?.tariff.name ?? `Подписка ${subscription.id}`;
}

export function renderSubscriptionQuotaLines(subscription: UserRemnawaveAccount) {
  const activeQuotas = subscription.squadQuotas.filter(
    (quota) => quota.expiresAt > new Date(),
  );

  if (activeQuotas.length === 0) {
    return [escapeHtml("Активные сквады не найдены")];
  }

  const groupedQuotas = new Map<string, {
    squadName: string;
    grantedBytes: bigint;
    consumedBytes: bigint;
    expiresAt: Date;
    hasActiveQuota: boolean;
  }>();

  for (const quota of activeQuotas) {
    const key = quota.squadUuid;
    const squadName = quota.squad.displayName ?? quota.squad.name;
    const existing = groupedQuotas.get(key);

    if (!existing) {
      groupedQuotas.set(key, {
        squadName,
        grantedBytes: quota.grantedTrafficBytes,
        consumedBytes: quota.consumedTrafficBytes,
        expiresAt: quota.expiresAt,
        hasActiveQuota: quota.exhaustedAt == null,
      });
      continue;
    }

    existing.grantedBytes += quota.grantedTrafficBytes;
    existing.consumedBytes += quota.consumedTrafficBytes;

    if (quota.expiresAt > existing.expiresAt) {
      existing.expiresAt = quota.expiresAt;
    }

    if (quota.exhaustedAt == null) {
      existing.hasActiveQuota = true;
    }
  }

  return [...groupedQuotas.values()].flatMap((quota, index) => {
    const remainingBytes = quota.grantedBytes - quota.consumedBytes;

    return [
      `${index + 1}. ${escapeHtml(quota.squadName)}`,
      renderPlainLine(
        "Статус",
        quota.hasActiveQuota ? "активен" : "трафик закончился",
      ),
      renderCodeLine("Выдано", formatTrafficBytes(quota.grantedBytes)),
      renderCodeLine(
        "Осталось",
        formatTrafficBytes(remainingBytes > 0n ? remainingBytes : 0n),
      ),
      renderCodeLine("Действует до", renderDate(quota.expiresAt)),
    ];
  });
}

export function renderInputPrompt(
  title: string,
  instructions: string[],
  options: PromptOptions,
): RenderedScreen {
  return {
    text: [
      htmlBold(title),
      "",
      ...instructions,
      options.currentValue !== undefined
        ? ["", renderCurrentValueLine(options.currentValue)]
        : [],
      options.errorMessage
        ? ["", `${escapeHtml("Ошибка ввода")}: ${htmlBold(options.errorMessage)}`]
        : [],
    ].flat().join("\n"),
    replyMarkup: buildPromptKeyboard(options.backCallback),
  };
}

export function renderBalanceStatus(status: BalanceTopUpOrder["status"]) {
  switch (status) {
    case "PAID":
      return "зачислено";
    case "CANCELED":
      return "отменено";
    case "FAILED":
      return "ошибка";
    default:
      return "ожидает оплату";
  }
}

export function renderPurchaseStatus(status: PurchaseOrder["status"]) {
  switch (status) {
    case "PAID":
      return "оплачен";
    case "CANCELED":
      return "отменен";
    case "FAILED":
      return "ошибка";
    default:
      return "ожидает оплату";
  }
}

export function renderDeviceAvailabilityLines(tariff: TariffDetails) {
  if (tariff.deviceDailyPriceMinor > 0) {
    return [
      renderPlainLine("Дополнительные устройства", "можно добавить сверх лимита"),
      renderCodeLine(
        "Цена доп. устройства в день",
        formatMoneyMinor(tariff.deviceDailyPriceMinor, tariff.currencyCode),
      ),
    ];
  }

  return [
    renderPlainLine("Дополнительные устройства", "нельзя добавить"),
    renderPlainLine("Цена доп. устройства в день", "не задана"),
  ];
}

export function calculateTariffPeriodPriceMinor(
  dailyPriceMinor: number,
  durationDays: number,
  discountPercent: number,
) {
  const fullPriceMinor = dailyPriceMinor * durationDays;
  return Math.round(fullPriceMinor * ((100 - discountPercent) / 100));
}

export function renderPeriodTitleLine(
  durationDays: number,
  maxDurationDays: number,
) {
  const width = String(maxDurationDays).length;
  return `• ${htmlCode(`${String(durationDays).padStart(width, " ")} дней`)}`;
}

export function joinPeriodBlocks(blocks: string[][]) {
  return blocks.flatMap((lines, index) => [
    ...lines,
    ...(index < blocks.length - 1 ? [escapeHtml("┄┄┄")] : []),
  ]);
}

export function renderTariffSummary(tariff: TariffDetails) {
  const maxDurationDays = Math.max(...tariff.periods.map((period) => period.durationDays), 0);
  const periodLines =
    tariff.periods.length > 0
      ? joinPeriodBlocks(
          tariff.periods.map((period) => [
            `${renderPeriodTitleLine(period.durationDays, maxDurationDays)} · ${htmlCode(`${period.discountPercent}%`)}`,
            renderCodeLine(
              "Итоговая цена",
              formatMoneyMinor(
                calculateTariffPeriodPriceMinor(
                  tariff.dailyPriceMinor,
                  period.durationDays,
                  period.discountPercent,
                ),
                tariff.currencyCode,
              ),
            ),
          ]),
        )
      : [escapeHtml("Периоды не добавлены")];
  const squadLines =
    tariff.squads.length > 0
      ? tariff.squads.flatMap((tariffSquad, index) => [
          `${index + 1}. ${escapeHtml(tariffSquad.squad.displayName ?? tariffSquad.squad.name)}`,
          renderCodeLine("ГБ в день", tariffSquad.trafficIncludedGbPerDay),
          renderCodeLine(
            "Стоимость 1 ГБ",
            formatMoneyMinor(tariffSquad.trafficPricePerGbMinor, tariff.currencyCode),
          ),
        ])
      : [escapeHtml("Сквады не добавлены")];

  return [
    htmlBold(`Тариф: ${tariff.name}`),
    "",
    ...renderSeparatedSections([
      renderSection("Состояние", [
        renderPlainLine("Доступность", tariff.isActive ? "доступен для покупки" : "скрыт из каталога"),
        renderCodeLine("Периодов настроено", tariff.periods.length),
        renderCodeLine("Серверов подключено", tariff.squads.length),
      ]),
      renderSection("Базовые", [
        renderPlainLine("Название", tariff.name),
        `${escapeHtml("Описание")}: ${renderOptionalText(tariff.description, "не заполнено")}`,
        `${escapeHtml("Условия использования")}: ${renderOptionalText(tariff.usageTerms, "не заполнены")}`,
        renderCodeLine("Цена за 1 день", formatMoneyMinor(tariff.dailyPriceMinor, tariff.currencyCode)),
      ]),
      renderSection("Периоды", periodLines),
      renderSection("Устройства", [
        renderCodeLine("Бесплатных устройств", tariff.freeDevicesPerUser),
        ...renderDeviceAvailabilityLines(tariff),
      ]),
      renderSection("Сервера", squadLines),
    ]),
  ].join("\n");
}

export function renderTariffBasicSummary(tariff: TariffDetails) {
  return renderSection("Базовые", [
    renderPlainLine("Название", tariff.name),
    `${escapeHtml("Описание")}: ${renderOptionalText(tariff.description, "не заполнено")}`,
    `${escapeHtml("Условия использования")}: ${renderOptionalText(tariff.usageTerms, "не заполнены")}`,
    renderCodeLine("Цена за 1 день", formatMoneyMinor(tariff.dailyPriceMinor, tariff.currencyCode)),
  ]).join("\n");
}

export function renderTariffDevicesSummary(tariff: TariffDetails) {
  return renderSection("Устройства", [
    renderCodeLine("Бесплатных устройств", tariff.freeDevicesPerUser),
    ...renderDeviceAvailabilityLines(tariff),
  ]).join("\n");
}

export function renderTariffPeriodsSummary(tariff: TariffDetails) {
  const maxDurationDays = Math.max(...tariff.periods.map((period) => period.durationDays), 0);
  const periodLines =
    tariff.periods.length > 0
      ? joinPeriodBlocks(
          tariff.periods.map((period) => [
            renderPeriodTitleLine(period.durationDays, maxDurationDays),
            renderCodeLine(
              "Цена без скидки",
              formatMoneyMinor(
                tariff.dailyPriceMinor * period.durationDays,
                tariff.currencyCode,
              ),
            ),
            renderCodeLine("Скидка", `${period.discountPercent}%`),
            renderCodeLine(
              "Итоговая цена",
              formatMoneyMinor(
                calculateTariffPeriodPriceMinor(
                  tariff.dailyPriceMinor,
                  period.durationDays,
                  period.discountPercent,
                ),
                tariff.currencyCode,
              ),
            ),
          ]),
        )
      : [escapeHtml("Периоды не добавлены")];

  return renderSection("Периоды", periodLines).join("\n");
}

export function renderTariffSquadsSummary(tariff: TariffDetails) {
  const squadLines =
    tariff.squads.length > 0
      ? tariff.squads.flatMap((tariffSquad, index) => [
          `${index + 1}. ${escapeHtml(tariffSquad.squad.displayName ?? tariffSquad.squad.name)}`,
          renderCodeLine("ГБ в день", tariffSquad.trafficIncludedGbPerDay),
          renderCodeLine(
            "Стоимость 1 ГБ",
            formatMoneyMinor(tariffSquad.trafficPricePerGbMinor, tariff.currencyCode),
          ),
        ])
      : [escapeHtml("Сквады не добавлены")];

  return renderSection("Сервера", squadLines).join("\n");
}

export function renderTariffSectionHeader(section: TariffSection) {
  switch (section) {
    case "basic":
      return [
        htmlBold("Тариф: базовые настройки"),
        "",
        "Здесь меняются название, описание, условия использования и базовая цена тарифа.",
      ].join("\n");
    case "servers":
      return [
        htmlBold("Тариф: сервера"),
        "",
        "Здесь подключаются серверы и задаются лимиты трафика для каждого из них.",
      ].join("\n");
    case "duration":
      return [
        htmlBold("Тариф: периоды"),
        "",
        "Здесь настраиваются доступные сроки подписки и скидка на каждый период.",
      ].join("\n");
    case "devices":
      return [
        htmlBold("Тариф: устройства"),
        "",
        "Здесь задается бесплатный лимит устройств и стоимость дополнительных устройств.",
      ].join("\n");
    default:
      return [
        htmlBold("Карточка тарифа"),
        "",
        "Ниже собрана полная сводка по тарифу и его текущей доступности.",
      ].join("\n");
  }
}

export function renderBalanceTopUpSummary(
  amountMinor: number,
  yookassaEnabled: boolean,
) {
  return [
    htmlBold("Пополнение баланса"),
    "",
    renderStrongCodeLine("Сумма пополнения", formatMoneyMinor(amountMinor, "RUB")),
    renderStrongCodeLine("Сумма в звёздах", calculateBalanceTopUpStars(amountMinor)),
    "",
    htmlBold("Выбери способ оплаты."),
    !yookassaEnabled ? "СБП сейчас недоступна." : "",
  ].filter((line) => line.length > 0).join("\n");
}
