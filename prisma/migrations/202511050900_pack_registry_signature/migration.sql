-- Prisma Migration: pack_registry_signature
-- Adds a signature column to DexPack so pack hashes carry a paired signature record for registry enforcement.

ALTER TABLE "DexPack" ADD COLUMN IF NOT EXISTS "signature" TEXT;

UPDATE "DexPack" SET "signature" = COALESCE("signature", "packHash");

ALTER TABLE "DexPack" ALTER COLUMN "signature" SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'DexPack_signature_key'
    ) THEN
        CREATE UNIQUE INDEX "DexPack_signature_key" ON "DexPack"("signature");
    END IF;
END $$;
