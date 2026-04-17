import type { Bot, Context } from "grammy";

import { config } from "../../config.js";
import {
  renderBalanceAmountInputPrompt,
  renderBalancePurchaseTransactionScreen,
  renderReferralRewardTransactionScreen,
  renderBalanceTopUpOptionsScreen,
  renderBalanceTopUpTransactionScreen,
  renderRenewCheckoutScreen,
  renderRenewTariffScreen,
  renderRenewTermsScreen,
  renderBalanceTopUpScreen,
  renderBalanceTransactionsScreen,
  renderBalanceYooKassaOrderScreen,
  renderPurchaseCheckoutScreen,
  renderPurchaseTariffScreen,
  renderPurchaseTermsScreen,
  renderSubscriptionDevicePurchaseScreen,
  renderSubscriptionDevicesScreen,
  renderUserSubscriptionScreen,
  renderYooKassaOrderScreen,
} from "../../navigation/cards.js";
import {
  BALANCE_TOP_UP_MAX_MINOR,
  BALANCE_TOP_UP_MIN_MINOR,
  createPaidDeviceUpgradeOrderFromBalanceAndTouchUser,
  createPaidPurchaseOrderFromBalanceAndTouchUser,
  createBalanceTopUpOrderAndTouchUser,
  createYooKassaBalanceTopUpPayment,
  calculatePurchasePricing,
  getBalanceTopUpOrderByInvoicePayload,
  getBalanceTopUpOrderById,
  getUserBalancePurchaseOrderById,
  getUserBalanceTopUpOrderById,
  getUserBalanceTransactionPage,
  parseTransactionMetadata,
  getPurchaseOrderByInvoicePayload,
  markBalanceTopUpPaidByInvoicePayload,
  markPurchaseOrderPaidByInvoicePayload,
  refreshYooKassaBalanceTopUpStatus,
  refreshYooKassaOrderStatus,
  updateBalanceTopUpOrderMetadata,
} from "../../services/purchase-service.js";
import { getUserReferralRewardById } from "../../services/referral-service.js";
import {
  getUserRemnawaveAccountById,
  getRemnawaveUserDeviceState,
  provisionPurchaseOrderToRemnawave,
} from "../../services/remnawave-users-service.js";
import { getActiveTariffById } from "../../services/tariff-service.js";
import { safeAnswerCallbackQuery } from "../../services/telegram-callback-service.js";
import { getTelegramUserByTelegramId } from "../../services/telegram-user-service.js";
import {
  clearUserInputSession,
  getUserInputSession,
  setUserInputSession,
} from "../../services/user-input-session-service.js";
import { clearAdminInputSession as clearAdminSession } from "../../services/admin-input-session-service.js";
import { showRenderedScreenFromCallback } from "../tariffs/presentation.js";
import { showRenderedScreen } from "../../navigation/screens/presenter.js";
import { openScreenFromCallback } from "../../navigation/screens/presenter.js";

function getSelectedPeriod(tariff: NonNullable<Awaited<ReturnType<typeof getActiveTariffById>>>, tariffPeriodId: number) {
  return tariff.periods.find((period) => period.id === tariffPeriodId) ?? null;
}

async function getCheckoutContext(
  telegramId: bigint,
  tariffId: number,
  tariffPeriodId: number,
  extraDeviceCount: number,
) {
  const [user, tariff] = await Promise.all([
    getTelegramUserByTelegramId(telegramId),
    getActiveTariffById(tariffId),
  ]);

  if (!user || !tariff) {
    return null;
  }

  const tariffPeriod = getSelectedPeriod(tariff, tariffPeriodId);

  if (!tariffPeriod) {
    return null;
  }

  const pricing = calculatePurchasePricing({
    tariff,
    tariffPeriod,
    extraDeviceCount,
  });

  return {
    user,
    tariff,
    tariffPeriod,
    pricing,
  };
}

async function processTopUpFollowUp(
  orderId: string,
) {
  const topUpOrder = await getBalanceTopUpOrderById(orderId);

  if (!topUpOrder?.telegramUser) {
    return null;
  }

  const metadata = parseTransactionMetadata(topUpOrder.metadataJson ?? null);

  if (typeof metadata.postTopUpProcessedAt === "string") {
    return null;
  }

  const action =
    typeof metadata.postTopUpAction === "string" ? metadata.postTopUpAction : null;

  if (!action) {
    return null;
  }

  if (action === "purchase" || action === "renewal") {
    const tariff = await getActiveTariffById(Number(metadata.tariffId));

    if (!tariff) {
      return null;
    }

    const tariffPeriod = tariff.periods.find((period) => period.id === Number(metadata.tariffPeriodId));

    if (!tariffPeriod) {
      return null;
    }

    const order = await createPaidPurchaseOrderFromBalanceAndTouchUser(
      topUpOrder.telegramUser,
      tariff,
      tariffPeriod,
      Number(metadata.extraDeviceCount ?? 0),
      action === "renewal"
        ? {
            metadata: {
              renewalAccountId: Number(metadata.renewalAccountId),
            },
          }
        : undefined,
    );

    await provisionPurchaseOrderToRemnawave(order.id);
    await updateBalanceTopUpOrderMetadata(topUpOrder.id, {
      ...metadata,
      postTopUpProcessedAt: new Date().toISOString(),
      postTopUpPurchaseOrderId: order.id,
    });

    return { kind: action, purchaseOrderId: order.id };
  }

  if (action === "device_upgrade") {
    const subscription = await getUserRemnawaveAccountById(
      topUpOrder.telegramUser.id,
      Number(metadata.subscriptionId),
    );

    if (!subscription?.purchaseOrder?.tariff || !subscription.purchaseOrder.tariffPeriod) {
      return null;
    }

    const deviceState = await getRemnawaveUserDeviceState(subscription.remnawaveUuid);
    const includedDevices = subscription.purchaseOrder.tariff.freeDevicesPerUser;
    const currentExtraDevices = Math.max(0, deviceState.deviceLimit - includedDevices);
    const targetExtraDevices = Math.max(currentExtraDevices, Number(metadata.targetExtraDeviceCount));
    const extraDevicesToAdd = targetExtraDevices - currentExtraDevices;
    const remainingDays = Math.max(
      1,
      Math.ceil((subscription.expireAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    );

    if (extraDevicesToAdd <= 0) {
      return null;
    }

    const order = await createPaidDeviceUpgradeOrderFromBalanceAndTouchUser({
      user: topUpOrder.telegramUser,
      tariffId: subscription.purchaseOrder.tariffId,
      tariffPeriodId: subscription.purchaseOrder.tariffPeriodId,
      currencyCode: subscription.purchaseOrder.currencyCode,
      deviceDailyPriceMinor: subscription.purchaseOrder.tariff.deviceDailyPriceMinor,
      remainingDays,
      purchasedExtraDeviceCount: extraDevicesToAdd,
      targetExtraDeviceCount: targetExtraDevices,
      subscriptionId: subscription.id,
    });

    await provisionPurchaseOrderToRemnawave(order.id);
    await updateBalanceTopUpOrderMetadata(topUpOrder.id, {
      ...metadata,
      postTopUpProcessedAt: new Date().toISOString(),
      postTopUpPurchaseOrderId: order.id,
    });

    return { kind: action, purchaseOrderId: order.id };
  }

  return null;
}

export function registerPurchaseHandlers(bot: Bot) {
  bot.callbackQuery(/^balance:transactions:noop$/, async (ctx) => {
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^balance:open_topup$/, async (ctx) => {
    await clearAdminSession(BigInt(ctx.from.id));
    await setUserInputSession(BigInt(ctx.from.id), "balance_top_up_amount");
    await showRenderedScreenFromCallback(ctx, renderBalanceTopUpOptionsScreen());
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^balance:transactions$/, async (ctx) => {
    const user = await getTelegramUserByTelegramId(BigInt(ctx.from.id));

    if (!user) {
      await safeAnswerCallbackQuery(ctx, { text: "Пользователь не найден", show_alert: false });
      return;
    }

    const transactions = await getUserBalanceTransactionPage(user.id, 1, 8);

    await showRenderedScreenFromCallback(ctx, renderBalanceTransactionsScreen(transactions));
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^balance:transactions:(\d+)$/, async (ctx) => {
    const user = await getTelegramUserByTelegramId(BigInt(ctx.from.id));

    if (!user) {
      await safeAnswerCallbackQuery(ctx, { text: "Пользователь не найден", show_alert: false });
      return;
    }

    const page = Number(ctx.match[1]);
    const transactions = await getUserBalanceTransactionPage(user.id, page, 8);

    await showRenderedScreenFromCallback(ctx, renderBalanceTransactionsScreen(transactions));
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^balance:tx:(topup|purchase|referral_reward):([^:]+):(\d+)$/, async (ctx) => {
    const user = await getTelegramUserByTelegramId(BigInt(ctx.from.id));

    if (!user) {
      await safeAnswerCallbackQuery(ctx, { text: "Пользователь не найден", show_alert: false });
      return;
    }

    const kind = ctx.match[1];
    const transactionId = ctx.match[2];
    const page = Number(ctx.match[3]);

    if (!transactionId) {
      await safeAnswerCallbackQuery(ctx, { text: "Транзакция не найдена", show_alert: false });
      return;
    }

    if (kind === "topup") {
      const order = await getUserBalanceTopUpOrderById(user.id, transactionId);

      if (!order) {
        await safeAnswerCallbackQuery(ctx, { text: "Транзакция не найдена", show_alert: false });
        return;
      }

      await showRenderedScreenFromCallback(
        ctx,
        renderBalanceTopUpTransactionScreen(order, page),
      );
      await safeAnswerCallbackQuery(ctx);
      return;
    }

    if (kind === "referral_reward") {
      const reward = await getUserReferralRewardById(user.id, Number(transactionId));

      if (!reward) {
        await safeAnswerCallbackQuery(ctx, { text: "Транзакция не найдена", show_alert: false });
        return;
      }

      await showRenderedScreenFromCallback(
        ctx,
        renderReferralRewardTransactionScreen(reward, page),
      );
      await safeAnswerCallbackQuery(ctx);
      return;
    }

    const order = await getUserBalancePurchaseOrderById(user.id, transactionId);

    if (!order) {
      await safeAnswerCallbackQuery(ctx, { text: "Транзакция не найдена", show_alert: false });
      return;
    }

    await showRenderedScreenFromCallback(
      ctx,
      renderBalancePurchaseTransactionScreen(order, page),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^balance:amount:(\d+)$/, async (ctx) => {
    const amountMinor = Number(ctx.match[1]);

    if (amountMinor < BALANCE_TOP_UP_MIN_MINOR || amountMinor > BALANCE_TOP_UP_MAX_MINOR) {
      await safeAnswerCallbackQuery(ctx, { text: "Сумма пополнения вне лимита", show_alert: false });
      return;
    }

    await clearUserInputSession(BigInt(ctx.from.id));

    await showRenderedScreenFromCallback(
      ctx,
      renderBalanceTopUpScreen(
        amountMinor,
        Boolean(config.YOOKASSA_SHOP_ID && config.YOOKASSA_SECRET_KEY),
      ),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^balance:stars:(\d+)$/, async (ctx) => {
    const user = await getTelegramUserByTelegramId(BigInt(ctx.from.id));
    const amountMinor = Number(ctx.match[1]);

    if (
      !user ||
      amountMinor < BALANCE_TOP_UP_MIN_MINOR ||
      amountMinor > BALANCE_TOP_UP_MAX_MINOR
    ) {
      await safeAnswerCallbackQuery(ctx, { text: "Пополнение недоступно", show_alert: false });
      return;
    }

    const order = await createBalanceTopUpOrderAndTouchUser(user, amountMinor, "STARS");

    await ctx.api.sendInvoice(
      ctx.chat!.id,
      "Пополнение баланса",
      `Зачисление ${(amountMinor / 100).toFixed(2)} RUB на баланс`,
      order.invoicePayload!,
      "XTR",
      [{ label: "Пополнение баланса", amount: order.amountStars! }],
    );

    await safeAnswerCallbackQuery(ctx, { text: "Инвойс отправлен", show_alert: false });
  });

  bot.callbackQuery(/^purchase:topup_pay:(stars|sbp):(\d+):(\d+):(\d+)$/, async (ctx) => {
    const user = await getTelegramUserByTelegramId(BigInt(ctx.from.id));
    const provider = ctx.match[1] === "stars" ? "STARS" : "YOOKASSA";
    const checkout = await getCheckoutContext(
      BigInt(ctx.from.id),
      Number(ctx.match[2]),
      Number(ctx.match[3]),
      Number(ctx.match[4]),
    );

    if (!user || !checkout) {
      await safeAnswerCallbackQuery(ctx, { text: "Пополнение недоступно", show_alert: false });
      return;
    }

    const shortfallMinor = Math.max(0, checkout.pricing.totalPriceMinor - checkout.user.balanceMinor);
    const order = await createBalanceTopUpOrderAndTouchUser(user, shortfallMinor, provider, {
      metadata: {
        postTopUpAction: "purchase",
        tariffId: checkout.tariff.id,
        tariffPeriodId: checkout.tariffPeriod.id,
        extraDeviceCount: checkout.pricing.extraDeviceCount,
      },
    });

    if (provider === "STARS") {
      await ctx.api.sendInvoice(
        ctx.chat!.id,
        "Пополнение баланса",
        `Зачисление ${(shortfallMinor / 100).toFixed(2)} RUB на баланс`,
        order.invoicePayload!,
        "XTR",
        [{ label: "Пополнение баланса", amount: order.amountStars! }],
      );
      await safeAnswerCallbackQuery(ctx, { text: "Инвойс отправлен", show_alert: false });
      return;
    }

    const updatedOrder = await createYooKassaBalanceTopUpPayment(order);
    await showRenderedScreenFromCallback(ctx, renderBalanceYooKassaOrderScreen(updatedOrder));
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^balance:yookassa:(\d+)$/, async (ctx) => {
    const user = await getTelegramUserByTelegramId(BigInt(ctx.from.id));
    const amountMinor = Number(ctx.match[1]);

    if (
      !user ||
      amountMinor < BALANCE_TOP_UP_MIN_MINOR ||
      amountMinor > BALANCE_TOP_UP_MAX_MINOR
    ) {
      await safeAnswerCallbackQuery(ctx, { text: "Пополнение недоступно", show_alert: false });
      return;
    }

    const order = await createBalanceTopUpOrderAndTouchUser(user, amountMinor, "YOOKASSA");
    const updatedOrder = await createYooKassaBalanceTopUpPayment(order);

    await showRenderedScreenFromCallback(ctx, renderBalanceYooKassaOrderScreen(updatedOrder));
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^balance:yookassa_check:(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];

    if (!orderId) {
      await safeAnswerCallbackQuery(ctx, { text: "Заказ не найден", show_alert: false });
      return;
    }

    const order = await refreshYooKassaBalanceTopUpStatus(orderId);

    if (!order) {
      await safeAnswerCallbackQuery(ctx, { text: "Заказ не найден", show_alert: false });
      return;
    }

    const followUp =
      order.status === "PAID"
        ? await processTopUpFollowUp(order.id)
        : null;

    await showRenderedScreenFromCallback(ctx, renderBalanceYooKassaOrderScreen(order));
    await safeAnswerCallbackQuery(ctx, {
      text: order.status === "PAID"
        ? followUp
          ? "Баланс пополнен, операция завершена"
          : "Баланс пополнен"
        : "Статус обновлен",
      show_alert: false,
    });
  });

  bot.callbackQuery(/^purchase:tariff:(\d+)$/, async (ctx) => {
    const tariff = await getActiveTariffById(Number(ctx.match[1]));

    if (!tariff) {
      await safeAnswerCallbackQuery(ctx, { text: "Тариф недоступен", show_alert: false });
      return;
    }

    await showRenderedScreenFromCallback(ctx, renderPurchaseTariffScreen(tariff));
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^mysub:renew:(\d+)$/, async (ctx) => {
    const user = await getTelegramUserByTelegramId(BigInt(ctx.from.id));

    if (!user) {
      await safeAnswerCallbackQuery(ctx, { text: "Пользователь не найден", show_alert: false });
      return;
    }

    const subscription = await getUserRemnawaveAccountById(user.id, Number(ctx.match[1]));

    if (!subscription?.purchaseOrder) {
      await safeAnswerCallbackQuery(ctx, { text: "Продление недоступно", show_alert: false });
      return;
    }

    const tariff = await getActiveTariffById(subscription.purchaseOrder.tariffId);

    if (!tariff) {
      await safeAnswerCallbackQuery(ctx, { text: "Тариф недоступен", show_alert: false });
      return;
    }

    const initialExtraDeviceCount = Math.max(0, subscription.purchaseOrder.extraDeviceCount);

    await showRenderedScreenFromCallback(
      ctx,
      renderRenewTariffScreen(subscription, tariff, initialExtraDeviceCount),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^renew:terms:(\d+):(\d+):(\d+):(\d+)$/, async (ctx) => {
    const user = await getTelegramUserByTelegramId(BigInt(ctx.from.id));

    if (!user) {
      await safeAnswerCallbackQuery(ctx, { text: "Пользователь не найден", show_alert: false });
      return;
    }

    const subscription = await getUserRemnawaveAccountById(user.id, Number(ctx.match[1]));
    const checkout = await getCheckoutContext(
      BigInt(ctx.from.id),
      Number(ctx.match[2]),
      Number(ctx.match[3]),
      Number(ctx.match[4]),
    );

    if (!subscription || !checkout) {
      await safeAnswerCallbackQuery(ctx, { text: "Не удалось открыть условия", show_alert: false });
      return;
    }

    await showRenderedScreenFromCallback(
      ctx,
      renderRenewTermsScreen(
        subscription,
        checkout.tariff,
        checkout.tariffPeriod,
        checkout.pricing,
      ),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^renew:checkout:(\d+):(\d+):(\d+):(\d+)$/, async (ctx) => {
    const user = await getTelegramUserByTelegramId(BigInt(ctx.from.id));

    if (!user) {
      await safeAnswerCallbackQuery(ctx, { text: "Пользователь не найден", show_alert: false });
      return;
    }

    const subscription = await getUserRemnawaveAccountById(user.id, Number(ctx.match[1]));
    const checkout = await getCheckoutContext(
      BigInt(ctx.from.id),
      Number(ctx.match[2]),
      Number(ctx.match[3]),
      Number(ctx.match[4]),
    );

    if (!subscription || !checkout) {
      await safeAnswerCallbackQuery(ctx, { text: "Не удалось открыть заказ", show_alert: false });
      return;
    }

    await showRenderedScreenFromCallback(
      ctx,
      renderRenewCheckoutScreen(
        subscription,
        checkout.tariff,
        checkout.tariffPeriod,
        checkout.pricing,
        checkout.user.balanceMinor,
      ),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^renew:extra:(inc|dec):(\d+):(\d+):(\d+):(\d+)$/, async (ctx) => {
    const user = await getTelegramUserByTelegramId(BigInt(ctx.from.id));
    const direction = ctx.match[1];
    const nextCount = Number(ctx.match[5]) + (direction === "inc" ? 1 : -1);

    if (!user) {
      await safeAnswerCallbackQuery(ctx, { text: "Пользователь не найден", show_alert: false });
      return;
    }

    const subscription = await getUserRemnawaveAccountById(user.id, Number(ctx.match[2]));
    const checkout = await getCheckoutContext(
      BigInt(ctx.from.id),
      Number(ctx.match[3]),
      Number(ctx.match[4]),
      nextCount,
    );

    if (!subscription || !checkout) {
      await safeAnswerCallbackQuery(ctx, { text: "Не удалось обновить заказ", show_alert: false });
      return;
    }

    await showRenderedScreenFromCallback(
      ctx,
      renderRenewCheckoutScreen(
        subscription,
        checkout.tariff,
        checkout.tariffPeriod,
        checkout.pricing,
        checkout.user.balanceMinor,
      ),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^purchase:checkout:(\d+):(\d+):(\d+)$/, async (ctx) => {
    const checkout = await getCheckoutContext(
      BigInt(ctx.from.id),
      Number(ctx.match[1]),
      Number(ctx.match[2]),
      Number(ctx.match[3]),
    );

    if (!checkout) {
      await safeAnswerCallbackQuery(ctx, { text: "Не удалось открыть заказ", show_alert: false });
      return;
    }

    await showRenderedScreenFromCallback(
      ctx,
      renderPurchaseCheckoutScreen(
        checkout.tariff,
        checkout.tariffPeriod,
        checkout.pricing,
        checkout.user.balanceMinor,
      ),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^purchase:terms:(\d+):(\d+):(\d+)$/, async (ctx) => {
    const checkout = await getCheckoutContext(
      BigInt(ctx.from.id),
      Number(ctx.match[1]),
      Number(ctx.match[2]),
      Number(ctx.match[3]),
    );

    if (!checkout) {
      await safeAnswerCallbackQuery(ctx, { text: "Не удалось открыть условия", show_alert: false });
      return;
    }

    await showRenderedScreenFromCallback(
      ctx,
      renderPurchaseTermsScreen(
        checkout.tariff,
        checkout.tariffPeriod,
        checkout.pricing,
      ),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^purchase:extra:(inc|dec):(\d+):(\d+):(\d+)$/, async (ctx) => {
    const direction = ctx.match[1];
    const nextCount = Number(ctx.match[4]) + (direction === "inc" ? 1 : -1);
    const checkout = await getCheckoutContext(
      BigInt(ctx.from.id),
      Number(ctx.match[2]),
      Number(ctx.match[3]),
      nextCount,
    );

    if (!checkout) {
      await safeAnswerCallbackQuery(ctx, { text: "Не удалось обновить заказ", show_alert: false });
      return;
    }

    await showRenderedScreenFromCallback(
      ctx,
      renderPurchaseCheckoutScreen(
        checkout.tariff,
        checkout.tariffPeriod,
        checkout.pricing,
        checkout.user.balanceMinor,
      ),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^purchase:balance:(\d+):(\d+):(\d+)$/, async (ctx) => {
    const checkout = await getCheckoutContext(
      BigInt(ctx.from.id),
      Number(ctx.match[1]),
      Number(ctx.match[2]),
      Number(ctx.match[3]),
    );

    if (!checkout || checkout.pricing.totalPriceMinor <= 0) {
      await safeAnswerCallbackQuery(ctx, { text: "Оплата недоступна", show_alert: false });
      return;
    }

    if (checkout.user.balanceMinor < checkout.pricing.totalPriceMinor) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно средств на балансе", show_alert: false });
      return;
    }

    const order = await createPaidPurchaseOrderFromBalanceAndTouchUser(
      checkout.user,
      checkout.tariff,
      checkout.tariffPeriod,
      checkout.pricing.extraDeviceCount,
    );

    await provisionPurchaseOrderToRemnawave(order.id);
    await openScreenFromCallback(ctx, "my_subscriptions");
  });

  bot.callbackQuery(/^purchase:topup:(\d+):(\d+):(\d+)$/, async (ctx) => {
    const checkout = await getCheckoutContext(
      BigInt(ctx.from.id),
      Number(ctx.match[1]),
      Number(ctx.match[2]),
      Number(ctx.match[3]),
    );

    if (!checkout) {
      await safeAnswerCallbackQuery(ctx, { text: "Не удалось открыть пополнение", show_alert: false });
      return;
    }

    const shortfallMinor = Math.max(0, checkout.pricing.totalPriceMinor - checkout.user.balanceMinor);

    await clearAdminSession(BigInt(ctx.from.id));
    await setUserInputSession(BigInt(ctx.from.id), "balance_top_up_amount");
    await showRenderedScreenFromCallback(
      ctx,
      renderBalanceTopUpScreen(
        shortfallMinor,
        Boolean(config.YOOKASSA_SHOP_ID && config.YOOKASSA_SECRET_KEY),
        {
          backCallback: `purchase:checkout:${checkout.tariff.id}:${checkout.tariffPeriod.id}:${checkout.pricing.extraDeviceCount}`,
          shortfallMinor,
          starsCallback: `purchase:topup_pay:stars:${checkout.tariff.id}:${checkout.tariffPeriod.id}:${checkout.pricing.extraDeviceCount}`,
          sbpCallback: `purchase:topup_pay:sbp:${checkout.tariff.id}:${checkout.tariffPeriod.id}:${checkout.pricing.extraDeviceCount}`,
        },
      ),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^renew:balance:(\d+):(\d+):(\d+):(\d+)$/, async (ctx) => {
    const user = await getTelegramUserByTelegramId(BigInt(ctx.from.id));

    if (!user) {
      await safeAnswerCallbackQuery(ctx, { text: "Пользователь не найден", show_alert: false });
      return;
    }

    const subscription = await getUserRemnawaveAccountById(user.id, Number(ctx.match[1]));
    const checkout = await getCheckoutContext(
      BigInt(ctx.from.id),
      Number(ctx.match[2]),
      Number(ctx.match[3]),
      Number(ctx.match[4]),
    );

    if (!subscription?.purchaseOrder || !checkout || checkout.pricing.totalPriceMinor <= 0) {
      await safeAnswerCallbackQuery(ctx, { text: "Продление недоступно", show_alert: false });
      return;
    }

    if (checkout.user.balanceMinor < checkout.pricing.totalPriceMinor) {
      await safeAnswerCallbackQuery(ctx, { text: "Недостаточно средств на балансе", show_alert: false });
      return;
    }

    const order = await createPaidPurchaseOrderFromBalanceAndTouchUser(
      checkout.user,
      checkout.tariff,
      checkout.tariffPeriod,
      checkout.pricing.extraDeviceCount,
      {
        metadata: {
          renewalAccountId: subscription.id,
        },
      },
    );

    await provisionPurchaseOrderToRemnawave(order.id);
    await showRenderedScreenFromCallback(
      ctx,
      renderUserSubscriptionScreen(
        (await getUserRemnawaveAccountById(user.id, subscription.id)) ?? subscription,
      ),
    );
    await safeAnswerCallbackQuery(ctx, { text: "Подписка продлена", show_alert: false });
  });

  bot.callbackQuery(/^renew:topup:(\d+):(\d+):(\d+):(\d+)$/, async (ctx) => {
    const user = await getTelegramUserByTelegramId(BigInt(ctx.from.id));

    if (!user) {
      await safeAnswerCallbackQuery(ctx, { text: "Пользователь не найден", show_alert: false });
      return;
    }

    const subscriptionId = Number(ctx.match[1]);
    const checkout = await getCheckoutContext(
      BigInt(ctx.from.id),
      Number(ctx.match[2]),
      Number(ctx.match[3]),
      Number(ctx.match[4]),
    );

    if (!checkout) {
      await safeAnswerCallbackQuery(ctx, { text: "Не удалось открыть пополнение", show_alert: false });
      return;
    }

    const shortfallMinor = Math.max(0, checkout.pricing.totalPriceMinor - checkout.user.balanceMinor);

    await clearAdminSession(BigInt(ctx.from.id));
    await setUserInputSession(BigInt(ctx.from.id), "balance_top_up_amount");
    await showRenderedScreenFromCallback(
      ctx,
      renderBalanceTopUpScreen(
        shortfallMinor,
        Boolean(config.YOOKASSA_SHOP_ID && config.YOOKASSA_SECRET_KEY),
        {
          backCallback: `renew:checkout:${subscriptionId}:${checkout.tariff.id}:${checkout.tariffPeriod.id}:${checkout.pricing.extraDeviceCount}`,
          shortfallMinor,
          starsCallback: `renew:topup_pay:stars:${subscriptionId}:${checkout.tariff.id}:${checkout.tariffPeriod.id}:${checkout.pricing.extraDeviceCount}`,
          sbpCallback: `renew:topup_pay:sbp:${subscriptionId}:${checkout.tariff.id}:${checkout.tariffPeriod.id}:${checkout.pricing.extraDeviceCount}`,
        },
      ),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^renew:topup_pay:(stars|sbp):(\d+):(\d+):(\d+):(\d+)$/, async (ctx) => {
    const user = await getTelegramUserByTelegramId(BigInt(ctx.from.id));
    const provider = ctx.match[1] === "stars" ? "STARS" : "YOOKASSA";
    const subscriptionId = Number(ctx.match[2]);
    const checkout = await getCheckoutContext(
      BigInt(ctx.from.id),
      Number(ctx.match[3]),
      Number(ctx.match[4]),
      Number(ctx.match[5]),
    );

    if (!user || !checkout) {
      await safeAnswerCallbackQuery(ctx, { text: "Пополнение недоступно", show_alert: false });
      return;
    }

    const shortfallMinor = Math.max(0, checkout.pricing.totalPriceMinor - checkout.user.balanceMinor);
    const order = await createBalanceTopUpOrderAndTouchUser(user, shortfallMinor, provider, {
      metadata: {
        postTopUpAction: "renewal",
        renewalAccountId: subscriptionId,
        tariffId: checkout.tariff.id,
        tariffPeriodId: checkout.tariffPeriod.id,
        extraDeviceCount: checkout.pricing.extraDeviceCount,
      },
    });

    if (provider === "STARS") {
      await ctx.api.sendInvoice(
        ctx.chat!.id,
        "Пополнение баланса",
        `Зачисление ${(shortfallMinor / 100).toFixed(2)} RUB на баланс`,
        order.invoicePayload!,
        "XTR",
        [{ label: "Пополнение баланса", amount: order.amountStars! }],
      );
      await safeAnswerCallbackQuery(ctx, { text: "Инвойс отправлен", show_alert: false });
      return;
    }

    const updatedOrder = await createYooKassaBalanceTopUpPayment(order);
    await showRenderedScreenFromCallback(ctx, renderBalanceYooKassaOrderScreen(updatedOrder));
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^purchase:yookassa_check:(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];

    if (!orderId) {
      await safeAnswerCallbackQuery(ctx, { text: "Заказ не найден", show_alert: false });
      return;
    }

    const order = await refreshYooKassaOrderStatus(orderId);

    if (!order) {
      await safeAnswerCallbackQuery(ctx, { text: "Заказ не найден", show_alert: false });
      return;
    }

    if (order.status === "PAID") {
      await provisionPurchaseOrderToRemnawave(order.id);
    }

    await showRenderedScreenFromCallback(ctx, renderYooKassaOrderScreen(order));
    await safeAnswerCallbackQuery(ctx, {
      text: order.status === "PAID" ? "Оплата подтверждена" : "Статус обновлен",
      show_alert: false,
    });
  });

  bot.callbackQuery(/^mysub:open:(\d+)$/, async (ctx) => {
    const user = await getTelegramUserByTelegramId(BigInt(ctx.from.id));

    if (!user) {
      await safeAnswerCallbackQuery(ctx, {
        text: "Пользователь не найден",
        show_alert: false,
      });
      return;
    }

    const subscription = await getUserRemnawaveAccountById(
      user.id,
      Number(ctx.match[1]),
    );

    if (!subscription) {
      await safeAnswerCallbackQuery(ctx, {
        text: "Подписка не найдена",
        show_alert: false,
      });
      return;
    }

    await showRenderedScreenFromCallback(
      ctx,
      renderUserSubscriptionScreen(subscription),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^mysub:devices:(\d+)$/, async (ctx) => {
    const user = await getTelegramUserByTelegramId(BigInt(ctx.from.id));

    if (!user) {
      await safeAnswerCallbackQuery(ctx, {
        text: "Пользователь не найден",
        show_alert: false,
      });
      return;
    }

    const subscription = await getUserRemnawaveAccountById(
      user.id,
      Number(ctx.match[1]),
    );

    if (!subscription) {
      await safeAnswerCallbackQuery(ctx, {
        text: "Подписка не найдена",
        show_alert: false,
      });
      return;
    }

    const deviceState = await getRemnawaveUserDeviceState(subscription.remnawaveUuid);

    await showRenderedScreenFromCallback(
      ctx,
      renderSubscriptionDevicesScreen(
        subscription,
        deviceState.devices,
        deviceState.deviceLimit,
      ),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^mysub:connect:(\d+)$/, async (ctx) => {
    await safeAnswerCallbackQuery(ctx, {
      text: "Ссылка подключения пока недоступна",
      show_alert: false,
    });
  });

  bot.callbackQuery(/^mysub:gb:(\d+)$/, async (ctx) => {
    await safeAnswerCallbackQuery(ctx, {
      text: "Пакеты ГБ скоро появятся",
      show_alert: false,
    });
  });

  bot.callbackQuery(/^mysub:devices_unlock:(\d+)$/, async (ctx) => {
    const user = await getTelegramUserByTelegramId(BigInt(ctx.from.id));

    if (!user) {
      await safeAnswerCallbackQuery(ctx, {
        text: "Пользователь не найден",
        show_alert: false,
      });
      return;
    }

    const subscription = await getUserRemnawaveAccountById(
      user.id,
      Number(ctx.match[1]),
    );

    if (!subscription) {
      await safeAnswerCallbackQuery(ctx, {
        text: "Подписка не найдена",
        show_alert: false,
      });
      return;
    }

    const deviceState = await getRemnawaveUserDeviceState(subscription.remnawaveUuid);

    await showRenderedScreenFromCallback(
      ctx,
      renderSubscriptionDevicePurchaseScreen(
        subscription,
        deviceState.deviceLimit,
        user.balanceMinor,
      ),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^mysub:devices_unlock_adjust:(inc|dec):(\d+):(\d+)$/, async (ctx) => {
    const user = await getTelegramUserByTelegramId(BigInt(ctx.from.id));
    const direction = ctx.match[1];

    if (!user) {
      await safeAnswerCallbackQuery(ctx, {
        text: "Пользователь не найден",
        show_alert: false,
      });
      return;
    }

    const subscription = await getUserRemnawaveAccountById(
      user.id,
      Number(ctx.match[2]),
    );

    if (!subscription) {
      await safeAnswerCallbackQuery(ctx, {
        text: "Подписка не найдена",
        show_alert: false,
      });
      return;
    }

    const deviceState = await getRemnawaveUserDeviceState(subscription.remnawaveUuid);
    const includedDevices = subscription.purchaseOrder?.tariff.freeDevicesPerUser ?? 0;
    const currentExtraDevices = Math.max(0, deviceState.deviceLimit - includedDevices);
    const targetExtraDevices = Math.max(
      currentExtraDevices,
      Number(ctx.match[3]) + (direction === "inc" ? 1 : -1),
    );

    await showRenderedScreenFromCallback(
      ctx,
      renderSubscriptionDevicePurchaseScreen(
        subscription,
        deviceState.deviceLimit,
        user.balanceMinor,
        targetExtraDevices,
      ),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^mysub:devices_unlock_pay:(\d+):(\d+)$/, async (ctx) => {
    const user = await getTelegramUserByTelegramId(BigInt(ctx.from.id));

    if (!user) {
      await safeAnswerCallbackQuery(ctx, {
        text: "Пользователь не найден",
        show_alert: false,
      });
      return;
    }

    const subscription = await getUserRemnawaveAccountById(
      user.id,
      Number(ctx.match[1]),
    );

    if (!subscription?.purchaseOrder?.tariff || !subscription.purchaseOrder.tariffPeriod) {
      await safeAnswerCallbackQuery(ctx, {
        text: "Подписка не найдена",
        show_alert: false,
      });
      return;
    }

    const deviceState = await getRemnawaveUserDeviceState(subscription.remnawaveUuid);
    const includedDevices = subscription.purchaseOrder.tariff.freeDevicesPerUser;
    const currentExtraDevices = Math.max(0, deviceState.deviceLimit - includedDevices);
    const targetExtraDevices = Math.max(currentExtraDevices, Number(ctx.match[2]));
    const extraDevicesToAdd = targetExtraDevices - currentExtraDevices;
    const remainingDays = Math.max(
      1,
      Math.ceil((subscription.expireAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    );
    const totalPriceMinor =
      subscription.purchaseOrder.tariff.deviceDailyPriceMinor *
      extraDevicesToAdd *
      remainingDays;

    if (extraDevicesToAdd <= 0 || totalPriceMinor <= 0) {
      await safeAnswerCallbackQuery(ctx, {
        text: "Нет дополнительных устройств для оплаты",
        show_alert: false,
      });
      return;
    }

    if (user.balanceMinor < totalPriceMinor) {
      await safeAnswerCallbackQuery(ctx, {
        text: "Недостаточно средств на балансе",
        show_alert: false,
      });
      return;
    }

    const order = await createPaidDeviceUpgradeOrderFromBalanceAndTouchUser({
      user,
      tariffId: subscription.purchaseOrder.tariffId,
      tariffPeriodId: subscription.purchaseOrder.tariffPeriodId,
      currencyCode: subscription.purchaseOrder.currencyCode,
      deviceDailyPriceMinor: subscription.purchaseOrder.tariff.deviceDailyPriceMinor,
      remainingDays,
      purchasedExtraDeviceCount: extraDevicesToAdd,
      targetExtraDeviceCount: targetExtraDevices,
      subscriptionId: subscription.id,
    });

    await provisionPurchaseOrderToRemnawave(order.id);

    const refreshedSubscription = await getUserRemnawaveAccountById(user.id, subscription.id);
    const refreshedDeviceState = await getRemnawaveUserDeviceState(subscription.remnawaveUuid);

    if (!refreshedSubscription) {
      await safeAnswerCallbackQuery(ctx, {
        text: "Подписка не найдена",
        show_alert: false,
      });
      return;
    }

    await showRenderedScreenFromCallback(
      ctx,
      renderSubscriptionDevicesScreen(
        refreshedSubscription,
        refreshedDeviceState.devices,
        refreshedDeviceState.deviceLimit,
      ),
    );
    await safeAnswerCallbackQuery(ctx, {
      text: "Лимит устройств обновлён",
      show_alert: false,
    });
  });

  bot.callbackQuery(/^mysub:devices_unlock_topup:(\d+):(\d+)$/, async (ctx) => {
    const user = await getTelegramUserByTelegramId(BigInt(ctx.from.id));

    if (!user) {
      await safeAnswerCallbackQuery(ctx, {
        text: "Пользователь не найден",
        show_alert: false,
      });
      return;
    }

    const subscription = await getUserRemnawaveAccountById(
      user.id,
      Number(ctx.match[1]),
    );

    if (!subscription?.purchaseOrder?.tariff) {
      await safeAnswerCallbackQuery(ctx, {
        text: "Подписка не найдена",
        show_alert: false,
      });
      return;
    }

    const deviceState = await getRemnawaveUserDeviceState(subscription.remnawaveUuid);
    const includedDevices = subscription.purchaseOrder.tariff.freeDevicesPerUser;
    const currentExtraDevices = Math.max(0, deviceState.deviceLimit - includedDevices);
    const targetExtraDevices = Math.max(currentExtraDevices, Number(ctx.match[2]));
    const extraDevicesToAdd = targetExtraDevices - currentExtraDevices;
    const remainingDays = Math.max(
      1,
      Math.ceil((subscription.expireAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    );
    const shortfallMinor =
      subscription.purchaseOrder.tariff.deviceDailyPriceMinor *
      extraDevicesToAdd *
      remainingDays;

    await clearAdminSession(BigInt(ctx.from.id));
    await setUserInputSession(BigInt(ctx.from.id), "balance_top_up_amount");
    await showRenderedScreenFromCallback(
      ctx,
      renderBalanceTopUpScreen(
        shortfallMinor,
        Boolean(config.YOOKASSA_SHOP_ID && config.YOOKASSA_SECRET_KEY),
        {
          backCallback: `mysub:devices_unlock:${subscription.id}`,
          shortfallMinor,
          starsCallback: `mysub:devices_unlock_topup_pay:stars:${subscription.id}:${targetExtraDevices}`,
          sbpCallback: `mysub:devices_unlock_topup_pay:sbp:${subscription.id}:${targetExtraDevices}`,
        },
      ),
    );
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^mysub:devices_unlock_topup_pay:(stars|sbp):(\d+):(\d+)$/, async (ctx) => {
    const user = await getTelegramUserByTelegramId(BigInt(ctx.from.id));
    const provider = ctx.match[1] === "stars" ? "STARS" : "YOOKASSA";

    if (!user) {
      await safeAnswerCallbackQuery(ctx, {
        text: "Пользователь не найден",
        show_alert: false,
      });
      return;
    }

    const subscription = await getUserRemnawaveAccountById(
      user.id,
      Number(ctx.match[2]),
    );

    if (!subscription?.purchaseOrder?.tariff) {
      await safeAnswerCallbackQuery(ctx, {
        text: "Подписка не найдена",
        show_alert: false,
      });
      return;
    }

    const deviceState = await getRemnawaveUserDeviceState(subscription.remnawaveUuid);
    const includedDevices = subscription.purchaseOrder.tariff.freeDevicesPerUser;
    const currentExtraDevices = Math.max(0, deviceState.deviceLimit - includedDevices);
    const targetExtraDevices = Math.max(currentExtraDevices, Number(ctx.match[3]));
    const extraDevicesToAdd = targetExtraDevices - currentExtraDevices;
    const remainingDays = Math.max(
      1,
      Math.ceil((subscription.expireAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    );
    const shortfallMinor =
      subscription.purchaseOrder.tariff.deviceDailyPriceMinor *
      extraDevicesToAdd *
      remainingDays;

    const order = await createBalanceTopUpOrderAndTouchUser(user, shortfallMinor, provider, {
      metadata: {
        postTopUpAction: "device_upgrade",
        subscriptionId: subscription.id,
        targetExtraDeviceCount: targetExtraDevices,
      },
    });

    if (provider === "STARS") {
      await ctx.api.sendInvoice(
        ctx.chat!.id,
        "Пополнение баланса",
        `Зачисление ${(shortfallMinor / 100).toFixed(2)} RUB на баланс`,
        order.invoicePayload!,
        "XTR",
        [{ label: "Пополнение баланса", amount: order.amountStars! }],
      );
      await safeAnswerCallbackQuery(ctx, { text: "Инвойс отправлен", show_alert: false });
      return;
    }

    const updatedOrder = await createYooKassaBalanceTopUpPayment(order);
    await showRenderedScreenFromCallback(ctx, renderBalanceYooKassaOrderScreen(updatedOrder));
    await safeAnswerCallbackQuery(ctx);
  });

  bot.callbackQuery(/^mysub:device_stub:(\d+):(\d+)$/, async (ctx) => {
    await safeAnswerCallbackQuery(ctx, {
      text: "Управление устройством появится позже",
      show_alert: false,
    });
  });
}

function parseBalanceTopUpAmountMinor(input: string) {
  const normalized = input.replace(/\s+/g, "").replace(",", ".");

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(parsed * 100);
}

export async function handlePurchaseTextInput(
  bot: Bot,
  telegramId: bigint,
  input: string,
) {
  const session = await getUserInputSession(telegramId);

  if (!session) {
    return false;
  }

  const user = await getTelegramUserByTelegramId(telegramId);

  if (!user) {
    await clearUserInputSession(telegramId);
    return false;
  }

  if (session.kind !== "balance_top_up_amount") {
    await clearUserInputSession(telegramId);
    return false;
  }

  const amountMinor = parseBalanceTopUpAmountMinor(input);

  if (amountMinor === null) {
    await showRenderedScreen(
      bot,
      user,
      renderBalanceAmountInputPrompt("Введи сумму числом, например 350 или 499.90"),
    );
    return true;
  }

  if (amountMinor < BALANCE_TOP_UP_MIN_MINOR || amountMinor > BALANCE_TOP_UP_MAX_MINOR) {
    await showRenderedScreen(
      bot,
      user,
      renderBalanceAmountInputPrompt("Сумма должна быть от 10 ₽ до 10 000 ₽"),
    );
    return true;
  }

  await clearUserInputSession(telegramId);

  await showRenderedScreen(
    bot,
    user,
    renderBalanceTopUpScreen(
      amountMinor,
      Boolean(config.YOOKASSA_SHOP_ID && config.YOOKASSA_SECRET_KEY),
    ),
  );

  return true;
}

export function registerPurchasePaymentHandlers(bot: Bot) {
  bot.on("pre_checkout_query", async (ctx) => {
    const invoicePayload = ctx.preCheckoutQuery.invoice_payload;
    const [order, topUpOrder] = await Promise.all([
      getPurchaseOrderByInvoicePayload(invoicePayload),
      getBalanceTopUpOrderByInvoicePayload(invoicePayload),
    ]);

    if (topUpOrder && topUpOrder.status === "PENDING") {
      await ctx.answerPreCheckoutQuery(true);
      return;
    }

    if (!order || order.status !== "PENDING") {
      await ctx.answerPreCheckoutQuery(false, "Заказ недоступен");
      return;
    }

    await ctx.answerPreCheckoutQuery(true);
  });

  bot.on("message:successful_payment", async (ctx) => {
    const payment = ctx.message.successful_payment;
    const [order, topUpOrder] = await Promise.all([
      getPurchaseOrderByInvoicePayload(payment.invoice_payload),
      getBalanceTopUpOrderByInvoicePayload(payment.invoice_payload),
    ]);

    if (topUpOrder) {
      const paidTopUpOrder = await markBalanceTopUpPaidByInvoicePayload(
        payment.invoice_payload,
        payment.telegram_payment_charge_id,
      );

      if (!paidTopUpOrder) {
        return;
      }

      const followUp = await processTopUpFollowUp(paidTopUpOrder.id);

      await ctx.reply(
        [
          followUp ? "Баланс пополнен, операция завершена." : "Баланс пополнен.",
          `Сумма: ${(paidTopUpOrder.amountMinor / 100).toFixed(2)} RUB`,
        ].join("\n"),
        { parse_mode: "HTML" },
      );
      return;
    }

    if (!order) {
      return;
    }

    const paidOrder = await markPurchaseOrderPaidByInvoicePayload(
      payment.invoice_payload,
      payment.telegram_payment_charge_id,
    );
    await provisionPurchaseOrderToRemnawave(paidOrder.id);

    await ctx.reply(
      [
        "Оплата получена.",
        `Заказ: ${order.id}`,
        `Период: ${order.durationDays} дней`,
      ].join("\n"),
      { parse_mode: "HTML" },
    );
  });
}
