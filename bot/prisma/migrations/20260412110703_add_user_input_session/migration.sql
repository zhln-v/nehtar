-- CreateTable
CREATE TABLE "UserInputSession" (
    "id" SERIAL NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserInputSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserInputSession_telegramId_key" ON "UserInputSession"("telegramId");
