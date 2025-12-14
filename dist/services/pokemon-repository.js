/**
 * Pokemon Repository — Domain-specific Pokemon Instance operations
 *
 * Provides type-safe access to PokemonInstance data with:
 * - Owner-based queries (User owns Pokemon)
 * - Trainer association support (optional trainer link)
 * - Party slot management integration
 * - Stats and experience calculations
 * - Box storage management
 * - Evolution eligibility checks
 * - RLS context integration for security
 *
 * @module services/pokemon-repository
 * @see prisma/schema.prisma - PokemonInstance, Species, PartySlot models
 * @see src/services/rls-context.ts - RLS context management
 * @see src/services/base-repository.ts - Base repository pattern
 */
import { setUserContext, clearUserContext } from "./rls-context.js";
import { toJsonValue, fromJsonValue } from "../shared/json-types.js";
// =============================================================================
// Default Values
// =============================================================================
const DEFAULT_EVS = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
// =============================================================================
// Pokemon Repository Implementation
// =============================================================================
/**
 * Pokemon Repository
 *
 * Standalone implementation (not extending BaseRepository) for type safety
 * and schema-specific operations. Designed for domain-specific Pokemon operations.
 */
export class PokemonRepository {
    prisma;
    rlsContext;
    constructor(prisma, rlsContext) {
        this.prisma = prisma;
        this.rlsContext = rlsContext;
    }
    // ===========================================================================
    // RLS Context Management
    // ===========================================================================
    /**
     * Execute operation with RLS context if configured
     */
    async withRls(operation) {
        if (!this.rlsContext) {
            return operation();
        }
        await setUserContext(this.prisma, this.rlsContext);
        try {
            return await operation();
        }
        finally {
            await clearUserContext(this.prisma);
        }
    }
    // ===========================================================================
    // Basic CRUD Operations
    // ===========================================================================
    /**
     * Find Pokemon by ID
     */
    async findById(id) {
        return this.withRls(async () => {
            return this.prisma.pokemonInstance.findUnique({
                where: { id },
                include: { species: true },
            });
        });
    }
    /**
     * Find Pokemon by ID with party slot info
     */
    async findByIdWithPartySlot(id) {
        return this.withRls(async () => {
            return this.prisma.pokemonInstance.findUnique({
                where: { id },
                include: {
                    species: true,
                    partySlots: {
                        select: { id: true, slot: true, partyId: true },
                    },
                },
            });
        });
    }
    /**
     * Find all Pokemon owned by a user
     */
    async findByOwnerId(ownerId) {
        return this.withRls(async () => {
            return this.prisma.pokemonInstance.findMany({
                where: { ownerId },
                include: { species: true },
                orderBy: [{ createdAt: "desc" }],
            });
        });
    }
    /**
     * Find Pokemon by owner with pagination
     */
    async findByOwnerIdPaginated(ownerId, options) {
        return this.withRls(async () => {
            const { page, pageSize } = options;
            const skip = (page - 1) * pageSize;
            const [data, total] = await Promise.all([
                this.prisma.pokemonInstance.findMany({
                    where: { ownerId },
                    include: { species: true },
                    orderBy: [{ createdAt: "desc" }],
                    skip,
                    take: pageSize,
                }),
                this.prisma.pokemonInstance.count({ where: { ownerId } }),
            ]);
            return {
                data,
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize),
            };
        });
    }
    /**
     * Find Pokemon associated with a trainer
     */
    async findByTrainerId(trainerId) {
        return this.withRls(async () => {
            return this.prisma.pokemonInstance.findMany({
                where: { trainerId },
                include: { species: true },
                orderBy: [{ level: "desc" }],
            });
        });
    }
    /**
     * Create a new Pokemon instance
     */
    async create(data) {
        return this.withRls(async () => {
            return this.prisma.pokemonInstance.create({
                data: {
                    ownerId: data.ownerId,
                    speciesId: data.speciesId,
                    level: data.level ?? 1,
                    exp: data.exp ?? 0,
                    nature: data.nature,
                    ivsJson: toJsonValue(data.ivs),
                    evsJson: toJsonValue(data.evs ?? DEFAULT_EVS),
                    movesJson: toJsonValue(data.moves),
                    hp: data.hp,
                    maxHp: data.maxHp,
                    isShiny: data.isShiny ?? false,
                    nickname: data.nickname,
                    form: data.form,
                    trainerId: data.trainerId,
                    tenantId: data.tenantId,
                },
                include: { species: true },
            });
        });
    }
    /**
     * Update a Pokemon instance
     */
    async update(id, data) {
        return this.withRls(async () => {
            const updateData = {};
            if (data.level !== undefined)
                updateData.level = data.level;
            if (data.exp !== undefined)
                updateData.exp = data.exp;
            if (data.nature !== undefined)
                updateData.nature = data.nature;
            if (data.ivs !== undefined)
                updateData.ivsJson = toJsonValue(data.ivs);
            if (data.evs !== undefined)
                updateData.evsJson = toJsonValue(data.evs);
            if (data.moves !== undefined)
                updateData.movesJson = toJsonValue(data.moves);
            if (data.hp !== undefined)
                updateData.hp = data.hp;
            if (data.maxHp !== undefined)
                updateData.maxHp = data.maxHp;
            if (data.status !== undefined)
                updateData.status = data.status;
            if (data.nickname !== undefined)
                updateData.nickname = data.nickname;
            if (data.boxSlot !== undefined)
                updateData.boxSlot = data.boxSlot;
            if (data.trainerId !== undefined) {
                updateData.trainer = data.trainerId
                    ? { connect: { id: data.trainerId } }
                    : { disconnect: true };
            }
            return this.prisma.pokemonInstance.update({
                where: { id },
                data: updateData,
                include: { species: true },
            });
        });
    }
    /**
     * Delete a Pokemon instance (hard delete)
     */
    async delete(id) {
        return this.withRls(async () => {
            await this.prisma.pokemonInstance.delete({ where: { id } });
        });
    }
    // ===========================================================================
    // Box Management Operations
    // ===========================================================================
    /**
     * Get Pokemon in box (not in party) for a user
     */
    async getBoxPokemon(ownerId, filters) {
        return this.withRls(async () => {
            // First get IDs of Pokemon in party slots
            const partyPokemonIds = await this.prisma.partySlot.findMany({
                where: {
                    party: { ownerId },
                },
                select: { pokemonId: true },
            });
            const partyIds = new Set(partyPokemonIds.map((p) => p.pokemonId));
            // Build where clause
            const where = {
                ownerId,
                id: { notIn: [...partyIds] },
            };
            if (filters?.speciesId !== undefined) {
                where.speciesId = filters.speciesId;
            }
            if (filters?.isShiny !== undefined) {
                where.isShiny = filters.isShiny;
            }
            if (filters?.minLevel !== undefined) {
                where.level = { ...where.level, gte: filters.minLevel };
            }
            if (filters?.maxLevel !== undefined) {
                where.level = { ...where.level, lte: filters.maxLevel };
            }
            if (filters?.form !== undefined) {
                where.form = filters.form;
            }
            return this.prisma.pokemonInstance.findMany({
                where,
                include: { species: true },
                orderBy: [{ boxSlot: "asc" }, { speciesId: "asc" }],
            });
        });
    }
    /**
     * Get Pokemon in box with pagination
     */
    async getBoxPokemonPaginated(ownerId, options, filters) {
        return this.withRls(async () => {
            const { page, pageSize } = options;
            const skip = (page - 1) * pageSize;
            // First get IDs of Pokemon in party slots
            const partyPokemonIds = await this.prisma.partySlot.findMany({
                where: {
                    party: { ownerId },
                },
                select: { pokemonId: true },
            });
            const partyIds = new Set(partyPokemonIds.map((p) => p.pokemonId));
            // Build where clause
            const where = {
                ownerId,
                id: { notIn: [...partyIds] },
            };
            if (filters?.speciesId !== undefined) {
                where.speciesId = filters.speciesId;
            }
            if (filters?.isShiny !== undefined) {
                where.isShiny = filters.isShiny;
            }
            if (filters?.minLevel !== undefined) {
                where.level = { ...where.level, gte: filters.minLevel };
            }
            if (filters?.maxLevel !== undefined) {
                where.level = { ...where.level, lte: filters.maxLevel };
            }
            if (filters?.form !== undefined) {
                where.form = filters.form;
            }
            const [data, total] = await Promise.all([
                this.prisma.pokemonInstance.findMany({
                    where,
                    include: { species: true },
                    orderBy: [{ boxSlot: "asc" }, { speciesId: "asc" }],
                    skip,
                    take: pageSize,
                }),
                this.prisma.pokemonInstance.count({ where }),
            ]);
            return {
                data,
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize),
            };
        });
    }
    /**
     * Assign box slot to Pokemon
     */
    async assignBoxSlot(id, boxSlot) {
        return this.withRls(async () => {
            return this.prisma.pokemonInstance.update({
                where: { id },
                data: { boxSlot },
                include: { species: true },
            });
        });
    }
    /**
     * Swap two Pokemon's box slots
     */
    async swapBoxSlots(pokemon1Id, pokemon2Id) {
        return this.withRls(async () => {
            const [p1, p2] = await Promise.all([
                this.prisma.pokemonInstance.findUnique({
                    where: { id: pokemon1Id },
                    select: { boxSlot: true },
                }),
                this.prisma.pokemonInstance.findUnique({
                    where: { id: pokemon2Id },
                    select: { boxSlot: true },
                }),
            ]);
            if (!p1 || !p2) {
                throw new Error("One or both Pokemon not found");
            }
            await this.prisma.$transaction([
                this.prisma.pokemonInstance.update({
                    where: { id: pokemon1Id },
                    data: { boxSlot: p2.boxSlot },
                }),
                this.prisma.pokemonInstance.update({
                    where: { id: pokemon2Id },
                    data: { boxSlot: p1.boxSlot },
                }),
            ]);
        });
    }
    // ===========================================================================
    // Battle & Health Operations
    // ===========================================================================
    /**
     * Update Pokemon HP (from battle damage or healing)
     */
    async updateHp(id, hp) {
        return this.withRls(async () => {
            return this.prisma.pokemonInstance.update({
                where: { id },
                data: { hp: Math.max(0, hp) },
                include: { species: true },
            });
        });
    }
    /**
     * Set Pokemon status condition
     */
    async setStatus(id, status) {
        return this.withRls(async () => {
            return this.prisma.pokemonInstance.update({
                where: { id },
                data: { status },
                include: { species: true },
            });
        });
    }
    /**
     * Heal Pokemon to full HP and clear status
     */
    async heal(id) {
        return this.withRls(async () => {
            const pokemon = await this.prisma.pokemonInstance.findUnique({
                where: { id },
                select: { maxHp: true },
            });
            if (!pokemon) {
                throw new Error(`Pokemon ${id} not found`);
            }
            return this.prisma.pokemonInstance.update({
                where: { id },
                data: { hp: pokemon.maxHp, status: null },
                include: { species: true },
            });
        });
    }
    /**
     * Heal all Pokemon owned by a user
     */
    async healAll(ownerId) {
        return this.withRls(async () => {
            // We need to heal each Pokemon to its own maxHp
            const pokemon = await this.prisma.pokemonInstance.findMany({
                where: { ownerId },
                select: { id: true, maxHp: true },
            });
            await Promise.all(pokemon.map((p) => this.prisma.pokemonInstance.update({
                where: { id: p.id },
                data: { hp: p.maxHp, status: null },
            })));
            return pokemon.length;
        });
    }
    // ===========================================================================
    // Experience & Leveling
    // ===========================================================================
    /**
     * Add experience to Pokemon
     */
    async addExperience(id, expGain) {
        return this.withRls(async () => {
            const pokemon = await this.prisma.pokemonInstance.findUnique({
                where: { id },
                select: { exp: true },
            });
            if (!pokemon) {
                throw new Error(`Pokemon ${id} not found`);
            }
            return this.prisma.pokemonInstance.update({
                where: { id },
                data: { exp: pokemon.exp + expGain },
                include: { species: true },
            });
        });
    }
    /**
     * Level up Pokemon (increment level, reset exp to 0)
     */
    async levelUp(id, newMaxHp) {
        return this.withRls(async () => {
            const updateData = {
                level: { increment: 1 },
                exp: 0,
            };
            if (newMaxHp !== undefined) {
                updateData.maxHp = newMaxHp;
                updateData.hp = newMaxHp; // Heal to full on level up
            }
            return this.prisma.pokemonInstance.update({
                where: { id },
                data: updateData,
                include: { species: true },
            });
        });
    }
    /**
     * Set Pokemon level directly
     */
    async setLevel(id, level, newMaxHp) {
        return this.withRls(async () => {
            const updateData = {
                level,
                exp: 0,
            };
            if (newMaxHp !== undefined) {
                updateData.maxHp = newMaxHp;
                updateData.hp = newMaxHp;
            }
            return this.prisma.pokemonInstance.update({
                where: { id },
                data: updateData,
                include: { species: true },
            });
        });
    }
    // ===========================================================================
    // Move Management
    // ===========================================================================
    /**
     * Get Pokemon moves
     */
    async getMoves(id) {
        return this.withRls(async () => {
            const pokemon = await this.prisma.pokemonInstance.findUnique({
                where: { id },
                select: { movesJson: true },
            });
            if (!pokemon) {
                throw new Error(`Pokemon ${id} not found`);
            }
            return fromJsonValue(pokemon.movesJson) ?? [];
        });
    }
    /**
     * Update Pokemon moves
     */
    async setMoves(id, moves) {
        return this.withRls(async () => {
            if (moves.length > 4) {
                throw new Error("Pokemon cannot have more than 4 moves");
            }
            return this.prisma.pokemonInstance.update({
                where: { id },
                data: { movesJson: toJsonValue(moves) },
                include: { species: true },
            });
        });
    }
    /**
     * Restore PP for all moves (after healing)
     */
    async restorePP(id) {
        return this.withRls(async () => {
            const pokemon = await this.prisma.pokemonInstance.findUnique({
                where: { id },
                select: { movesJson: true },
            });
            if (!pokemon) {
                throw new Error(`Pokemon ${id} not found`);
            }
            const moves = fromJsonValue(pokemon.movesJson) ?? [];
            const restoredMoves = moves.map((move) => ({
                ...move,
                pp: move.maxPP,
            }));
            return this.prisma.pokemonInstance.update({
                where: { id },
                data: { movesJson: toJsonValue(restoredMoves) },
                include: { species: true },
            });
        });
    }
    // ===========================================================================
    // Statistics & Queries
    // ===========================================================================
    /**
     * Get Pokemon statistics for a user
     */
    async getStats(ownerId) {
        return this.withRls(async () => {
            // Get all Pokemon
            const pokemon = await this.prisma.pokemonInstance.findMany({
                where: { ownerId },
                select: {
                    id: true,
                    level: true,
                    isShiny: true,
                    speciesId: true,
                },
            });
            // Get Pokemon in party
            const partyPokemonIds = await this.prisma.partySlot.findMany({
                where: {
                    party: { ownerId },
                },
                select: { pokemonId: true },
            });
            const partyIds = new Set(partyPokemonIds.map((p) => p.pokemonId));
            const uniqueSpecies = new Set(pokemon.map((p) => p.speciesId));
            const total = pokemon.length;
            const inParty = partyIds.size;
            const inBox = total - inParty;
            const shinyCount = pokemon.filter((p) => p.isShiny).length;
            const levels = pokemon.map((p) => p.level);
            const averageLevel = total > 0 ? levels.reduce((a, b) => a + b, 0) / total : 0;
            const highestLevel = total > 0 ? Math.max(...levels) : 0;
            return {
                total,
                inParty,
                inBox,
                shinyCount,
                averageLevel: Math.round(averageLevel * 10) / 10,
                highestLevel,
                uniqueSpecies: uniqueSpecies.size,
            };
        });
    }
    /**
     * Find Pokemon by species (across owner)
     */
    async findBySpecies(ownerId, speciesId) {
        return this.withRls(async () => {
            return this.prisma.pokemonInstance.findMany({
                where: { ownerId, speciesId },
                include: { species: true },
                orderBy: [{ level: "desc" }],
            });
        });
    }
    /**
     * Check if user owns a species
     */
    async ownsSpecies(ownerId, speciesId) {
        return this.withRls(async () => {
            const count = await this.prisma.pokemonInstance.count({
                where: { ownerId, speciesId },
            });
            return count > 0;
        });
    }
    /**
     * Get user's Pokedex (unique species owned)
     */
    async getPokedex(ownerId) {
        return this.withRls(async () => {
            const pokemon = await this.prisma.pokemonInstance.findMany({
                where: { ownerId },
                select: { speciesId: true },
                distinct: ["speciesId"],
                orderBy: { speciesId: "asc" },
            });
            return pokemon.map((p) => p.speciesId);
        });
    }
    /**
     * Count total Pokemon for owner
     */
    async count(ownerId) {
        return this.withRls(async () => {
            return this.prisma.pokemonInstance.count({ where: { ownerId } });
        });
    }
    /**
     * Get shiny Pokemon for owner
     */
    async getShiny(ownerId) {
        return this.withRls(async () => {
            return this.prisma.pokemonInstance.findMany({
                where: { ownerId, isShiny: true },
                include: { species: true },
                orderBy: [{ speciesId: "asc" }],
            });
        });
    }
    // ===========================================================================
    // Bulk Operations
    // ===========================================================================
    /**
     * Release multiple Pokemon (delete)
     */
    async releaseMany(ids) {
        return this.withRls(async () => {
            const result = await this.prisma.pokemonInstance.deleteMany({
                where: { id: { in: ids } },
            });
            return result.count;
        });
    }
    /**
     * Transfer Pokemon to another owner
     */
    async transfer(pokemonId, newOwnerId, newTrainerId) {
        return this.withRls(async () => {
            // First remove from any party slots
            await this.prisma.partySlot.deleteMany({
                where: { pokemonId },
            });
            // Then transfer ownership
            return this.prisma.pokemonInstance.update({
                where: { id: pokemonId },
                data: {
                    ownerId: newOwnerId,
                    trainerId: newTrainerId ?? null,
                    boxSlot: null, // Reset box slot
                },
                include: { species: true },
            });
        });
    }
    // ===========================================================================
    // Factory Methods
    // ===========================================================================
    /**
     * Create repository instance with RLS context
     */
    static withContext(prisma, rlsContext) {
        return new PokemonRepository(prisma, rlsContext);
    }
    /**
     * Create repository instance without RLS (for admin operations)
     */
    static withoutRls(prisma) {
        return new PokemonRepository(prisma);
    }
}
// =============================================================================
// Export Default Instance Factory
// =============================================================================
/**
 * Create a new PokemonRepository instance
 */
export function createPokemonRepository(prisma, rlsContext) {
    return new PokemonRepository(prisma, rlsContext);
}
