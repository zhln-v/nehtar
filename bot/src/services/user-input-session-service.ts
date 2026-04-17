import { prisma } from "../db.js";

export const userInputKinds = [
  "balance_top_up_amount",
] as const;

export type UserInputKind = (typeof userInputKinds)[number];

function isUserInputKind(value: string): value is UserInputKind {
  return userInputKinds.includes(value as UserInputKind);
}

export async function setUserInputSession(
  telegramId: bigint,
  kind: UserInputKind,
) {
  return prisma.userInputSession.upsert({
    where: {
      telegramId,
    },
    update: {
      kind,
    },
    create: {
      telegramId,
      kind,
    },
  });
}

export async function getUserInputSession(telegramId: bigint) {
  const session = await prisma.userInputSession.findUnique({
    where: {
      telegramId,
    },
  });

  if (!session || !isUserInputKind(session.kind)) {
    return null;
  }

  return {
    ...session,
    kind: session.kind,
  };
}

export async function clearUserInputSession(telegramId: bigint) {
  return prisma.userInputSession.deleteMany({
    where: {
      telegramId,
    },
  });
}
