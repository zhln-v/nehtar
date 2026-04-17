import os from "node:os";

import { prisma } from "../db.js";
import { config } from "../config.js";
import {
  getCurrentLoadPercent,
  getLoadHistorySummary,
} from "./system-load-history-service.js";

export type SystemStatusSnapshot = {
  generatedAt: Date;
  uptimeSec: number;
  pid: number;
  nodeEnv: string;
  platform: string;
  architecture: string;
  bunVersion: string;
  rssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  systemTotalMemoryBytes: number;
  systemFreeMemoryBytes: number;
  systemMemoryUsedPercent: number;
  heapUsedPercent: number;
  loadAverage: [number, number, number];
  loadPercentCurrent: number;
  loadPercentHourAvg: number | null;
  loadPercentTwelveHoursAvg: number | null;
  loadPercentDayAvg: number | null;
  databaseLatencyMs: number;
  usersCount: number;
  usersWithPrivateChatCount: number;
  activeSubscriptionsCount: number;
  topUpPendingCount: number;
  purchasePendingCount: number;
  topUpPaidCount: number;
  purchasePaidCount: number;
  remnawaveSyncIntervalMs: number;
};

export async function getSystemStatusSnapshot(): Promise<SystemStatusSnapshot> {
  const memory = process.memoryUsage();
  const dbStartedAt = performance.now();
  const [
    usersCount,
    usersWithPrivateChatCount,
    activeSubscriptionsCount,
    topUpPendingCount,
    purchasePendingCount,
    topUpPaidCount,
    purchasePaidCount,
  ] = await Promise.all([
    prisma.telegramUser.count(),
    prisma.telegramUser.count({
      where: {
        privateChatId: {
          not: null,
        },
      },
    }),
    prisma.remnawaveUserAccount.count({
      where: {
        expireAt: {
          gt: new Date(),
        },
      },
    }),
    prisma.balanceTopUpOrder.count({
      where: {
        status: "PENDING",
      },
    }),
    prisma.purchaseOrder.count({
      where: {
        status: "PENDING",
      },
    }),
    prisma.balanceTopUpOrder.count({
      where: {
        status: "PAID",
      },
    }),
    prisma.purchaseOrder.count({
      where: {
        status: "PAID",
      },
    }),
  ]);
  await prisma.$queryRaw`SELECT 1`;
  const databaseLatencyMs = Math.round((performance.now() - dbStartedAt) * 100) / 100;
  const loadAverage = os.loadavg() as [number, number, number];
  const systemTotalMemoryBytes = os.totalmem();
  const systemFreeMemoryBytes = os.freemem();
  const currentLoadPercent = getCurrentLoadPercent();
  const loadHistory = getLoadHistorySummary();

  return {
    generatedAt: new Date(),
    uptimeSec: Math.floor(process.uptime()),
    pid: process.pid,
    nodeEnv: process.env.NODE_ENV ?? "development",
    platform: process.platform,
    architecture: process.arch,
    bunVersion: process.versions.bun ?? "не определен",
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    heapTotalBytes: memory.heapTotal,
    systemTotalMemoryBytes,
    systemFreeMemoryBytes,
    systemMemoryUsedPercent:
      systemTotalMemoryBytes > 0
        ? ((systemTotalMemoryBytes - systemFreeMemoryBytes) / systemTotalMemoryBytes) * 100
        : 0,
    heapUsedPercent:
      memory.heapTotal > 0
        ? (memory.heapUsed / memory.heapTotal) * 100
        : 0,
    loadAverage,
    loadPercentCurrent: currentLoadPercent,
    loadPercentHourAvg: loadHistory.hourAvgPercent,
    loadPercentTwelveHoursAvg: loadHistory.twelveHoursAvgPercent,
    loadPercentDayAvg: loadHistory.dayAvgPercent,
    databaseLatencyMs,
    usersCount,
    usersWithPrivateChatCount,
    activeSubscriptionsCount,
    topUpPendingCount,
    purchasePendingCount,
    topUpPaidCount,
    purchasePaidCount,
    remnawaveSyncIntervalMs: config.REMNAWAVE_SYNC_INTERVAL_MS,
  };
}
