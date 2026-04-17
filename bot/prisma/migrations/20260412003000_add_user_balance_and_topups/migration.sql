-- AlterTable
ALTER TABLE "TelegramUser" ADD COLUMN "balanceMinor" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BalanceTopUpOrder" (
    "id" TEXT NOT NULL,
    "telegramUserId" INTEGER NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amountMinor" INTEGER NOT NULL,
    "amountStars" INTEGER,
    "currencyCode" TEXT NOT NULL DEFAULT 'RUB',
    "invoicePayload" TEXT,
    "telegramChargeId" TEXT,
    "providerPaymentId" TEXT,
    "providerConfirmationUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BalanceTopUpOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BalanceTopUpOrder_invoicePayload_key" ON "BalanceTopUpOrder"("invoicePayload");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceTopUpOrder_telegramChargeId_key" ON "BalanceTopUpOrder"("telegramChargeId");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceTopUpOrder_providerPaymentId_key" ON "BalanceTopUpOrder"("providerPaymentId");

-- AddForeignKey
ALTER TABLE "BalanceTopUpOrder"
ADD CONSTRAINT "BalanceTopUpOrder_telegramUserId_fkey"
FOREIGN KEY ("telegramUserId") REFERENCES "TelegramUser"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
