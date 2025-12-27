-- CreateTable: Runtime Metrics (replaces /Store/restart-metrics.json)
CREATE TABLE "runtime_metrics" (
    "id" TEXT NOT NULL,
    "metric_type" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trigger" TEXT,
    "uptime_ms" BIGINT,
    "error_message" TEXT,
    "stack_trace" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "runtime_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_runtime_metric_type_time" ON "runtime_metrics"("metric_type", "timestamp" DESC);

-- CreateTable: Alert Queue (replaces /Store/alerts/)
CREATE TABLE "alert_queue" (
    "id" TEXT NOT NULL,
    "alert_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "dispatched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_alert_created" ON "alert_queue"("created_at" DESC);
CREATE INDEX "idx_alert_pending" ON "alert_queue"("dispatched_at") WHERE "dispatched_at" IS NULL;

-- CreateTable: Guild Config (replaces /Store/guild-member-timeout-config.json)
CREATE TABLE "guild_config" (
    "guild_id" TEXT NOT NULL,
    "config_key" TEXT NOT NULL,
    "config_value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guild_config_pkey" PRIMARY KEY ("guild_id")
);

-- CreateIndex
CREATE INDEX "idx_guild_config_key" ON "guild_config"("config_key");

-- CreateTable: Cache Entries (replaces /Store/runtime-cache/, /Store/discord-cache/, /Store/pokemon-cache/)
CREATE TABLE "cache_entries" (
    "cache_key" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cache_entries_pkey" PRIMARY KEY ("cache_key")
);

-- CreateIndex
CREATE INDEX "idx_cache_namespace" ON "cache_entries"("namespace");
CREATE INDEX "idx_cache_expires" ON "cache_entries"("expires_at") WHERE "expires_at" IS NOT NULL;
