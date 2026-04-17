export function getTelegramRetryAfterSeconds(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  const maybeError = error as {
    parameters?: {
      retry_after?: number;
    };
    description?: string;
  };

  if (typeof maybeError.parameters?.retry_after === "number") {
    return maybeError.parameters.retry_after;
  }

  const description = maybeError.description;

  if (typeof description !== "string") {
    return null;
  }

  const match = description.match(/retry after (\d+)/i);
  return match ? Number(match[1]) : null;
}
