-- CreateTable: SensaiOS Component Capabilities
-- Ring 0-3 security model capability grants
CREATE TABLE "component_capabilities" (
    "id" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" TEXT,
    "revoke_reason" TEXT,

    CONSTRAINT "component_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SensaiOS Installed Applications
-- App registry for installation primitives
CREATE TABLE "installed_apps" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "ring_level" SMALLINT NOT NULL DEFAULT 3,
    "manifest" JSONB NOT NULL,
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'enabled',

    CONSTRAINT "installed_apps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Capability lookup by component and type
CREATE INDEX "idx_capability_component_type" ON "component_capabilities"("component", "type");

-- CreateIndex: Capability expiration tracking
CREATE INDEX "idx_capability_expires" ON "component_capabilities"("expires_at");

-- CreateIndex: Revoked capability audit
CREATE INDEX "idx_capability_revoked" ON "component_capabilities"("revoked_at");

-- CreateIndex: App lookup by status and ring level
CREATE INDEX "idx_installed_app_status_ring" ON "installed_apps"("status", "ring_level");

-- CreateIndex: App installation time ordering
CREATE INDEX "idx_installed_app_installed" ON "installed_apps"("installed_at" DESC);
