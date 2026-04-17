import type { Context } from "grammy";

function isExpiredCallbackQueryError(error: unknown) {
  return (
    error instanceof Error &&
    (
      error.message.includes("query is too old") ||
      error.message.includes("query ID is invalid") ||
      error.message.includes("response timeout expired")
    )
  );
}

export async function safeAnswerCallbackQuery(
  ctx: Context,
  ...args: Parameters<Context["answerCallbackQuery"]>
) {
  try {
    await ctx.answerCallbackQuery(...args);
  } catch (error) {
    if (isExpiredCallbackQueryError(error)) {
      return;
    }

    throw error;
  }
}
