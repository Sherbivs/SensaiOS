-- Add indexes to support scaling queries

DO $$
BEGIN
	IF to_regclass('"PokemonInstance"') IS NOT NULL THEN
		CREATE INDEX IF NOT EXISTS "PokemonInstance_ownerId_idx" ON "PokemonInstance"("ownerId");
	END IF;
END $$;

DO $$
BEGIN
	IF to_regclass('"Party"') IS NOT NULL THEN
		CREATE INDEX IF NOT EXISTS "Party_ownerId_idx" ON "Party"("ownerId");
	END IF;
END $$;

DO $$
BEGIN
	IF to_regclass('"Encounter"') IS NOT NULL THEN
		CREATE INDEX IF NOT EXISTS "Encounter_ownerId_state_idx" ON "Encounter"("ownerId", "state");
		CREATE INDEX IF NOT EXISTS "Encounter_state_startedAt_idx" ON "Encounter"("state", "startedAt");
	END IF;
END $$;

DO $$
BEGIN
	IF to_regclass('"Battle"') IS NOT NULL THEN
		CREATE INDEX IF NOT EXISTS "Battle_state_endedAt_idx" ON "Battle"("state", "endedAt");
		CREATE INDEX IF NOT EXISTS "Battle_p1Id_state_endedAt_idx" ON "Battle"("p1Id", "state", "endedAt");
		CREATE INDEX IF NOT EXISTS "Battle_p2Id_state_endedAt_idx" ON "Battle"("p2Id", "state", "endedAt");
	END IF;
END $$;

DO $$
BEGIN
	IF to_regclass('"Cooldown"') IS NOT NULL THEN
		DROP INDEX IF EXISTS "Cooldown_ownerId_kind_idx";
		CREATE UNIQUE INDEX IF NOT EXISTS "Cooldown_ownerId_kind_key" ON "Cooldown"("ownerId", "kind");
	END IF;
END $$;
