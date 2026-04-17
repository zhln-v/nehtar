import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  BOT_USERNAME: z.string().default(""),
  BOT_INFO_MESSAGE: z.string().default("Бот запущен и готов к работе"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BOT_MODE: z.enum(["polling", "webhook"]).default("polling"),
  PORT: z.coerce.number().int().positive().default(8080),
  WEBHOOK_PATH: z.string().default("/telegram/webhook"),
  WEBHOOK_PUBLIC_URL: z.string().default(""),
  WEBHOOK_SECRET_TOKEN: z.string().default(""),
  ADMIN_TELEGRAM_IDS: z.string().default(""),
  REMNAWAVE_API_URL: z.string().default("http://remnawave.localhost:8080"),
  REMNAWAVE_API_TOKEN: z.string().default(""),
  TELEGRAM_STARS_PER_RUB: z.coerce.number().positive().default(1),
  YOOKASSA_SHOP_ID: z.string().default(""),
  YOOKASSA_SECRET_KEY: z.string().default(""),
  YOOKASSA_API_URL: z.string().url().default("https://api.yookassa.ru/v3"),
  PAYMENTS_RETURN_URL: z.string().url().default("https://t.me"),
  REMNAWAVE_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(300000),
});

const parsedEnv = envSchema.parse(process.env);

export const config = {
  ...parsedEnv,
  adminTelegramIds: parsedEnv.ADMIN_TELEGRAM_IDS.split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => BigInt(value)),
};
