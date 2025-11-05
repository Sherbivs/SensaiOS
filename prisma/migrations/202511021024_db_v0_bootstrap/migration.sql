-- Prisma Migration: db_v0_bootstrap
-- Aligns the day-one database blueprint with Prisma schema updates introducing tenants, trainers, dex pack registry,
-- trainer settings, per-trainer inventories, and audit logging while keeping existing gameplay tables intact.

-- Extend users with the platform identifier used in the blueprint (nullable, uniqueness enforced via partial index).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "platformId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_platformId_key" ON "User"("platformId") WHERE "platformId" IS NOT NULL;

-- Tenant registry for multi-tenant scoping.
CREATE TABLE IF NOT EXISTS "Tenant" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- Content-addressed dex pack registry required by DEX v2 rollout.
CREATE TABLE IF NOT EXISTS "DexPack" (
    "packHash" TEXT NOT NULL,
    "schemaVer" SMALLINT NOT NULL,
    "gen" SMALLINT NOT NULL,
    "signedAt" TIMESTAMPTZ NOT NULL,
    "metaJson" JSONB NOT NULL,
    CONSTRAINT "DexPack_pkey" PRIMARY KEY ("packHash")
);

-- Trainer records bind users to tenants, enabling per-guild separation and future sharding.
CREATE TABLE IF NOT EXISTS "Trainer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nickname" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "Trainer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Trainer_tenantId_userId_key" ON "Trainer"("tenantId", "userId");
CREATE INDEX IF NOT EXISTS "Trainer_userId_idx" ON "Trainer"("userId");

-- Trainer settings hold the active dex pack selection and preferences payload.
CREATE TABLE IF NOT EXISTS "TrainerSettings" (
    "trainerId" TEXT NOT NULL,
    "activePack" TEXT NOT NULL,
    "prefsJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "TrainerSettings_pkey" PRIMARY KEY ("trainerId")
);

-- Inventory table attaches per-trainer item quantities.
CREATE TABLE IF NOT EXISTS "Inventory" (
    "trainerId" TEXT NOT NULL,
    "itemId" SMALLINT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("trainerId", "itemId"),
    CONSTRAINT "Inventory_qty_non_negative" CHECK ("qty" >= 0)
);
CREATE INDEX IF NOT EXISTS "Inventory_itemId_idx" ON "Inventory"("itemId");

-- Audit log for operational visibility and incident response.
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "tenantId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_at_idx" ON "AuditLog"("tenantId", "at");

-- Extend gameplay tables with tenant/trainer/pack metadata for side-by-side migration.
ALTER TABLE "PokemonInstance" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "PokemonInstance" ADD COLUMN IF NOT EXISTS "trainerId" TEXT;
ALTER TABLE "PokemonInstance" ADD COLUMN IF NOT EXISTS "packHash" TEXT;
CREATE INDEX IF NOT EXISTS "PokemonInstance_trainerId_idx" ON "PokemonInstance"("trainerId");
CREATE INDEX IF NOT EXISTS "PokemonInstance_tenantId_idx" ON "PokemonInstance"("tenantId");

ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "trainerId" TEXT;
CREATE INDEX IF NOT EXISTS "Party_trainerId_idx" ON "Party"("trainerId");

ALTER TABLE "Encounter" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Encounter" ADD COLUMN IF NOT EXISTS "trainerId" TEXT;
ALTER TABLE "Encounter" ADD COLUMN IF NOT EXISTS "packHash" TEXT;
CREATE INDEX IF NOT EXISTS "Encounter_tenantId_startedAt_idx" ON "Encounter"("tenantId", "startedAt");

ALTER TABLE "Battle" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Battle" ADD COLUMN IF NOT EXISTS "packHash" TEXT;
ALTER TABLE "Battle" ADD COLUMN IF NOT EXISTS "trainer1Id" TEXT;
ALTER TABLE "Battle" ADD COLUMN IF NOT EXISTS "trainer2Id" TEXT;
CREATE INDEX IF NOT EXISTS "Battle_tenantId_state_endedAt_idx" ON "Battle"("tenantId", "state", "endedAt");

ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "packHash" TEXT;

-- Establish foreign keys to enforce new relational guarantees.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Trainer_tenantId_fkey' AND table_name = 'Trainer' AND table_schema = 'public'
    ) THEN
        ALTER TABLE "Trainer"
            ADD CONSTRAINT "Trainer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Trainer_userId_fkey' AND table_name = 'Trainer' AND table_schema = 'public'
    ) THEN
        ALTER TABLE "Trainer"
            ADD CONSTRAINT "Trainer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'TrainerSettings_trainerId_fkey' AND table_name = 'TrainerSettings' AND table_schema = 'public'
    ) THEN
        ALTER TABLE "TrainerSettings"
            ADD CONSTRAINT "TrainerSettings_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'TrainerSettings_activePack_fkey' AND table_name = 'TrainerSettings' AND table_schema = 'public'
    ) THEN
        ALTER TABLE "TrainerSettings"
            ADD CONSTRAINT "TrainerSettings_activePack_fkey" FOREIGN KEY ("activePack") REFERENCES "DexPack"("packHash") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Inventory_trainerId_fkey' AND table_name = 'Inventory' AND table_schema = 'public'
    ) THEN
        ALTER TABLE "Inventory"
            ADD CONSTRAINT "Inventory_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Inventory_itemId_fkey' AND table_name = 'Inventory' AND table_schema = 'public'
    ) THEN
        ALTER TABLE "Inventory"
            ADD CONSTRAINT "Inventory_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'AuditLog_tenantId_fkey' AND table_name = 'AuditLog' AND table_schema = 'public'
    ) THEN
        ALTER TABLE "AuditLog"
            ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'PokemonInstance_tenantId_fkey' AND table_name = 'PokemonInstance' AND table_schema = 'public'
    ) THEN
        ALTER TABLE "PokemonInstance"
            ADD CONSTRAINT "PokemonInstance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'PokemonInstance_trainerId_fkey' AND table_name = 'PokemonInstance' AND table_schema = 'public'
    ) THEN
        ALTER TABLE "PokemonInstance"
            ADD CONSTRAINT "PokemonInstance_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'PokemonInstance_packHash_fkey' AND table_name = 'PokemonInstance' AND table_schema = 'public'
    ) THEN
        ALTER TABLE "PokemonInstance"
            ADD CONSTRAINT "PokemonInstance_packHash_fkey" FOREIGN KEY ("packHash") REFERENCES "DexPack"("packHash") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Party_trainerId_fkey' AND table_name = 'Party' AND table_schema = 'public'
    ) THEN
        ALTER TABLE "Party"
            ADD CONSTRAINT "Party_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Encounter_tenantId_fkey' AND table_name = 'Encounter' AND table_schema = 'public'
    ) THEN
        ALTER TABLE "Encounter"
            ADD CONSTRAINT "Encounter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Encounter_trainerId_fkey' AND table_name = 'Encounter' AND table_schema = 'public'
    ) THEN
        ALTER TABLE "Encounter"
            ADD CONSTRAINT "Encounter_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Encounter_packHash_fkey' AND table_name = 'Encounter' AND table_schema = 'public'
    ) THEN
        ALTER TABLE "Encounter"
            ADD CONSTRAINT "Encounter_packHash_fkey" FOREIGN KEY ("packHash") REFERENCES "DexPack"("packHash") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Battle_tenantId_fkey' AND table_name = 'Battle' AND table_schema = 'public'
    ) THEN
        ALTER TABLE "Battle"
            ADD CONSTRAINT "Battle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Battle_packHash_fkey' AND table_name = 'Battle' AND table_schema = 'public'
    ) THEN
        ALTER TABLE "Battle"
            ADD CONSTRAINT "Battle_packHash_fkey" FOREIGN KEY ("packHash") REFERENCES "DexPack"("packHash") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Battle_trainer1Id_fkey' AND table_name = 'Battle' AND table_schema = 'public'
    ) THEN
        ALTER TABLE "Battle"
            ADD CONSTRAINT "Battle_trainer1Id_fkey" FOREIGN KEY ("trainer1Id") REFERENCES "Trainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Battle_trainer2Id_fkey' AND table_name = 'Battle' AND table_schema = 'public'
    ) THEN
        ALTER TABLE "Battle"
            ADD CONSTRAINT "Battle_trainer2Id_fkey" FOREIGN KEY ("trainer2Id") REFERENCES "Trainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Item_packHash_fkey' AND table_name = 'Item' AND table_schema = 'public'
    ) THEN
        ALTER TABLE "Item"
            ADD CONSTRAINT "Item_packHash_fkey" FOREIGN KEY ("packHash") REFERENCES "DexPack"("packHash") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
