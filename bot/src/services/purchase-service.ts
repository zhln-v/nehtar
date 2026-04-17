import { randomUUID } from "node:crypto";

import { config } from "../config.js";
import { prisma } from "../db.js";
import type {
  BalanceTopUpOrder,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  PurchaseOrder,
  TariffPeriod,
  TelegramUser,
} from "../generated/prisma/index.js";
import type { TariffDetails } from "./tariff-service.js";
import { touchTelegramUserActivity } from "./telegram-user-service.js";

type PurchaseSelection = {
  tariff: TariffDetails;
  tariffPeriod: TariffPeriod;
  extraDeviceCount: number;
};

type PurchaseOrderOptions = {
  metadata?: Record<string, unknown>;
};

type BalanceTopUpOrderOptions = {
  metadata?: Record<string, unknown>;
};

type TransactionMetadata = {
  orderKind?: string;
  balanceBeforeMinor?: number;
  balanceAfterMinor?: number;
  balanceAfterMinorExpected?: number;
  renewalAccountId?: number;
  deviceUpgradeAccountId?: number;
  targetExtraDeviceCount?: number;
  purchasedExtraDeviceCount?: number;
  topUpMethod?: string;
  [key: string]: unknown;
};

export const BALANCE_TOP_UP_MIN_MINOR = 1_000;
export const BALANCE_TOP_UP_MAX_MINOR = 1_000_000;

type YooKassaCreatePaymentResponse = {
  id: string;
  status: string;
  confirmation?: {
    confirmation_url?: string;
  };
};

export type PurchasePricing = {
  durationDays: number;
  basePriceMinor: number;
  extraDevicesPriceMinor: number;
  totalPriceMinor: number;
  totalPriceStars: number;
  extraDeviceCount: number;
  extraDeviceAllowed: boolean;
};

export type BalanceTransactionListItem = {
  kind: "topup" | "purchase" | "referral_reward";
  id: string;
  amountMinor: number;
  currencyCode: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  createdAt: Date;
  title: string;
};

export type BalanceTransactionPage = {
  items: BalanceTransactionListItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

function calculateTariffPeriodPriceMinor(
  dailyPriceMinor: number,
  durationDays: number,
  discountPercent: number,
) {
  const fullPriceMinor = dailyPriceMinor * durationDays;
  return Math.round(fullPriceMinor * ((100 - discountPercent) / 100));
}

function calculateExtraDevicesPriceMinor(
  extraDeviceCount: number,
  deviceDailyPriceMinor: number,
  durationDays: number,
) {
  return extraDeviceCount * deviceDailyPriceMinor * durationDays;
}

function rubMinorToStars(valueMinor: number) {
  return Math.max(1, Math.ceil((valueMinor / 100) * config.TELEGRAM_STARS_PER_RUB));
}

function formatMinorAmount(valueMinor: number) {
  return (valueMinor / 100).toFixed(2);
}

function buildInvoicePayload(orderId: string) {
  return `order:${orderId}`;
}

function buildTopUpInvoicePayload(orderId: string) {
  return `topup:${orderId}`;
}

function buildMetadataJson(metadata: Record<string, unknown>) {
  return JSON.stringify(metadata);
}

function calculateReferralRewardMinor(amountMinor: number, rewardPercent: number) {
  return Math.floor(amountMinor * (rewardPercent / 100));
}

export function parseTransactionMetadata(metadataJson: string | null): TransactionMetadata {
  if (!metadataJson) {
    return {};
  }

  try {
    const parsed = JSON.parse(metadataJson);
    return typeof parsed === "object" && parsed !== null
      ? parsed as TransactionMetadata
      : {};
  } catch {
    return {};
  }
}

async function applyReferralRewardForPaidTopUp(
  tx: Prisma.TransactionClient,
  order: Pick<BalanceTopUpOrder, "id" | "telegramUserId" | "amountMinor">,
) {
  const [settings, referredUser, existingReward] = await Promise.all([
    tx.billingSettings.findUnique({
      where: {
        id: 1,
      },
    }),
    tx.telegramUser.findUnique({
      where: {
        id: order.telegramUserId,
      },
    }),
    tx.referralReward.findUnique({
      where: {
        balanceTopUpOrderId: order.id,
      },
    }),
  ]);

  if (
    !settings?.referralProgramEnabled ||
    settings.referralTopUpRewardPercent <= 0 ||
    !referredUser?.referredByUserId ||
    existingReward
  ) {
    return null;
  }

  const rewardAmountMinor = calculateReferralRewardMinor(
    order.amountMinor,
    settings.referralTopUpRewardPercent,
  );

  if (rewardAmountMinor <= 0) {
    return null;
  }

  await tx.referralReward.create({
    data: {
      referrerUserId: referredUser.referredByUserId,
      referredUserId: referredUser.id,
      balanceTopUpOrderId: order.id,
      rewardPercent: settings.referralTopUpRewardPercent,
      topUpAmountMinor: order.amountMinor,
      rewardAmountMinor,
    },
  });

  await tx.telegramUser.update({
    where: {
      id: referredUser.referredByUserId,
    },
    data: {
      balanceMinor: {
        increment: rewardAmountMinor,
      },
    },
  });

  return rewardAmountMinor;
}

async function markBalanceTopUpPaid(params: {
  where: Prisma.BalanceTopUpOrderWhereUniqueInput;
  telegramChargeId?: string;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const existingOrder = await tx.balanceTopUpOrder.findUnique({
      where: params.where,
      include: {
        telegramUser: true,
      },
    });

    if (!existingOrder) {
      return null;
    }

    if (existingOrder.status === "PAID") {
      return existingOrder;
    }

    const paidOrder = await tx.balanceTopUpOrder.update({
      where: {
        id: existingOrder.id,
      },
      data: {
        status: "PAID",
        telegramChargeId: params.telegramChargeId ?? existingOrder.telegramChargeId,
      },
      include: {
        telegramUser: true,
      },
    });

    await tx.telegramUser.update({
      where: {
        id: paidOrder.telegramUserId,
      },
      data: {
        balanceMinor: {
          increment: paidOrder.amountMinor,
        },
      },
    });

    await applyReferralRewardForPaidTopUp(tx, paidOrder);

    return paidOrder;
  });

  if (result?.telegramUser) {
    await touchTelegramUserActivity(result.telegramUser.telegramId);
  }

  return result;
}

function normalizeExtraDeviceCount(
  extraDeviceCount: number,
  extraDeviceAllowed: boolean,
) {
  if (!extraDeviceAllowed) {
    return 0;
  }

  return Math.max(0, Math.min(10, extraDeviceCount));
}

export function calculatePurchasePricing({
  tariff,
  tariffPeriod,
  extraDeviceCount,
}: PurchaseSelection): PurchasePricing {
  const extraDeviceAllowed = tariff.deviceDailyPriceMinor > 0;
  const normalizedExtraDeviceCount = normalizeExtraDeviceCount(
    extraDeviceCount,
    extraDeviceAllowed,
  );
  const basePriceMinor = calculateTariffPeriodPriceMinor(
    tariff.dailyPriceMinor,
    tariffPeriod.durationDays,
    tariffPeriod.discountPercent,
  );
  const extraDevicesPriceMinor = calculateExtraDevicesPriceMinor(
    normalizedExtraDeviceCount,
    tariff.deviceDailyPriceMinor,
    tariffPeriod.durationDays,
  );
  const totalPriceMinor = basePriceMinor + extraDevicesPriceMinor;

  return {
    durationDays: tariffPeriod.durationDays,
    basePriceMinor,
    extraDevicesPriceMinor,
    totalPriceMinor,
    totalPriceStars: rubMinorToStars(totalPriceMinor),
    extraDeviceCount: normalizedExtraDeviceCount,
    extraDeviceAllowed,
  };
}

export async function createPurchaseOrder(
  user: TelegramUser,
  tariff: TariffDetails,
  tariffPeriod: TariffPeriod,
  provider: PaymentProvider,
  extraDeviceCount: number,
  options: PurchaseOrderOptions = {},
) {
  const pricing = calculatePurchasePricing({
    tariff,
    tariffPeriod,
    extraDeviceCount,
  });

  const invoicePayload =
    provider === "STARS" ? buildInvoicePayload(randomUUID()) : null;

  return prisma.purchaseOrder.create({
    data: {
      telegramUserId: user.id,
      tariffId: tariff.id,
      tariffPeriodId: tariffPeriod.id,
      provider,
      extraDeviceCount: pricing.extraDeviceCount,
      durationDays: pricing.durationDays,
      basePriceMinor: pricing.basePriceMinor,
      extraDevicesPriceMinor: pricing.extraDevicesPriceMinor,
      totalPriceMinor: pricing.totalPriceMinor,
      totalPriceStars: provider === "STARS" ? pricing.totalPriceStars : null,
      currencyCode: tariff.currencyCode,
      invoicePayload,
      metadataJson: buildMetadataJson({
        orderKind: "subscription_purchase",
        tariffId: tariff.id,
        tariffPeriodId: tariffPeriod.id,
        extraDeviceCount: pricing.extraDeviceCount,
        ...(options.metadata ?? {}),
      }),
    },
  });
}

export async function createPaidPurchaseOrderFromBalanceAndTouchUser(
  user: TelegramUser,
  tariff: TariffDetails,
  tariffPeriod: TariffPeriod,
  extraDeviceCount: number,
  options: PurchaseOrderOptions = {},
) {
  const pricing = calculatePurchasePricing({
    tariff,
    tariffPeriod,
    extraDeviceCount,
  });

  if (pricing.totalPriceMinor <= 0) {
    throw new Error("Сумма заказа должна быть больше 0");
  }

  return prisma.$transaction(async (tx) => {
    const currentUser = await tx.telegramUser.findUnique({
      where: {
        id: user.id,
      },
    });

    if (!currentUser) {
      throw new Error("Пользователь не найден");
    }

    if (currentUser.balanceMinor < pricing.totalPriceMinor) {
      throw new Error("Недостаточно средств на балансе");
    }

    const order = await tx.purchaseOrder.create({
      data: {
        telegramUserId: currentUser.id,
        tariffId: tariff.id,
        tariffPeriodId: tariffPeriod.id,
        provider: "BALANCE",
        status: "PAID",
        extraDeviceCount: pricing.extraDeviceCount,
        durationDays: pricing.durationDays,
        basePriceMinor: pricing.basePriceMinor,
        extraDevicesPriceMinor: pricing.extraDevicesPriceMinor,
        totalPriceMinor: pricing.totalPriceMinor,
        totalPriceStars: null,
        currencyCode: tariff.currencyCode,
        invoicePayload: null,
        metadataJson: buildMetadataJson({
          orderKind: options.metadata?.renewalAccountId ? "subscription_renewal" : "subscription_purchase",
          tariffId: tariff.id,
          tariffPeriodId: tariffPeriod.id,
          extraDeviceCount: pricing.extraDeviceCount,
          paidWithBalance: true,
          balanceBeforeMinor: currentUser.balanceMinor,
          balanceAfterMinor: currentUser.balanceMinor - pricing.totalPriceMinor,
          ...(options.metadata ?? {}),
        }),
      },
    });

    await tx.telegramUser.update({
      where: {
        id: currentUser.id,
      },
      data: {
        balanceMinor: {
          decrement: pricing.totalPriceMinor,
        },
      },
    });

    return order;
  }).then(async (order) => {
    await touchTelegramUserActivity(user.telegramId);
    return order;
  });
}

export async function createPaidDeviceUpgradeOrderFromBalanceAndTouchUser(params: {
  user: TelegramUser;
  tariffId: number;
  tariffPeriodId: number;
  currencyCode: string;
  deviceDailyPriceMinor: number;
  remainingDays: number;
  purchasedExtraDeviceCount: number;
  targetExtraDeviceCount: number;
  subscriptionId: number;
}) {
  const normalizedPurchasedExtraDeviceCount = Math.max(0, params.purchasedExtraDeviceCount);
  const normalizedTargetExtraDeviceCount = Math.max(
    normalizedPurchasedExtraDeviceCount,
    params.targetExtraDeviceCount,
  );
  const normalizedRemainingDays = Math.max(1, params.remainingDays);
  const extraDevicesPriceMinor =
    normalizedPurchasedExtraDeviceCount *
    params.deviceDailyPriceMinor *
    normalizedRemainingDays;

  if (extraDevicesPriceMinor <= 0) {
    throw new Error("Сумма заказа должна быть больше 0");
  }

  return prisma.$transaction(async (tx) => {
    const currentUser = await tx.telegramUser.findUnique({
      where: {
        id: params.user.id,
      },
    });

    if (!currentUser) {
      throw new Error("Пользователь не найден");
    }

    if (currentUser.balanceMinor < extraDevicesPriceMinor) {
      throw new Error("Недостаточно средств на балансе");
    }

    const order = await tx.purchaseOrder.create({
      data: {
        telegramUserId: currentUser.id,
        tariffId: params.tariffId,
        tariffPeriodId: params.tariffPeriodId,
        provider: "BALANCE",
        status: "PAID",
        extraDeviceCount: normalizedPurchasedExtraDeviceCount,
        durationDays: normalizedRemainingDays,
        basePriceMinor: 0,
        extraDevicesPriceMinor,
        totalPriceMinor: extraDevicesPriceMinor,
        totalPriceStars: null,
        currencyCode: params.currencyCode,
        invoicePayload: null,
        metadataJson: buildMetadataJson({
          paidWithBalance: true,
          orderKind: "device_upgrade",
          deviceUpgradeAccountId: params.subscriptionId,
          purchasedExtraDeviceCount: normalizedPurchasedExtraDeviceCount,
          targetExtraDeviceCount: normalizedTargetExtraDeviceCount,
          balanceBeforeMinor: currentUser.balanceMinor,
          balanceAfterMinor: currentUser.balanceMinor - extraDevicesPriceMinor,
        }),
      },
    });

    await tx.telegramUser.update({
      where: {
        id: currentUser.id,
      },
      data: {
        balanceMinor: {
          decrement: extraDevicesPriceMinor,
        },
      },
    });

    return order;
  }).then(async (order) => {
    await touchTelegramUserActivity(params.user.telegramId);
    return order;
  });
}

export async function createPurchaseOrderAndTouchUser(
  user: TelegramUser,
  tariff: TariffDetails,
  tariffPeriod: TariffPeriod,
  provider: PaymentProvider,
  extraDeviceCount: number,
  options: PurchaseOrderOptions = {},
) {
  const order = await createPurchaseOrder(
    user,
    tariff,
    tariffPeriod,
    provider,
    extraDeviceCount,
    options,
  );

  await touchTelegramUserActivity(user.telegramId);
  return order;
}

export async function getPurchaseOrderById(orderId: string) {
  return prisma.purchaseOrder.findUnique({
    where: {
      id: orderId,
    },
    include: {
      telegramUser: true,
      tariff: true,
      tariffPeriod: true,
    },
  });
}

export async function getPurchaseOrderByInvoicePayload(invoicePayload: string) {
  return prisma.purchaseOrder.findUnique({
    where: {
      invoicePayload,
    },
    include: {
      telegramUser: true,
      tariff: true,
      tariffPeriod: true,
    },
  });
}

export async function updatePurchaseOrderStatus(
  orderId: string,
  status: PaymentStatus,
) {
  return prisma.purchaseOrder.update({
    where: {
      id: orderId,
    },
    data: {
      status,
    },
  });
}

export async function markPurchaseOrderPaidByInvoicePayload(
  invoicePayload: string,
  telegramChargeId: string,
) {
  const order = await prisma.purchaseOrder.update({
    where: {
      invoicePayload,
    },
    data: {
      status: "PAID",
      telegramChargeId,
    },
  });

  const user = await prisma.telegramUser.findUnique({
    where: {
      id: order.telegramUserId,
    },
  });

  if (user) {
    await touchTelegramUserActivity(user.telegramId);
  }

  return order;
}

export async function getUserPurchaseOrders(telegramUserId: number) {
  return prisma.purchaseOrder.findMany({
    where: {
      telegramUserId,
    },
    include: {
      tariff: true,
      tariffPeriod: true,
    },
    orderBy: [
      {
        createdAt: "desc",
      },
      {
        id: "desc",
      },
    ],
  });
}

export async function getUserBalancePurchaseOrderById(
  telegramUserId: number,
  orderId: string,
) {
  return prisma.purchaseOrder.findFirst({
    where: {
      id: orderId,
      telegramUserId,
      provider: "BALANCE",
    },
    include: {
      tariff: true,
      tariffPeriod: true,
      remnawaveAccount: true,
    },
  });
}

export function calculateBalanceTopUpStars(amountMinor: number) {
  return rubMinorToStars(amountMinor);
}

export async function createBalanceTopUpOrder(
  user: TelegramUser,
  amountMinor: number,
  provider: PaymentProvider,
  options: BalanceTopUpOrderOptions = {},
) {
  const normalizedAmountMinor = Math.max(
    BALANCE_TOP_UP_MIN_MINOR,
    Math.min(BALANCE_TOP_UP_MAX_MINOR, amountMinor),
  );

  return prisma.balanceTopUpOrder.create({
    data: {
      telegramUserId: user.id,
      provider,
      amountMinor: normalizedAmountMinor,
      amountStars: provider === "STARS" ? rubMinorToStars(normalizedAmountMinor) : null,
      currencyCode: "RUB",
      invoicePayload: provider === "STARS" ? buildTopUpInvoicePayload(randomUUID()) : null,
      metadataJson: buildMetadataJson({
        orderKind: "balance_top_up",
        topUpMethod: provider,
        balanceBeforeMinor: user.balanceMinor,
        balanceAfterMinorExpected: user.balanceMinor + normalizedAmountMinor,
        ...(options.metadata ?? {}),
      }),
    },
  });
}

export async function createBalanceTopUpOrderAndTouchUser(
  user: TelegramUser,
  amountMinor: number,
  provider: PaymentProvider,
  options: BalanceTopUpOrderOptions = {},
) {
  const order = await createBalanceTopUpOrder(user, amountMinor, provider, options);
  await touchTelegramUserActivity(user.telegramId);
  return order;
}

export async function getBalanceTopUpOrderById(orderId: string) {
  return prisma.balanceTopUpOrder.findUnique({
    where: {
      id: orderId,
    },
    include: {
      telegramUser: true,
    },
  });
}

export async function updateBalanceTopUpOrderMetadata(
  orderId: string,
  metadata: Record<string, unknown>,
) {
  return prisma.balanceTopUpOrder.update({
    where: {
      id: orderId,
    },
    data: {
      metadataJson: buildMetadataJson(metadata),
    },
    include: {
      telegramUser: true,
    },
  });
}

export async function getBalanceTopUpOrderByInvoicePayload(invoicePayload: string) {
  return prisma.balanceTopUpOrder.findUnique({
    where: {
      invoicePayload,
    },
    include: {
      telegramUser: true,
    },
  });
}

export async function getUserBalanceTopUpOrders(telegramUserId: number) {
  return prisma.balanceTopUpOrder.findMany({
    where: {
      telegramUserId,
    },
    orderBy: [
      {
        createdAt: "desc",
      },
      {
        id: "desc",
      },
    ],
    take: 10,
  });
}

export async function getUserBalanceTopUpOrderById(
  telegramUserId: number,
  orderId: string,
) {
  return prisma.balanceTopUpOrder.findFirst({
    where: {
      id: orderId,
      telegramUserId,
    },
    include: {
      telegramUser: true,
    },
  });
}

export async function getUserBalanceTransactionPage(
  telegramUserId: number,
  page: number,
  pageSize: number,
): Promise<BalanceTransactionPage> {
  const safePageSize = Math.max(1, Math.min(20, pageSize));

  const [topUpOrders, purchaseOrders, referralRewards] = await Promise.all([
    prisma.balanceTopUpOrder.findMany({
      where: {
        telegramUserId,
      },
      orderBy: [
        {
          createdAt: "desc",
        },
        {
          id: "desc",
        },
      ],
    }),
    prisma.purchaseOrder.findMany({
      where: {
        telegramUserId,
        provider: "BALANCE",
      },
      include: {
        tariff: true,
      },
      orderBy: [
        {
          createdAt: "desc",
        },
        {
          id: "desc",
        },
      ],
    }),
    prisma.referralReward.findMany({
      where: {
        referrerUserId: telegramUserId,
      },
      include: {
        referredUser: true,
      },
      orderBy: [
        {
          createdAt: "desc",
        },
        {
          id: "desc",
        },
      ],
    }),
  ]);

  const items = [
    ...topUpOrders.map<BalanceTransactionListItem>((order) => ({
      kind: "topup",
      id: order.id,
      amountMinor: order.amountMinor,
      currencyCode: order.currencyCode,
      provider: order.provider,
      status: order.status,
      createdAt: order.createdAt,
      title: "Пополнение баланса",
    })),
    ...purchaseOrders.map<BalanceTransactionListItem>((order) => ({
      kind: "purchase",
      id: order.id,
      amountMinor: order.totalPriceMinor,
      currencyCode: order.currencyCode,
      provider: order.provider,
      status: order.status,
      createdAt: order.createdAt,
      title: order.tariff.name,
    })),
    ...referralRewards.map<BalanceTransactionListItem>((reward) => ({
      kind: "referral_reward",
      id: String(reward.id),
      amountMinor: reward.rewardAmountMinor,
      currencyCode: "RUB",
      provider: "BALANCE",
      status: "PAID",
      createdAt: reward.createdAt,
      title: reward.referredUser.username
        ? `Реферал @${reward.referredUser.username}`
        : `Реферал ${reward.referredUser.firstName}`,
    })),
  ].sort((left, right) => {
    const diff = right.createdAt.getTime() - left.createdAt.getTime();

    if (diff !== 0) {
      return diff;
    }

    return right.id.localeCompare(left.id);
  });

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safePage = Math.max(1, Math.min(totalPages, page));
  const offset = (safePage - 1) * safePageSize;

  return {
    items: items.slice(offset, offset + safePageSize),
    page: safePage,
    pageSize: safePageSize,
    totalItems,
    totalPages,
  };
}

export async function markBalanceTopUpPaidByInvoicePayload(
  invoicePayload: string,
  telegramChargeId: string,
) {
  return markBalanceTopUpPaid({
    where: {
      invoicePayload,
    },
    telegramChargeId,
  });
}

export async function createYooKassaPayment(order: PurchaseOrder) {
  if (!config.YOOKASSA_SHOP_ID || !config.YOOKASSA_SECRET_KEY) {
    throw new Error("ЮKassa не настроена");
  }

  const response = await fetch(`${config.YOOKASSA_API_URL}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${config.YOOKASSA_SHOP_ID}:${config.YOOKASSA_SECRET_KEY}`).toString("base64")}`,
      "Idempotence-Key": order.id,
    },
    body: JSON.stringify({
      amount: {
        value: formatMinorAmount(order.totalPriceMinor),
        currency: order.currencyCode,
      },
      capture: true,
      description: `Подписка ${order.tariffId} на ${order.durationDays} дн.`,
      confirmation: {
        type: "redirect",
        return_url: config.PAYMENTS_RETURN_URL,
      },
      metadata: {
        order_id: order.id,
        telegram_user_id: String(order.telegramUserId),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`ЮKassa вернула ${response.status}`);
  }

  const payload = (await response.json()) as YooKassaCreatePaymentResponse;

  if (!payload.confirmation?.confirmation_url) {
    throw new Error("ЮKassa не вернула confirmation_url");
  }

  const updatedOrder = await prisma.purchaseOrder.update({
    where: {
      id: order.id,
    },
    data: {
      providerPaymentId: payload.id,
      providerConfirmationUrl: payload.confirmation.confirmation_url,
    },
  });

  return updatedOrder;
}

export async function refreshYooKassaOrderStatus(orderId: string) {
  const order = await getPurchaseOrderById(orderId);

  if (!order || order.provider !== "YOOKASSA" || !order.providerPaymentId) {
    return null;
  }

  if (!config.YOOKASSA_SHOP_ID || !config.YOOKASSA_SECRET_KEY) {
    throw new Error("ЮKassa не настроена");
  }

  const response = await fetch(
    `${config.YOOKASSA_API_URL}/payments/${order.providerPaymentId}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.YOOKASSA_SHOP_ID}:${config.YOOKASSA_SECRET_KEY}`).toString("base64")}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`ЮKassa вернула ${response.status}`);
  }

  const payload = (await response.json()) as YooKassaCreatePaymentResponse;
  const nextStatus: PaymentStatus =
    payload.status === "succeeded"
      ? "PAID"
      : payload.status === "canceled"
        ? "CANCELED"
        : "PENDING";

  const updatedOrder = await prisma.purchaseOrder.update({
    where: {
      id: order.id,
    },
    data: {
      status: nextStatus,
    },
    include: {
      telegramUser: true,
      tariff: true,
      tariffPeriod: true,
    },
  });

  if (updatedOrder.status === "PAID") {
    await touchTelegramUserActivity(updatedOrder.telegramUser.telegramId);
  }

  return updatedOrder;
}

export async function createYooKassaBalanceTopUpPayment(order: BalanceTopUpOrder) {
  if (!config.YOOKASSA_SHOP_ID || !config.YOOKASSA_SECRET_KEY) {
    throw new Error("ЮKassa не настроена");
  }

  const response = await fetch(`${config.YOOKASSA_API_URL}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${config.YOOKASSA_SHOP_ID}:${config.YOOKASSA_SECRET_KEY}`).toString("base64")}`,
      "Idempotence-Key": order.id,
    },
    body: JSON.stringify({
      amount: {
        value: formatMinorAmount(order.amountMinor),
        currency: order.currencyCode,
      },
      capture: true,
      description: `Пополнение баланса на ${formatMinorAmount(order.amountMinor)} ${order.currencyCode}`,
      confirmation: {
        type: "redirect",
        return_url: config.PAYMENTS_RETURN_URL,
      },
      metadata: {
        topup_order_id: order.id,
        telegram_user_id: String(order.telegramUserId),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`ЮKassa вернула ${response.status}`);
  }

  const payload = (await response.json()) as YooKassaCreatePaymentResponse;

  if (!payload.confirmation?.confirmation_url) {
    throw new Error("ЮKassa не вернула confirmation_url");
  }

  return prisma.balanceTopUpOrder.update({
    where: {
      id: order.id,
    },
    data: {
      providerPaymentId: payload.id,
      providerConfirmationUrl: payload.confirmation.confirmation_url,
    },
  });
}

export async function refreshYooKassaBalanceTopUpStatus(orderId: string) {
  const order = await getBalanceTopUpOrderById(orderId);

  if (!order || order.provider !== "YOOKASSA" || !order.providerPaymentId) {
    return null;
  }

  if (!config.YOOKASSA_SHOP_ID || !config.YOOKASSA_SECRET_KEY) {
    throw new Error("ЮKassa не настроена");
  }

  const response = await fetch(
    `${config.YOOKASSA_API_URL}/payments/${order.providerPaymentId}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.YOOKASSA_SHOP_ID}:${config.YOOKASSA_SECRET_KEY}`).toString("base64")}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`ЮKassa вернула ${response.status}`);
  }

  const payload = (await response.json()) as YooKassaCreatePaymentResponse;
  const nextStatus: PaymentStatus =
    payload.status === "succeeded"
      ? "PAID"
      : payload.status === "canceled"
        ? "CANCELED"
        : "PENDING";

  const previousStatus = order.status;
  if (previousStatus !== "PAID" && nextStatus === "PAID") {
    return markBalanceTopUpPaid({
      where: {
        id: order.id,
      },
    });
  }

  const updatedOrder = await prisma.balanceTopUpOrder.update({
    where: {
      id: order.id,
    },
    data: {
      status: nextStatus,
    },
    include: {
      telegramUser: true,
    },
  });

  return updatedOrder;
}
