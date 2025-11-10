-- CreateTable: ErrorLog
-- Purpose: Centralized error tracking with fingerprinting and learning capabilities
CREATE TABLE "ErrorLog" (
    "errorId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "errorName" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "stackTrace" TEXT,
    "contextData" JSONB,
    "recoveryAttempted" INTEGER NOT NULL DEFAULT 0,
    "recoverySuccess" INTEGER NOT NULL DEFAULT 0,
    "lastRecoveryStrategy" TEXT,
    "lastRecoveryOutcome" TEXT,
    "impactedFeatures" TEXT[],
    "estimatedUserImpact" INTEGER,
    "learningMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("errorId")
);

-- CreateTable: ErrorAlert
-- Purpose: Track alerts sent for errors requiring attention
CREATE TABLE "ErrorAlert" (
    "alertId" TEXT NOT NULL,
    "errorId" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "recipientId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,

    CONSTRAINT "ErrorAlert_pkey" PRIMARY KEY ("alertId")
);

-- CreateIndex: ErrorLog fingerprint (unique for deduplication)
CREATE UNIQUE INDEX "ErrorLog_fingerprint_key" ON "ErrorLog"("fingerprint");

-- CreateIndex: ErrorLog fingerprint (performance)
CREATE INDEX "ErrorLog_fingerprint_idx" ON "ErrorLog"("fingerprint");

-- CreateIndex: ErrorLog category (for filtering)
CREATE INDEX "ErrorLog_category_idx" ON "ErrorLog"("category");

-- CreateIndex: ErrorLog severity (for filtering)
CREATE INDEX "ErrorLog_severity_idx" ON "ErrorLog"("severity");

-- CreateIndex: ErrorLog lastSeen (for recent errors)
CREATE INDEX "ErrorLog_lastSeen_idx" ON "ErrorLog"("lastSeen" DESC);

-- CreateIndex: ErrorLog occurrenceCount (for top errors)
CREATE INDEX "ErrorLog_occurrenceCount_idx" ON "ErrorLog"("occurrenceCount" DESC);

-- CreateIndex: ErrorAlert errorId (for lookups)
CREATE INDEX "ErrorAlert_errorId_idx" ON "ErrorAlert"("errorId");

-- CreateIndex: ErrorAlert sentAt (for alert history)
CREATE INDEX "ErrorAlert_sentAt_idx" ON "ErrorAlert"("sentAt" DESC);

-- AddForeignKey: ErrorAlert → ErrorLog
ALTER TABLE "ErrorAlert" ADD CONSTRAINT "ErrorAlert_errorId_fkey" FOREIGN KEY ("errorId") REFERENCES "ErrorLog"("errorId") ON DELETE CASCADE ON UPDATE CASCADE;
