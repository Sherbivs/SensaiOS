-- CreateTable
CREATE TABLE "db_version" (
    "id" SERIAL NOT NULL,
    "versionFingerprint" TEXT NOT NULL,
    "migrationCount" INTEGER NOT NULL,
    "lastMigrationName" TEXT NOT NULL,
    "lastMigrationAppliedAt" TIMESTAMP(3) NOT NULL,
    "syncSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "db_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "db_sync_state" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastDuration" INTEGER,
    "lastError" TEXT,
    "lastIntegrityCheck" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "db_sync_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "db_version_versionFingerprint_idx" ON "db_version"("versionFingerprint");

-- CreateIndex
CREATE INDEX "db_sync_state_status_idx" ON "db_sync_state"("status");

-- CreateIndex
CREATE UNIQUE INDEX "db_sync_state_source_target_key" ON "db_sync_state"("source", "target");
