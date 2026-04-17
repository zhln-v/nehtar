import { InlineKeyboard } from "grammy";

import { escapeHtml } from "../../formatters/html.js";
import { isAdminTelegramId } from "../../services/access-service.js";
import { formatMoneyMinor } from "../../services/pricing-format-service.js";
import {
  renderCodeLine,
  renderDate,
  renderPlainLine,
  renderScreenLayout,
  renderSection,
  renderStrongCodeLine,
  renderSubscriptionHeadline,
  renderUserSubscriptionStatus,
  formatTrafficBytes,
} from "../ui/text.js";
import { BACK_BUTTON_TEXT, buildSecondaryKeyboard } from "../ui/keyboards.js";
import type { PurchaseOrders, ScreenRenderContext, UserSubscriptions } from "./types.js";

function buildHomeKeyboard(isAdmin: boolean) {
  const keyboard = new InlineKeyboard()
    .text({ text: "🛒 Оформить подписку", style: "success" }, "nav:catalog")
    .row()
    .text({ text: "📦 Мои подписки", style: "primary" }, "nav:my_subscriptions")
    .text({ text: "💰 Баланс", style: "success" }, "nav:balance")
    .row()
    .text({ text: "🤝 Рефералка", style: "primary" }, "nav:referrals");

  if (isAdmin) {
    keyboard.row().text({ text: "🛠️ Админ-панель", style: "danger" }, "nav:admin");
  }

  return keyboard;
}

function buildCatalogKeyboard(tariffsCountSafe: { id: number; name: string }[]) {
  const keyboard = new InlineKeyboard();

  for (const tariff of tariffsCountSafe) {
    keyboard
      .text({ text: tariff.name, style: "primary" }, `purchase:tariff:${tariff.id}`)
      .row();
  }

  keyboard.text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:home");
  return keyboard;
}

function buildMySubscriptionsKeyboard(subscriptions: UserSubscriptions) {
  const keyboard = new InlineKeyboard()
    .text({ text: "🛒 Оформить подписку", style: "success" }, "nav:catalog")
    .row();

  for (const subscription of subscriptions) {
    const title = subscription.purchaseOrder?.tariff.name ?? "Подписка";
    const traffic = formatTrafficBytes(subscription.remainingTrafficBytes);
    const devices = `${subscription.connectedDeviceCount}/${subscription.deviceLimit}`;

    keyboard
      .text(
        {
          text: `${title} · ${traffic} · ${devices}`,
          style: subscription.expireAt > new Date() ? "primary" : "danger",
        },
        `mysub:open:${subscription.id}`,
      )
      .row();
  }

  keyboard.text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:home");
  return keyboard;
}

function buildBalanceKeyboard() {
  return new InlineKeyboard()
    .text({ text: "➕ Пополнить", style: "success" }, "balance:open_topup")
    .row()
    .text({ text: "🧾 Транзакции", style: "primary" }, "balance:transactions")
    .row()
    .text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:home");
}

function renderMySubscriptionsScreen(
  subscriptions: UserSubscriptions,
  purchaseOrders: PurchaseOrders,
) {
  return {
    text: renderScreenLayout("📦 Мои подписки", {
      nextStep: subscriptions.length > 0
        ? ["Открой нужную подписку кнопкой ниже."]
        : [
            purchaseOrders.length > 0
              ? "Дождись выдачи доступов или проверь заказы у администратора."
              : "Оформи новую подписку через каталог.",
          ],
      sections: subscriptions.length > 0
        ? undefined
        : [[
            purchaseOrders.length > 0
              ? "Покупки уже есть, но доступы в Remnawave еще не выданы."
              : "У тебя пока нет оформленных подписок.",
          ]],
    }),
    replyMarkup: buildMySubscriptionsKeyboard(subscriptions),
  };
}

function renderHelpScreen() {
  return {
    text: renderScreenLayout("О боте", {
      summary: [
        "🤖 Этот бот использует inline-кнопки и редактирование одного сообщения.",
      ],
      nextStep: [
        "↻ Новые экраны открываются через editMessageText, а не через новые сообщения.",
      ],
    }),
    replyMarkup: buildSecondaryKeyboard(),
  };
}

export const rootScreenRegistry = {
  home: ({ user }: ScreenRenderContext) => {
    const isAdmin = isAdminTelegramId(user.telegramId);

    return {
      text: renderScreenLayout("🏠 Главное меню", {
        summary: [
          renderStrongCodeLine("Баланс", formatMoneyMinor(user.balanceMinor, "RUB")),
          renderPlainLine("Имя", user.firstName),
          user.username
            ? renderPlainLine("Telegram", `@${user.username}`)
            : renderCodeLine("Telegram ID", user.telegramId),
          renderPlainLine("Роль", isAdmin ? "администратор" : "пользователь"),
        ],
        nextStep: [
          "🛒 Оформи подписку, проверь действующие доступы, пополни баланс или пригласи друга по реферальной программе.",
        ],
      }),
      replyMarkup: buildHomeKeyboard(isAdmin),
    };
  },
  catalog: ({ tariffs = [] }: ScreenRenderContext) => ({
      text: renderScreenLayout("🛒 Подписка", {
        summary: [
          renderCodeLine("Доступно тарифов", tariffs.length),
        ],
        nextStep: [
          tariffs.length > 0
            ? "↓ Выбери подходящий тариф кнопкой ниже."
            : "• Сейчас нет доступных тарифов.",
        ],
      }),
      replyMarkup: buildCatalogKeyboard(tariffs),
    }),
  balance: ({ user, topUpOrders = [] }: ScreenRenderContext) => ({
      text: renderScreenLayout("💰 Баланс", {
        summary: [
          renderStrongCodeLine("Баланс", formatMoneyMinor(user.balanceMinor, "RUB")),
          renderCodeLine("Транзакций", topUpOrders.length),
        ],
        nextStep: [
          "↓ Выбери действие кнопками ниже.",
        ],
      }),
      replyMarkup: buildBalanceKeyboard(),
    }),
  referrals: ({ pricingSettings, referralSummary }: ScreenRenderContext) => ({
      text: renderScreenLayout("🤝 Реферальная программа", {
        summary: [
          pricingSettings?.referralProgramEnabled
            ? `Получай ${pricingSettings?.referralTopUpRewardPercent ?? 0}% с каждого успешного пополнения приглашенного пользователя.`
            : "Реферальная программа сейчас отключена.",
          ...(referralSummary
            ? [renderStrongCodeLine("Ты уже заработал", formatMoneyMinor(referralSummary.totalRewardMinor, "RUB"))]
            : []),
        ],
        sections: referralSummary
          ? [
              renderSection("💸 Твоя выгода", [
                renderCodeLine("Ставка", `${pricingSettings?.referralTopUpRewardPercent ?? 0}%`),
                renderCodeLine("Приглашено", referralSummary.invitedUsersCount),
                renderCodeLine("С пополнениями", referralSummary.invitedUsersWithTopUpsCount),
                renderCodeLine("Объем пополнений", formatMoneyMinor(referralSummary.totalReferralTopUpMinor, "RUB")),
              ]),
              renderSection("🔗 Твой инвайт", [
                renderCodeLine("Код", referralSummary.referralCode),
                renderPlainLine("Команда", referralSummary.referralCommand),
                ...(referralSummary.referralLink
                  ? [renderPlainLine("Ссылка", referralSummary.referralLink)]
                  : []),
              ]),
              renderSection("⚙️ Как это работает", [
                "1. Друг открывает бота по твоей ссылке.",
                "2. Он пополняет баланс.",
                `3. Ты получаешь ${pricingSettings?.referralTopUpRewardPercent ?? 0}% на свой баланс автоматически.`,
              ]),
              ...(pricingSettings?.referralTermsText
                ? [
                    renderSection(
                      "📋 Условия",
                      pricingSettings.referralTermsText
                        .split(/\r?\n/)
                        .map((line) => line.trim())
                        .filter((line) => line.length > 0),
                    ),
                  ]
                : []),
            ]
          : undefined,
        nextStep: pricingSettings?.referralProgramEnabled
          ? [
              "Поделись ссылкой ниже. Бонус начислится автоматически после пополнения друга.",
            ]
          : [
              "Реферальная программа сейчас отключена администратором.",
            ],
      }),
      replyMarkup: (() => {
        const keyboard = new InlineKeyboard();

        if (referralSummary?.referralLink) {
          keyboard.url(
            "📨 Поделиться ссылкой",
            `https://t.me/share/url?url=${encodeURIComponent(referralSummary.referralLink)}`,
          ).row();
        }

        keyboard.text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:balance");
        return keyboard;
      })(),
    }),
  profile: ({ user }: ScreenRenderContext) => ({
      text: renderScreenLayout("👤 Профиль", {
        summary: [
          renderPlainLine("Имя", user.firstName),
          renderPlainLine("Фамилия", user.lastName ?? "не указана"),
          renderPlainLine("Username", user.username ? `@${user.username}` : "не указан"),
          renderPlainLine("Язык", user.languageCode ?? "не указан"),
        ],
        sections: [
          renderSection("🪪 Служебные данные", [
            renderCodeLine("Внутренний ID", user.id),
            renderCodeLine("Telegram ID", user.telegramId),
          ]),
        ],
      }),
      replyMarkup: buildSecondaryKeyboard(),
    }),
  my_subscriptions: ({ subscriptions = [], purchaseOrders = [] }: ScreenRenderContext) =>
    renderMySubscriptionsScreen(subscriptions, purchaseOrders),
  help: () => renderHelpScreen(),
  admin: () => ({
      text: renderScreenLayout("🛠️ Админ-панель", {
        sections: [
          renderSection("👥 Пользователи", [
            "Активность, покупки, подписки и рефералы.",
          ]),
          renderSection("⚙️ Система", [
            "Рассылки и служебное состояние бота.",
          ]),
          renderSection("💳 Коммерция", [
            "Тарифы, рефералка и внутренние сквады.",
          ]),
        ],
        nextStep: [
          "↓ Выбери нужный раздел кнопками ниже.",
        ],
      }),
      replyMarkup: new InlineKeyboard()
        .text({ text: "👥 Пользователи", style: "primary" }, "nav:admin_users")
        .text({ text: "⚙️ Система", style: "success" }, "nav:admin_system")
        .row()
        .text({ text: "💳 Тарифы", style: "primary" }, "nav:admin_tariffs")
        .text({ text: "🤝 Рефералка", style: "success" }, "nav:admin_referrals")
        .row()
        .text({ text: "🛰️ Сквады", style: "success" }, "nav:admin_squads")
        .row()
        .text({ text: BACK_BUTTON_TEXT, style: "danger" }, "nav:home"),
    }),
};
