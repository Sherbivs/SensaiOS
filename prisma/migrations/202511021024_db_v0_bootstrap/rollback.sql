-- Prisma Migration Rollback: db_v0_bootstrap
-- Reverts the structural changes introduced by the day-one blueprint migration.
-- Execute only when the db_v0_bootstrap migration has been applied and needs to be undone.

-- Drop foreign keys before removing columns or tables.
ALTER TABLE "TrainerSettings" DROP CONSTRAINT IF EXISTS "TrainerSettings_activePack_fkey";
ALTER TABLE "TrainerSettings" DROP CONSTRAINT IF EXISTS "TrainerSettings_trainerId_fkey";
ALTER TABLE "Inventory" DROP CONSTRAINT IF EXISTS "Inventory_itemId_fkey";
ALTER TABLE "Inventory" DROP CONSTRAINT IF EXISTS "Inventory_trainerId_fkey";
ALTER TABLE "Inventory" DROP CONSTRAINT IF EXISTS "Inventory_qty_non_negative";
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_tenantId_fkey";
ALTER TABLE "PokemonInstance" DROP CONSTRAINT IF EXISTS "PokemonInstance_packHash_fkey";
ALTER TABLE "PokemonInstance" DROP CONSTRAINT IF EXISTS "PokemonInstance_trainerId_fkey";
ALTER TABLE "PokemonInstance" DROP CONSTRAINT IF EXISTS "PokemonInstance_tenantId_fkey";
ALTER TABLE "Party" DROP CONSTRAINT IF EXISTS "Party_trainerId_fkey";
ALTER TABLE "Encounter" DROP CONSTRAINT IF EXISTS "Encounter_packHash_fkey";
ALTER TABLE "Encounter" DROP CONSTRAINT IF EXISTS "Encounter_trainerId_fkey";
ALTER TABLE "Encounter" DROP CONSTRAINT IF EXISTS "Encounter_tenantId_fkey";
ALTER TABLE "Battle" DROP CONSTRAINT IF EXISTS "Battle_trainer2Id_fkey";
ALTER TABLE "Battle" DROP CONSTRAINT IF EXISTS "Battle_trainer1Id_fkey";
ALTER TABLE "Battle" DROP CONSTRAINT IF EXISTS "Battle_packHash_fkey";
ALTER TABLE "Battle" DROP CONSTRAINT IF EXISTS "Battle_tenantId_fkey";
ALTER TABLE "Item" DROP CONSTRAINT IF EXISTS "Item_packHash_fkey";
ALTER TABLE "Trainer" DROP CONSTRAINT IF EXISTS "Trainer_userId_fkey";
ALTER TABLE "Trainer" DROP CONSTRAINT IF EXISTS "Trainer_tenantId_fkey";

-- Drop indexes tied to the new structures.
DROP INDEX IF EXISTS "Trainer_tenantId_userId_key";
DROP INDEX IF EXISTS "Trainer_userId_idx";
DROP INDEX IF EXISTS "Inventory_itemId_idx";
DROP INDEX IF EXISTS "AuditLog_tenantId_at_idx";
DROP INDEX IF EXISTS "PokemonInstance_trainerId_idx";
DROP INDEX IF EXISTS "PokemonInstance_tenantId_idx";
DROP INDEX IF EXISTS "Party_trainerId_idx";
DROP INDEX IF EXISTS "Encounter_tenantId_startedAt_idx";
DROP INDEX IF EXISTS "Battle_tenantId_state_endedAt_idx";
DROP INDEX IF EXISTS "User_platformId_key";

-- Remove columns added by the migration.
ALTER TABLE "PokemonInstance" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "PokemonInstance" DROP COLUMN IF EXISTS "trainerId";
ALTER TABLE "PokemonInstance" DROP COLUMN IF EXISTS "packHash";
ALTER TABLE "Party" DROP COLUMN IF EXISTS "trainerId";
ALTER TABLE "Encounter" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "Encounter" DROP COLUMN IF EXISTS "trainerId";
ALTER TABLE "Encounter" DROP COLUMN IF EXISTS "packHash";
ALTER TABLE "Battle" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "Battle" DROP COLUMN IF EXISTS "packHash";
ALTER TABLE "Battle" DROP COLUMN IF EXISTS "trainer1Id";
ALTER TABLE "Battle" DROP COLUMN IF EXISTS "trainer2Id";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "packHash";
ALTER TABLE "User" DROP COLUMN IF EXISTS "platformId";

-- Drop tables introduced by the migration (order avoids dependency issues).
DROP TABLE IF EXISTS "TrainerSettings";
DROP TABLE IF EXISTS "Inventory";
DROP TABLE IF EXISTS "AuditLog";
DROP TABLE IF EXISTS "Trainer";
DROP TABLE IF EXISTS "DexPack";
DROP TABLE IF EXISTS "Tenant";
