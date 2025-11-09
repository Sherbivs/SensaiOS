/**
 * dex-queries-pg.ts
 * PostgreSQL queries for Pokédex seed operations
 * Handles bulk operations for types, abilities, moves, species, and related junction tables
 */

import type { Pool, PoolClient } from "pg";
import { buildSelect, buildInsert, buildDelete, buildCount } from "../pg-query.js";
import { getProdDb } from "../pg-connection.js";

// ============================================================================
// Types
// ============================================================================

export type TypeRow = {
  id: number;
  slug: string;
};

export type AbilityInsert = {
  id: number;
  slug: string;
  name: string;
  desc: string | null;
};

export type MoveInsert = {
  id: number;
  slug: string;
  name: string;
  typeId: number;
  power: number | null;
  accuracy: number | null;
  pp: number;
  priority: number;
  category: "physical" | "special" | "status";
  meta: Record<string, unknown>;
};

export type SpeciesInsert = {
  id: number;
  slug: string;
  name: string;
  baseHp: number;
  baseAtk: number;
  baseDef: number;
  baseSpAtk: number;
  baseSpDef: number;
  baseSpe: number;
  growth: string;
  captureRate: number;
  maleRate: number | null;
  hatchSteps: number | null;
  meta: Record<string, unknown>;
};

export type SpeciesTypeInsert = {
  speciesId: number;
  typeId: number;
  slot: number;
};

export type SpeciesAbilityInsert = {
  speciesId: number;
  abilityId: number;
  slot: number;
};

export type SpeciesLearnsetInsert = {
  speciesId: number;
  moveId: number;
  method: "level" | "machine" | "tutor" | "egg";
  level: number;
  machineId: number | null;
};

export type NameVariantInsert = {
  id: string;
  kind: string;
  refIntId: number;
  locale: string;
  nameType: string;
  value: string;
  normalized: string;
};

export type TypeChartInsert = {
  atkTypeId: number;
  defTypeId: number;
  mult: number;
};

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Find all types with their IDs and slugs
 */
export async function findAllTypes(pool?: Pool | PoolClient): Promise<TypeRow[]> {
  const db = pool ?? getProdDb();
  const { text, values } = buildSelect("Type", ["id", "slug"], {}, {
    orderBy: "id",
  });
  const result = await db.query<TypeRow>(text, values);
  return result.rows;
}

/**
 * Count records in a table
 */
export async function countTable(
  tableName: string,
  pool?: Pool | PoolClient,
): Promise<number> {
  const db = pool ?? getProdDb();
  const { text, values } = buildCount(tableName, {});
  const result = await db.query<{ count: string }>(text, values);
  return parseInt(result.rows[0]?.count ?? "0", 10);
}

// ============================================================================
// Bulk Delete Operations
// ============================================================================

/**
 * Delete all records from SpeciesLearnset table
 */
export async function deleteAllSpeciesLearnsets(pool?: Pool | PoolClient): Promise<void> {
  const db = pool ?? getProdDb();
  // Use TRUNCATE for bulk delete (faster and safer for seeding)
  await db.query('TRUNCATE TABLE "SpeciesLearnset" CASCADE');
}

/**
 * Delete all records from SpeciesAbility table
 */
export async function deleteAllSpeciesAbilities(pool?: Pool | PoolClient): Promise<void> {
  const db = pool ?? getProdDb();
  await db.query('TRUNCATE TABLE "SpeciesAbility" CASCADE');
}

/**
 * Delete all records from SpeciesType table
 */
export async function deleteAllSpeciesTypes(pool?: Pool | PoolClient): Promise<void> {
  const db = pool ?? getProdDb();
  await db.query('TRUNCATE TABLE "SpeciesType" CASCADE');
}

/**
 * Delete all records from EvolutionStep table
 */
export async function deleteAllEvolutionSteps(pool?: Pool | PoolClient): Promise<void> {
  const db = pool ?? getProdDb();
  await db.query('TRUNCATE TABLE "EvolutionStep" CASCADE');
}

/**
 * Delete all species-kind name variants
 */
export async function deleteSpeciesNameVariants(pool?: Pool | PoolClient): Promise<void> {
  const db = pool ?? getProdDb();
  const { text, values } = buildDelete("NameVariant", { kind: "species" });
  await db.query(text, values);
}

/**
 * Delete all records from Species table
 */
export async function deleteAllSpecies(pool?: Pool | PoolClient): Promise<void> {
  const db = pool ?? getProdDb();
  await db.query('TRUNCATE TABLE "Species" CASCADE');
}

/**
 * Delete all records from Move table
 */
export async function deleteAllMoves(pool?: Pool | PoolClient): Promise<void> {
  const db = pool ?? getProdDb();
  await db.query('TRUNCATE TABLE "Move" CASCADE');
}

/**
 * Delete all records from Ability table
 */
export async function deleteAllAbilities(pool?: Pool | PoolClient): Promise<void> {
  const db = pool ?? getProdDb();
  await db.query('TRUNCATE TABLE "Ability" CASCADE');
}

/**
 * Delete all records from TypeChart table
 */
export async function deleteAllTypeChart(pool?: Pool | PoolClient): Promise<void> {
  const db = pool ?? getProdDb();
  await db.query('TRUNCATE TABLE "TypeChart" CASCADE');
}

// ============================================================================
// Bulk Insert Operations
// ============================================================================

/**
 * Insert abilities in chunks
 */
export async function insertAbilities(
  abilities: AbilityInsert[],
  pool?: Pool | PoolClient,
): Promise<void> {
  if (abilities.length === 0) return;
  const db = pool ?? getProdDb();
  
  // Build bulk INSERT with placeholders
  const columns = ["id", "slug", "name", "desc"];
  const placeholders: string[] = [];
  const values: unknown[] = [];
  
  abilities.forEach((ability, idx) => {
    const offset = idx * columns.length;
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`
    );
    values.push(ability.id, ability.slug, ability.name, ability.desc);
  });
  
  const text = `
    INSERT INTO "Ability" ("id", "slug", "name", "desc")
    VALUES ${placeholders.join(", ")}
  `.trim();
  
  await db.query(text, values);
}

/**
 * Insert moves in chunks
 */
export async function insertMoves(
  moves: MoveInsert[],
  pool?: Pool | PoolClient,
): Promise<void> {
  if (moves.length === 0) return;
  const db = pool ?? getProdDb();
  
  // Build bulk INSERT with placeholders
  const columns = ["id", "slug", "name", "typeId", "power", "accuracy", "pp", "priority", "category", "meta"];
  const placeholders: string[] = [];
  const values: unknown[] = [];
  
  moves.forEach((move, idx) => {
    const offset = idx * columns.length;
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`
    );
    values.push(
      move.id,
      move.slug,
      move.name,
      move.typeId,
      move.power,
      move.accuracy,
      move.pp,
      move.priority,
      move.category,
      JSON.stringify(move.meta)
    );
  });
  
  const text = `
    INSERT INTO "Move" ("id", "slug", "name", "typeId", "power", "accuracy", "pp", "priority", "category", "meta")
    VALUES ${placeholders.join(", ")}
  `.trim();
  
  await db.query(text, values);
}

/**
 * Insert species in chunks
 */
export async function insertSpecies(
  species: SpeciesInsert[],
  pool?: Pool | PoolClient,
): Promise<void> {
  if (species.length === 0) return;
  const db = pool ?? getProdDb();
  
  // Build bulk INSERT with placeholders
  const columns = ["id", "slug", "name", "baseHp", "baseAtk", "baseDef", "baseSpAtk", "baseSpDef", "baseSpe", "growth", "captureRate", "maleRate", "hatchSteps", "meta"];
  const placeholders: string[] = [];
  const values: unknown[] = [];
  
  species.forEach((s, idx) => {
    const offset = idx * columns.length;
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14})`
    );
    values.push(
      s.id,
      s.slug,
      s.name,
      s.baseHp,
      s.baseAtk,
      s.baseDef,
      s.baseSpAtk,
      s.baseSpDef,
      s.baseSpe,
      s.growth,
      s.captureRate,
      s.maleRate,
      s.hatchSteps,
      JSON.stringify(s.meta)
    );
  });
  
  const text = `
    INSERT INTO "Species" ("id", "slug", "name", "baseHp", "baseAtk", "baseDef", "baseSpAtk", "baseSpDef", "baseSpe", "growth", "captureRate", "maleRate", "hatchSteps", "meta")
    VALUES ${placeholders.join(", ")}
  `.trim();
  
  await db.query(text, values);
}

/**
 * Insert species types in chunks
 */
export async function insertSpeciesTypes(
  speciesTypes: SpeciesTypeInsert[],
  pool?: Pool | PoolClient,
): Promise<void> {
  if (speciesTypes.length === 0) return;
  const db = pool ?? getProdDb();
  
  // Build bulk INSERT with placeholders
  const columns = ["speciesId", "typeId", "slot"];
  const placeholders: string[] = [];
  const values: unknown[] = [];
  
  speciesTypes.forEach((st, idx) => {
    const offset = idx * columns.length;
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3})`
    );
    values.push(st.speciesId, st.typeId, st.slot);
  });
  
  const text = `
    INSERT INTO "SpeciesType" ("speciesId", "typeId", "slot")
    VALUES ${placeholders.join(", ")}
  `.trim();
  
  await db.query(text, values);
}

/**
 * Insert species abilities in chunks
 */
export async function insertSpeciesAbilities(
  speciesAbilities: SpeciesAbilityInsert[],
  pool?: Pool | PoolClient,
): Promise<void> {
  if (speciesAbilities.length === 0) return;
  const db = pool ?? getProdDb();
  
  // Build bulk INSERT with placeholders
  const columns = ["speciesId", "abilityId", "slot"];
  const placeholders: string[] = [];
  const values: unknown[] = [];
  
  speciesAbilities.forEach((sa, idx) => {
    const offset = idx * columns.length;
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3})`
    );
    values.push(sa.speciesId, sa.abilityId, sa.slot);
  });
  
  const text = `
    INSERT INTO "SpeciesAbility" ("speciesId", "abilityId", "slot")
    VALUES ${placeholders.join(", ")}
  `.trim();
  
  await db.query(text, values);
}

/**
 * Insert species learnsets in chunks (with ON CONFLICT DO NOTHING for duplicates)
 */
export async function insertSpeciesLearnsets(
  learnsets: SpeciesLearnsetInsert[],
  pool?: Pool | PoolClient,
): Promise<void> {
  if (learnsets.length === 0) return;
  const db = pool ?? getProdDb();
  
  // buildInsert doesn't support ON CONFLICT, so we'll construct it manually
  // for the skipDuplicates behavior
  const columns = ["speciesId", "moveId", "method", "level", "machineId"];
  const placeholders: string[] = [];
  const values: unknown[] = [];
  
  learnsets.forEach((entry, idx) => {
    const offset = idx * columns.length;
    const row = [
      entry.speciesId,
      entry.moveId,
      entry.method,
      entry.level,
      entry.machineId,
    ];
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`
    );
    values.push(...row);
  });
  
  const text = `
    INSERT INTO "SpeciesLearnset" ("speciesId", "moveId", "method", "level", "machineId")
    VALUES ${placeholders.join(", ")}
    ON CONFLICT ("speciesId", "moveId", "method", "level") DO NOTHING
  `.trim();
  
  await db.query(text, values);
}

/**
 * Insert name variants in chunks
 */
export async function insertNameVariants(
  variants: NameVariantInsert[],
  pool?: Pool | PoolClient,
): Promise<void> {
  if (variants.length === 0) return;
  const db = pool ?? getProdDb();
  
  // Build bulk INSERT with placeholders
  const columns = ["id", "kind", "refIntId", "locale", "nameType", "value", "normalized"];
  const placeholders: string[] = [];
  const values: unknown[] = [];
  
  variants.forEach((v, idx) => {
    const offset = idx * columns.length;
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`
    );
    values.push(v.id, v.kind, v.refIntId, v.locale, v.nameType, v.value, v.normalized);
  });
  
  const text = `
    INSERT INTO "NameVariant" ("id", "kind", "refIntId", "locale", "nameType", "value", "normalized")
    VALUES ${placeholders.join(", ")}
  `.trim();
  
  await db.query(text, values);
}

/**
 * Insert type chart rows in chunks
 */
export async function insertTypeChart(
  typeChart: TypeChartInsert[],
  pool?: Pool | PoolClient,
): Promise<void> {
  if (typeChart.length === 0) return;
  const db = pool ?? getProdDb();
  
  // Build bulk INSERT with placeholders
  const columns = ["atkTypeId", "defTypeId", "mult"];
  const placeholders: string[] = [];
  const values: unknown[] = [];
  
  typeChart.forEach((tc, idx) => {
    const offset = idx * columns.length;
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3})`
    );
    values.push(tc.atkTypeId, tc.defTypeId, tc.mult);
  });
  
  const text = `
    INSERT INTO "TypeChart" ("atkTypeId", "defTypeId", "mult")
    VALUES ${placeholders.join(", ")}
  `.trim();
  
  await db.query(text, values);
}

// ============================================================================
// Materialized View Operations
// ============================================================================

/**
 * Refresh the SpeciesSheet materialized view
 * Tries direct REFRESH first, falls back to helper function if permission denied
 */
export async function refreshSpeciesSheet(pool?: Pool | PoolClient): Promise<void> {
  const db = pool ?? getProdDb();
  
  try {
    await db.query(`REFRESH MATERIALIZED VIEW "SpeciesSheet"`);
  } catch (error: unknown) {
    // Check for permission denied error (42501)
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "42501"
    ) {
      // Fallback to helper function
      await db.query(`SELECT public.refresh_species_sheet()::text`);
    } else {
      throw error;
    }
  }
}
