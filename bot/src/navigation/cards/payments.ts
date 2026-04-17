import { InlineKeyboard } from "grammy";

import type {
  BalanceTopUpOrder,
  PaymentProvider,
  PurchaseOrder,
  ReferralReward,
} from "../../generated/prisma/index.js";
import { formatMoneyMinor } from "../../services/pricing-format-service.js";
import {
  BALANCE_TOP_UP_MAX_MINOR,
  BALANCE_TOP_UP_MIN_MINOR,
  type BalanceTransactionPage,
  calculateBalanceTopUpStars,
  parseTransactionMetadata,
} from "../../services/purchase-service.js";
import type { RenderedScreen } from "../screens/types.js";
import { BACK_BUTTON_TEXT } from "../ui/keyboards.js";
import {
  renderBalanceStatus,
  renderCodeLine,
  renderInputPrompt,
  renderPlainLine,
  renderPurchaseStatus,
  renderDate,
  renderScreenLayout,
  renderStrongCodeLine,
} from "../ui/text.js";

function formatProviderLabel(provider: PaymentProvider) {
  switch (provider) {
    case "BALANCE":
      return "Баланс";
    case "STARS":
      return "Звёзды";
    case "YOOKASSA":
      return "СБП";
  }
}

function formatPurchaseOperationTitle(orderKind?: string) {
  switch (orderKind) {
    case "subscription_renewal":
      return "Продление подписки";
    case "device_upgrade":
      return "Разблокировка устройств";
    default:
      return "Покупка подписки";
  }
}

function formatCompactAmount(amountMinor: number) {
  const value = amountMinor / 100;

  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function renderBalanceTopUpOptionsScreen(): RenderedScreen {
  const keyboard = new InlineKeyboard()
    .text({ text: "➕ 10 ₽", style: "primary" }, "balance:amount:1000")
    .text({ text: "➕ 100 ₽", style: "primary" }, "balance:amount:10000")
    .row()
    .text({ text: "➕ 500 ₽", style: "success" }, "balance:amount:50000")
    .text({ text: "➕ 1000 ₽", style: "success" }, "balance:amount:100000")
    .row()
    .text({ text: "➕ 5000 ₽", style: "primary" }, "balance:amount:500000")
    .text({ text: "➕ 10000 ₽", style: "success" }, "balance:amount:1000000")
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:balance");

  return {
    text: renderScreenLayout("➕ Пополнение баланса", {
      summary: [
        `Лимит пополнения: от ${formatMoneyMinor(BALANCE_TOP_UP_MIN_MINOR, "RUB")} до ${formatMoneyMinor(BALANCE_TOP_UP_MAX_MINOR, "RUB")}.`,
        "Можно выбрать готовую сумму кнопкой или просто отправить свою сумму следующим сообщением.",
      ],
      nextStep: [
        "↓ Выбери сумму кнопкой ниже или отправь число сообщением, например 350.",
      ],
    }),
    replyMarkup: keyboard,
  };
}

export function renderBalanceTransactionsScreen(
  transactions: BalanceTransactionPage,
): RenderedScreen {
  const keyboard = new InlineKeyboard();

  for (const transaction of transactions.items) {
    const isIncoming = transaction.kind === "topup" || transaction.kind === "referral_reward";
    const amountText = `${isIncoming ? "+" : "-"}${formatCompactAmount(transaction.amountMinor)}`;

    keyboard.text(
      { text: amountText, style: isIncoming ? "success" : "danger" },
      `balance:tx:${transaction.kind}:${transaction.id}:${transactions.page}`,
    ).row();
  }

  if (transactions.totalPages > 1) {
    if (transactions.page > 1) {
      keyboard.text(
        { text: "←", style: "primary" },
        `balance:transactions:${transactions.page - 1}`,
      );
    }

    keyboard.text(
      { text: `${transactions.page}/${transactions.totalPages}`, style: "primary" },
      "balance:transactions:noop",
    );

    if (transactions.page < transactions.totalPages) {
      keyboard.text(
        { text: "→", style: "primary" },
        `balance:transactions:${transactions.page + 1}`,
      );
    }

    keyboard.row();
  }

  keyboard.text(
    { text: BACK_BUTTON_TEXT, style: "danger" },
    "nav:balance",
  );

  return {
    text: renderScreenLayout("🧾 Транзакции", {
      summary: [
        transactions.totalItems > 0
          ? renderPlainLine("Операций", `${transactions.totalItems}`)
          : "Транзакций пока нет.",
      ],
      nextStep: transactions.totalItems > 0 ? ["↓ Открой транзакцию кнопкой ниже."] : undefined,
    }),
    replyMarkup: keyboard,
  };
}

export function renderReferralRewardTransactionScreen(
  reward: ReferralReward & {
    referredUser: {
      firstName: string;
      username: string | null;
    };
    balanceTopUpOrder: {
      id: string;
      amountMinor: number;
      currencyCode: string;
      createdAt: Date;
    };
  },
  page: number,
  backCallback?: string,
): RenderedScreen {
  const referredLabel = reward.referredUser.username
    ? `@${reward.referredUser.username}`
    : reward.referredUser.firstName;

  return {
    text: renderScreenLayout("🤝 Реферальный бонус", {
      summary: [
        renderStrongCodeLine("Начислено", formatMoneyMinor(reward.rewardAmountMinor, "RUB")),
      ],
      sections: [[
        renderPlainLine("За кого", referredLabel),
        renderPlainLine("Источник", "Пополнение реферала"),
        renderCodeLine("Пополнение", formatMoneyMinor(reward.topUpAmountMinor, "RUB")),
        renderCodeLine("Ставка", `${reward.rewardPercent}%`),
        renderCodeLine("Создано", renderDate(reward.createdAt)),
        renderCodeLine("ID пополнения", reward.balanceTopUpOrder.id),
        renderCodeLine("ID бонуса", reward.id),
      ]],
    }),
    replyMarkup: new InlineKeyboard().text(
      { text: BACK_BUTTON_TEXT, style: "danger" },
      backCallback ?? `balance:transactions:${page}`,
    ),
  };
}

export function renderBalanceTopUpTransactionScreen(
  order: BalanceTopUpOrder,
  page: number,
  backCallback?: string,
): RenderedScreen {
  const metadata = parseTransactionMetadata(order.metadataJson ?? null);
  const keyboard = new InlineKeyboard();

  if (order.providerConfirmationUrl && order.status === "PENDING") {
    keyboard.url("🔗 Перейти к оплате", order.providerConfirmationUrl).row();
  }

  if (order.provider === "YOOKASSA" && order.status === "PENDING") {
    keyboard
      .text({ text: "🔄 Проверить оплату", style: "primary" }, `balance:yookassa_check:${order.id}`)
      .row();
  }

  keyboard
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, backCallback ?? `balance:transactions:${page}`);

  return {
    text: renderScreenLayout("➕ Пополнение баланса", {
      summary: [
        renderStrongCodeLine("Сумма", formatMoneyMinor(order.amountMinor, order.currencyCode)),
      ],
      sections: [
        [
          renderPlainLine("Операция", "Пополнение баланса"),
          renderPlainLine("Статус", renderBalanceStatus(order.status)),
          renderPlainLine("Способ", formatProviderLabel(order.provider)),
          ...(typeof metadata.balanceBeforeMinor === "number"
            ? [renderCodeLine("Баланс до", formatMoneyMinor(metadata.balanceBeforeMinor, order.currencyCode))]
            : []),
          ...(typeof metadata.balanceAfterMinorExpected === "number"
            ? [renderCodeLine("Баланс после", formatMoneyMinor(metadata.balanceAfterMinorExpected, order.currencyCode))]
            : []),
          renderCodeLine("Создано", renderDate(order.createdAt)),
          ...(order.amountStars != null
            ? [renderCodeLine("Списано в звёздах", order.amountStars)]
            : []),
          renderCodeLine("ID", order.id),
        ],
      ],
    }),
    replyMarkup: keyboard,
  };
}

export function renderBalancePurchaseTransactionScreen(
  order: PurchaseOrder & {
    tariff: {
      name: string;
    };
    tariffPeriod: {
      durationDays: number;
      discountPercent: number;
    };
    remnawaveAccount: {
      id: number;
    } | null;
  },
  page: number,
  backCallback?: string,
): RenderedScreen {
  const metadata = parseTransactionMetadata(order.metadataJson ?? null);
  const orderKind =
    typeof metadata.orderKind === "string" ? metadata.orderKind : undefined;

  return {
    text: renderScreenLayout("➖ Списание с баланса", {
      summary: [
        renderStrongCodeLine("Сумма", formatMoneyMinor(order.totalPriceMinor, order.currencyCode)),
      ],
      sections: [
        [
          renderPlainLine("Операция", formatPurchaseOperationTitle(orderKind)),
          renderPlainLine("За что", `Подписка ${order.tariff.name}`),
          renderPlainLine("Статус", renderPurchaseStatus(order.status)),
          renderPlainLine("Способ", formatProviderLabel(order.provider)),
          ...(typeof metadata.balanceBeforeMinor === "number"
            ? [renderCodeLine("Баланс до", formatMoneyMinor(metadata.balanceBeforeMinor, order.currencyCode))]
            : []),
          ...(typeof metadata.balanceAfterMinor === "number"
            ? [renderCodeLine("Баланс после", formatMoneyMinor(metadata.balanceAfterMinor, order.currencyCode))]
            : []),
          renderPlainLine("Период", `${order.tariffPeriod.durationDays} дн.`),
          ...(order.tariffPeriod.discountPercent > 0
            ? [renderPlainLine("Скидка периода", `${order.tariffPeriod.discountPercent}%`)]
            : []),
          ...(orderKind === "device_upgrade"
            ? [
                renderPlainLine(
                  "Докуплено устройств",
                  `${typeof metadata.purchasedExtraDeviceCount === "number" ? metadata.purchasedExtraDeviceCount : order.extraDeviceCount}`,
                ),
                ...(typeof metadata.targetExtraDeviceCount === "number"
                  ? [renderPlainLine("Новый лимит сверх тарифа", `${metadata.targetExtraDeviceCount}`)]
                  : []),
              ]
            : [renderPlainLine("Доп. устройств", `${order.extraDeviceCount}`)]),
          renderCodeLine("Тарифная часть", formatMoneyMinor(order.basePriceMinor, order.currencyCode)),
          renderCodeLine("Устройства", formatMoneyMinor(order.extraDevicesPriceMinor, order.currencyCode)),
          renderCodeLine("Создано", renderDate(order.createdAt)),
          ...((typeof metadata.renewalAccountId === "number" || typeof metadata.deviceUpgradeAccountId === "number")
            ? [renderCodeLine("ID подписки", typeof metadata.renewalAccountId === "number" ? metadata.renewalAccountId : metadata.deviceUpgradeAccountId!)]
            : order.remnawaveAccount
              ? [renderCodeLine("ID подписки", order.remnawaveAccount.id)]
            : []),
          renderCodeLine("ID заказа", order.id),
        ],
      ],
    }),
    replyMarkup: new InlineKeyboard().text(
      { text: BACK_BUTTON_TEXT, style: "danger" },
      backCallback ?? `balance:transactions:${page}`,
    ),
  };
}

export function renderBalanceTopUpScreen(
  amountMinor: number,
  yookassaEnabled: boolean,
  options?: {
    backCallback?: string;
    shortfallMinor?: number;
    starsCallback?: string;
    sbpCallback?: string;
  },
): RenderedScreen {
  const keyboard = new InlineKeyboard()
    .text(
      { text: "⭐ Звёзды", style: "primary" },
      options?.starsCallback ?? `balance:stars:${amountMinor}`,
    );

  if (yookassaEnabled) {
    keyboard.text(
      { text: "💳 СБП", style: "success" },
      options?.sbpCallback ?? `balance:yookassa:${amountMinor}`,
    );
  }

  keyboard
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, options?.backCallback ?? "nav:balance");

  return {
    text: renderScreenLayout("💰 Пополнение баланса", {
      summary: [
        renderStrongCodeLine("Пополнение", formatMoneyMinor(amountMinor, "RUB")),
        ...(typeof options?.shortfallMinor === "number"
          ? [renderStrongCodeLine("Не хватает для оплаты", formatMoneyMinor(options.shortfallMinor, "RUB"))]
          : []),
        renderStrongCodeLine("Списание в звёздах", calculateBalanceTopUpStars(amountMinor)),
      ],
      actions: [
        `Лимит пополнения: от ${formatMoneyMinor(BALANCE_TOP_UP_MIN_MINOR, "RUB")} до ${formatMoneyMinor(BALANCE_TOP_UP_MAX_MINOR, "RUB")}.`,
      ],
      nextStep: [
        "↓ Выбери подходящий способ оплаты кнопками ниже.",
      ],
      sections: !yookassaEnabled ? [[ "⚠️ СБП сейчас недоступна." ]] : undefined,
    }),
    replyMarkup: keyboard,
  };
}

export function renderBalanceYooKassaOrderScreen(order: BalanceTopUpOrder): RenderedScreen {
  const keyboard = new InlineKeyboard();

  if (order.providerConfirmationUrl) {
    keyboard.url("🔗 Перейти к оплате", order.providerConfirmationUrl).row();
  }

  keyboard
    .text({ text: "🔄 Проверить оплату", style: "primary" }, `balance:yookassa_check:${order.id}`)
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:balance");

  return {
    text: renderScreenLayout("💳 Пополнение: СБП", {
      summary: [
        renderCodeLine("ID", order.id),
        renderPlainLine("Статус", renderBalanceStatus(order.status)),
        renderStrongCodeLine("Сумма", formatMoneyMinor(order.amountMinor, order.currencyCode)),
      ],
      nextStep: [
        order.providerConfirmationUrl
          ? "🔗 Открой страницу оплаты и после завершения проверь статус."
          : "• Ссылка на оплату пока недоступна.",
      ],
    }),
    replyMarkup: keyboard,
  };
}

export function renderBalanceAmountInputPrompt(errorMessage?: string): RenderedScreen {
  return renderInputPrompt(
    "💰 Ввод суммы пополнения",
    [
      `Введи сумму пополнения следующим сообщением.`,
      `Минимум: <code>${formatMoneyMinor(BALANCE_TOP_UP_MIN_MINOR, "RUB")}</code>`,
      `Максимум: <code>${formatMoneyMinor(BALANCE_TOP_UP_MAX_MINOR, "RUB")}</code>`,
      "Пример: <code>350</code>",
    ],
    {
      backCallback: "nav:balance",
      errorMessage,
    },
  );
}

export function renderReferralTermsInputPrompt(
  currentValue?: string | null,
  errorMessage?: string,
): RenderedScreen {
  return renderInputPrompt(
    "🤝 Условия реферальной программы",
    [
      "Отправь следующим сообщением текст условий, который увидят пользователи на экране рефералки.",
      "Можно описать ограничения, порядок начисления и любые важные детали.",
      "Отправь <code>-</code>, чтобы убрать текст условий.",
    ],
    {
      currentValue,
      backCallback: "nav:admin_referrals",
      errorMessage,
    },
  );
}
