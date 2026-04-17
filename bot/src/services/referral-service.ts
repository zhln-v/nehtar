import { config } from "../config.js";
import { prisma } from "../db.js";

const REFERRAL_START_PREFIX = "ref_";

export type ReferralSummary = {
  referralCode: string;
  referralCommand: string;
  referralLink: string | null;
  invitedUsersCount: number;
  invitedUsersWithTopUpsCount: number;
  totalRewardMinor: number;
  totalReferralTopUpMinor: number;
};

export function parseReferralStartPayload(payload: string | undefined) {
  if (!payload?.startsWith(REFERRAL_START_PREFIX)) {
    return null;
  }

  const referralCode = payload.slice(REFERRAL_START_PREFIX.length).trim();
  return referralCode.length > 0 ? referralCode : null;
}

export function buildReferralCommand(referralCode: string) {
  return `/start ${REFERRAL_START_PREFIX}${referralCode}`;
}

export function buildReferralLink(referralCode: string) {
  if (!config.BOT_USERNAME) {
    return null;
  }

  return `https://t.me/${config.BOT_USERNAME}?start=${REFERRAL_START_PREFIX}${referralCode}`;
}

export async function attachReferrerByReferralCode(
  telegramUserId: number,
  referralCode: string,
) {
  const [user, referrer] = await Promise.all([
    prisma.telegramUser.findUnique({
      where: {
        id: telegramUserId,
      },
    }),
    prisma.telegramUser.findUnique({
      where: {
        referralCode,
      },
    }),
  ]);

  if (!user || !referrer) {
    return null;
  }

  if (user.id === referrer.id || user.referredByUserId) {
    return user;
  }

  return prisma.telegramUser.update({
    where: {
      id: user.id,
    },
    data: {
      referredByUserId: referrer.id,
      referredAt: new Date(),
    },
  });
}

export async function getReferralSummary(telegramUserId: number): Promise<ReferralSummary | null> {
  const [user, rewards, invitedUsersCount, invitedUsersWithTopUpsCount] = await Promise.all([
    prisma.telegramUser.findUnique({
      where: {
        id: telegramUserId,
      },
    }),
    prisma.referralReward.aggregate({
      where: {
        referrerUserId: telegramUserId,
      },
      _sum: {
        rewardAmountMinor: true,
        topUpAmountMinor: true,
      },
    }),
    prisma.telegramUser.count({
      where: {
        referredByUserId: telegramUserId,
      },
    }),
    prisma.telegramUser.count({
      where: {
        referredByUserId: telegramUserId,
        balanceTopUpOrders: {
          some: {
            status: "PAID",
          },
        },
      },
    }),
  ]);

  if (!user) {
    return null;
  }

  return {
    referralCode: user.referralCode,
    referralCommand: buildReferralCommand(user.referralCode),
    referralLink: buildReferralLink(user.referralCode),
    invitedUsersCount,
    invitedUsersWithTopUpsCount,
    totalRewardMinor: rewards._sum.rewardAmountMinor ?? 0,
    totalReferralTopUpMinor: rewards._sum.topUpAmountMinor ?? 0,
  };
}

export async function getUserReferralRewardById(
  telegramUserId: number,
  rewardId: number,
) {
  return prisma.referralReward.findFirst({
    where: {
      id: rewardId,
      referrerUserId: telegramUserId,
    },
    include: {
      referredUser: true,
      balanceTopUpOrder: true,
    },
  });
}
