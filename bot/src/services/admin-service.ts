import { prisma } from "../db.js";
import type { Prisma } from "../generated/prisma/index.js";
import type { UserRemnawaveAccount } from "./remnawave-users-service.js";
import { getUserBalanceTransactionPage } from "./purchase-service.js";

export type AdminUserSubscriptionPage = {
  items: (UserRemnawaveAccount & {
    remainingTrafficBytes: bigint;
  })[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type AdminUserReferralPage = {
  items: {
    id: number;
    telegramId: bigint;
    firstName: string;
    username: string | null;
    balanceMinor: number;
    createdAt: Date;
    topUpsCount: number;
  }[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type AdminUserListPage = {
  items: {
    id: number;
    telegramId: bigint;
    firstName: string;
    lastName: string | null;
    username: string | null;
    balanceMinor: number;
    createdAt: Date;
    updatedAt: Date;
  }[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  query?: string | undefined;
};

export async function getAdminStats() {
  const [totalUsers, privateUsers, activeMenuUsers, latestUsers, latestPurchases, latestProvisionedAccounts] = await Promise.all([
    prisma.telegramUser.count(),
    prisma.telegramUser.count({
      where: {
        privateChatId: {
          not: null,
        },
      },
    }),
    prisma.telegramUser.count({
      where: {
        lastMenuMessageId: {
          not: null,
        },
      },
    }),
    prisma.telegramUser.findMany({
      orderBy: {
        updatedAt: "desc",
      },
      take: 5,
      select: {
        firstName: true,
        username: true,
        updatedAt: true,
      },
    }),
    prisma.purchaseOrder.findMany({
      where: {
        status: "PAID",
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 5,
      include: {
        telegramUser: {
          select: {
            firstName: true,
            username: true,
          },
        },
        tariff: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.remnawaveUserAccount.findMany({
      orderBy: {
        updatedAt: "desc",
      },
      take: 5,
      include: {
        telegramUser: {
          select: {
            firstName: true,
            username: true,
          },
        },
        squadQuotas: {
          where: {
            exhaustedAt: null,
            expiresAt: {
              gt: new Date(),
            },
          },
          include: {
            squad: {
              select: {
                displayName: true,
                name: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    }),
  ]);

  return {
    totalUsers,
    privateUsers,
    activeMenuUsers,
    latestUsers,
    latestPurchases,
    latestProvisionedAccounts,
  };
}

function buildAdminUserSearchWhere(query?: string) {
  const normalizedQuery = query?.trim();

  if (!normalizedQuery) {
    return null;
  }

  const filters: Prisma.TelegramUserWhereInput[] = [
    {
      firstName: {
        contains: normalizedQuery,
        mode: "insensitive" as const,
      },
    },
    {
      lastName: {
        contains: normalizedQuery,
        mode: "insensitive" as const,
      },
    },
    {
      username: {
        contains: normalizedQuery,
        mode: "insensitive" as const,
      },
    },
    {
      referralCode: {
        contains: normalizedQuery,
        mode: "insensitive" as const,
      },
    },
  ];

  if (/^\d+$/.test(normalizedQuery)) {
    filters.push({
      telegramId: BigInt(normalizedQuery),
    });
  }

  return {
    OR: filters,
  } satisfies Prisma.TelegramUserWhereInput;
}

export async function getAdminUserListPage(
  page: number,
  pageSize: number,
  query?: string,
): Promise<AdminUserListPage> {
  const safePageSize = Math.max(1, Math.min(20, pageSize));
  const where = buildAdminUserSearchWhere(query);
  const totalItems = where
    ? await prisma.telegramUser.count({ where })
    : await prisma.telegramUser.count();
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safePage = Math.max(1, Math.min(totalPages, page));
  const skip = (safePage - 1) * safePageSize;

  const items = await prisma.telegramUser.findMany({
    ...(where ? { where } : {}),
    orderBy: [
      {
        updatedAt: "desc",
      },
      {
        id: "desc",
      },
    ],
    skip,
    take: safePageSize,
    select: {
      id: true,
      telegramId: true,
      firstName: true,
      lastName: true,
      username: true,
      balanceMinor: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return {
    items,
    page: safePage,
    pageSize: safePageSize,
    totalItems,
    totalPages,
    query: query?.trim() || undefined,
  };
}

export async function getAdminUserDetails(userId: number) {
  return prisma.telegramUser.findUnique({
    where: {
      id: userId,
    },
    include: {
      _count: {
        select: {
          purchaseOrders: true,
          balanceTopUpOrders: true,
          remnawaveAccounts: true,
          referrals: true,
        },
      },
      referredBy: {
        select: {
          id: true,
          firstName: true,
          username: true,
        },
      },
    },
  });
}

export async function getAdminUserSubscriptionsPage(
  userId: number,
  page: number,
  pageSize: number,
): Promise<AdminUserSubscriptionPage> {
  const safePageSize = Math.max(1, Math.min(20, pageSize));
  const totalItems = await prisma.remnawaveUserAccount.count({
    where: {
      telegramUserId: userId,
    },
  });
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safePage = Math.max(1, Math.min(totalPages, page));
  const skip = (safePage - 1) * safePageSize;
  const items = await prisma.remnawaveUserAccount.findMany({
    where: {
      telegramUserId: userId,
    },
    include: {
      purchaseOrder: {
        include: {
          tariff: true,
          tariffPeriod: true,
        },
      },
      squadQuotas: {
        include: {
          squad: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
    orderBy: [
      {
        updatedAt: "desc",
      },
      {
        id: "desc",
      },
    ],
    skip,
    take: safePageSize,
  });

  return {
    items: items.map((item) => ({
      ...item,
      remainingTrafficBytes: item.squadQuotas.reduce((total, quota) => {
        if (quota.expiresAt <= new Date()) {
          return total;
        }

        const remaining = quota.grantedTrafficBytes - quota.consumedTrafficBytes;
        return remaining > 0n ? total + remaining : total;
      }, 0n),
    })),
    page: safePage,
    pageSize: safePageSize,
    totalItems,
    totalPages,
  };
}

export async function getAdminUserSubscriptionById(
  userId: number,
  subscriptionId: number,
) {
  return prisma.remnawaveUserAccount.findFirst({
    where: {
      id: subscriptionId,
      telegramUserId: userId,
    },
    include: {
      purchaseOrder: {
        include: {
          tariff: true,
          tariffPeriod: true,
        },
      },
      squadQuotas: {
        include: {
          squad: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });
}

export async function getAdminUserTransactionsPage(
  userId: number,
  page: number,
  pageSize: number,
) {
  return getUserBalanceTransactionPage(userId, page, pageSize);
}

export async function getAdminUserReferralPage(
  userId: number,
  page: number,
  pageSize: number,
): Promise<AdminUserReferralPage> {
  const safePageSize = Math.max(1, Math.min(20, pageSize));
  const totalItems = await prisma.telegramUser.count({
    where: {
      referredByUserId: userId,
    },
  });
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safePage = Math.max(1, Math.min(totalPages, page));
  const skip = (safePage - 1) * safePageSize;

  const items = await prisma.telegramUser.findMany({
    where: {
      referredByUserId: userId,
    },
    orderBy: [
      {
        createdAt: "desc",
      },
      {
        id: "desc",
      },
    ],
    skip,
    take: safePageSize,
    include: {
      _count: {
        select: {
          balanceTopUpOrders: true,
        },
      },
    },
  });

  return {
    items: items.map((item) => ({
      id: item.id,
      telegramId: item.telegramId,
      firstName: item.firstName,
      username: item.username,
      balanceMinor: item.balanceMinor,
      createdAt: item.createdAt,
      topUpsCount: item._count.balanceTopUpOrders,
    })),
    page: safePage,
    pageSize: safePageSize,
    totalItems,
    totalPages,
  };
}

export async function getAdminReferralRewardById(rewardId: number) {
  return prisma.referralReward.findUnique({
    where: {
      id: rewardId,
    },
    include: {
      referredUser: true,
      balanceTopUpOrder: true,
    },
  });
}

export async function getAdminBalancePurchaseOrderById(orderId: string) {
  return prisma.purchaseOrder.findUnique({
    where: {
      id: orderId,
    },
    include: {
      tariff: true,
      tariffPeriod: true,
      remnawaveAccount: true,
    },
  });
}
