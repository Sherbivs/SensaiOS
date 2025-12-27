-- CreateTable
CREATE TABLE "role_change_audit" (
    "id" BIGSERIAL NOT NULL,
    "guild_id" TEXT NOT NULL,
    "guild_name" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "member_tag" TEXT NOT NULL,
    "change_type" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "role_name" TEXT NOT NULL,
    "role_position" INTEGER,
    "executor_id" TEXT NOT NULL,
    "executor_tag" TEXT NOT NULL,
    "executor_roles" TEXT[],
    "authorized" BOOLEAN NOT NULL,
    "auth_reason" TEXT,
    "reverted" BOOLEAN NOT NULL DEFAULT false,
    "reverted_at" TIMESTAMPTZ(6),
    "reverted_by" TEXT,
    "revert_reason" TEXT,
    "origin" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_change_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "threat_detections" (
    "id" BIGSERIAL NOT NULL,
    "threat_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "guild_id" TEXT NOT NULL,
    "guild_name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "triggering_entry_id" BIGINT,
    "mitre_attack" TEXT,
    "mitre_tactic" TEXT,
    "recommended_action" TEXT NOT NULL,
    "auto_mitigated" BOOLEAN NOT NULL DEFAULT false,
    "mitigation_action" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "resolution_notes" TEXT,
    "false_positive" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "threat_detections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_baselines" (
    "id" BIGSERIAL NOT NULL,
    "guild_id" TEXT NOT NULL,
    "guild_name" TEXT NOT NULL,
    "average_changes_per_hour" DOUBLE PRECISION NOT NULL,
    "average_changes_per_day" DOUBLE PRECISION NOT NULL,
    "peak_activity_hours" INTEGER[],
    "rapid_change_threshold" INTEGER NOT NULL,
    "max_changes_per_member" INTEGER NOT NULL,
    "expected_origins" TEXT[],
    "confidence_level" DOUBLE PRECISION NOT NULL,
    "data_point_count" INTEGER NOT NULL,
    "computed_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "security_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "guild_id" TEXT NOT NULL,
    "guild_name" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "role_name" TEXT NOT NULL,
    "permissions" TEXT[],
    "position" INTEGER NOT NULL,
    "color" INTEGER,
    "hoist" BOOLEAN NOT NULL,
    "mentionable" BOOLEAN NOT NULL,
    "signature" TEXT NOT NULL,
    "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_role_change_audit_guild_time" ON "role_change_audit"("guild_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_role_change_audit_member_time" ON "role_change_audit"("member_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_role_change_audit_executor_time" ON "role_change_audit"("executor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_role_change_audit_authorized" ON "role_change_audit"("authorized", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_role_change_audit_reverted" ON "role_change_audit"("reverted");

-- CreateIndex
CREATE INDEX "idx_threat_detections_type_time" ON "threat_detections"("threat_type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_threat_detections_guild_time" ON "threat_detections"("guild_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_threat_detections_severity_time" ON "threat_detections"("severity", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_threat_detections_resolved" ON "threat_detections"("resolved");

-- CreateIndex
CREATE INDEX "idx_threat_detections_false_positive" ON "threat_detections"("false_positive");

-- CreateIndex
CREATE UNIQUE INDEX "security_baselines_guild_id_key" ON "security_baselines"("guild_id");

-- CreateIndex
CREATE INDEX "idx_security_baselines_guild" ON "security_baselines"("guild_id");

-- CreateIndex
CREATE INDEX "idx_permission_snapshots_guild_role" ON "permission_snapshots"("guild_id", "role_id");

-- CreateIndex
CREATE INDEX "idx_permission_snapshots_time" ON "permission_snapshots"("captured_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "unq_permission_snapshots_guild_role_time" ON "permission_snapshots"("guild_id", "role_id", "captured_at");
