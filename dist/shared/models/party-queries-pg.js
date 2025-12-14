/**
 * Party/Pokemon Queries - PostgreSQL Implementation
 *
 * Purpose: Raw pg queries for Party, PartySlot, and PokemonInstance operations
 * Migration: Replaces Prisma patterns from:
 *   - src/shared/models/party-queries.ts
 *   - src/bot/dm/starters.ts
 *   - src/bot/dm/heal.ts
 *   - src/core/encounter/catch.ts
 *
 * Patterns Covered:
 *   - Party with slots and Pokemon (3-way JOIN)
 *   - Party CRUD (create, find, count)
 *   - PokemonInstance CRUD (create, update, find)
 *   - PartySlot assignment (find available slot, create)
 *   - Healing (bulk Pokemon updates)
 *   - Box management (boxSlot tracking)
 *
 * Migration Phase: 9 (Party/Pokemon queries)
 */
import { getProdDb } from "../pg-connection.js";
import { buildSelect, buildInsert, buildUpdate, buildCount } from "../pg-query.js";
// ============================================================================
// Helper Functions
// ============================================================================
/**
 * Convert Date fields from database string results
 * Required for: createdAt, updatedAt
 */
function reviveParty(row) {
    return {
        ...row,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
        updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
    };
}
/**
 * Convert Date fields for PartySlot
 */
function revivePartySlot(row) {
    return {
        ...row,
        updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
    };
}
/**
 * Convert Date fields for PokemonInstance
 */
function revivePokemon(row) {
    return {
        ...row,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
        updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
    };
}
/**
 * Convert PartyWithSlots Date fields (party + slots + pokemon)
 */
function revivePartyWithSlots(rows) {
    if (rows.length === 0)
        return null;
    const firstRow = rows[0];
    const party = reviveParty({
        id: firstRow.party_id,
        ownerId: firstRow.party_ownerId,
        trainerId: firstRow.party_trainerId,
        createdAt: firstRow.party_createdAt,
        updatedAt: firstRow.party_updatedAt,
    });
    const slots = rows
        .filter(row => row.slot_id !== null) // Filter out parties with no slots
        .map(row => ({
        ...revivePartySlot({
            id: row.slot_id,
            partyId: row.slot_partyId,
            slot: row.slot_slot,
            pokemonId: row.slot_pokemonId,
            updatedAt: row.slot_updatedAt,
        }),
        pokemon: revivePokemon({
            id: row.pokemon_id,
            ownerId: row.pokemon_ownerId,
            speciesId: row.pokemon_speciesId,
            form: row.pokemon_form,
            level: row.pokemon_level,
            exp: row.pokemon_exp,
            nature: row.pokemon_nature,
            ivsJson: row.pokemon_ivsJson,
            evsJson: row.pokemon_evsJson,
            movesJson: row.pokemon_movesJson,
            status: row.pokemon_status,
            hp: row.pokemon_hp,
            maxHp: row.pokemon_maxHp,
            isShiny: row.pokemon_isShiny,
            nickname: row.pokemon_nickname,
            boxSlot: row.pokemon_boxSlot,
            createdAt: row.pokemon_createdAt,
            updatedAt: row.pokemon_updatedAt,
            tenantId: row.pokemon_tenantId,
            trainerId: row.pokemon_trainerId,
            packHash: row.pokemon_packHash,
        }),
    }));
    return {
        ...party,
        slots,
    };
}
/**
 * Get pool with fallback to PROD
 */
function getPool(pool) {
    if (pool)
        return pool;
    const prodPool = getProdDb();
    if (!prodPool)
        throw new Error("No PROD database pool available");
    return prodPool;
}
// ============================================================================
// Party Read Operations
// ============================================================================
/**
 * Get user's first party with all slots and Pokemon loaded
 * Equivalent to: prisma.party.findFirst({ where: { ownerId }, include: { slots: { include: { pokemon: true } } } })
 *
 * Used by: DM flows, battle handlers, encounter catch, healing
 *
 * @param ownerId - User ID who owns the party
 * @param pool - Optional pg pool override
 * @returns Party with slots and Pokemon, or null if no party exists
 */
export async function getPartyWithSlots(ownerId, pool) {
    const db = getPool(pool);
    const query = `
    SELECT 
      p."id" AS party_id, p."ownerId" AS party_ownerId, p."trainerId" AS party_trainerId,
      p."createdAt" AS party_createdAt, p."updatedAt" AS party_updatedAt,
      s."id" AS slot_id, s."partyId" AS slot_partyId, s."slot" AS slot_slot,
      s."pokemonId" AS slot_pokemonId, s."updatedAt" AS slot_updatedAt,
      pk."id" AS pokemon_id, pk."ownerId" AS pokemon_ownerId, pk."speciesId" AS pokemon_speciesId,
      pk."form" AS pokemon_form, pk."level" AS pokemon_level, pk."exp" AS pokemon_exp,
      pk."nature" AS pokemon_nature, pk."ivsJson" AS pokemon_ivsJson, pk."evsJson" AS pokemon_evsJson,
      pk."movesJson" AS pokemon_movesJson, pk."status" AS pokemon_status, pk."hp" AS pokemon_hp,
      pk."maxHp" AS pokemon_maxHp, pk."isShiny" AS pokemon_isShiny, pk."nickname" AS pokemon_nickname,
      pk."boxSlot" AS pokemon_boxSlot, pk."createdAt" AS pokemon_createdAt, pk."updatedAt" AS pokemon_updatedAt,
      pk."tenantId" AS pokemon_tenantId, pk."trainerId" AS pokemon_trainerId, pk."packHash" AS pokemon_packHash
    FROM "Party" p
    LEFT JOIN "PartySlot" s ON p."id" = s."partyId"
    LEFT JOIN "PokemonInstance" pk ON s."pokemonId" = pk."id"
    WHERE p."ownerId" = $1
    ORDER BY p."createdAt" ASC, s."slot" ASC
    LIMIT 1
  `;
    const result = await db.query(query, [ownerId]);
    return revivePartyWithSlots(result.rows);
}
/**
 * Get party by ID with slots and Pokemon loaded
 * Equivalent to: prisma.party.findUnique({ where: { id }, include: { slots: { include: { pokemon: true } } } })
 *
 * @param partyId - Party ID to fetch
 * @param pool - Optional pg pool override
 * @returns Party with slots and Pokemon, or null if not found
 */
export async function getPartyByIdWithSlots(partyId, pool) {
    const db = getPool(pool);
    const query = `
    SELECT 
      p."id" AS party_id, p."ownerId" AS party_ownerId, p."trainerId" AS party_trainerId,
      p."createdAt" AS party_createdAt, p."updatedAt" AS party_updatedAt,
      s."id" AS slot_id, s."partyId" AS slot_partyId, s."slot" AS slot_slot,
      s."pokemonId" AS slot_pokemonId, s."updatedAt" AS slot_updatedAt,
      pk."id" AS pokemon_id, pk."ownerId" AS pokemon_ownerId, pk."speciesId" AS pokemon_speciesId,
      pk."form" AS pokemon_form, pk."level" AS pokemon_level, pk."exp" AS pokemon_exp,
      pk."nature" AS pokemon_nature, pk."ivsJson" AS pokemon_ivsJson, pk."evsJson" AS pokemon_evsJson,
      pk."movesJson" AS pokemon_movesJson, pk."status" AS pokemon_status, pk."hp" AS pokemon_hp,
      pk."maxHp" AS pokemon_maxHp, pk."isShiny" AS pokemon_isShiny, pk."nickname" AS pokemon_nickname,
      pk."boxSlot" AS pokemon_boxSlot, pk."createdAt" AS pokemon_createdAt, pk."updatedAt" AS pokemon_updatedAt,
      pk."tenantId" AS pokemon_tenantId, pk."trainerId" AS pokemon_trainerId, pk."packHash" AS pokemon_packHash
    FROM "Party" p
    LEFT JOIN "PartySlot" s ON p."id" = s."partyId"
    LEFT JOIN "PokemonInstance" pk ON s."pokemonId" = pk."id"
    WHERE p."id" = $1
    ORDER BY s."slot" ASC
  `;
    const result = await db.query(query, [partyId]);
    return revivePartyWithSlots(result.rows);
}
/**
 * Get all parties for a user with slots and Pokemon
 * Equivalent to: prisma.party.findMany({ where: { ownerId }, include: { slots: { include: { pokemon: true } } }, orderBy: { createdAt: "asc" } })
 *
 * Less common, but useful for profile/admin views
 *
 * @param ownerId - User ID who owns the parties
 * @param pool - Optional pg pool override
 * @returns Array of parties with slots and Pokemon
 */
export async function getAllPartiesWithSlots(ownerId, pool) {
    const db = getPool(pool);
    const query = `
    SELECT 
      p."id" AS party_id, p."ownerId" AS party_ownerId, p."trainerId" AS party_trainerId,
      p."createdAt" AS party_createdAt, p."updatedAt" AS party_updatedAt,
      s."id" AS slot_id, s."partyId" AS slot_partyId, s."slot" AS slot_slot,
      s."pokemonId" AS slot_pokemonId, s."updatedAt" AS slot_updatedAt,
      pk."id" AS pokemon_id, pk."ownerId" AS pokemon_ownerId, pk."speciesId" AS pokemon_speciesId,
      pk."form" AS pokemon_form, pk."level" AS pokemon_level, pk."exp" AS pokemon_exp,
      pk."nature" AS pokemon_nature, pk."ivsJson" AS pokemon_ivsJson, pk."evsJson" AS pokemon_evsJson,
      pk."movesJson" AS pokemon_movesJson, pk."status" AS pokemon_status, pk."hp" AS pokemon_hp,
      pk."maxHp" AS pokemon_maxHp, pk."isShiny" AS pokemon_isShiny, pk."nickname" AS pokemon_nickname,
      pk."boxSlot" AS pokemon_boxSlot, pk."createdAt" AS pokemon_createdAt, pk."updatedAt" AS pokemon_updatedAt,
      pk."tenantId" AS pokemon_tenantId, pk."trainerId" AS pokemon_trainerId, pk."packHash" AS pokemon_packHash
    FROM "Party" p
    LEFT JOIN "PartySlot" s ON p."id" = s."partyId"
    LEFT JOIN "PokemonInstance" pk ON s."pokemonId" = pk."id"
    WHERE p."ownerId" = $1
    ORDER BY p."createdAt" ASC, s."slot" ASC
  `;
    const result = await db.query(query, [ownerId]);
    // Group rows by party ID
    const partiesMap = new Map();
    for (const row of result.rows) {
        const partyId = row.party_id;
        if (!partiesMap.has(partyId)) {
            partiesMap.set(partyId, []);
        }
        partiesMap.get(partyId).push(row);
    }
    // Convert each group to PartyWithSlots
    const parties = [];
    for (const rows of partiesMap.values()) {
        const party = revivePartyWithSlots(rows);
        if (party)
            parties.push(party);
    }
    return parties;
}
/**
 * Check if user has any party
 * Equivalent to: prisma.party.count({ where: { ownerId } }) > 0
 *
 * Lightweight query when you only need existence check
 *
 * @param ownerId - User ID to check
 * @param pool - Optional pg pool override
 * @returns True if user has at least one party
 */
export async function hasParty(ownerId, pool) {
    const db = getPool(pool);
    const { text, values } = buildCount("Party", { ownerId });
    const result = await db.query(text, values);
    return parseInt(result.rows[0].count, 10) > 0;
}
/**
 * Get party with only slot count (no Pokemon data)
 * Equivalent to: prisma.party.findFirst({ where: { ownerId }, include: { _count: { select: { slots: true } } } })
 *
 * Use when you only need to know how many slots are filled
 *
 * @param ownerId - User ID who owns the party
 * @param pool - Optional pg pool override
 * @returns Party with slot count, or null
 */
export async function getPartyWithSlotCount(ownerId, pool) {
    const db = getPool(pool);
    const query = `
    SELECT 
      p.*,
      COUNT(s."id") AS slot_count
    FROM "Party" p
    LEFT JOIN "PartySlot" s ON p."id" = s."partyId"
    WHERE p."ownerId" = $1
    GROUP BY p."id"
    ORDER BY p."createdAt" ASC
    LIMIT 1
  `;
    const result = await db.query(query, [ownerId]);
    if (result.rows.length === 0)
        return null;
    const row = result.rows[0];
    const party = reviveParty(row);
    return {
        ...party,
        _count: { slots: parseInt(row.slot_count, 10) },
    };
}
// ============================================================================
// Party Write Operations
// ============================================================================
/**
 * Create a new party
 * Equivalent to: prisma.party.create({ data: { ownerId } })
 *
 * Used by: Starter selection, first Pokemon catch
 *
 * @param ownerId - User ID who owns the party
 * @param pool - Optional pg pool override
 * @returns Created Party record
 */
export async function createParty(ownerId, pool) {
    const db = getPool(pool);
    const { text, values } = buildInsert("Party", {
        id: "gen_random_uuid()",
        ownerId,
        trainerId: null,
        createdAt: "NOW()",
        updatedAt: "NOW()",
    });
    const result = await db.query(`${text} RETURNING *`, values);
    return reviveParty(result.rows[0]);
}
/**
 * Delete a party (cascades to slots)
 * Equivalent to: prisma.party.delete({ where: { id } })
 *
 * @param partyId - Party ID to delete
 * @param pool - Optional pg pool override
 * @returns Deleted Party or null if not found
 */
export async function deleteParty(partyId, pool) {
    const db = getPool(pool);
    const query = `DELETE FROM "Party" WHERE "id" = $1 RETURNING *`;
    const result = await db.query(query, [partyId]);
    if (result.rows.length === 0)
        return null;
    return reviveParty(result.rows[0]);
}
// ============================================================================
// PartySlot Operations
// ============================================================================
/**
 * Create a party slot (assign Pokemon to party)
 * Equivalent to: prisma.partySlot.create({ data: { partyId, pokemonId, slot } })
 *
 * Used by: Starter selection, Pokemon catch
 *
 * @param partyId - Party ID
 * @param pokemonId - PokemonInstance ID
 * @param slot - Slot number (1-6)
 * @param pool - Optional pg pool override
 * @returns Created PartySlot record
 */
export async function createPartySlot(partyId, pokemonId, slot, pool) {
    const db = getPool(pool);
    const { text, values } = buildInsert("PartySlot", {
        id: "gen_random_uuid()",
        partyId,
        pokemonId,
        slot,
        updatedAt: "NOW()",
    });
    const result = await db.query(`${text} RETURNING *`, values);
    return revivePartySlot(result.rows[0]);
}
/**
 * Find next available party slot (1-6)
 * Returns the first unused slot number, or null if party is full
 *
 * Used by: Starter selection, Pokemon catch
 *
 * @param partyId - Party ID
 * @param pool - Optional pg pool override
 * @returns Next available slot number (1-6) or null if full
 */
export async function findNextAvailableSlot(partyId, pool) {
    const db = getPool(pool);
    const query = `
    SELECT s."slot"
    FROM "PartySlot" s
    WHERE s."partyId" = $1
    ORDER BY s."slot" ASC
  `;
    const result = await db.query(query, [partyId]);
    const usedSlots = new Set(result.rows.map(row => row.slot));
    // Find first unused slot 1-6
    for (let slot = 1; slot <= 6; slot++) {
        if (!usedSlots.has(slot)) {
            return slot;
        }
    }
    return null; // Party is full
}
/**
 * Delete a party slot (remove Pokemon from party)
 * Equivalent to: prisma.partySlot.delete({ where: { id } })
 *
 * @param slotId - PartySlot ID to delete
 * @param pool - Optional pg pool override
 * @returns Deleted PartySlot or null if not found
 */
export async function deletePartySlot(slotId, pool) {
    const db = getPool(pool);
    const query = `DELETE FROM "PartySlot" WHERE "id" = $1 RETURNING *`;
    const result = await db.query(query, [slotId]);
    if (result.rows.length === 0)
        return null;
    return revivePartySlot(result.rows[0]);
}
// ============================================================================
// PokemonInstance Operations
// ============================================================================
/**
 * Create a new Pokemon instance
 * Equivalent to: prisma.pokemonInstance.create({ data: { ... } })
 *
 * Used by: Starter selection, Pokemon catch
 *
 * @param data - Pokemon creation data
 * @param pool - Optional pg pool override
 * @returns Created PokemonInstance record
 */
export async function createPokemon(data, pool) {
    const db = getPool(pool);
    const { text, values } = buildInsert("PokemonInstance", {
        id: "gen_random_uuid()",
        ownerId: data.ownerId,
        speciesId: data.speciesId,
        form: null,
        level: data.level,
        exp: data.exp,
        nature: data.nature,
        ivsJson: JSON.stringify(data.ivsJson),
        evsJson: JSON.stringify(data.evsJson),
        movesJson: JSON.stringify(data.movesJson),
        status: data.status,
        hp: data.hp,
        maxHp: data.maxHp,
        isShiny: data.isShiny,
        nickname: data.nickname,
        boxSlot: data.boxSlot,
        createdAt: "NOW()",
        updatedAt: "NOW()",
        tenantId: null,
        trainerId: null,
        packHash: null,
    });
    const result = await db.query(`${text} RETURNING *`, values);
    return revivePokemon(result.rows[0]);
}
/**
 * Find Pokemon instance by ID
 * Equivalent to: prisma.pokemonInstance.findUnique({ where: { id } })
 *
 * @param pokemonId - PokemonInstance ID
 * @param pool - Optional pg pool override
 * @returns PokemonInstance or null if not found
 */
export async function findPokemonById(pokemonId, pool) {
    const db = getPool(pool);
    const { text, values } = buildSelect("PokemonInstance", ["id", "ownerId", "speciesId", "form", "level", "exp", "nature", "ivsJson", "evsJson", "movesJson", "status", "hp", "maxHp", "isShiny", "nickname", "boxSlot", "createdAt", "updatedAt", "tenantId", "trainerId", "packHash"], { id: pokemonId });
    const result = await db.query(text, values);
    if (result.rows.length === 0)
        return null;
    return revivePokemon(result.rows[0]);
}
/**
 * Update Pokemon HP and status (heal)
 * Equivalent to: prisma.pokemonInstance.update({ where: { id }, data: { hp, status } })
 *
 * Used by: Healing, battle damage
 *
 * @param pokemonId - PokemonInstance ID
 * @param hp - New HP value
 * @param status - New status (null to clear)
 * @param pool - Optional pg pool override
 * @returns Updated PokemonInstance or null if not found
 */
export async function updatePokemonHealth(pokemonId, hp, status, pool) {
    const db = getPool(pool);
    const { text, values } = buildUpdate("PokemonInstance", { hp, status, updatedAt: "NOW()" }, { id: pokemonId });
    const result = await db.query(`${text} RETURNING *`, values);
    if (result.rows.length === 0)
        return null;
    return revivePokemon(result.rows[0]);
}
/**
 * Update party slot position
 * Equivalent to: prisma.partySlot.update({ where: { id }, data: { slot } })
 *
 * Used by: Party slot swapping during encounters
 *
 * @param slotId - PartySlot ID
 * @param newSlotPosition - New slot position (1-6, or 0 for temp)
 * @param pool - Optional pg pool override
 * @returns Updated PartySlot or null if not found
 */
export async function updatePartySlotPosition(slotId, newSlotPosition, pool) {
    const db = getPool(pool);
    const { text, values } = buildUpdate("PartySlot", { slot: newSlotPosition, updatedAt: "NOW()" }, { id: slotId });
    const result = await db.query(`${text} RETURNING *`, values);
    if (result.rows.length === 0)
        return null;
    return revivePartySlot(result.rows[0]);
}
/**
 * Heal multiple Pokemon (bulk update)
 * Equivalent to: prisma.$transaction(instances.map(p => prisma.pokemonInstance.update(...)))
 *
 * Used by: Party healing
 *
 * @param pokemonIds - Array of PokemonInstance IDs
 * @param pool - Optional pg pool override
 * @returns Number of Pokemon healed
 */
export async function healPokemon(pokemonIds, pool) {
    const db = getPool(pool);
    if (pokemonIds.length === 0)
        return 0;
    const query = `
    UPDATE "PokemonInstance"
    SET "hp" = "maxHp", "status" = NULL, "updatedAt" = NOW()
    WHERE "id" = ANY($1::uuid[])
  `;
    const result = await db.query(query, [pokemonIds]);
    return result.rowCount ?? 0;
}
/**
 * Delete Pokemon instance
 * Equivalent to: prisma.pokemonInstance.delete({ where: { id } })
 *
 * @param pokemonId - PokemonInstance ID to delete
 * @param pool - Optional pg pool override
 * @returns Deleted PokemonInstance or null if not found
 */
export async function deletePokemon(pokemonId, pool) {
    const db = getPool(pool);
    const query = `DELETE FROM "PokemonInstance" WHERE "id" = $1 RETURNING *`;
    const result = await db.query(query, [pokemonId]);
    if (result.rows.length === 0)
        return null;
    return revivePokemon(result.rows[0]);
}
