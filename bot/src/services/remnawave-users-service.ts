import { randomUUID } from "node:crypto";

import { z } from "zod";

import { config } from "../config.js";
import { prisma } from "../db.js";
import type { Prisma } from "../generated/prisma/index.js";
import { getPurchaseOrderById } from "./purchase-service.js";
import type { PurchaseOrder, TelegramUser } from "../generated/prisma/index.js";
import type { TariffDetails } from "./tariff-service.js";

const remnawaveUserSchema = z.object({
  uuid: z.string().uuid(),
  username: z.string(),
  trafficLimitBytes: z.number().int().nonnegative(),
  expireAt: z.string(),
  subscriptionUrl: z.string(),
  hwidDeviceLimit: z.number().int().nullable(),
  activeInternalSquads: z.array(
    z.object({
      uuid: z.string().uuid(),
      name: z.string(),
    }),
  ),
  userTraffic: z.object({
    usedTrafficBytes: z.number().int().nonnegative(),
    lifetimeUsedTrafficBytes: z.number().int().nonnegative(),
  }),
});

const remnawaveUserResponseSchema = z.object({
  response: remnawaveUserSchema,
});

const remnawaveHwidDeviceSchema = z.object({
  hwid: z.string(),
  userId: z.number(),
  platform: z.string().nullable(),
  osVersion: z.string().nullable(),
  deviceModel: z.string().nullable(),
  userAgent: z.string().nullable(),
  requestIp: z.string().nullable(),
  createdAt: z.string().datetime().transform((value) => new Date(value)),
  updatedAt: z.string().datetime().transform((value) => new Date(value)),
});

const remnawaveUserHwidDevicesResponseSchema = z.object({
  response: z.object({
    total: z.number(),
    devices: z.array(remnawaveHwidDeviceSchema),
  }),
});

export type UserRemnawaveAccount = Prisma.RemnawaveUserAccountGetPayload<{
  include: {
    purchaseOrder: {
      include: {
        tariff: true;
        tariffPeriod: true;
      };
    };
    squadQuotas: {
      include: {
        squad: true;
      };
      orderBy: {
        createdAt: "asc";
      };
    };
  };
}>;

export type RemnawaveHwidDevice = z.infer<typeof remnawaveHwidDeviceSchema>;
export type UserSubscriptionSummary = UserRemnawaveAccount & {
  connectedDeviceCount: number;
  deviceLimit: number;
  remainingTrafficBytes: bigint;
};

function buildRemnawaveRequest(urlPath: string, method = "GET", body?: unknown) {
  const baseUrl = new URL(config.REMNAWAVE_API_URL);
  const requestUrl = new URL(urlPath, baseUrl);
  const headers = new Headers({
    Authorization: `Bearer ${config.REMNAWAVE_API_TOKEN}`,
  });

  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (baseUrl.hostname === "127.0.0.1" && baseUrl.port === "3000") {
    headers.set("X-Forwarded-Proto", "https");
    headers.set("X-Forwarded-For", "127.0.0.1");
    headers.set("X-Forwarded-Host", "remnawave.localhost:8080");
    headers.set("Host", "remnawave.localhost:8080");
  }

  const init: RequestInit = {
    method,
    headers,
    body: body === undefined ? null : JSON.stringify(body),
  };

  return {
    requestUrl,
    init,
  };
}

function makeRemnawaveUsername(telegramUser: TelegramUser, purchaseOrderId: string) {
  return `tg-${telegramUser.telegramId}-${purchaseOrderId.slice(-8)}`;
}

function addDays(from: Date, days: number) {
  const next = new Date(from);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toBytesFromDailyGb(trafficGbPerDay: number, durationDays: number) {
  return BigInt(trafficGbPerDay) * BigInt(durationDays) * 1024n * 1024n * 1024n;
}

function calculateRemainingTrafficBytes(account: UserRemnawaveAccount) {
  return account.squadQuotas.reduce((total, quota) => {
    if (quota.expiresAt <= new Date()) {
      return total;
    }

    const remaining = quota.grantedTrafficBytes - quota.consumedTrafficBytes;
    return remaining > 0n ? total + remaining : total;
  }, 0n);
}

function parseRemnawaveUser(payload: unknown) {
  const parsed = remnawaveUserResponseSchema.parse(payload);
  return parsed.response;
}

async function fetchRemnawaveUser(uuid: string) {
  const { requestUrl, init } = buildRemnawaveRequest(`/api/users/${uuid}`);
  const response = await fetch(requestUrl, init);

  if (!response.ok) {
    throw new Error(`Remnawave user fetch failed: ${response.status}`);
  }

  return parseRemnawaveUser(await response.json());
}

function parseRemnawaveUserHwidDevices(payload: unknown) {
  const parsed = remnawaveUserHwidDevicesResponseSchema.parse(payload);
  return parsed.response;
}

async function fetchRemnawaveUserHwidDevices(userUuid: string) {
  const { requestUrl, init } = buildRemnawaveRequest(`/api/hwid/devices/${userUuid}`);
  const response = await fetch(requestUrl, init);

  if (!response.ok) {
    throw new Error(`Remnawave user HWID devices fetch failed: ${response.status}`);
  }

  return parseRemnawaveUserHwidDevices(await response.json());
}

async function createRemnawaveUser(payload: {
  uuid: string;
  username: string;
  expireAt: string;
  activeInternalSquads: string[];
  trafficLimitBytes: number;
  hwidDeviceLimit: number;
}) {
  const { requestUrl, init } = buildRemnawaveRequest("/api/users", "POST", {
    uuid: payload.uuid,
    username: payload.username,
    expireAt: payload.expireAt,
    activeInternalSquads: payload.activeInternalSquads,
    trafficLimitBytes: payload.trafficLimitBytes,
    hwidDeviceLimit: payload.hwidDeviceLimit,
    trafficLimitStrategy: "NO_RESET",
  });
  const response = await fetch(requestUrl, init);

  if (!response.ok) {
    throw new Error(`Remnawave user create failed: ${response.status}`);
  }

  return parseRemnawaveUser(await response.json());
}

async function updateRemnawaveUser(payload: {
  uuid: string;
  username: string;
  expireAt: string;
  activeInternalSquads: string[];
  trafficLimitBytes: number;
  hwidDeviceLimit: number;
}) {
  const { requestUrl, init } = buildRemnawaveRequest("/api/users", "PATCH", {
    uuid: payload.uuid,
    username: payload.username,
    expireAt: payload.expireAt,
    activeInternalSquads: payload.activeInternalSquads,
    trafficLimitBytes: payload.trafficLimitBytes,
    hwidDeviceLimit: payload.hwidDeviceLimit,
    trafficLimitStrategy: "NO_RESET",
  });
  const response = await fetch(requestUrl, init);

  if (!response.ok) {
    throw new Error(`Remnawave user update failed: ${response.status}`);
  }

  return parseRemnawaveUser(await response.json());
}

async function upsertLocalRemnawaveAccount(params: {
  telegramUserId: number;
  purchaseOrderId: string;
  remnawaveUuid: string;
  username: string;
  subscriptionUrl: string;
  expireAt: Date;
}) {
  return prisma.remnawaveUserAccount.upsert({
    where: {
      purchaseOrderId: params.purchaseOrderId,
    },
    update: {
      telegramUserId: params.telegramUserId,
      remnawaveUuid: params.remnawaveUuid,
      username: params.username,
      subscriptionUrl: params.subscriptionUrl,
      expireAt: params.expireAt,
    },
    create: {
      telegramUserId: params.telegramUserId,
      purchaseOrderId: params.purchaseOrderId,
      remnawaveUuid: params.remnawaveUuid,
      username: params.username,
      subscriptionUrl: params.subscriptionUrl,
      expireAt: params.expireAt,
    },
  });
}

async function createOrderQuotas(
  remnawaveAccountId: number,
  purchaseOrder: PurchaseOrder,
  tariff: TariffDetails,
  expiresAtOverride?: Date,
) {
  const payloads = tariff.squads
    .filter((squad: TariffDetails["squads"][number]) => squad.trafficIncludedGbPerDay > 0)
    .map((squad: TariffDetails["squads"][number]) => ({
      remnawaveAccountId,
      purchaseOrderId: purchaseOrder.id,
      squadUuid: squad.squadUuid,
      grantedTrafficBytes: toBytesFromDailyGb(
        squad.trafficIncludedGbPerDay,
        purchaseOrder.durationDays,
      ),
      expiresAt: expiresAtOverride ?? new Date(
        purchaseOrder.updatedAt.getTime() + purchaseOrder.durationDays * 24 * 60 * 60 * 1000,
      ),
    }));

  if (payloads.length === 0) {
    return [];
  }

  return Promise.all(payloads.map((payload: (typeof payloads)[number]) =>
    prisma.userSquadQuota.create({
      data: payload,
    }),
  ));
}

function parsePurchaseOrderMetadata(metadataJson: string | null) {
  if (!metadataJson) {
    return {};
  }

  try {
    const parsed = JSON.parse(metadataJson);

    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function getActiveQuotasForAccount(remnawaveAccountId: number) {
  return prisma.userSquadQuota.findMany({
    where: {
      remnawaveAccountId,
      exhaustedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: [
      {
        createdAt: "asc",
      },
      {
        id: "asc",
      },
    ],
  });
}

function sumRemainingBytes(quotas: Awaited<ReturnType<typeof getActiveQuotasForAccount>>) {
  return quotas.reduce((total, quota) => {
    const remaining = quota.grantedTrafficBytes - quota.consumedTrafficBytes;
    return remaining > 0 ? total + remaining : total;
  }, 0n);
}

function activeSquadUuidsFromQuotas(quotas: Awaited<ReturnType<typeof getActiveQuotasForAccount>>) {
  return [...new Set(quotas
    .filter((quota) => quota.grantedTrafficBytes > quota.consumedTrafficBytes)
    .map((quota) => quota.squadUuid))];
}

export async function provisionPurchaseOrderToRemnawave(purchaseOrderId: string) {
  const purchaseOrder = await getPurchaseOrderById(purchaseOrderId);

  if (!purchaseOrder || purchaseOrder.status !== "PAID") {
    return null;
  }

  const tariff = await prisma.tariff.findUnique({
    where: {
      id: purchaseOrder.tariffId,
    },
    include: {
      squads: {
        include: {
          squad: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      periods: true,
    },
  });

  if (!tariff) {
    return null;
  }

  const metadata = parsePurchaseOrderMetadata(purchaseOrder.metadataJson);
  const deviceUpgradeAccountId =
    typeof metadata.deviceUpgradeAccountId === "number" ? metadata.deviceUpgradeAccountId : null;
  const renewalAccountId =
    typeof metadata.renewalAccountId === "number" ? metadata.renewalAccountId : null;

  if (deviceUpgradeAccountId !== null) {
    const targetExtraDeviceCount =
      typeof metadata.targetExtraDeviceCount === "number"
        ? Math.max(0, metadata.targetExtraDeviceCount)
        : null;
    const deviceUpgradeAccount = await prisma.remnawaveUserAccount.findFirst({
      where: {
        id: deviceUpgradeAccountId,
        telegramUserId: purchaseOrder.telegramUserId,
      },
    });

    if (!deviceUpgradeAccount || targetExtraDeviceCount === null) {
      return null;
    }

    const remnawaveUser = await fetchRemnawaveUser(deviceUpgradeAccount.remnawaveUuid);
    const updatedUser = await updateRemnawaveUser({
      uuid: deviceUpgradeAccount.remnawaveUuid,
      username: deviceUpgradeAccount.username,
      expireAt: deviceUpgradeAccount.expireAt.toISOString(),
      activeInternalSquads: remnawaveUser.activeInternalSquads.map((squad) => squad.uuid),
      trafficLimitBytes: remnawaveUser.trafficLimitBytes,
      hwidDeviceLimit: tariff.freeDevicesPerUser + targetExtraDeviceCount,
    });

    const updatedAccount = await prisma.remnawaveUserAccount.update({
      where: {
        id: deviceUpgradeAccount.id,
      },
      data: {
        subscriptionUrl: updatedUser.subscriptionUrl,
        expireAt: new Date(updatedUser.expireAt),
      },
    });

    return {
      account: updatedAccount,
      remnawaveUser: updatedUser,
    };
  }

  if (renewalAccountId !== null) {
    const renewalAccount = await prisma.remnawaveUserAccount.findFirst({
      where: {
        id: renewalAccountId,
        telegramUserId: purchaseOrder.telegramUserId,
      },
    });

    if (!renewalAccount) {
      return null;
    }

    const [remnawaveUser, activeQuotas] = await Promise.all([
      fetchRemnawaveUser(renewalAccount.remnawaveUuid),
      getActiveQuotasForAccount(renewalAccount.id),
    ]);
    const currentUsedBytes = BigInt(remnawaveUser.userTraffic.usedTrafficBytes);
    const remainingBytes = sumRemainingBytes(activeQuotas);
    const addedQuotaBytes = tariff.squads.reduce((sum, squad) => (
      sum + toBytesFromDailyGb(squad.trafficIncludedGbPerDay, purchaseOrder.durationDays)
    ), 0n);
    const nextExpireBase =
      renewalAccount.expireAt > new Date() ? renewalAccount.expireAt : new Date();
    const nextExpireAt = addDays(nextExpireBase, purchaseOrder.durationDays);
    const nextActiveSquads = [
      ...new Set([
        ...activeSquadUuidsFromQuotas(activeQuotas),
        ...tariff.squads
          .filter((squad) => squad.trafficIncludedGbPerDay > 0)
          .map((squad) => squad.squadUuid),
      ]),
    ];
    const nextDeviceLimit = tariff.freeDevicesPerUser + purchaseOrder.extraDeviceCount;
    const updatedUser = await updateRemnawaveUser({
      uuid: renewalAccount.remnawaveUuid,
      username: renewalAccount.username,
      expireAt: nextExpireAt.toISOString(),
      activeInternalSquads: nextActiveSquads,
      trafficLimitBytes: Number(currentUsedBytes + remainingBytes + addedQuotaBytes),
      hwidDeviceLimit: nextDeviceLimit,
    });

    const updatedAccount = await prisma.remnawaveUserAccount.update({
      where: {
        id: renewalAccount.id,
      },
      data: {
        purchaseOrderId: purchaseOrder.id,
        subscriptionUrl: updatedUser.subscriptionUrl,
        expireAt: new Date(updatedUser.expireAt),
        lastObservedUsedBytes: currentUsedBytes,
      },
    });

    await createOrderQuotas(
      updatedAccount.id,
      purchaseOrder,
      tariff as TariffDetails,
      nextExpireAt,
    );

    return {
      account: updatedAccount,
      remnawaveUser: updatedUser,
    };
  }

  const existingAccount = await prisma.remnawaveUserAccount.findUnique({
    where: {
      purchaseOrderId,
    },
  });

  if (existingAccount) {
    const remnawaveUser = await fetchRemnawaveUser(existingAccount.remnawaveUuid);

    return {
      account: existingAccount,
      remnawaveUser,
    };
  }

  const username = makeRemnawaveUsername(purchaseOrder.telegramUser, purchaseOrder.id);
  const remnawaveUuid = randomUUID();
  const nextExpireAt = addDays(new Date(), purchaseOrder.durationDays);
  const hwidDeviceLimit = tariff.freeDevicesPerUser + purchaseOrder.extraDeviceCount;
  const addedQuotaBytes = tariff.squads.reduce((sum, squad) => (
    sum + toBytesFromDailyGb(squad.trafficIncludedGbPerDay, purchaseOrder.durationDays)
  ), 0n);
  const nextTrafficLimitBytes = addedQuotaBytes;
  const nextSquadUuids = tariff.squads
    .filter((squad) => squad.trafficIncludedGbPerDay > 0)
    .map((squad) => squad.squadUuid);

  const remnawaveUser = await createRemnawaveUser({
    uuid: remnawaveUuid,
    username,
    expireAt: nextExpireAt.toISOString(),
    activeInternalSquads: nextSquadUuids,
    trafficLimitBytes: Number(nextTrafficLimitBytes),
    hwidDeviceLimit,
  });

  const account = await upsertLocalRemnawaveAccount({
    telegramUserId: purchaseOrder.telegramUserId,
    purchaseOrderId: purchaseOrder.id,
    remnawaveUuid: remnawaveUser.uuid,
    username: remnawaveUser.username,
    subscriptionUrl: remnawaveUser.subscriptionUrl,
    expireAt: new Date(remnawaveUser.expireAt),
  });

  await createOrderQuotas(account.id, purchaseOrder, tariff as TariffDetails);

  return {
    account,
    remnawaveUser,
  };
}

export async function getUserRemnawaveAccounts(telegramUserId: number) {
  return prisma.remnawaveUserAccount.findMany({
    where: {
      telegramUserId,
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
        createdAt: "desc",
      },
      {
        id: "desc",
      },
    ],
  });
}

export async function getUserSubscriptionSummaries(telegramUserId: number): Promise<UserSubscriptionSummary[]> {
  const accounts = await getUserRemnawaveAccounts(telegramUserId);

  return Promise.all(accounts.map(async (account) => {
    const deviceState = await getRemnawaveUserDeviceState(account.remnawaveUuid);
    const connectedDeviceCount = Math.min(deviceState.devices.length, deviceState.deviceLimit);

    return {
      ...account,
      connectedDeviceCount,
      deviceLimit: deviceState.deviceLimit,
      remainingTrafficBytes: calculateRemainingTrafficBytes(account),
    };
  }));
}

export async function getUserRemnawaveAccountById(
  telegramUserId: number,
  accountId: number,
) {
  return prisma.remnawaveUserAccount.findFirst({
    where: {
      id: accountId,
      telegramUserId,
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

export async function getRemnawaveUserDeviceState(remnawaveUuid: string) {
  const [remnawaveUser, hwidDevices] = await Promise.all([
    fetchRemnawaveUser(remnawaveUuid),
    fetchRemnawaveUserHwidDevices(remnawaveUuid),
  ]);

  return {
    deviceLimit: remnawaveUser.hwidDeviceLimit ?? hwidDevices.total,
    devices: hwidDevices.devices,
    total: hwidDevices.total,
  };
}

export async function syncRemnawaveUserQuotaState(accountId: number) {
  const account = await prisma.remnawaveUserAccount.findUnique({
    where: {
      id: accountId,
    },
  });

  if (!account) {
    return null;
  }

  const remnawaveUser = await fetchRemnawaveUser(account.remnawaveUuid);
  const currentUsedBytes = BigInt(remnawaveUser.userTraffic.usedTrafficBytes);
  const deltaUsedBytes =
    currentUsedBytes > account.lastObservedUsedBytes
      ? currentUsedBytes - account.lastObservedUsedBytes
      : 0n;

  if (deltaUsedBytes > 0n) {
    let remainingDelta = deltaUsedBytes;
    const activeQuotas = await getActiveQuotasForAccount(account.id);

    for (const quota of activeQuotas) {
      if (remainingDelta <= 0n) {
        break;
      }

      const remainingQuota = quota.grantedTrafficBytes - quota.consumedTrafficBytes;

      if (remainingQuota <= 0n) {
        continue;
      }

      const consumedNow = remainingDelta > remainingQuota ? remainingQuota : remainingDelta;
      const nextConsumed = quota.consumedTrafficBytes + consumedNow;

      await prisma.userSquadQuota.update({
        where: {
          id: quota.id,
        },
        data: {
          consumedTrafficBytes: nextConsumed,
          exhaustedAt: nextConsumed >= quota.grantedTrafficBytes ? new Date() : null,
        },
      });

      remainingDelta -= consumedNow;
    }
  }

  const refreshedQuotas = await getActiveQuotasForAccount(account.id);
  const nextRemainingBytes = sumRemainingBytes(refreshedQuotas);
  const nextActiveSquads = activeSquadUuidsFromQuotas(refreshedQuotas);

  const updatedUser = await updateRemnawaveUser({
    uuid: account.remnawaveUuid,
    username: account.username,
    expireAt: account.expireAt.toISOString(),
    activeInternalSquads: nextActiveSquads,
    trafficLimitBytes: Number(currentUsedBytes + nextRemainingBytes),
    hwidDeviceLimit: remnawaveUser.hwidDeviceLimit ?? 0,
  });

  await prisma.remnawaveUserAccount.update({
    where: {
      id: account.id,
    },
    data: {
      subscriptionUrl: updatedUser.subscriptionUrl,
      expireAt: new Date(updatedUser.expireAt),
      lastObservedUsedBytes: currentUsedBytes,
    },
  });

  return {
    updatedUser,
    remainingBytes: nextRemainingBytes,
  };
}

export async function syncAllRemnawaveUserQuotaStates() {
  const accounts = await prisma.remnawaveUserAccount.findMany({
    orderBy: {
      id: "asc",
    },
  });

  let synced = 0;

  for (const account of accounts) {
    await syncRemnawaveUserQuotaState(account.id);
    synced += 1;
  }

  return synced;
}

export async function deleteRemnawaveUser(uuid: string) {
  const { requestUrl, init } = buildRemnawaveRequest(`/api/users/${uuid}`, "DELETE");
  const response = await fetch(requestUrl, init);

  if (!response.ok) {
    throw new Error(`Remnawave user delete failed: ${response.status}`);
  }

  return response.json();
}
