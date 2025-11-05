-- Prisma Migration: trainer_profile_option_c
-- Establishes per-user trainer profile customization surfaces (Option C hybrid plan).
-- Adds TrainerProfile table with tagline/bio/favorite species metadata and cascading relations.

CREATE TABLE IF NOT EXISTS "TrainerProfile" (
    "userId" TEXT NOT NULL,
    "tagline" TEXT,
    "bio" TEXT,
    "favoriteSpeciesId" SMALLINT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "TrainerProfile_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX IF NOT EXISTS "TrainerProfile_favoriteSpeciesId_idx" ON "TrainerProfile" ("favoriteSpeciesId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'TrainerProfile_userId_fkey' AND table_name = 'TrainerProfile' AND table_schema = 'public'
    ) THEN
        ALTER TABLE "TrainerProfile"
            ADD CONSTRAINT "TrainerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'TrainerProfile_favoriteSpeciesId_fkey' AND table_name = 'TrainerProfile' AND table_schema = 'public'
    ) THEN
        ALTER TABLE "TrainerProfile"
            ADD CONSTRAINT "TrainerProfile_favoriteSpeciesId_fkey" FOREIGN KEY ("favoriteSpeciesId") REFERENCES "Species"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
