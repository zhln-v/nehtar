import type { Prisma } from "../generated/prisma/index.js";
import { prisma } from "../db.js";
import { getBillingSettings } from "./billing-settings-service.js";

const tariffDetailsInclude = {
  periods: {
    orderBy: [
      {
        durationDays: "asc",
      },
      {
        id: "asc",
      },
    ],
  },
  squads: {
    include: {
      squad: true,
    },
    orderBy: [
      {
        createdAt: "asc",
      },
      {
        id: "asc",
      },
    ],
  },
} satisfies Prisma.TariffInclude;

export type TariffDetails = Prisma.TariffGetPayload<{
  include: typeof tariffDetailsInclude;
}>;

export async function getTariffs() {
  return prisma.tariff.findMany({
    orderBy: [
      {
        isActive: "desc",
      },
      {
        createdAt: "asc",
      },
    ],
  });
}

export async function getActiveTariffs() {
  return prisma.tariff.findMany({
    where: {
      isActive: true,
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

export async function createTariffFromDefaults(name: string) {
  const settings = await getBillingSettings();

  return prisma.tariff.create({
    data: {
      name,
      currencyCode: settings.currencyCode,
      dailyPriceMinor: 0,
      freeDevicesPerUser: settings.freeDevicesPerUser,
      deviceDailyPriceMinor: settings.paidDeviceDailyPriceMinor,
      periods: {
        create: {
          durationDays: 30,
          discountPercent: 0,
        },
      },
    },
  });
}

export async function getTariffById(id: number) {
  return prisma.tariff.findUnique({
    where: {
      id,
    },
    include: tariffDetailsInclude,
  });
}

export async function getActiveTariffById(id: number) {
  return prisma.tariff.findFirst({
    where: {
      id,
      isActive: true,
    },
    include: tariffDetailsInclude,
  });
}

export async function updateTariff(
  id: number,
  data: Partial<{
    name: string;
    description: string | null;
    usageTerms: string | null;
    dailyPriceMinor: number;
    freeDevicesPerUser: number;
    deviceDailyPriceMinor: number;
    isActive: boolean;
  }>,
) {
  return prisma.tariff.update({
    where: {
      id,
    },
    data,
  });
}

export async function toggleTariffActive(id: number) {
  const tariff = await prisma.tariff.findUnique({
    where: {
      id,
    },
  });

  if (!tariff) {
    return null;
  }

  return updateTariff(id, {
    isActive: !tariff.isActive,
  });
}

export async function addSquadToTariff(tariffId: number, squadUuid: string) {
  const squad = await prisma.remnawaveInternalSquad.findUnique({
    where: {
      uuid: squadUuid,
    },
  });

  if (!squad) {
    return null;
  }

  return prisma.tariffSquad.upsert({
    where: {
      tariffId_squadUuid: {
        tariffId,
        squadUuid,
      },
    },
    update: {},
    create: {
      tariffId,
      squadUuid,
      displayName: null,
    },
  });
}

export async function getTariffPeriodById(id: number) {
  return prisma.tariffPeriod.findUnique({
    where: {
      id,
    },
    include: {
      tariff: true,
    },
  });
}

export async function createTariffPeriod(tariffId: number, durationDays: number) {
  return prisma.tariffPeriod.create({
    data: {
      tariffId,
      durationDays,
      discountPercent: 0,
    },
  });
}

export async function updateTariffPeriod(
  id: number,
  data: Partial<{
    durationDays: number;
    discountPercent: number;
  }>,
) {
  return prisma.tariffPeriod.update({
    where: {
      id,
    },
    data,
  });
}

export async function removeTariffPeriod(id: number) {
  return prisma.tariffPeriod.delete({
    where: {
      id,
    },
  });
}

export async function getTariffSquadById(id: number) {
  return prisma.tariffSquad.findUnique({
    where: {
      id,
    },
    include: {
      squad: true,
      tariff: true,
    },
  });
}

export async function updateTariffSquad(
  id: number,
  data: Partial<{
    displayName: string | null;
    trafficIncludedGbPerDay: number;
    trafficPricePerGbMinor: number;
  }>,
) {
  return prisma.tariffSquad.update({
    where: {
      id,
    },
    data,
  });
}

export async function removeTariffSquad(id: number) {
  return prisma.tariffSquad.delete({
    where: {
      id,
    },
  });
}
