-- Tighten relational constraints, add timestamps, and align outbox status enum

-- Ensure existing outbox rows use the new terminal status name
UPDATE "OutboxMessage" SET "status" = 'processed' WHERE "status" = 'done';

-- Enum for outbox statuses
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OutboxStatus') THEN
        CREATE TYPE "OutboxStatus" AS ENUM ('pending', 'processing', 'processed', 'error');
    END IF;
END $$;

-- Users gain updatedAt tracking
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW();

-- Parties cascade on owner delete and gain updatedAt + uniqueness
ALTER TABLE "Party"
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE "Party" DROP CONSTRAINT IF EXISTS "Party_ownerId_fkey";
ALTER TABLE "Party" ADD CONSTRAINT "Party_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE "Party" ADD CONSTRAINT "Party_ownerId_key" UNIQUE ("ownerId");
CREATE INDEX IF NOT EXISTS "Party_ownerId_idx" ON "Party" ("ownerId");

-- Party slots enforce unique occupancy and indexed lookups
ALTER TABLE "PartySlot" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE "PartySlot" ADD CONSTRAINT IF NOT EXISTS "PartySlot_pokemonId_key" UNIQUE ("pokemonId");
CREATE INDEX IF NOT EXISTS "PartySlot_partyId_idx" ON "PartySlot" ("partyId");

-- Pokémon instances cascade with owners and gain updatedAt
ALTER TABLE "PokemonInstance" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE "PokemonInstance" DROP CONSTRAINT IF EXISTS "PokemonInstance_ownerId_fkey";
ALTER TABLE "PokemonInstance" ADD CONSTRAINT "PokemonInstance_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "PokemonInstance_ownerId_idx" ON "PokemonInstance" ("ownerId");

-- Cooldowns cascade, gain readyAt index
ALTER TABLE "Cooldown" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE "Cooldown" DROP CONSTRAINT IF EXISTS "Cooldown_ownerId_fkey";
ALTER TABLE "Cooldown" ADD CONSTRAINT "Cooldown_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "Cooldown_ownerId_readyAt_idx" ON "Cooldown" ("ownerId", "readyAt");

-- Encounters cascade and gain supporting indexes
ALTER TABLE "Encounter" DROP CONSTRAINT IF EXISTS "Encounter_ownerId_fkey";
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "Encounter_threadChannelId_idx" ON "Encounter" ("threadChannelId");
CREATE INDEX IF NOT EXISTS "Encounter_expiresAt_idx" ON "Encounter" ("expiresAt");

-- Battles gain updatedAt and arena lookup index
ALTER TABLE "Battle" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS "Battle_arenaThreadId_idx" ON "Battle" ("arenaThreadId");

-- Outbox message improvements: timestamps, enum status, and new indexes
ALTER TABLE "OutboxMessage" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE "OutboxMessage" ALTER COLUMN "status" TYPE "OutboxStatus" USING "status"::"OutboxStatus";
ALTER TABLE "OutboxMessage" ALTER COLUMN "status" SET DEFAULT 'pending';
DROP INDEX IF EXISTS "OutboxMessage_status_createdAt_idx";
CREATE INDEX IF NOT EXISTS "OutboxMessage_status_processedAt_idx" ON "OutboxMessage" ("status", "processedAt");
CREATE INDEX IF NOT EXISTS "OutboxMessage_topic_status_idx" ON "OutboxMessage" ("topic", "status");
