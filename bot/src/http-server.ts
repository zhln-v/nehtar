import { bot } from "./bot.js";
import { config } from "./config.js";
import { reissueRemnawaveSubscriptionLink } from "./services/remnawave-users-service.js";

type ServerHandle = {
  stop: () => void;
};

const bunRuntime = globalThis as typeof globalThis & {
  Bun?: {
    serve: (options: {
      port: number;
      fetch: (request: Request) => Response | Promise<Response>;
    }) => ServerHandle;
  };
};

function getWebhookSecretHeader(request: Request) {
  return request.headers.get("x-telegram-bot-api-secret-token") ?? "";
}

function isAuthorizedInternalRequest(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const expectedToken = config.BOT_INTERNAL_API_TOKEN;

  if (!expectedToken) {
    return false;
  }

  return authHeader === `Bearer ${expectedToken}`;
}

export function startHttpServer() {
  if (!bunRuntime.Bun) {
    throw new Error("HTTP server is supported only in Bun runtime");
  }

  return bunRuntime.Bun.serve({
    port: config.PORT,
    fetch: async (request) => {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/health") {
        return new Response("ok", { status: 200 });
      }

      if (request.method === "POST" && /^\/api\/subscriptions\/\d+\/reissue-link$/.test(url.pathname)) {
        if (!isAuthorizedInternalRequest(request)) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        const accountId = Number(url.pathname.match(/^\/api\/subscriptions\/(\d+)\/reissue-link$/)?.[1]);

        if (!Number.isInteger(accountId) || accountId <= 0) {
          return Response.json({ error: "invalid_subscription_id" }, { status: 400 });
        }

        try {
          const result = await reissueRemnawaveSubscriptionLink(accountId);

          if (!result) {
            return Response.json({ error: "subscription_not_found" }, { status: 404 });
          }

          return Response.json({
            success: true,
            subscriptionId: result.account.id,
            subscriptionUrl: result.account.subscriptionUrl,
            remnawaveUuid: result.account.remnawaveUuid,
            username: result.account.username,
            expireAt: result.account.expireAt.toISOString(),
          });
        } catch (error) {
          console.error("Failed to reissue subscription link", error);
          return Response.json({ error: "reissue_failed" }, { status: 502 });
        }
      }

      if (config.BOT_MODE === "webhook" && request.method === "POST" && url.pathname === config.WEBHOOK_PATH) {
        if (
          config.WEBHOOK_SECRET_TOKEN &&
          getWebhookSecretHeader(request) !== config.WEBHOOK_SECRET_TOKEN
        ) {
          return new Response("forbidden", { status: 403 });
        }

        const update = await request.json();
        await bot.handleUpdate(update);

        return new Response("ok", { status: 200 });
      }

      return new Response("not found", { status: 404 });
    },
  });
}
