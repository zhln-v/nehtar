import { config } from "./config.js";
import { bot } from "./bot.js";
import { disconnectPrisma } from "./db.js";
import { startHttpServer } from "./http-server.js";
import { syncAllRemnawaveUserQuotaStates } from "./services/remnawave-users-service.js";

let remnawaveSyncTimer: ReturnType<typeof setInterval> | null = null;
let httpServer: { stop: () => void } | null = null;

async function configureTelegramDelivery() {
  if (config.BOT_MODE === "webhook") {
    if (!config.WEBHOOK_PUBLIC_URL) {
      throw new Error("WEBHOOK_PUBLIC_URL is required in webhook mode");
    }

    const webhookOptions = config.WEBHOOK_SECRET_TOKEN
      ? {
          secret_token: config.WEBHOOK_SECRET_TOKEN,
          drop_pending_updates: false,
        }
      : {
          drop_pending_updates: false,
        };

    await bot.init();
    await bot.api.setWebhook(config.WEBHOOK_PUBLIC_URL, webhookOptions);

    console.log(`Бот @${bot.botInfo.username} переведен в webhook-режим`);
    return;
  }

  await bot.api.deleteWebhook({
    drop_pending_updates: false,
  });

  await bot.start({
    onStart: (botInfo) => {
      console.log(`Бот @${botInfo.username} запущен`);
    },
  });
}

async function main() {
  await bot.api.setMyCommands([
    { command: "start", description: "Проверить, что бот запущен" },
    { command: "ping", description: "Команда проверки доступности" },
  ]);

  httpServer = startHttpServer();
  console.log(`HTTP сервер запущен на порту ${config.PORT}`);

  await configureTelegramDelivery();

  remnawaveSyncTimer = setInterval(() => {
    void syncAllRemnawaveUserQuotaStates().catch((error) => {
      console.error("Не удалось синхронизировать квоты Remnawave", error);
    });
  }, config.REMNAWAVE_SYNC_INTERVAL_MS);
}

async function shutdown(signal: string) {
  console.log(`Получен сигнал ${signal}, останавливаю бота`);
  if (remnawaveSyncTimer) {
    clearInterval(remnawaveSyncTimer);
  }
  if (httpServer) {
    httpServer.stop();
  }
  await bot.stop();
  await disconnectPrisma();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

void main().catch((error) => {
  console.error("Не удалось запустить бота", error);
  process.exit(1);
});
