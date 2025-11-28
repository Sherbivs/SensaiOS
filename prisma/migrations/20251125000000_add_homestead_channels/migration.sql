-- CreateTable
CREATE TABLE "homestead_channels" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homestead_channels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "homestead_channels_userId_key" ON "homestead_channels"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "homestead_channels_channelId_key" ON "homestead_channels"("channelId");

-- CreateIndex
CREATE INDEX "homestead_channels_guildId_idx" ON "homestead_channels"("guildId");

-- CreateIndex
CREATE INDEX "homestead_channels_channelId_idx" ON "homestead_channels"("channelId");

-- AddForeignKey
ALTER TABLE "homestead_channels" ADD CONSTRAINT "homestead_channels_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
