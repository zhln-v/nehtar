import type { Bot } from "grammy";

import { adminScreenRegistry } from "../../navigation/screens/admin.js";
import {
  renderAdminBroadcastMessagePrompt,
  renderAdminBroadcastPreviewScreen,
  renderAdminBroadcastResultScreen,
  renderAdminUserDetailsScreen,
  renderAdminUserSearchPrompt,
  renderAdminUserReferralsScreen,
  renderAdminUserSubscriptionScreen,
  renderAdminUserSubscriptionsScreen,
  renderAdminUserTransactionsScreen,
} from "../../navigation/screens/admin.js";
import {
  renderBalancePurchaseTransactionScreen,
  renderBalanceTopUpTransactionScreen,
  renderReferralRewardTransactionScreen,
  renderReferralTermsInputPrompt,
} from "../../navigation/cards.js";
import { showRenderedScreen } from "../../navigation/screens/presenter.js";
import { openScreenFromCallback } from "../../navigation/screens/presenter.js";
import { resolveScreen } from "../../navigation/screens/resolver.js";
import {
  getAdminBalancePurchaseOrderById,
  getAdminReferralRewardById,
  getAdminUserDetails,
  getAdminUserListPage,
  getAdminUserReferralPage,
  getAdminUserSubscriptionById,
  getAdminUserSubscriptionsPage,
  getAdminUserTransactionsPage,
} from "../../services/admin-service.js";
import {
  getBillingSettings,
  incrementFreeDevices,
  incrementPaidDeviceDailyPrice,
  incrementReferralTopUpRewardPercent,
  incrementTrafficPrice,
  toggleReferralProgram,
  toggleTrafficBilling,
  updateReferralTermsText,
} from "../../services/billing-settings-service.js";
import {
  countBroadcastRecipients,
  formatBroadcastAudienceLabel,
  isBroadcastAudience,
  sendBroadcast,
  type BroadcastAudience,
} from "../../services/broadcast-service.js";
import {
  clearAdminInputSession,
  getAdminInputSession,
  setAdminInputSession,
} from "../../services/admin-input-session-service.js";
import { isAdminTelegramId } from "../../services/access-service.js";
import { safeAnswerCallbackQuery } from "../../services/telegram-callback-service.js";
import { getTelegramUserByTelegramId } from "../../services/telegram-user-service.js";
import { clearUserInputSession } from "../../services/user-input-session-service.js";
import { showRenderedScreenFromCallback } from "../tariffs/presentation.js";
import {
  getBalanceTopUpOrderById,
} from "../../services/purchase-service.js";

function isAdminContext(ctx: { from?: { id: number } | undefined }) {
  return Boolean(ctx.from && isAdminTelegramId(BigInt(ctx.from.id)));
}

type AdminBroadcastDraft = {
  audience: BroadcastAudience;
  message?: string;
};

function serializeAdminBroadcastDraft(draft: AdminBroadcastDraft) {
  return JSON.stringify(draft);
}

function parseAdminBroadcastDraft(raw: string | null | undefined): AdminBroadcastDraft | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { audience?: string; message?: string };

    if (!parsed || !isBroadcastAudience(parsed.audience ?? "")) {
      return null;
    }

    return {
      audience: parsed.audience as BroadcastAudience,
      ...(typeof parsed.message === "string" ? { message: parsed.message } : {}),
    };
  } catch {
    return null;
  }
}

function renderAdminUsersListScreen(
  user: NonNullable<Awaited<ReturnType<typeof getTelegramUserByTelegramId>>>,
  pageData: Awaited<ReturnType<typeof getAdminUserListPage>>,
) {
  return adminScreenRegistry.admin_users({
    user,
    adminUsersPage: pageData,
  });
}

export function registerAdminHandlers(bot: Bot) {
  bot.callbackQuery(/^adminusers:noop$/, async (ctx) => {
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^adminusers:page:(\d+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const telegramId = BigInt(ctx.from.id);
    const session = await getAdminInputSession(telegramId);
    const query =
      session?.kind === "admin_users_search_results" ? (session.textValue ?? undefined) : undefined;
    const pageData = await getAdminUserListPage(Number(ctx.match[1]), 8, query);
    const user = await getTelegramUserByTelegramId(telegramId);

    if (!user) {
      await safeAnswerCallbackQuery(ctx, { text: "Пользователь не найден", show_alert: false });
      return;
    }

    await showRenderedScreenFromCallback(
      ctx,
      renderAdminUsersListScreen(user, pageData),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^adminusers:search$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const telegramId = BigInt(ctx.from.id);
    const [user, session] = await Promise.all([
      getTelegramUserByTelegramId(telegramId),
      getAdminInputSession(telegramId),
    ]);

    if (!user) {
      await safeAnswerCallbackQuery(ctx, { text: "Пользователь не найден", show_alert: false });
      return;
    }

    await clearUserInputSession(telegramId);
    await setAdminInputSession(telegramId, {
      kind: "admin_users_search_prompt",
      textValue:
        session?.kind === "admin_users_search_results" ? (session.textValue ?? undefined) : undefined,
    });
    await showRenderedScreen(bot, user, renderAdminUserSearchPrompt(session?.textValue ?? null));
    await safeAnswerCallbackQuery(ctx, { text: "Жду ввод в чат", show_alert: false });
  });

  bot.callbackQuery(/^adminusers:clear_search$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    await clearAdminInputSession(BigInt(ctx.from.id));
    await openScreenFromCallback(ctx, "admin_users");
  });

  bot.callbackQuery(/^adminusers:open:(\d+):(\d+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const details = await getAdminUserDetails(Number(ctx.match[1]));

    if (!details) {
      await safeAnswerCallbackQuery(ctx, { text: "Пользователь не найден", show_alert: false });
      return;
    }

    await showRenderedScreenFromCallback(
      ctx,
      renderAdminUserDetailsScreen(details, Number(ctx.match[2])),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^adminusers:subscriptions:(\d+):(\d+):(\d+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const userId = Number(ctx.match[1]);
    const parentPage = Number(ctx.match[2]);
    const page = Number(ctx.match[3]);
    const [targetUser, subscriptionsPage] = await Promise.all([
      getAdminUserDetails(userId),
      getAdminUserSubscriptionsPage(userId, page, 8),
    ]);

    if (!targetUser) {
      await safeAnswerCallbackQuery(ctx, { text: "Пользователь не найден", show_alert: false });
      return;
    }

    await showRenderedScreenFromCallback(
      ctx,
      renderAdminUserSubscriptionsScreen(targetUser, subscriptionsPage, parentPage),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^adminusers:subscription_open:(\d+):(\d+):(\d+):(\d+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const userId = Number(ctx.match[1]);
    const parentPage = Number(ctx.match[2]);
    const listPage = Number(ctx.match[3]);
    const subscriptionId = Number(ctx.match[4]);
    const [targetUser, subscription] = await Promise.all([
      getAdminUserDetails(userId),
      getAdminUserSubscriptionById(userId, subscriptionId),
    ]);

    if (!targetUser || !subscription) {
      await safeAnswerCallbackQuery(ctx, { text: "Подписка не найдена", show_alert: false });
      return;
    }

    await showRenderedScreenFromCallback(
      ctx,
      renderAdminUserSubscriptionScreen(targetUser, subscription, parentPage, listPage),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^adminusers:transactions:(\d+):(\d+):(\d+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const userId = Number(ctx.match[1]);
    const parentPage = Number(ctx.match[2]);
    const page = Number(ctx.match[3]);
    const [targetUser, transactionsPage] = await Promise.all([
      getAdminUserDetails(userId),
      getAdminUserTransactionsPage(userId, page, 8),
    ]);

    if (!targetUser) {
      await safeAnswerCallbackQuery(ctx, { text: "Пользователь не найден", show_alert: false });
      return;
    }

    await showRenderedScreenFromCallback(
      ctx,
      renderAdminUserTransactionsScreen(targetUser, transactionsPage, parentPage),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^adminusers:tx:(topup|purchase|referral_reward):(\d+):([^:]+):(\d+):(\d+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const kind = ctx.match[1];
    const userId = Number(ctx.match[2]);
    const transactionId = ctx.match[3];
    const parentPage = Number(ctx.match[4]);
    const listPage = Number(ctx.match[5]);
    const backCallback = `adminusers:transactions:${userId}:${parentPage}:${listPage}`;

    if (!transactionId) {
      await safeAnswerCallbackQuery(ctx, { text: "Транзакция не найдена", show_alert: false });
      return;
    }

    if (kind === "topup") {
      const order = await getBalanceTopUpOrderById(transactionId);

      if (!order || order.telegramUserId !== userId) {
        await safeAnswerCallbackQuery(ctx, { text: "Транзакция не найдена", show_alert: false });
        return;
      }

      await showRenderedScreenFromCallback(
        ctx,
        renderBalanceTopUpTransactionScreen(order, listPage, backCallback),
      );
      await safeAnswerCallbackQuery(ctx);
      return;
    }

    if (kind === "referral_reward") {
      const reward = await getAdminReferralRewardById(Number(transactionId));

      if (!reward || reward.referrerUserId !== userId) {
        await safeAnswerCallbackQuery(ctx, { text: "Транзакция не найдена", show_alert: false });
        return;
      }

      await showRenderedScreenFromCallback(
        ctx,
        renderReferralRewardTransactionScreen(reward, listPage, backCallback),
      );
      await safeAnswerCallbackQuery(ctx);
      return;
    }

    const order = await getAdminBalancePurchaseOrderById(transactionId);

    if (!order || order.telegramUserId !== userId || order.provider !== "BALANCE") {
      await safeAnswerCallbackQuery(ctx, { text: "Транзакция не найдена", show_alert: false });
      return;
    }

    await showRenderedScreenFromCallback(
      ctx,
      renderBalancePurchaseTransactionScreen(order, listPage, backCallback),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^adminusers:referrals:(\d+):(\d+):(\d+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const userId = Number(ctx.match[1]);
    const parentPage = Number(ctx.match[2]);
    const page = Number(ctx.match[3]);
    const [targetUser, referralsPage] = await Promise.all([
      getAdminUserDetails(userId),
      getAdminUserReferralPage(userId, page, 8),
    ]);

    if (!targetUser) {
      await safeAnswerCallbackQuery(ctx, { text: "Пользователь не найден", show_alert: false });
      return;
    }

    await showRenderedScreenFromCallback(
      ctx,
      renderAdminUserReferralsScreen(targetUser, referralsPage, parentPage),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^adminbroadcast:audience:(all_private|subscribers|without_subscriptions)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const telegramId = BigInt(ctx.from.id);
    const user = await getTelegramUserByTelegramId(telegramId);
    const audience = ctx.match[1] as BroadcastAudience;

    if (!user) {
      await safeAnswerCallbackQuery(ctx, { text: "Пользователь не найден", show_alert: false });
      return;
    }

    await clearUserInputSession(telegramId);
    await setAdminInputSession(telegramId, {
      kind: "admin_broadcast_message_prompt",
      textValue: serializeAdminBroadcastDraft({ audience }),
    });
    await showRenderedScreen(bot, user, renderAdminBroadcastMessagePrompt(audience));
    await safeAnswerCallbackQuery(ctx, {
      text: `Жду текст для аудитории: ${formatBroadcastAudienceLabel(audience)}`,
      show_alert: false,
    });
  });

  bot.callbackQuery(/^adminbroadcast:edit$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const telegramId = BigInt(ctx.from.id);
    const [user, session] = await Promise.all([
      getTelegramUserByTelegramId(telegramId),
      getAdminInputSession(telegramId),
    ]);
    const draft = parseAdminBroadcastDraft(session?.textValue);

    if (!user || session?.kind !== "admin_broadcast_preview" || !draft) {
      await safeAnswerCallbackQuery(ctx, { text: "Черновик рассылки не найден", show_alert: false });
      return;
    }

    await setAdminInputSession(telegramId, {
      kind: "admin_broadcast_message_prompt",
      textValue: serializeAdminBroadcastDraft(draft),
    });
    await showRenderedScreen(
      bot,
      user,
      renderAdminBroadcastMessagePrompt(draft.audience, draft.message ?? null),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^adminbroadcast:send$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const telegramId = BigInt(ctx.from.id);
    const session = await getAdminInputSession(telegramId);
    const draft = parseAdminBroadcastDraft(session?.textValue);

    if (session?.kind !== "admin_broadcast_preview" || !draft?.message) {
      await safeAnswerCallbackQuery(ctx, { text: "Черновик рассылки не найден", show_alert: false });
      return;
    }

    const result = await sendBroadcast(bot, draft.audience, draft.message);
    await clearAdminInputSession(telegramId);

    const user = await getTelegramUserByTelegramId(telegramId);

    if (user) {
      await showRenderedScreen(
        bot,
        user,
        renderAdminBroadcastResultScreen(result),
      );
    }

    await safeAnswerCallbackQuery(ctx, { text: "Рассылка завершена", show_alert: false });
  });

  bot.callbackQuery(/^pricing:(.+)$/, async (ctx) => {
    if (!isAdminContext(ctx)) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно прав", show_alert: true });
      return;
    }

    const action = ctx.match[1];

    switch (action) {
      case "free_devices:dec":
        await incrementFreeDevices(-1);
        await openScreenFromCallback(ctx, "admin_pricing_free");
        return;
      case "free_devices:inc":
        await incrementFreeDevices(1);
        await openScreenFromCallback(ctx, "admin_pricing_free");
        return;
      case "device_daily:dec":
        await incrementPaidDeviceDailyPrice(-1000);
        await openScreenFromCallback(ctx, "admin_pricing_devices");
        return;
      case "device_daily:inc":
        await incrementPaidDeviceDailyPrice(1000);
        await openScreenFromCallback(ctx, "admin_pricing_devices");
        return;
      case "traffic_toggle":
        await toggleTrafficBilling();
        await openScreenFromCallback(ctx, "admin_pricing_traffic");
        return;
      case "traffic_price:dec":
        await incrementTrafficPrice(-500);
        await openScreenFromCallback(ctx, "admin_pricing_traffic");
        return;
      case "traffic_price:inc":
        await incrementTrafficPrice(500);
        await openScreenFromCallback(ctx, "admin_pricing_traffic");
        return;
      case "referral_toggle":
        await toggleReferralProgram();
        await openScreenFromCallback(ctx, "admin_referrals");
        return;
      case "referral_percent:dec":
        await incrementReferralTopUpRewardPercent(-1);
        await openScreenFromCallback(ctx, "admin_referrals");
        return;
      case "referral_percent:inc":
        await incrementReferralTopUpRewardPercent(1);
        await openScreenFromCallback(ctx, "admin_referrals");
        return;
      case "referral_terms": {
        const [user, settings] = await Promise.all([
          getTelegramUserByTelegramId(BigInt(ctx.from.id)),
          getBillingSettings(),
        ]);

        if (!user) {
          await safeAnswerCallbackQuery(ctx, { text: "Пользователь не найден", show_alert: false });
          return;
        }

        await clearUserInputSession(BigInt(ctx.from.id));
        await setAdminInputSession(BigInt(ctx.from.id), {
          kind: "billing_referral_terms",
        });
        await showRenderedScreen(
          bot,
          user,
          renderReferralTermsInputPrompt(settings.referralTermsText),
        );
        await safeAnswerCallbackQuery(ctx, { text: "Жду ввод в чат", show_alert: false });
        return;
      }
      default:
        await safeAnswerCallbackQuery(ctx, { text: "Неизвестное действие тарифов", show_alert: false });
    }
  });
}

export async function handleAdminTextInput(
  bot: Bot,
  telegramId: bigint,
  input: string,
) {
  const session = await getAdminInputSession(telegramId);

  if (!session) {
    return false;
  }

  const [user, settings] = await Promise.all([
    getTelegramUserByTelegramId(telegramId),
    getBillingSettings(),
  ]);

  if (!user) {
    await clearAdminInputSession(telegramId);
    return true;
  }

  if (session.kind === "admin_users_search_prompt") {
    const nextQuery = input === "-" ? "" : input.trim();

    if (nextQuery.length > 0 && nextQuery.length < 2) {
      await showRenderedScreen(
        bot,
        user,
        renderAdminUserSearchPrompt(
          session.textValue ?? null,
          "Запрос должен содержать хотя бы 2 символа",
        ),
      );
      return true;
    }

    if (!nextQuery) {
      await clearAdminInputSession(telegramId);
      await showRenderedScreen(bot, user, await resolveScreen(user, "admin_users"));
      return true;
    }

    await setAdminInputSession(telegramId, {
      kind: "admin_users_search_results",
      textValue: nextQuery,
    });
    await showRenderedScreen(
      bot,
      user,
      renderAdminUsersListScreen(user, await getAdminUserListPage(1, 8, nextQuery)),
    );
    return true;
  }

  if (session.kind === "admin_broadcast_message_prompt") {
    const draft = parseAdminBroadcastDraft(session.textValue);

    if (!draft) {
      await clearAdminInputSession(telegramId);
      await showRenderedScreen(bot, user, await resolveScreen(user, "admin_broadcast"));
      return true;
    }

    const message = input === "-" ? "" : input.trim();

    if (!message) {
      await clearAdminInputSession(telegramId);
      await showRenderedScreen(bot, user, await resolveScreen(user, "admin_broadcast"));
      return true;
    }

    if (message.length < 3) {
      await showRenderedScreen(
        bot,
        user,
        renderAdminBroadcastMessagePrompt(
          draft.audience,
          draft.message ?? null,
          "Сообщение слишком короткое",
        ),
      );
      return true;
    }

    const recipientCount = await countBroadcastRecipients(draft.audience);
    const nextDraft = {
      ...draft,
      message,
    };

    await setAdminInputSession(telegramId, {
      kind: "admin_broadcast_preview",
      textValue: serializeAdminBroadcastDraft(nextDraft),
    });
    await showRenderedScreen(
      bot,
      user,
      renderAdminBroadcastPreviewScreen({
        audience: draft.audience,
        recipientCount,
        message,
      }),
    );
    return true;
  }

  if (session.kind !== "billing_referral_terms") {
    return false;
  }

  const nextValue = input === "-" ? null : input.trim();

  if (nextValue !== null && nextValue.length < 12) {
    await showRenderedScreen(
      bot,
      user,
      renderReferralTermsInputPrompt(
        settings.referralTermsText,
        "Текст условий должен быть хотя бы немного содержательным",
      ),
    );
    return true;
  }

  await updateReferralTermsText(nextValue);
  await clearAdminInputSession(telegramId);

  const updatedUser = await getTelegramUserByTelegramId(telegramId);

  if (updatedUser) {
    await showRenderedScreen(
      bot,
      updatedUser,
      await resolveScreen(updatedUser, "admin_referrals"),
    );
  }

  return true;
}
