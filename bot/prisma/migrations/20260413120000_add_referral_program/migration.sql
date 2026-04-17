-- AlterTable
ALTER TABLE "BillingSettings"
ADD COLUMN     "referralProgramEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referralTopUpRewardPercent" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "TelegramUser"
ADD COLUMN     "referredAt" TIMESTAMP(3),
ADD COLUMN     "referredByUserId" INTEGER,
ADD COLUMN     "referralCode" TEXT;

UPDATE "TelegramUser"
SET "referralCode" = substr(md5((random()::text || clock_timestamp()::text)), 1, 16)
WHERE "referralCode" IS NULL;

ALTER TABLE "TelegramUser"
ALTER COLUMN "referralCode" SET NOT NULL,
ALTER COLUMN "referralCode" SET DEFAULT substr(md5((random()::text || clock_timestamp()::text)), 1, 16);

-- CreateTable
CREATE TABLE "ReferralReward" (
    "id" SERIAL NOT NULL,
    "referrerUserId" INTEGER NOT NULL,
    "referredUserId" INTEGER NOT NULL,
    "balanceTopUpOrderId" TEXT NOT NULL,
    "rewardPercent" INTEGER NOT NULL,
    "topUpAmountMinor" INTEGER NOT NULL,
    "rewardAmountMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUser_referralCode_key" ON "TelegramUser"("referralCode");

-- CreateIndex
CREATE INDEX "ReferralReward_referrerUserId_createdAt_idx" ON "ReferralReward"("referrerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralReward_referredUserId_createdAt_idx" ON "ReferralReward"("referredUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_balanceTopUpOrderId_key" ON "ReferralReward"("balanceTopUpOrderId");

-- AddForeignKey
ALTER TABLE "TelegramUser" ADD CONSTRAINT "TelegramUser_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "TelegramUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "TelegramUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "TelegramUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_balanceTopUpOrderId_fkey" FOREIGN KEY ("balanceTopUpOrderId") REFERENCES "BalanceTopUpOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
