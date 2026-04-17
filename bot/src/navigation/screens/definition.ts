import type { TelegramUser } from "../../generated/prisma/index.js";
import type { ScreenId } from "../screens.js";
import type { RenderedScreen, ScreenRenderContext } from "./types.js";

export type ScreenAccess = "public" | "admin";

export type ScreenDefinition = {
  id: ScreenId;
  access?: ScreenAccess | undefined;
  load?: ((user: TelegramUser) => Promise<Partial<ScreenRenderContext>>) | undefined;
  render: (context: ScreenRenderContext) => RenderedScreen;
};
