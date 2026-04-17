-- CreateEnum
CREATE TYPE "TrafficUnit" AS ENUM ('MB', 'GB', 'TB');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STARS', 'YOOKASSA');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED', 'FAILED');

-- CreateTable
CREATE TABLE "TelegramUser" (
    "id" SERIAL NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "languageCode" TEXT,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "privateChatId" BIGINT,
    "lastMenuMessageId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "currencyCode" TEXT NOT NULL DEFAULT 'RUB',
    "freeDevicesPerUser" INTEGER NOT NULL DEFAULT 1,
    "paidDeviceDailyPriceMinor" INTEGER NOT NULL DEFAULT 1500,
    "trafficBillingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "trafficPricePerGbMinor" INTEGER NOT NULL DEFAULT 500,
    "freeSquadName" TEXT NOT NULL DEFAULT 'free',
    "paidSquadName" TEXT NOT NULL DEFAULT 'paid',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemnawaveInternalSquad" (
    "uuid" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "viewPosition" INTEGER NOT NULL,
    "membersCount" INTEGER NOT NULL DEFAULT 0,
    "inboundsCount" INTEGER NOT NULL DEFAULT 0,
    "deviceDailyPriceMinor" INTEGER NOT NULL DEFAULT 0,
    "trafficPricePerGbMinor" INTEGER NOT NULL DEFAULT 0,
    "trafficPriceUnit" "TrafficUnit" NOT NULL DEFAULT 'GB',
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RemnawaveInternalSquad_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "AdminInputSession" (
    "id" SERIAL NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "squadUuid" UUID,
    "tariffId" INTEGER,
    "tariffSquadId" INTEGER,
    "tariffPeriodId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminInputSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tariff" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "usageTerms" TEXT,
    "currencyCode" TEXT NOT NULL DEFAULT 'RUB',
    "dailyPriceMinor" INTEGER NOT NULL DEFAULT 0,
    "freeDevicesPerUser" INTEGER NOT NULL DEFAULT 1,
    "deviceDailyPriceMinor" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TariffPeriod" (
    "id" SERIAL NOT NULL,
    "tariffId" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TariffPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "telegramUserId" INTEGER NOT NULL,
    "tariffId" INTEGER NOT NULL,
    "tariffPeriodId" INTEGER NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "extraDeviceCount" INTEGER NOT NULL DEFAULT 0,
    "durationDays" INTEGER NOT NULL,
    "basePriceMinor" INTEGER NOT NULL,
    "extraDevicesPriceMinor" INTEGER NOT NULL DEFAULT 0,
    "totalPriceMinor" INTEGER NOT NULL,
    "totalPriceStars" INTEGER,
    "currencyCode" TEXT NOT NULL DEFAULT 'RUB',
    "invoicePayload" TEXT,
    "telegramChargeId" TEXT,
    "providerPaymentId" TEXT,
    "providerConfirmationUrl" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemnawaveUserAccount" (
    "id" SERIAL NOT NULL,
    "telegramUserId" INTEGER NOT NULL,
    "purchaseOrderId" TEXT,
    "remnawaveUuid" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "subscriptionUrl" TEXT,
    "expireAt" TIMESTAMP(3) NOT NULL,
    "lastObservedUsedBytes" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RemnawaveUserAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSquadQuota" (
    "id" SERIAL NOT NULL,
    "remnawaveAccountId" INTEGER NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "squadUuid" UUID NOT NULL,
    "grantedTrafficBytes" BIGINT NOT NULL,
    "consumedTrafficBytes" BIGINT NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "exhaustedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSquadQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TariffSquad" (
    "id" SERIAL NOT NULL,
    "tariffId" INTEGER NOT NULL,
    "squadUuid" UUID NOT NULL,
    "displayName" TEXT,
    "trafficIncludedGbPerDay" INTEGER NOT NULL DEFAULT 0,
    "trafficPricePerGbMinor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TariffSquad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUser_telegramId_key" ON "TelegramUser"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminInputSession_telegramId_key" ON "AdminInputSession"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "Tariff_name_key" ON "Tariff"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TariffPeriod_tariffId_durationDays_key" ON "TariffPeriod"("tariffId", "durationDays");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_invoicePayload_key" ON "PurchaseOrder"("invoicePayload");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_telegramChargeId_key" ON "PurchaseOrder"("telegramChargeId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_providerPaymentId_key" ON "PurchaseOrder"("providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "RemnawaveUserAccount_purchaseOrderId_key" ON "RemnawaveUserAccount"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "RemnawaveUserAccount_remnawaveUuid_key" ON "RemnawaveUserAccount"("remnawaveUuid");

-- CreateIndex
CREATE UNIQUE INDEX "RemnawaveUserAccount_username_key" ON "RemnawaveUserAccount"("username");

-- CreateIndex
CREATE INDEX "RemnawaveUserAccount_telegramUserId_updatedAt_idx" ON "RemnawaveUserAccount"("telegramUserId", "updatedAt");

-- CreateIndex
CREATE INDEX "UserSquadQuota_remnawaveAccountId_expiresAt_idx" ON "UserSquadQuota"("remnawaveAccountId", "expiresAt");

-- CreateIndex
CREATE INDEX "UserSquadQuota_purchaseOrderId_idx" ON "UserSquadQuota"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "TariffSquad_tariffId_squadUuid_key" ON "TariffSquad"("tariffId", "squadUuid");

-- AddForeignKey
ALTER TABLE "TariffPeriod" ADD CONSTRAINT "TariffPeriod_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "Tariff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_telegramUserId_fkey" FOREIGN KEY ("telegramUserId") REFERENCES "TelegramUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "Tariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_tariffPeriodId_fkey" FOREIGN KEY ("tariffPeriodId") REFERENCES "TariffPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemnawaveUserAccount" ADD CONSTRAINT "RemnawaveUserAccount_telegramUserId_fkey" FOREIGN KEY ("telegramUserId") REFERENCES "TelegramUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemnawaveUserAccount" ADD CONSTRAINT "RemnawaveUserAccount_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSquadQuota" ADD CONSTRAINT "UserSquadQuota_remnawaveAccountId_fkey" FOREIGN KEY ("remnawaveAccountId") REFERENCES "RemnawaveUserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSquadQuota" ADD CONSTRAINT "UserSquadQuota_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSquadQuota" ADD CONSTRAINT "UserSquadQuota_squadUuid_fkey" FOREIGN KEY ("squadUuid") REFERENCES "RemnawaveInternalSquad"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TariffSquad" ADD CONSTRAINT "TariffSquad_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "Tariff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TariffSquad" ADD CONSTRAINT "TariffSquad_squadUuid_fkey" FOREIGN KEY ("squadUuid") REFERENCES "RemnawaveInternalSquad"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
