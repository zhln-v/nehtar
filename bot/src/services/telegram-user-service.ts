import type { Context } from "grammy";

import { prisma } from "../db.js";

export async function upsertTelegramUser(ctx: Context) {
  if (!ctx.from) {
    throw new Error("Невозможно сохранить пользователя без ctx.from");
  }

  const privateChatId =
    ctx.chat?.type === "private" ? BigInt(ctx.chat.id) : null;

  return prisma.telegramUser.upsert({
    where: {
      telegramId: BigInt(ctx.from.id),
    },
    update: {
      username: ctx.from.username ?? null,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name ?? null,
      languageCode: ctx.from.language_code ?? null,
      isBot: ctx.from.is_bot,
      privateChatId,
    },
    create: {
      telegramId: BigInt(ctx.from.id),
      username: ctx.from.username ?? null,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name ?? null,
      languageCode: ctx.from.language_code ?? null,
      isBot: ctx.from.is_bot,
      privateChatId,
    },
  });
}

export async function updateTelegramUserMenuMessage(
  telegramId: bigint,
  messageId: number,
) {
  return prisma.telegramUser.update({
    where: {
      telegramId,
    },
    data: {
      lastMenuMessageId: messageId,
    },
  });
}

export async function getTelegramUserByTelegramId(telegramId: bigint) {
  return prisma.telegramUser.findUnique({
    where: {
      telegramId,
    },
  });
}

export async function touchTelegramUserActivity(telegramId: bigint) {
  const user = await prisma.telegramUser.findUnique({
    where: {
      telegramId,
    },
  });

  if (!user) {
    return null;
  }

  return prisma.telegramUser.update({
    where: {
      telegramId,
    },
    data: {
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      languageCode: user.languageCode,
      isBot: user.isBot,
      privateChatId: user.privateChatId,
      lastMenuMessageId: user.lastMenuMessageId,
    },
  });
}
