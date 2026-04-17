import type { Bot } from "grammy";

import { prisma } from "../db.js";

export const broadcastAudiences = [
  "all_private",
  "subscribers",
  "without_subscriptions",
] as const;

export type BroadcastAudience = (typeof broadcastAudiences)[number];

export type BroadcastAudienceStats = {
  allPrivateCount: number;
  subscribersCount: number;
  withoutSubscriptionsCount: number;
};

export type BroadcastSendResult = {
  audience: BroadcastAudience;
  attemptedCount: number;
  sentCount: number;
  failedCount: number;
};

export function isBroadcastAudience(value: string): value is BroadcastAudience {
  return broadcastAudiences.includes(value as BroadcastAudience);
}

export function formatBroadcastAudienceLabel(audience: BroadcastAudience) {
  switch (audience) {
    case "all_private":
      return "всем, кто открыл бота";
    case "subscribers":
      return "только пользователям с подписками";
    case "without_subscriptions":
      return "только пользователям без подписок";
  }
}

function buildRecipientWhere(audience: BroadcastAudience) {
  switch (audience) {
    case "all_private":
      return {
        privateChatId: {
          not: null,
        },
      } as const;
    case "subscribers":
      return {
        privateChatId: {
          not: null,
        },
        remnawaveAccounts: {
          some: {},
        },
      } as const;
    case "without_subscriptions":
      return {
        privateChatId: {
          not: null,
        },
        remnawaveAccounts: {
          none: {},
        },
      } as const;
  }
}

export async function getBroadcastAudienceStats(): Promise<BroadcastAudienceStats> {
  const [allPrivateCount, subscribersCount, withoutSubscriptionsCount] = await Promise.all([
    prisma.telegramUser.count({
      where: buildRecipientWhere("all_private"),
    }),
    prisma.telegramUser.count({
      where: buildRecipientWhere("subscribers"),
    }),
    prisma.telegramUser.count({
      where: buildRecipientWhere("without_subscriptions"),
    }),
  ]);

  return {
    allPrivateCount,
    subscribersCount,
    withoutSubscriptionsCount,
  };
}

export async function countBroadcastRecipients(audience: BroadcastAudience) {
  return prisma.telegramUser.count({
    where: buildRecipientWhere(audience),
  });
}

export async function sendBroadcast(
  bot: Bot,
  audience: BroadcastAudience,
  text: string,
): Promise<BroadcastSendResult> {
  const recipients = await prisma.telegramUser.findMany({
    where: buildRecipientWhere(audience),
    select: {
      privateChatId: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipients) {
    if (!recipient.privateChatId) {
      continue;
    }

    try {
      await bot.api.sendMessage(Number(recipient.privateChatId), text, {
        parse_mode: "HTML",
      });
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      console.error("Не удалось отправить рассылку пользователю", error);
    }
  }

  return {
    audience,
    attemptedCount: recipients.length,
    sentCount,
    failedCount,
  };
}
