-- Add indexes to support scaling queries

-- PokemonInstance owner lookups
CREATE INDEX IF NOT EXISTS "PokemonInstance_ownerId_idx" ON "PokemonInstance"("ownerId");

-- Party owner lookups
CREATE INDEX IF NOT EXISTS "Party_ownerId_idx" ON "Party"("ownerId");

-- Encounter lookups by owner/state and state timelines
CREATE INDEX IF NOT EXISTS "Encounter_ownerId_state_idx" ON "Encounter"("ownerId", "state");
CREATE INDEX IF NOT EXISTS "Encounter_state_startedAt_idx" ON "Encounter"("state", "startedAt");

-- Battle history and active-state checks
CREATE INDEX IF NOT EXISTS "Battle_state_endedAt_idx" ON "Battle"("state", "endedAt");
CREATE INDEX IF NOT EXISTS "Battle_p1Id_state_endedAt_idx" ON "Battle"("p1Id", "state", "endedAt");
CREATE INDEX IF NOT EXISTS "Battle_p2Id_state_endedAt_idx" ON "Battle"("p2Id", "state", "endedAt");

-- Promote cooldown compound key to unique for upserts
DROP INDEX IF EXISTS "Cooldown_ownerId_kind_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "Cooldown_ownerId_kind_key" ON "Cooldown"("ownerId", "kind");
