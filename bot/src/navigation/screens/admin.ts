import { InlineKeyboard } from "grammy";

import { escapeHtml } from "../../formatters/html.js";
import { formatMoneyMinor } from "../../services/pricing-format-service.js";
import {
  formatBroadcastAudienceLabel,
  type BroadcastAudience,
} from "../../services/broadcast-service.js";
import type { ScreenRenderContext } from "./types.js";
import { BACK_BUTTON_TEXT } from "../ui/keyboards.js";
import {
  renderCodeLine,
  renderDate,
  formatTrafficBytes,
  renderInputPrompt,
  renderPlainLine,
  renderPurchaseStatus,
  renderScreenLayout,
  renderSection,
  renderStrongCodeLine,
  renderSubscriptionHeadline,
  renderSubscriptionQuotaLines,
  renderUserSubscriptionStatus,
} from "../ui/text.js";

function buildAdminKeyboard() {
  return new InlineKeyboard()
    .text({ text: "👥 Пользователи", style: "primary" }, "nav:admin_users")
    .text({ text: "⚙️ Система", style: "success" }, "nav:admin_system")
    .row()
    .text({ text: "💳 Тарифы", style: "primary" }, "nav:admin_tariffs")
    .text({ text: "🤝 Рефералка", style: "success" }, "nav:admin_referrals")
    .row()
    .text({ text: "🛰️ Сквады", style: "success" }, "nav:admin_squads")
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:home");
}

function buildAdminSystemKeyboard() {
  return new InlineKeyboard()
    .text({ text: "📣 Рассылки", style: "success" }, "nav:admin_broadcast")
    .row()
    .text({ text: "🧠 Состояние системы", style: "primary" }, "nav:admin_system_status")
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:admin");
}

function formatBytes(bytes: number) {
  const gb = bytes / (1024 ** 3);

  if (gb >= 1) {
    return `${gb.toFixed(2)} ГБ`;
  }

  const mb = bytes / (1024 ** 2);
  return `${mb.toFixed(2)} МБ`;
}

function formatDuration(totalSec: number) {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return `${hours}ч ${minutes}м ${seconds}с`;
}

function formatPercent(value: number | null | undefined) {
  if (value == null) {
    return "недостаточно данных";
  }

  return `${value.toFixed(1)}%`;
}

function buildAdminBroadcastKeyboard() {
  return new InlineKeyboard()
    .text({ text: "👥 Всем, кто открыл бота", style: "primary" }, "adminbroadcast:audience:all_private")
    .row()
    .text({ text: "🔐 Только с подписками", style: "success" }, "adminbroadcast:audience:subscribers")
    .row()
    .text({ text: "🆕 Только без подписок", style: "primary" }, "adminbroadcast:audience:without_subscriptions")
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:admin");
}

function buildAdminTariffsKeyboard(tariffs: { id: number; name: string; isActive: boolean }[]) {
  const keyboard = new InlineKeyboard()
    .text({ text: "➕ Создать тариф", style: "success" }, "tariff:create")
    .row();

  for (const tariff of tariffs) {
    keyboard
      .text(
        {
          text: tariff.name,
          style: tariff.isActive ? "primary" : "danger",
        },
        `tariff:open:${tariff.id}`,
      )
      .row();
  }

  keyboard.text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:admin");
  return keyboard;
}

function buildAdminPricingKeyboard() {
  return new InlineKeyboard()
    .text({ text: "🆓 Бесплатный доступ", style: "primary" }, "nav:admin_pricing_free")
    .text({ text: "📱 Устройства", style: "success" }, "nav:admin_pricing_devices")
    .row()
    .text({ text: "📡 Трафик", style: "primary" }, "nav:admin_pricing_traffic")
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:admin_tariffs");
}

function buildFreePricingKeyboard() {
  return new InlineKeyboard()
    .text({ text: "−1 устройство", style: "danger" }, "pricing:free_devices:dec")
    .text({ text: "+1 устройство", style: "success" }, "pricing:free_devices:inc")
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:admin_pricing");
}

function buildDevicePricingKeyboard() {
  return new InlineKeyboard()
    .text({ text: "−10 ₽/день", style: "danger" }, "pricing:device_daily:dec")
    .text({ text: "+10 ₽/день", style: "success" }, "pricing:device_daily:inc")
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:admin_pricing");
}

function buildTrafficPricingKeyboard(enabled: boolean) {
  return new InlineKeyboard()
    .text(
      {
        text: enabled ? "Выключить трафик" : "Включить трафик",
        style: enabled ? "danger" : "success",
      },
      "pricing:traffic_toggle",
    )
    .row()
    .text({ text: "−5 ₽/ГБ", style: "danger" }, "pricing:traffic_price:dec")
    .text({ text: "+5 ₽/ГБ", style: "success" }, "pricing:traffic_price:inc")
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:admin_pricing");
}

function buildReferralPricingKeyboard(enabled: boolean) {
  return new InlineKeyboard()
    .text(
      {
        text: enabled ? "Выключить реферальную программу" : "Включить реферальную программу",
        style: enabled ? "danger" : "success",
      },
      "pricing:referral_toggle",
    )
    .row()
    .text({ text: "−1%", style: "danger" }, "pricing:referral_percent:dec")
    .text({ text: "+1%", style: "success" }, "pricing:referral_percent:inc")
    .row()
    .text({ text: "✍️ Условия", style: "primary" }, "pricing:referral_terms")
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:admin");
}

function buildSquadsKeyboard(squads: { uuid: string; name: string }[]) {
  const keyboard = new InlineKeyboard().text(
    { text: "🔄 Синхронизировать сквады", style: "success" },
    "squads:sync",
  );

  for (const squad of squads) {
    keyboard
      .row()
      .text({ text: squad.name, style: "primary" }, `squad:open:${squad.uuid}`);
  }

  keyboard
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:admin");

  return keyboard;
}

function buildAdminUsersKeyboard(pageData: NonNullable<ScreenRenderContext["adminUsersPage"]>) {
  const keyboard = new InlineKeyboard()
    .text({ text: "🔎 Поиск", style: "success" }, "adminusers:search");

  if (pageData.query) {
    keyboard.text({ text: "✖️ Сбросить", style: "danger" }, "adminusers:clear_search");
  }

  keyboard.row();

  for (const item of pageData.items) {
    const label = item.username ? `@${item.username}` : item.firstName;
    keyboard
      .text(
        { text: label, style: "primary" },
        `adminusers:open:${item.id}:${pageData.page}`,
      )
      .row();
  }

  if (pageData.totalPages > 1) {
    if (pageData.page > 1) {
      keyboard.text({ text: "←", style: "primary" }, `adminusers:page:${pageData.page - 1}`);
    }

    keyboard.text(
      { text: `${pageData.page}/${pageData.totalPages}`, style: "primary" },
      "adminusers:noop",
    );

    if (pageData.page < pageData.totalPages) {
      keyboard.text({ text: "→", style: "primary" }, `adminusers:page:${pageData.page + 1}`);
    }

    keyboard.row();
  }

  keyboard.text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:admin");
  return keyboard;
}

export function renderAdminUserSearchPrompt(currentValue?: string | null, errorMessage?: string) {
  return renderInputPrompt(
    "👥 Поиск пользователя",
    [
      "Отправь имя, username, Telegram ID или реферальный код следующим сообщением.",
      "Пример: <code>vlad</code> или <code>5760798380</code>",
      "Отправь <code>-</code>, чтобы сбросить поиск и вернуться ко всем пользователям.",
    ],
    {
      currentValue,
      backCallback: "nav:admin_users",
      errorMessage,
    },
  );
}

export function renderAdminBroadcastMessagePrompt(
  audience: BroadcastAudience,
  currentValue?: string | null,
  errorMessage?: string,
) {
  return renderInputPrompt(
    "📣 Текст рассылки",
    [
      `Аудитория: <b>${escapeHtml(formatBroadcastAudienceLabel(audience))}</b>`,
      "Отправь текст следующим сообщением. Поддерживается HTML Telegram.",
      "Отправь <code>-</code>, чтобы отменить подготовку рассылки.",
    ],
    {
      currentValue,
      backCallback: "nav:admin_broadcast",
      errorMessage,
    },
  );
}

export function renderAdminBroadcastPreviewScreen(params: {
  audience: BroadcastAudience;
  recipientCount: number;
  message: string;
}) {
  return {
    text: renderScreenLayout("📣 Рассылка: превью", {
      summary: [
        renderPlainLine("Аудитория", formatBroadcastAudienceLabel(params.audience)),
        renderCodeLine("Получателей", params.recipientCount),
      ],
      sections: [
        renderSection("✉️ Сообщение", [params.message]),
      ],
      nextStep: [
        "Проверь текст ниже и запусти рассылку кнопкой.",
      ],
    }),
    replyMarkup: new InlineKeyboard()
      .text({ text: "✅ Запустить", style: "success" }, "adminbroadcast:send")
      .text({ text: "✏️ Изменить текст", style: "primary" }, "adminbroadcast:edit")
      .row()
      .text({ text: "✖️ Отменить", style: "danger" }, "nav:admin_broadcast"),
  };
}

export function renderAdminBroadcastResultScreen(params: {
  audience: BroadcastAudience;
  attemptedCount: number;
  sentCount: number;
  failedCount: number;
}) {
  return {
    text: renderScreenLayout("📣 Рассылка завершена", {
      summary: [
        renderPlainLine("Аудитория", formatBroadcastAudienceLabel(params.audience)),
        renderCodeLine("Планировалось", params.attemptedCount),
        renderCodeLine("Отправлено", params.sentCount),
        renderCodeLine("Ошибок", params.failedCount),
      ],
    }),
    replyMarkup: new InlineKeyboard()
      .text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:admin_broadcast"),
  };
}

export function renderAdminUserDetailsScreen(
  user: {
    id: number;
    telegramId: bigint;
    firstName: string;
    lastName: string | null;
    username: string | null;
    languageCode: string | null;
    balanceMinor: number;
    referralCode: string;
    createdAt: Date;
    updatedAt: Date;
    referredBy: {
      id: number;
      firstName: string;
      username: string | null;
    } | null;
    _count: {
      purchaseOrders: number;
      balanceTopUpOrders: number;
      remnawaveAccounts: number;
      referrals: number;
    };
  },
  page: number,
) {
  const referredByLabel = user.referredBy
    ? (user.referredBy.username ? `@${user.referredBy.username}` : user.referredBy.firstName)
    : "нет";

  return {
    text: renderScreenLayout(`👤 Пользователь: ${escapeHtml(user.firstName)}`, {
      summary: [
        user.username ? renderPlainLine("Username", `@${user.username}`) : renderCodeLine("Telegram ID", user.telegramId),
        renderStrongCodeLine("Баланс", formatMoneyMinor(user.balanceMinor, "RUB")),
      ],
      sections: [
        renderSection("🪪 Профиль", [
          renderCodeLine("Внутренний ID", user.id),
          renderCodeLine("Telegram ID", user.telegramId),
          renderPlainLine("Имя", user.firstName),
          renderPlainLine("Фамилия", user.lastName ?? "не указана"),
          renderPlainLine("Язык", user.languageCode ?? "не указан"),
        ]),
        renderSection("📊 Активность", [
          renderCodeLine("Покупок", user._count.purchaseOrders),
          renderCodeLine("Пополнений", user._count.balanceTopUpOrders),
          renderCodeLine("Подписок", user._count.remnawaveAccounts),
          renderCodeLine("Приглашенных", user._count.referrals),
        ]),
        renderSection("🤝 Рефералка", [
          renderCodeLine("Код", user.referralCode),
          renderPlainLine("Пригласил", referredByLabel),
        ]),
        renderSection("🕒 Время", [
          renderCodeLine("Создан", user.createdAt.toISOString().slice(0, 19).replace("T", " ")),
          renderCodeLine("Обновлен", user.updatedAt.toISOString().slice(0, 19).replace("T", " ")),
        ]),
      ],
    }),
    replyMarkup: new InlineKeyboard()
      .text({ text: "🔐 Подписки", style: "primary" }, `adminusers:subscriptions:${user.id}:${page}:1`)
      .text({ text: "🧾 Транзакции", style: "success" }, `adminusers:transactions:${user.id}:${page}:1`)
      .row()
      .text({ text: "🤝 Рефералы", style: "primary" }, `adminusers:referrals:${user.id}:${page}:1`)
      .row()
      .text({ text: "👥 К пользователям", style: "primary" }, `adminusers:page:${page}`)
      .row()
      .text({ text: BACK_BUTTON_TEXT, style: "danger" }, `adminusers:page:${page}`),
  };
}

function buildAdminUserSubscriptionsKeyboard(
  userId: number,
  parentPage: number,
  pageData: {
    items: {
      id: number;
      purchaseOrder: {
        tariff: {
          name: string;
        };
      } | null;
      remainingTrafficBytes: bigint;
      expireAt: Date;
    }[];
    page: number;
    totalPages: number;
  },
) {
  const keyboard = new InlineKeyboard();

  for (const item of pageData.items) {
    const title = item.purchaseOrder?.tariff.name ?? `Подписка ${item.id}`;
    keyboard
      .text(
        {
          text: `${title} · ${formatTrafficBytes(item.remainingTrafficBytes)}`,
          style: item.expireAt > new Date() ? "primary" : "danger",
        },
        `adminusers:subscription_open:${userId}:${parentPage}:${pageData.page}:${item.id}`,
      )
      .row();
  }

  if (pageData.totalPages > 1) {
    if (pageData.page > 1) {
      keyboard.text({ text: "←", style: "primary" }, `adminusers:subscriptions:${userId}:${parentPage}:${pageData.page - 1}`);
    }
    keyboard.text({ text: `${pageData.page}/${pageData.totalPages}`, style: "primary" }, "adminusers:noop");
    if (pageData.page < pageData.totalPages) {
      keyboard.text({ text: "→", style: "primary" }, `adminusers:subscriptions:${userId}:${parentPage}:${pageData.page + 1}`);
    }
    keyboard.row();
  }

  keyboard.text({ text: "👥 К пользователям", style: "primary" }, `adminusers:page:${parentPage}`).row();
  keyboard.text({ text: BACK_BUTTON_TEXT, style: "danger" }, `adminusers:open:${userId}:${parentPage}`);
  return keyboard;
}

export function renderAdminUserSubscriptionsScreen(
  targetUser: {
    id: number;
    firstName: string;
    username: string | null;
  },
  pageData: {
    items: {
      id: number;
      purchaseOrder: {
        tariff: {
          name: string;
        };
      } | null;
      remainingTrafficBytes: bigint;
      expireAt: Date;
    }[];
    page: number;
    totalItems: number;
    totalPages: number;
  },
  parentPage: number,
) {
  const label = targetUser.username ? `@${targetUser.username}` : targetUser.firstName;

  return {
    text: renderScreenLayout(`🔐 Подписки: ${escapeHtml(label)}`, {
      summary: [
        renderCodeLine("Найдено подписок", pageData.totalItems),
        renderCodeLine("Страница", `${pageData.page}/${pageData.totalPages}`),
      ],
      nextStep: [
        pageData.totalItems > 0 ? "↓ Открой подписку кнопкой ниже." : "Подписок пока нет.",
      ],
    }),
    replyMarkup: buildAdminUserSubscriptionsKeyboard(targetUser.id, parentPage, pageData),
  };
}

export function renderAdminUserSubscriptionScreen(
  targetUser: {
    id: number;
    firstName: string;
    username: string | null;
  },
  subscription: {
    id: number;
    username: string;
    subscriptionUrl: string | null;
    expireAt: Date;
    purchaseOrder: {
      tariff: {
        name: string;
      };
    } | null;
    squadQuotas: {
      squadUuid: string;
      grantedTrafficBytes: bigint;
      consumedTrafficBytes: bigint;
      expiresAt: Date;
      exhaustedAt: Date | null;
      squad: {
        name: string;
        displayName: string | null;
      };
    }[];
  },
  parentPage: number,
  listPage: number,
) {
  const label = targetUser.username ? `@${targetUser.username}` : targetUser.firstName;
  const subscriptionView = {
    ...subscription,
    purchaseOrder: subscription.purchaseOrder,
  } as Parameters<typeof renderSubscriptionHeadline>[0];

  return {
    text: renderScreenLayout(`🔐 Подписка: ${escapeHtml(label)}`, {
      summary: [
        renderPlainLine("Тариф", renderSubscriptionHeadline(subscriptionView)),
        renderPlainLine("Статус", renderUserSubscriptionStatus(subscriptionView)),
        renderCodeLine("Действует до", renderDate(subscription.expireAt)),
        renderCodeLine("Логин", subscription.username),
      ],
      sections: [
        renderSection("🛰️ Серверы и трафик", renderSubscriptionQuotaLines(subscriptionView)),
      ],
    }),
    replyMarkup: new InlineKeyboard()
      .text({ text: "👥 К пользователям", style: "primary" }, `adminusers:page:${parentPage}`)
      .row()
      .text({ text: BACK_BUTTON_TEXT, style: "danger" }, `adminusers:subscriptions:${targetUser.id}:${parentPage}:${listPage}`),
  };
}

function buildAdminUserReferralsKeyboard(
  userId: number,
  parentPage: number,
  pageData: {
    items: {
      id: number;
      firstName: string;
      username: string | null;
      topUpsCount: number;
    }[];
    page: number;
    totalPages: number;
  },
) {
  const keyboard = new InlineKeyboard();

  for (const item of pageData.items) {
    const label = item.username ? `@${item.username}` : item.firstName;
    keyboard
      .text(
        { text: `${label} · пополнений ${item.topUpsCount}`, style: "primary" },
        `adminusers:open:${item.id}:${parentPage}`,
      )
      .row();
  }

  if (pageData.totalPages > 1) {
    if (pageData.page > 1) {
      keyboard.text({ text: "←", style: "primary" }, `adminusers:referrals:${userId}:${parentPage}:${pageData.page - 1}`);
    }
    keyboard.text({ text: `${pageData.page}/${pageData.totalPages}`, style: "primary" }, "adminusers:noop");
    if (pageData.page < pageData.totalPages) {
      keyboard.text({ text: "→", style: "primary" }, `adminusers:referrals:${userId}:${parentPage}:${pageData.page + 1}`);
    }
    keyboard.row();
  }

  keyboard.text({ text: "👥 К пользователям", style: "primary" }, `adminusers:page:${parentPage}`).row();
  keyboard.text({ text: BACK_BUTTON_TEXT, style: "danger" }, `adminusers:open:${userId}:${parentPage}`);
  return keyboard;
}

export function renderAdminUserReferralsScreen(
  targetUser: {
    id: number;
    firstName: string;
    username: string | null;
  },
  pageData: {
    items: {
      id: number;
      firstName: string;
      username: string | null;
      topUpsCount: number;
      createdAt: Date;
    }[];
    page: number;
    totalItems: number;
    totalPages: number;
  },
  parentPage: number,
) {
  const label = targetUser.username ? `@${targetUser.username}` : targetUser.firstName;

  return {
    text: renderScreenLayout(`🤝 Рефералы: ${escapeHtml(label)}`, {
      summary: [
        renderCodeLine("Найдено рефералов", pageData.totalItems),
        renderCodeLine("Страница", `${pageData.page}/${pageData.totalPages}`),
      ],
      nextStep: [
        pageData.totalItems > 0 ? "↓ Открой реферала кнопкой ниже." : "У пользователя пока нет рефералов.",
      ],
    }),
    replyMarkup: buildAdminUserReferralsKeyboard(targetUser.id, parentPage, pageData),
  };
}

export function renderAdminUserTransactionsScreen(
  targetUser: {
    id: number;
    firstName: string;
    username: string | null;
  },
  transactions: {
    items: {
      kind: "topup" | "purchase" | "referral_reward";
      id: string;
      amountMinor: number;
    }[];
    page: number;
    totalItems: number;
    totalPages: number;
  },
  parentPage: number,
) {
  const label = targetUser.username ? `@${targetUser.username}` : targetUser.firstName;
  const keyboard = new InlineKeyboard();

  for (const item of transactions.items) {
    const sign = item.kind === "purchase" ? "-" : "+";
    keyboard
      .text(
        { text: `${sign}${(item.amountMinor / 100).toFixed(2)}`, style: item.kind === "purchase" ? "danger" : "success" },
        `adminusers:tx:${item.kind}:${targetUser.id}:${item.id}:${parentPage}:${transactions.page}`,
      )
      .row();
  }

  if (transactions.totalPages > 1) {
    if (transactions.page > 1) {
      keyboard.text({ text: "←", style: "primary" }, `adminusers:transactions:${targetUser.id}:${parentPage}:${transactions.page - 1}`);
    }
    keyboard.text({ text: `${transactions.page}/${transactions.totalPages}`, style: "primary" }, "adminusers:noop");
    if (transactions.page < transactions.totalPages) {
      keyboard.text({ text: "→", style: "primary" }, `adminusers:transactions:${targetUser.id}:${parentPage}:${transactions.page + 1}`);
    }
    keyboard.row();
  }

  keyboard
    .text({ text: "👥 К пользователям", style: "primary" }, `adminusers:page:${parentPage}`)
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, `adminusers:open:${targetUser.id}:${parentPage}`);

  return {
    text: renderScreenLayout(`🧾 Транзакции: ${escapeHtml(label)}`, {
      summary: [
        renderCodeLine("Операций", transactions.totalItems),
        renderCodeLine("Страница", `${transactions.page}/${transactions.totalPages}`),
      ],
      nextStep: [
        transactions.totalItems > 0 ? "↓ Открой транзакцию кнопкой ниже." : "Транзакций пока нет.",
      ],
    }),
    replyMarkup: keyboard,
  };
}

export const adminScreenRegistry = {
  admin_users: ({ adminUsersPage }: ScreenRenderContext) => ({
      text: renderScreenLayout("👥 Админ-панель: пользователи", {
        summary: [
          renderStrongCodeLine("Найдено пользователей", adminUsersPage?.totalItems ?? 0),
          renderCodeLine("Страница", `${adminUsersPage?.page ?? 1}/${adminUsersPage?.totalPages ?? 1}`),
          ...(adminUsersPage?.query
            ? [renderPlainLine("Поиск", adminUsersPage.query)]
            : []),
        ],
        nextStep: [
          adminUsersPage?.totalItems
            ? "↓ Открой пользователя кнопкой ниже или используй поиск."
            : "Пользователи не найдены.",
        ],
      }),
      replyMarkup: buildAdminUsersKeyboard(adminUsersPage ?? {
        items: [],
        page: 1,
        pageSize: 8,
        totalItems: 0,
        totalPages: 1,
      }),
    }),
  admin_system: () => ({
      text: renderScreenLayout("⚙️ Админ-панель: система", {
        summary: [
          "Служебные инструменты и операционные разделы бота.",
        ],
        sections: [
          renderSection("📣 Рассылки", [
            "Массовые сообщения по выбранной аудитории пользователей.",
          ]),
          renderSection("🧠 Состояние системы", [
            "Окружение, runtime и базовые служебные параметры процесса.",
          ]),
        ],
        nextStep: [
          "↓ Выбери нужный раздел кнопками ниже.",
        ],
      }),
      replyMarkup: buildAdminSystemKeyboard(),
    }),
  admin_system_status: ({ adminSystemStatus }: ScreenRenderContext) => ({
      text: renderScreenLayout("🧠 Состояние системы", {
        summary: [
          renderCodeLine("Снимок", adminSystemStatus?.generatedAt.toISOString().slice(11, 19) ?? "—"),
          renderCodeLine("Uptime", formatDuration(adminSystemStatus?.uptimeSec ?? 0)),
          renderCodeLine("DB latency", `${adminSystemStatus?.databaseLatencyMs ?? 0} ms`),
        ],
        sections: [
          renderSection("💾 Память", [
            renderCodeLine("RSS", formatBytes(adminSystemStatus?.rssBytes ?? 0)),
            renderCodeLine("Heap used", formatBytes(adminSystemStatus?.heapUsedBytes ?? 0)),
            renderCodeLine("Heap total", formatBytes(adminSystemStatus?.heapTotalBytes ?? 0)),
            renderCodeLine("Heap load", formatPercent(adminSystemStatus?.heapUsedPercent)),
            renderCodeLine(
              "Система свободно",
              `${formatBytes(adminSystemStatus?.systemFreeMemoryBytes ?? 0)} / ${formatBytes(adminSystemStatus?.systemTotalMemoryBytes ?? 0)}`,
            ),
            renderCodeLine("Система занято", formatPercent(adminSystemStatus?.systemMemoryUsedPercent)),
          ]),
          renderSection("📈 Нагрузка", [
            renderCodeLine("Текущая", formatPercent(adminSystemStatus?.loadPercentCurrent)),
            renderCodeLine("За час", formatPercent(adminSystemStatus?.loadPercentHourAvg)),
            renderCodeLine("За 12 часов", formatPercent(adminSystemStatus?.loadPercentTwelveHoursAvg)),
            renderCodeLine("За сутки", formatPercent(adminSystemStatus?.loadPercentDayAvg)),
            renderCodeLine(
              "Load avg",
              adminSystemStatus
                ? adminSystemStatus.loadAverage.map((value) => value.toFixed(2)).join(" / ")
                : "0.00 / 0.00 / 0.00",
            ),
            renderCodeLine(
              "Remnawave sync",
              `${Math.round((adminSystemStatus?.remnawaveSyncIntervalMs ?? 0) / 1000)} сек.`,
            ),
          ]),
          renderSection("👥 Пользователи", [
            renderCodeLine("Всего", adminSystemStatus?.usersCount ?? 0),
            renderCodeLine("Есть private chat", adminSystemStatus?.usersWithPrivateChatCount ?? 0),
            renderCodeLine("Активных подписок", adminSystemStatus?.activeSubscriptionsCount ?? 0),
          ]),
          renderSection("💳 Платежи", [
            renderCodeLine("Пополнения pending", adminSystemStatus?.topUpPendingCount ?? 0),
            renderCodeLine("Заказы pending", adminSystemStatus?.purchasePendingCount ?? 0),
            renderCodeLine("Пополнения paid", adminSystemStatus?.topUpPaidCount ?? 0),
            renderCodeLine("Заказы paid", adminSystemStatus?.purchasePaidCount ?? 0),
          ]),
        ],
      }),
      replyMarkup: new InlineKeyboard()
        .text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:admin_system"),
    }),
  admin_broadcast: ({ adminBroadcastStats }: ScreenRenderContext) => ({
      text: renderScreenLayout("📣 Админ-панель: рассылка", {
        summary: [
          "Выбери аудиторию и отправь одно сообщение всем подходящим пользователям.",
        ],
        sections: [
          renderSection("👥 Аудитории", [
            renderCodeLine("Открыли бота", adminBroadcastStats?.allPrivateCount ?? 0),
            renderCodeLine("С подписками", adminBroadcastStats?.subscribersCount ?? 0),
            renderCodeLine("Без подписок", adminBroadcastStats?.withoutSubscriptionsCount ?? 0),
          ]),
        ],
        nextStep: [
          "↓ Выбери аудиторию кнопками ниже.",
        ],
      }),
      replyMarkup: buildAdminBroadcastKeyboard(),
    }),
  admin_tariffs: ({ tariffs = [] }: ScreenRenderContext) => ({
      text: renderScreenLayout("💳 Админ-панель: тарифы", {
        summary: [
          renderCodeLine("Всего тарифов", tariffs.length),
        ],
        nextStep: [
          "↓ Выбери тариф для настройки или создай новый.",
        ],
      }),
      replyMarkup: buildAdminTariffsKeyboard(tariffs),
    }),
  admin_pricing: ({ pricingSettings }: ScreenRenderContext) => ({
      text: renderScreenLayout("📐 Тарифы: базовые правила", {
        summary: [
          "🧾 Ниже собраны глобальные правила биллинга, которые влияют на все тарифы.",
        ],
        sections: [
          renderSection("📋 Общие правила", [
            renderCodeLine("Бесплатных устройств", pricingSettings?.freeDevicesPerUser ?? 0),
            renderCodeLine(
              "Цена устройства в день",
              formatMoneyMinor(
                pricingSettings?.paidDeviceDailyPriceMinor ?? 0,
                pricingSettings?.currencyCode ?? "RUB",
              ),
            ),
            renderPlainLine(
              "Трафик по умолчанию",
              pricingSettings?.trafficBillingEnabled ? "включен" : "выключен",
            ),
            renderCodeLine(
              "Цена трафика за 1 ГБ",
              formatMoneyMinor(
                pricingSettings?.trafficPricePerGbMinor ?? 0,
                pricingSettings?.currencyCode ?? "RUB",
              ),
            ),
          ]),
          renderSection("🔗 Связанные сквады", [
            renderCodeLine("Бесплатный сквад", pricingSettings?.freeSquadName ?? "free"),
            renderCodeLine("Платный сквад", pricingSettings?.paidSquadName ?? "paid"),
          ]),
        ],
      }),
      replyMarkup: buildAdminPricingKeyboard(),
    }),
  admin_pricing_free: ({ pricingSettings }: ScreenRenderContext) => ({
      text: renderScreenLayout("🆓 Тарифы: бесплатный доступ", {
        summary: [
          renderCodeLine("Текущее значение", pricingSettings?.freeDevicesPerUser ?? 0),
          renderCodeLine("Бесплатный сквад", pricingSettings?.freeSquadName ?? "free"),
        ],
        nextStep: [
          "↕️ Измени число бесплатных устройств кнопками ниже.",
        ],
      }),
      replyMarkup: buildFreePricingKeyboard(),
    }),
  admin_pricing_devices: ({ pricingSettings }: ScreenRenderContext) => ({
      text: renderScreenLayout("📱 Тарифы: устройства", {
        summary: [
          renderCodeLine(
            "Текущая цена за устройство в день",
            formatMoneyMinor(
              pricingSettings?.paidDeviceDailyPriceMinor ?? 0,
              pricingSettings?.currencyCode ?? "RUB",
            ),
          ),
          renderCodeLine("Платный сквад", pricingSettings?.paidSquadName ?? "paid"),
        ],
        nextStep: [
          "↕️ Измени стоимость кнопками ниже.",
        ],
      }),
      replyMarkup: buildDevicePricingKeyboard(),
    }),
  admin_pricing_traffic: ({ pricingSettings }: ScreenRenderContext) => ({
      text: renderScreenLayout("📡 Тарифы: трафик", {
        summary: [
          renderPlainLine(
            "Трафик по тарифу",
            pricingSettings?.trafficBillingEnabled ? "включен" : "выключен",
          ),
          renderCodeLine(
            "Цена за 1 ГБ",
            formatMoneyMinor(
              pricingSettings?.trafficPricePerGbMinor ?? 0,
              pricingSettings?.currencyCode ?? "RUB",
            ),
          ),
        ],
        nextStep: [
          "↕️ Переключи режим тарификации или скорректируй цену кнопками ниже.",
        ],
      }),
      replyMarkup: buildTrafficPricingKeyboard(pricingSettings?.trafficBillingEnabled ?? false),
    }),
  admin_referrals: ({ pricingSettings }: ScreenRenderContext) => ({
      text: renderScreenLayout("🤝 Админ-панель: реферальная программа", {
        summary: [
          renderPlainLine(
            "Статус",
            pricingSettings?.referralProgramEnabled ? "включена" : "выключена",
          ),
          renderCodeLine(
            "Бонус с пополнения",
            `${pricingSettings?.referralTopUpRewardPercent ?? 0}%`,
          ),
          pricingSettings?.referralProgramEnabled
            ? "Пользователь получает бонус на баланс после успешного пополнения приглашенного пользователя."
            : "Начисления не происходят, пока программа выключена.",
        ],
        sections: [
          renderSection(
            "📋 Условия для пользователей",
            pricingSettings?.referralTermsText
              ? pricingSettings.referralTermsText
                  .split(/\r?\n/)
                  .map((line) => line.trim())
                  .filter((line) => line.length > 0)
              : ["Текст условий пока не задан."],
          ),
        ],
        nextStep: [
          "↕️ Настрой процент и задай текст условий, который увидит пользователь на экране реферальной программы.",
        ],
      }),
      replyMarkup: buildReferralPricingKeyboard(pricingSettings?.referralProgramEnabled ?? false),
    }),
  admin_squads: ({ squads = [] }: ScreenRenderContext) => ({
      text: renderScreenLayout("🛰️ Админ-панель: внутренние сквады", {
        summary: [
          renderCodeLine("Найдено сквадов", squads.length),
          "🔄 Сквады подтягиваются из Remnawave через API.",
        ],
        nextStep: [
          squads.length > 0
            ? "↓ Выбери сквад для настройки тарифов."
            : "• Список пока пуст. Нажми синхронизацию.",
        ],
      }),
      replyMarkup: buildSquadsKeyboard(
        squads.map((squad) => ({
          uuid: squad.uuid,
          name: squad.name,
        })),
      ),
    }),
};
