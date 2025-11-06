-- Prisma Migration Rollback: pack_registry_signature
-- Reverts the DexPack signature column and associated unique index.

DROP INDEX IF EXISTS "DexPack_signature_key";
ALTER TABLE "DexPack" DROP COLUMN IF EXISTS "signature";
