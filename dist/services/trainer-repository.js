/**
 * Trainer Repository - Domain-Specific Repository
 *
 * Provides type-safe database operations for Trainer entities
 * with RLS support and domain-specific query methods.
 *
 * Schema Notes (as of 2025-12):
 * - Trainer: id, tenantId, userId, nickname, createdAt (linked to User via userId)
 * - User: discordId, coins, settingsJson (owns Trainers, Pokemon, Parties)
 * - Party: id, ownerId (User), trainerId (optional), slots[] - unique per User
 * - PartySlot: slot (number 0-5), pokemonId
 * - PokemonInstance: level, exp, hp, maxHp, trainerId (optional)
 *
 * @module services/trainer-repository
 * @task P1-003 Base Repository Pattern
 * @created 2025-12-04
 */
import { setUserContext, clearUserContext } from "./rls-context.js";
// ============================================================================
// Repository Implementation
// ============================================================================
/**
 * Trainer repository with domain-specific operations
 *
 * This is a standalone repository (not extending BaseRepository) for clarity
 * and to avoid complex generic type issues. It provides all the same functionality
 * with explicit, readable implementations.
 *
 * Important: The actual Trainer model is lightweight - it only has:
 * - id, tenantId, userId, nickname, createdAt
 *
 * Trainer links to User, which has:
 * - discordId, coins, pokemon, parties, encounters, battles
 *
 * Party is owned by User (ownerId), with optional trainerId linkage.
 */
export class TrainerRepository {
    prisma;
    userContext;
    constructor(prisma, userContext) {
        this.prisma = prisma;
        this.userContext = userContext;
    }
    // -------------------------------------------------------------------------
    // Context Management
    // -------------------------------------------------------------------------
    /**
     * Execute operation with RLS context
     */
    async withContext(operation) {
        if (this.userContext) {
            await setUserContext(this.prisma, this.userContext);
        }
        try {
            return await operation();
        }
        finally {
            if (this.userContext) {
                await clearUserContext(this.prisma);
            }
        }
    }
    // -------------------------------------------------------------------------
    // Basic CRUD
    // -------------------------------------------------------------------------
    /**
     * Find trainer by ID
     */
    async findById(id) {
        return this.withContext(async () => {
            return await this.prisma.trainer.findUnique({
                where: { id },
            });
        });
    }
    /**
     * Find trainer by User ID and Tenant (composite unique key)
     */
    async findByUserId(userId, tenantId) {
        return this.withContext(async () => {
            return await this.prisma.trainer.findUnique({
                where: { tenantId_userId: { tenantId, userId } },
            });
        });
    }
    /**
     * Find trainer by Discord ID (looks up User first)
     */
    async findByDiscordId(discordId, tenantId) {
        return this.withContext(async () => {
            const user = await this.prisma.user.findUnique({
                where: { discordId },
            });
            if (!user)
                return null;
            const trainer = await this.prisma.trainer.findUnique({
                where: { tenantId_userId: { tenantId, userId: user.id } },
                include: {
                    user: true,
                    parties: {
                        include: {
                            slots: {
                                orderBy: { slot: "asc" },
                                include: {
                                    pokemon: true,
                                },
                            },
                        },
                    },
                    mons: true,
                },
            });
            return trainer;
        });
    }
    /**
     * Find all trainers for a User (across tenants)
     */
    async findAllByUserId(userId) {
        return this.withContext(async () => {
            return await this.prisma.trainer.findMany({
                where: { userId },
                orderBy: { createdAt: "desc" },
            });
        });
    }
    /**
     * Find trainer with all related data
     */
    async findWithRelations(trainerId) {
        return this.withContext(async () => {
            const trainer = await this.prisma.trainer.findUnique({
                where: { id: trainerId },
                include: {
                    user: true,
                    parties: {
                        include: {
                            slots: {
                                orderBy: { slot: "asc" },
                                include: {
                                    pokemon: true,
                                },
                            },
                        },
                    },
                    mons: {
                        orderBy: { createdAt: "desc" },
                    },
                },
            });
            return trainer;
        });
    }
    /**
     * Create a new trainer
     */
    async create(input) {
        return this.withContext(async () => {
            const trainer = await this.prisma.trainer.create({
                data: {
                    tenant: { connect: { id: input.tenantId } },
                    user: { connect: { id: input.userId } },
                    nickname: input.nickname ?? "Trainer",
                },
            });
            // Ensure user has a party (Party is per-User, not per-Trainer)
            const existingParty = await this.prisma.party.findUnique({
                where: { ownerId: input.userId },
            });
            if (!existingParty) {
                await this.prisma.party.create({
                    data: {
                        ownerId: input.userId,
                        trainerId: trainer.id,
                    },
                });
            }
            return trainer;
        });
    }
    /**
     * Update trainer profile
     */
    async update(trainerId, input) {
        return this.withContext(async () => {
            return await this.prisma.trainer.update({
                where: { id: trainerId },
                data: input,
            });
        });
    }
    /**
     * Delete trainer
     */
    async delete(trainerId) {
        await this.withContext(async () => {
            await this.prisma.trainer.delete({
                where: { id: trainerId },
            });
        });
    }
    // -------------------------------------------------------------------------
    // Party Management
    // -------------------------------------------------------------------------
    /**
     * Get trainer's party pokemon in slot order
     */
    async getActiveParty(trainerId) {
        return this.withContext(async () => {
            const trainer = await this.prisma.trainer.findUnique({
                where: { id: trainerId },
            });
            if (!trainer)
                return [];
            const party = await this.prisma.party.findUnique({
                where: { ownerId: trainer.userId },
                include: {
                    slots: {
                        orderBy: { slot: "asc" },
                        include: {
                            pokemon: true,
                        },
                    },
                },
            });
            if (!party)
                return [];
            return party.slots.map((s) => s.pokemon);
        });
    }
    /**
     * Set party slots (replaces all slots)
     */
    async setPartySlots(userId, assignments) {
        return this.withContext(async () => {
            // Validate slot numbers (0-5)
            const invalidSlots = assignments.filter((a) => a.slot < 0 || a.slot > 5);
            if (invalidSlots.length > 0) {
                throw new Error(`Invalid slot numbers: ${invalidSlots.map((s) => s.slot).join(", ")}`);
            }
            // Validate no duplicate slots
            const slots = assignments.map((a) => a.slot);
            if (new Set(slots).size !== slots.length) {
                throw new Error("Duplicate slot assignments");
            }
            // Get or create party (unique per user)
            let party = await this.prisma.party.findUnique({
                where: { ownerId: userId },
            });
            if (!party) {
                party = await this.prisma.party.create({
                    data: { ownerId: userId },
                });
            }
            const partyId = party.id;
            // Replace all slots atomically
            await this.prisma.$transaction([
                this.prisma.partySlot.deleteMany({
                    where: { partyId },
                }),
                this.prisma.partySlot.createMany({
                    data: assignments.map((a) => ({
                        partyId,
                        slot: a.slot,
                        pokemonId: a.pokemonId,
                    })),
                }),
            ]);
            // Return updated party
            const result = await this.prisma.party.findUniqueOrThrow({
                where: { id: partyId },
                include: {
                    slots: {
                        orderBy: { slot: "asc" },
                        include: { pokemon: true },
                    },
                },
            });
            return result;
        });
    }
    /**
     * Add pokemon to first available party slot
     */
    async addToParty(userId, pokemonId) {
        return this.withContext(async () => {
            const party = await this.prisma.party.findUnique({
                where: { ownerId: userId },
                include: { slots: true },
            });
            if (!party)
                return null;
            // Find first empty slot (0-5)
            const occupiedSlots = new Set(party.slots.map((s) => s.slot));
            let emptySlot = null;
            for (let i = 0; i <= 5; i++) {
                if (!occupiedSlots.has(i)) {
                    emptySlot = i;
                    break;
                }
            }
            if (emptySlot === null) {
                throw new Error("Party is full (6 pokemon max)");
            }
            return this.prisma.partySlot.create({
                data: {
                    partyId: party.id,
                    slot: emptySlot,
                    pokemonId,
                },
                include: { pokemon: true },
            });
        });
    }
    /**
     * Remove pokemon from party
     */
    async removeFromParty(userId, pokemonId) {
        await this.withContext(async () => {
            const slot = await this.prisma.partySlot.findFirst({
                where: {
                    pokemonId,
                    party: { ownerId: userId },
                },
            });
            if (slot) {
                await this.prisma.partySlot.delete({
                    where: { id: slot.id },
                });
            }
        });
    }
    /**
     * Swap two party slots
     */
    async swapPartySlots(userId, slotA, slotB) {
        await this.withContext(async () => {
            const party = await this.prisma.party.findUnique({
                where: { ownerId: userId },
                include: { slots: true },
            });
            if (!party)
                throw new Error("No party found for user");
            const slotAData = party.slots.find((s) => s.slot === slotA);
            const slotBData = party.slots.find((s) => s.slot === slotB);
            if (!slotAData && !slotBData) {
                throw new Error("Both slots are empty");
            }
            // Use raw queries for swap to avoid unique constraint issues
            if (slotAData && slotBData) {
                // Swap both using temp value
                await this.prisma.$executeRaw `
          UPDATE "PartySlot" 
          SET slot = CASE 
            WHEN id = ${slotAData.id} THEN 99
            WHEN id = ${slotBData.id} THEN ${slotA}
          END
          WHERE id IN (${slotAData.id}, ${slotBData.id})
        `;
                await this.prisma.$executeRaw `
          UPDATE "PartySlot" SET slot = ${slotB} WHERE id = ${slotAData.id}
        `;
            }
            else if (slotAData) {
                await this.prisma.partySlot.update({
                    where: { id: slotAData.id },
                    data: { slot: slotB },
                });
            }
            else if (slotBData) {
                await this.prisma.partySlot.update({
                    where: { id: slotBData.id },
                    data: { slot: slotA },
                });
            }
        });
    }
    // -------------------------------------------------------------------------
    // Statistics & Leaderboard
    // -------------------------------------------------------------------------
    /**
     * Get trainer statistics
     */
    async getStats(trainerId) {
        return this.withContext(async () => {
            const trainer = await this.prisma.trainer.findUnique({
                where: { id: trainerId },
            });
            if (!trainer) {
                throw new Error(`Trainer not found: ${trainerId}`);
            }
            const [pokemonCount, uniqueSpecies, battles] = await Promise.all([
                this.prisma.pokemonInstance.count({
                    where: { trainerId },
                }),
                this.prisma.pokemonInstance.groupBy({
                    by: ["speciesId"],
                    where: { trainerId },
                }),
                this.prisma.battle.findMany({
                    where: {
                        OR: [{ trainer1Id: trainerId }, { trainer2Id: trainerId }],
                    },
                    select: { resultJson: true },
                }),
            ]);
            // Parse resultJson to extract winnerId (Battle schema stores result in JSON, not as column)
            const battlesWon = battles.filter((b) => {
                const result = b.resultJson;
                return result?.winnerId === trainerId;
            }).length;
            const partyPokemon = await this.getActiveParty(trainerId);
            const partyStrength = partyPokemon.reduce((sum, p) => sum + p.level, 0);
            return {
                totalPokemon: pokemonCount,
                uniqueSpecies: uniqueSpecies.length,
                totalBattles: battles.length,
                battlesWon,
                partyStrength,
            };
        });
    }
    /**
     * Get leaderboard by total pokemon count and levels
     */
    async getLeaderboard(options = {}) {
        return this.withContext(async () => {
            const { tenantId, limit = 10, offset = 0 } = options;
            const where = tenantId ? { tenantId } : {};
            const [trainers, total] = await Promise.all([
                this.prisma.trainer.findMany({
                    where,
                    orderBy: { createdAt: "desc" },
                    skip: offset,
                    take: limit,
                    include: {
                        user: true,
                        _count: {
                            select: { mons: true },
                        },
                    },
                }),
                this.prisma.trainer.count({ where }),
            ]);
            const trainersWithLevels = await Promise.all(trainers.map(async (t) => {
                const totalLevels = await this.prisma.pokemonInstance.aggregate({
                    where: { trainerId: t.id },
                    _sum: { level: true },
                });
                return {
                    ...t,
                    totalLevels: totalLevels._sum.level ?? 0,
                };
            }));
            // Sort by total levels descending
            trainersWithLevels.sort((a, b) => b.totalLevels - a.totalLevels);
            const data = trainersWithLevels.map((t, idx) => ({
                rank: offset + idx + 1,
                trainerId: t.id,
                userId: t.userId,
                nickname: t.nickname ?? "Unknown",
                totalPokemon: t._count.mons,
                totalLevels: t.totalLevels,
            }));
            return {
                data,
                total,
                page: Math.floor(offset / limit) + 1,
                pageSize: limit,
                totalPages: Math.ceil(total / limit),
            };
        });
    }
    // -------------------------------------------------------------------------
    // User Operations (coins are on User, not Trainer)
    // -------------------------------------------------------------------------
    /**
     * Add coins to user
     */
    async addCoins(userId, amount) {
        return this.withContext(async () => {
            return await this.prisma.user.update({
                where: { id: userId },
                data: {
                    coins: { increment: amount },
                },
            });
        });
    }
    /**
     * Spend coins (with validation)
     */
    async spendCoins(userId, amount) {
        return this.withContext(async () => {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
            });
            if (!user) {
                return { success: false, error: "User not found" };
            }
            if (user.coins < amount) {
                return {
                    success: false,
                    error: `Insufficient coins: have ${user.coins}, need ${amount}`,
                };
            }
            const updated = await this.prisma.user.update({
                where: { id: userId },
                data: {
                    coins: { decrement: amount },
                },
            });
            return { success: true, user: updated };
        });
    }
    // -------------------------------------------------------------------------
    // Count & Existence
    // -------------------------------------------------------------------------
    /**
     * Count trainers matching criteria
     */
    async count(where) {
        return this.withContext(async () => {
            return await this.prisma.trainer.count({ where });
        });
    }
    /**
     * Check if trainer exists
     */
    async exists(id) {
        return this.withContext(async () => {
            const count = await this.prisma.trainer.count({
                where: { id },
            });
            return count > 0;
        });
    }
}
// ============================================================================
// Factory Function
// ============================================================================
/**
 * Create a trainer repository with optional user context
 */
export function createTrainerRepository(prisma, userContext) {
    return new TrainerRepository(prisma, userContext);
}
