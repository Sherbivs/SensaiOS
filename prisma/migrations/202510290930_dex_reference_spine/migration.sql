-- Dex reference spine migration

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Enums
CREATE TYPE "MoveCategory" AS ENUM ('physical', 'special', 'status');
CREATE TYPE "LearnMethod" AS ENUM ('level', 'machine', 'tutor', 'egg');

-- Core dex tables
CREATE TABLE "Type" (
    "id" SMALLINT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Type_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Type_slug_key" UNIQUE ("slug")
);

CREATE TABLE "Ability" (
    "id" SMALLINT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "desc" TEXT,
    CONSTRAINT "Ability_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Ability_slug_key" UNIQUE ("slug")
);

CREATE TABLE "Item" (
    "id" SMALLINT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "meta" JSONB,
    CONSTRAINT "Item_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Item_slug_key" UNIQUE ("slug")
);

CREATE TABLE "Move" (
    "id" SMALLINT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "typeId" SMALLINT NOT NULL,
    "power" SMALLINT,
    "accuracy" SMALLINT,
    "pp" SMALLINT NOT NULL,
    "priority" SMALLINT NOT NULL DEFAULT 0,
    "category" "MoveCategory" NOT NULL,
    "meta" JSONB,
    CONSTRAINT "Move_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Move_slug_key" UNIQUE ("slug"),
    CONSTRAINT "Move_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "Type"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Move_typeId_idx" ON "Move"("typeId");

CREATE TABLE "Species" (
    "id" SMALLINT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseHp" SMALLINT NOT NULL,
    "baseAtk" SMALLINT NOT NULL,
    "baseDef" SMALLINT NOT NULL,
    "baseSpAtk" SMALLINT NOT NULL,
    "baseSpDef" SMALLINT NOT NULL,
    "baseSpe" SMALLINT NOT NULL,
    "growth" TEXT NOT NULL,
    "captureRate" SMALLINT NOT NULL,
    "maleRate" SMALLINT,
    "hatchSteps" SMALLINT,
    "meta" JSONB,
    CONSTRAINT "Species_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Species_slug_key" UNIQUE ("slug")
);

CREATE INDEX "Species_slug_idx" ON "Species"("slug");

CREATE TABLE "SpeciesType" (
    "speciesId" SMALLINT NOT NULL,
    "typeId" SMALLINT NOT NULL,
    "slot" SMALLINT NOT NULL,
    CONSTRAINT "SpeciesType_pkey" PRIMARY KEY ("speciesId", "slot"),
    CONSTRAINT "SpeciesType_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "Species"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SpeciesType_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "Type"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "SpeciesType_typeId_idx" ON "SpeciesType"("typeId");

CREATE TABLE "SpeciesAbility" (
    "speciesId" SMALLINT NOT NULL,
    "abilityId" SMALLINT NOT NULL,
    "slot" SMALLINT NOT NULL,
    CONSTRAINT "SpeciesAbility_pkey" PRIMARY KEY ("speciesId", "slot"),
    CONSTRAINT "SpeciesAbility_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "Species"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SpeciesAbility_abilityId_fkey" FOREIGN KEY ("abilityId") REFERENCES "Ability"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "SpeciesAbility_abilityId_idx" ON "SpeciesAbility"("abilityId");

CREATE TABLE "SpeciesLearnset" (
    "speciesId" SMALLINT NOT NULL,
    "moveId" SMALLINT NOT NULL,
    "method" "LearnMethod" NOT NULL,
    "level" SMALLINT NOT NULL DEFAULT 0,
    "machineId" SMALLINT,
    CONSTRAINT "SpeciesLearnset_pkey" PRIMARY KEY ("speciesId", "moveId", "method", "level"),
    CONSTRAINT "SpeciesLearnset_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "Species"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SpeciesLearnset_moveId_fkey" FOREIGN KEY ("moveId") REFERENCES "Move"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SpeciesLearnset_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "SpeciesLearnset_moveId_idx" ON "SpeciesLearnset"("moveId");
CREATE INDEX "SpeciesLearnset_method_level_idx" ON "SpeciesLearnset"("method", "level");

CREATE TABLE "EvolutionStep" (
    "fromId" SMALLINT NOT NULL,
    "toId" SMALLINT NOT NULL,
    "trigger" TEXT NOT NULL,
    "level" SMALLINT,
    "itemId" SMALLINT,
    "meta" JSONB,
    CONSTRAINT "EvolutionStep_pkey" PRIMARY KEY ("fromId", "toId"),
    CONSTRAINT "EvolutionStep_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Species"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EvolutionStep_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Species"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EvolutionStep_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "EvolutionStep_toId_idx" ON "EvolutionStep"("toId");

CREATE TABLE "TypeChart" (
    "atkTypeId" SMALLINT NOT NULL,
    "defTypeId" SMALLINT NOT NULL,
    "mult" SMALLINT NOT NULL,
    CONSTRAINT "TypeChart_pkey" PRIMARY KEY ("atkTypeId", "defTypeId"),
    CONSTRAINT "TypeChart_atkTypeId_fkey" FOREIGN KEY ("atkTypeId") REFERENCES "Type"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TypeChart_defTypeId_fkey" FOREIGN KEY ("defTypeId") REFERENCES "Type"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TypeChart_defTypeId_idx" ON "TypeChart"("defTypeId");

CREATE TABLE "NameVariant" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refIntId" SMALLINT NOT NULL,
    "locale" TEXT NOT NULL,
    "nameType" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    CONSTRAINT "NameVariant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NameVariant_kind_refIntId_idx" ON "NameVariant"("kind", "refIntId");
CREATE INDEX "NameVariant_locale_normalized_idx" ON "NameVariant"("locale", "normalized");
CREATE INDEX "NameVariant_normalized_gin" ON "NameVariant" USING GIN ("normalized" gin_trgm_ops);

-- Materialized view for fast species hydration
CREATE MATERIALIZED VIEW IF NOT EXISTS "SpeciesSheet" AS
SELECT
    s.id,
    s.slug,
    s.name,
    COALESCE(
      (
        SELECT jsonb_agg(st.typeId ORDER BY st.slot)
        FROM "SpeciesType" st
        WHERE st.speciesId = s.id
      ),
      '[]'::jsonb
    ) AS type_ids,
    COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object('slot', sa.slot, 'abilityId', sa.abilityId) ORDER BY sa.slot)
        FROM "SpeciesAbility" sa
        WHERE sa.speciesId = s.id
      ),
      '[]'::jsonb
    ) AS abilities,
    jsonb_build_object(
      'hp', s."baseHp",
      'atk', s."baseAtk",
      'def', s."baseDef",
      'spAtk', s."baseSpAtk",
      'spDef', s."baseSpDef",
      'spe', s."baseSpe"
    ) AS stats
FROM "Species" s;

CREATE INDEX "SpeciesSheet_id_idx" ON "SpeciesSheet"("id");

-- Hook live data to canonical tables
ALTER TABLE "PokemonInstance"
  ALTER COLUMN "speciesId" TYPE SMALLINT USING "speciesId"::smallint;

ALTER TABLE "PokemonInstance"
  ADD CONSTRAINT "PokemonInstance_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "Species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "PokemonInstance_speciesId_idx" ON "PokemonInstance"("speciesId");

ALTER TABLE "Encounter"
  ALTER COLUMN "speciesId" TYPE SMALLINT USING "speciesId"::smallint;

ALTER TABLE "Encounter"
  ADD CONSTRAINT "Encounter_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "Species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ensure encounters benefit from direct species joins
CREATE INDEX IF NOT EXISTS "Encounter_speciesId_idx" ON "Encounter"("speciesId");
*** End Patch