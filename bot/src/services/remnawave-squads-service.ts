import { z } from "zod";

import { config } from "../config.js";
import type { TrafficUnit } from "../generated/prisma/index.js";
import { prisma } from "../db.js";

const internalSquadSchema = z.object({
  uuid: z.string().uuid(),
  viewPosition: z.number().int(),
  name: z.string(),
  info: z.object({
    membersCount: z.number(),
    inboundsCount: z.number(),
  }),
});

const getInternalSquadsResponseSchema = z.object({
  response: z.object({
    total: z.number(),
    internalSquads: z.array(internalSquadSchema),
  }),
});

function buildRemnawaveRequest(urlPath: string) {
  const baseUrl = new URL(config.REMNAWAVE_API_URL);
  const requestUrl = new URL(urlPath, baseUrl);
  const headers = new Headers({
    Authorization: `Bearer ${config.REMNAWAVE_API_TOKEN}`,
  });

  if (baseUrl.hostname === "127.0.0.1" && baseUrl.port === "3000") {
    headers.set("X-Forwarded-Proto", "https");
    headers.set("X-Forwarded-For", "127.0.0.1");
    headers.set("X-Forwarded-Host", "remnawave.localhost:8080");
    headers.set("Host", "remnawave.localhost:8080");
  }

  return {
    requestUrl,
    headers,
  };
}

export async function syncInternalSquadsFromRemnawave() {
  if (!config.REMNAWAVE_API_TOKEN) {
    throw new Error("REMNAWAVE_API_TOKEN не задан");
  }

  const { requestUrl, headers } = buildRemnawaveRequest("/api/internal-squads");

  const response = await fetch(requestUrl, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Remnawave API вернул ${response.status}`);
  }

  const parsed = getInternalSquadsResponseSchema.parse(await response.json());
  const squads = parsed.response.internalSquads;
  const now = new Date();
  const squadUuids = squads.map((squad) => squad.uuid);

  await prisma.$transaction(async (tx) => {
    for (const squad of squads) {
      await tx.remnawaveInternalSquad.upsert({
        where: {
          uuid: squad.uuid,
        },
        update: {
          name: squad.name,
          viewPosition: squad.viewPosition,
          membersCount: squad.info.membersCount,
          inboundsCount: squad.info.inboundsCount,
          syncedAt: now,
        },
        create: {
          uuid: squad.uuid,
          name: squad.name,
          viewPosition: squad.viewPosition,
          membersCount: squad.info.membersCount,
          inboundsCount: squad.info.inboundsCount,
          syncedAt: now,
        },
      });
    }

    if (squadUuids.length > 0) {
      await tx.tariffSquad.deleteMany({
        where: {
          squadUuid: {
            notIn: squadUuids,
          },
        },
      });

      await tx.remnawaveInternalSquad.deleteMany({
        where: {
          uuid: {
            notIn: squadUuids,
          },
        },
      });
      return;
    }

    await tx.tariffSquad.deleteMany();
    await tx.remnawaveInternalSquad.deleteMany();
  });

  return squads.length;
}

export async function getInternalSquads() {
  return prisma.remnawaveInternalSquad.findMany({
    orderBy: [
      {
        viewPosition: "asc",
      },
      {
        name: "asc",
      },
    ],
  });
}

export async function getInternalSquadByUuid(uuid: string) {
  return prisma.remnawaveInternalSquad.findUnique({
    where: {
      uuid,
    },
  });
}

export async function updateInternalSquadSettings(
  uuid: string,
  data: Partial<{
    displayName: string | null;
    deviceDailyPriceMinor: number;
    trafficPricePerGbMinor: number;
    trafficPriceUnit: TrafficUnit;
  }>,
) {
  return prisma.remnawaveInternalSquad.update({
    where: {
      uuid,
    },
    data,
  });
}
