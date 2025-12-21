-- Error Learning System Phase 1 Migration
-- Specialist Team Design Session — December 21, 2025
-- Enables ML pattern detection, resolution tracking, and cascade analysis

-- ============================================================================
-- ErrorKnowledge — Stores learned patterns separately from errors
-- ============================================================================
CREATE TABLE IF NOT EXISTS "ErrorKnowledge" (
    "knowledgeId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "patternType" TEXT NOT NULL,
    "patternData" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "validUntil" TIMESTAMPTZ NOT NULL,
    "observedCount" INTEGER NOT NULL DEFAULT 1,
    "relatedFingerprints" TEXT[] DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_errorknowledge_pattern_confidence" 
    ON "ErrorKnowledge" ("patternType", "confidence" DESC);
CREATE INDEX IF NOT EXISTS "idx_errorknowledge_valid_until" 
    ON "ErrorKnowledge" ("validUntil");
CREATE INDEX IF NOT EXISTS "idx_errorknowledge_pattern_valid" 
    ON "ErrorKnowledge" ("patternType", "validUntil");

-- ============================================================================
-- ErrorResolution — Tracks fix attempts and outcomes for learning
-- ============================================================================
CREATE TABLE IF NOT EXISTS "ErrorResolution" (
    "resolutionId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "errorId" TEXT NOT NULL REFERENCES "ErrorLog"("errorId") ON DELETE CASCADE,
    "strategy" TEXT NOT NULL,
    "attempted" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "durationMs" INTEGER,
    "outcome" TEXT NOT NULL,
    "notes" TEXT,
    "contextData" JSONB,
    "triggeredBy" TEXT
);

CREATE INDEX IF NOT EXISTS "idx_errorresolution_error_outcome" 
    ON "ErrorResolution" ("errorId", "outcome");
CREATE INDEX IF NOT EXISTS "idx_errorresolution_strategy_outcome" 
    ON "ErrorResolution" ("strategy", "outcome");
CREATE INDEX IF NOT EXISTS "idx_errorresolution_attempted" 
    ON "ErrorResolution" ("attempted" DESC);
CREATE INDEX IF NOT EXISTS "idx_errorresolution_strategy_attempted" 
    ON "ErrorResolution" ("strategy", "attempted" DESC);

-- ============================================================================
-- ErrorDependency — Tracks which errors trigger other errors
-- ============================================================================
CREATE TABLE IF NOT EXISTS "ErrorDependency" (
    "dependencyId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "parentErrorId" TEXT NOT NULL REFERENCES "ErrorLog"("errorId") ON DELETE CASCADE,
    "childErrorId" TEXT NOT NULL REFERENCES "ErrorLog"("errorId") ON DELETE CASCADE,
    "observedCount" INTEGER NOT NULL DEFAULT 1,
    "avgTimeDeltaMs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "firstObserved" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "lastObserved" TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE ("parentErrorId", "childErrorId")
);

CREATE INDEX IF NOT EXISTS "idx_errordependency_parent" 
    ON "ErrorDependency" ("parentErrorId");
CREATE INDEX IF NOT EXISTS "idx_errordependency_child" 
    ON "ErrorDependency" ("childErrorId");
CREATE INDEX IF NOT EXISTS "idx_errordependency_confidence" 
    ON "ErrorDependency" ("confidence" DESC);

-- ============================================================================
-- ErrorCodeContext — Preserves stack frame details for debugging
-- ============================================================================
CREATE TABLE IF NOT EXISTS "ErrorCodeContext" (
    "contextId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "errorId" TEXT NOT NULL REFERENCES "ErrorLog"("errorId") ON DELETE CASCADE,
    "frameIndex" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "columnNumber" INTEGER,
    "functionName" TEXT,
    "codeSnippet" TEXT
);

CREATE INDEX IF NOT EXISTS "idx_errorcodecontext_error" 
    ON "ErrorCodeContext" ("errorId");
CREATE INDEX IF NOT EXISTS "idx_errorcodecontext_file_line" 
    ON "ErrorCodeContext" ("filePath", "lineNumber");
CREATE INDEX IF NOT EXISTS "idx_errorcodecontext_function" 
    ON "ErrorCodeContext" ("functionName");

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON TABLE "ErrorKnowledge" IS 'Stores learned error patterns (time clusters, correlations, cascades, recovery strategies)';
COMMENT ON TABLE "ErrorResolution" IS 'Tracks resolution attempts and outcomes for learning what works';
COMMENT ON TABLE "ErrorDependency" IS 'Maps error-to-error cascades for root cause analysis';
COMMENT ON TABLE "ErrorCodeContext" IS 'Preserves stack frame details for debugging and analysis';

COMMENT ON COLUMN "ErrorKnowledge"."patternType" IS 'TIME_CLUSTER | CORRELATION | CASCADE | RECOVERY';
COMMENT ON COLUMN "ErrorKnowledge"."confidence" IS 'Statistical confidence 0.0 to 1.0';
COMMENT ON COLUMN "ErrorResolution"."strategy" IS 'RETRY | FALLBACK | RESTART | ESCALATE | IGNORE';
COMMENT ON COLUMN "ErrorResolution"."outcome" IS 'SUCCESS | PARTIAL | FAILED | ESCALATED';
COMMENT ON COLUMN "ErrorDependency"."avgTimeDeltaMs" IS 'Average milliseconds between parent and child error';
