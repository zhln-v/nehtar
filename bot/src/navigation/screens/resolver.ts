import type { TelegramUser } from "../../generated/prisma/index.js";
import { isAdminTelegramId } from "../../services/access-service.js";
import { getScreenDefinition } from "./registry.js";
import type { ScreenId } from "../screens.js";

function ensureScreenAccess(user: TelegramUser, screenId: ScreenId) {
  const definition = getScreenDefinition(screenId);

  if (definition.access === "admin" && !isAdminTelegramId(user.telegramId)) {
    throw new Error("Недостаточно прав для открытия админ-экрана");
  }

  return definition;
}

export async function resolveScreen(user: TelegramUser, screenId: ScreenId) {
  const definition = ensureScreenAccess(user, screenId);
  const data = definition.load ? await definition.load(user) : {};

  return definition.render({
    user,
    ...data,
  });
}
