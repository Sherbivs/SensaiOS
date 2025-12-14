/**
 * dex-queries-pg.ts
 * PostgreSQL queries for Pokédex seed operations
 * Handles bulk operations for types, abilities, moves, species, and related junction tables
 */
import { buildSelect, buildDelete, buildCount } from "../pg-query.js";
import { getProdDb } from "../pg-connection.js";
// ============================================================================
// Read Operations
// ============================================================================
/**
 * Find all types with their IDs and slugs
 */
export async function findAllTypes(pool) {
    const db = pool ?? getProdDb();
    const { text, values } = buildSelect("Type", ["id", "slug"], {}, {
        orderBy: "id",
    });
    const result = await db.query(text, values);
    return result.rows;
}
/**
 * Count records in a table
 */
export async function countTable(tableName, pool) {
    const db = pool ?? getProdDb();
    const { text, values } = buildCount(tableName, {});
    const result = await db.query(text, values);
    return parseInt(result.rows[0]?.count ?? "0", 10);
}
// ============================================================================
// Bulk Delete Operations
// ============================================================================
/**
 * Delete all records from SpeciesLearnset table
 */
export async function deleteAllSpeciesLearnsets(pool) {
    const db = pool ?? getProdDb();
    // Use TRUNCATE for bulk delete (faster and safer for seeding)
    await db.query('TRUNCATE TABLE "SpeciesLearnset" CASCADE');
}
/**
 * Delete all records from SpeciesAbility table
 */
export async function deleteAllSpeciesAbilities(pool) {
    const db = pool ?? getProdDb();
    await db.query('TRUNCATE TABLE "SpeciesAbility" CASCADE');
}
/**
 * Delete all records from SpeciesType table
 */
export async function deleteAllSpeciesTypes(pool) {
    const db = pool ?? getProdDb();
    await db.query('TRUNCATE TABLE "SpeciesType" CASCADE');
}
/**
 * Delete all records from EvolutionStep table
 */
export async function deleteAllEvolutionSteps(pool) {
    const db = pool ?? getProdDb();
    await db.query('TRUNCATE TABLE "EvolutionStep" CASCADE');
}
/**
 * Delete all species-kind name variants
 */
export async function deleteSpeciesNameVariants(pool) {
    const db = pool ?? getProdDb();
    const { text, values } = buildDelete("NameVariant", { kind: "species" });
    await db.query(text, values);
}
/**
 * Delete all records from Species table
 */
export async function deleteAllSpecies(pool) {
    const db = pool ?? getProdDb();
    await db.query('TRUNCATE TABLE "Species" CASCADE');
}
/**
 * Delete all records from Move table
 */
export async function deleteAllMoves(pool) {
    const db = pool ?? getProdDb();
    await db.query('TRUNCATE TABLE "Move" CASCADE');
}
/**
 * Delete all records from Ability table
 */
export async function deleteAllAbilities(pool) {
    const db = pool ?? getProdDb();
    await db.query('TRUNCATE TABLE "Ability" CASCADE');
}
/**
 * Delete all records from TypeChart table
 */
export async function deleteAllTypeChart(pool) {
    const db = pool ?? getProdDb();
    await db.query('TRUNCATE TABLE "TypeChart" CASCADE');
}
// ============================================================================
// Bulk Insert Operations
// ============================================================================
/**
 * Insert abilities in chunks
 */
export async function insertAbilities(abilities, pool) {
    if (abilities.length === 0)
        return;
    const db = pool ?? getProdDb();
    // Build bulk INSERT with placeholders
    const columns = ["id", "slug", "name", "desc"];
    const placeholders = [];
    const values = [];
    abilities.forEach((ability, idx) => {
        const offset = idx * columns.length;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
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
export async function insertMoves(moves, pool) {
    if (moves.length === 0)
        return;
    const db = pool ?? getProdDb();
    // Build bulk INSERT with placeholders
    const columns = ["id", "slug", "name", "typeId", "power", "accuracy", "pp", "priority", "category", "meta"];
    const placeholders = [];
    const values = [];
    moves.forEach((move, idx) => {
        const offset = idx * columns.length;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`);
        values.push(move.id, move.slug, move.name, move.typeId, move.power, move.accuracy, move.pp, move.priority, move.category, JSON.stringify(move.meta));
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
export async function insertSpecies(species, pool) {
    if (species.length === 0)
        return;
    const db = pool ?? getProdDb();
    // Build bulk INSERT with placeholders
    const columns = ["id", "slug", "name", "baseHp", "baseAtk", "baseDef", "baseSpAtk", "baseSpDef", "baseSpe", "growth", "captureRate", "maleRate", "hatchSteps", "meta"];
    const placeholders = [];
    const values = [];
    species.forEach((s, idx) => {
        const offset = idx * columns.length;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14})`);
        values.push(s.id, s.slug, s.name, s.baseHp, s.baseAtk, s.baseDef, s.baseSpAtk, s.baseSpDef, s.baseSpe, s.growth, s.captureRate, s.maleRate, s.hatchSteps, JSON.stringify(s.meta));
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
export async function insertSpeciesTypes(speciesTypes, pool) {
    if (speciesTypes.length === 0)
        return;
    const db = pool ?? getProdDb();
    // Build bulk INSERT with placeholders
    const columns = ["speciesId", "typeId", "slot"];
    const placeholders = [];
    const values = [];
    speciesTypes.forEach((st, idx) => {
        const offset = idx * columns.length;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
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
export async function insertSpeciesAbilities(speciesAbilities, pool) {
    if (speciesAbilities.length === 0)
        return;
    const db = pool ?? getProdDb();
    // Build bulk INSERT with placeholders
    const columns = ["speciesId", "abilityId", "slot"];
    const placeholders = [];
    const values = [];
    speciesAbilities.forEach((sa, idx) => {
        const offset = idx * columns.length;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
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
export async function insertSpeciesLearnsets(learnsets, pool) {
    if (learnsets.length === 0)
        return;
    const db = pool ?? getProdDb();
    // buildInsert doesn't support ON CONFLICT, so we'll construct it manually
    // for the skipDuplicates behavior
    const columns = ["speciesId", "moveId", "method", "level", "machineId"];
    const placeholders = [];
    const values = [];
    learnsets.forEach((entry, idx) => {
        const offset = idx * columns.length;
        const row = [
            entry.speciesId,
            entry.moveId,
            entry.method,
            entry.level,
            entry.machineId,
        ];
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
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
export async function insertNameVariants(variants, pool) {
    if (variants.length === 0)
        return;
    const db = pool ?? getProdDb();
    // Build bulk INSERT with placeholders
    const columns = ["id", "kind", "refIntId", "locale", "nameType", "value", "normalized"];
    const placeholders = [];
    const values = [];
    variants.forEach((v, idx) => {
        const offset = idx * columns.length;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`);
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
export async function insertTypeChart(typeChart, pool) {
    if (typeChart.length === 0)
        return;
    const db = pool ?? getProdDb();
    // Build bulk INSERT with placeholders
    const columns = ["atkTypeId", "defTypeId", "mult"];
    const placeholders = [];
    const values = [];
    typeChart.forEach((tc, idx) => {
        const offset = idx * columns.length;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
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
export async function refreshSpeciesSheet(pool) {
    const db = pool ?? getProdDb();
    try {
        await db.query(`REFRESH MATERIALIZED VIEW "SpeciesSheet"`);
    }
    catch (error) {
        // Check for permission denied error (42501)
        if (error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "42501") {
            // Fallback to helper function
            await db.query(`SELECT public.refresh_species_sheet()::text`);
        }
        else {
            throw error;
        }
    }
}
