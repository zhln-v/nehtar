import { bot } from "./bot.js";
import { config } from "./config.js";

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
