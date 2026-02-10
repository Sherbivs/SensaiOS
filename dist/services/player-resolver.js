/**
 * Player Resolver Service
 *
 * CONSOLIDATION LAYER: Unifies player identity from multiple sources:
 * - User table (game state: coins, pokemon, progress)
 * - Discord Identity (security DB: username, displayName, roles)
 * - Homestead Channel (guild presence)
 *
 * This is the SINGLE ENTRY POINT for resolving player context throughout
 * the application. All components should use this instead of direct lookups.
 *
 * @module player-resolver
 * @see discord-identity — Canonical Discord identity source
 * @see user-queries-pg — Game state queries
 * @see homestead-manager — Channel management
 */
// LOGGER FIRST — Must be early import to capture initialization errors
import { getLogger } from "../shared/logging/index.js";
const logger = getLogger();
import { prisma } from '../shared/prisma.js';
import { getErrorMessage } from '../shared/utils/error-utils.js';
import { resolveDiscordUser, hasDiscordIdentity } from './discord-identity.js';
// ============================================================================
// Player Resolver Service
// ============================================================================
/**
 * Singleton service for resolving complete player context.
 *
 * Usage:
 * ```typescript
 * const player = await PlayerResolver.resolve(
 *   interaction.user.id,
 *   { guildId: interaction.guildId! }
 * );
 *
 * console.log(player.username);  // From security DB
 * console.log(player.coins);     // From User table
 * console.log(player.isAdmin);   // From security DB
 * ```
 */
export class PlayerResolver {
    static instance = null;
    // Resolution cache (short TTL for per-interaction freshness)
    cache = new Map();
    CACHE_TTL_MS = 30_000; // 30 seconds
    MAX_CACHE_SIZE = 1000;
    constructor() { }
    static getInstance() {
        if (!PlayerResolver.instance) {
            PlayerResolver.instance = new PlayerResolver();
        }
        return PlayerResolver.instance;
    }
    static resetInstance() {
        PlayerResolver.instance = null;
    }
    // --------------------------------------------------------------------------
    // Primary Resolution Methods
    // --------------------------------------------------------------------------
    /**
     * Resolve a Discord user ID to complete player context
     *
     * This is the main entry point. Combines:
     * - Discord identity from security database
     * - Game state from User table
     * - Homestead channel info
     *
     * @param discordId - Discord user snowflake
     * @param options - Resolution options including required guildId
     * @returns Complete player context or null if user doesn't exist
     */
    async resolve(discordId, options) {
        const cacheKey = `${discordId}:${options.guildId}`;
        // Check cache
        const cached = this.cache.get(cacheKey);
        if (cached) {
            if (cached.expiresAt > Date.now()) {
                this.cache.delete(cacheKey);
                this.cache.set(cacheKey, cached);
                return cached.data;
            }
            this.cache.delete(cacheKey);
        }
        const startTime = Date.now();
        try {
            // Step 1: Get game user
            const gameUser = await prisma.user.findUnique({
                where: { discordId },
                include: {
                    homesteadChannels: {
                        where: { guildId: options.guildId },
                        take: 1,
                    }
                }
            });
            if (!gameUser) {
                if (options.createIfMissing) {
                    // Create new user (basic stub - will be enriched later)
                    return await this.createNewPlayer(discordId, options);
                }
                return null;
            }
            // Step 2: Get Discord identity (unless skipped)
            let identity = null;
            if (!options.skipIdentity) {
                identity = await resolveDiscordUser(discordId, options.guildId);
            }
            // Step 3: Build resolved player
            const homestead = gameUser.homesteadChannels[0] || null;
            const resolved = {
                // IDs
                id: gameUser.id,
                discordId: gameUser.discordId,
                guildId: options.guildId,
                // Discord Identity (fallback to Discord ID if not in security DB)
                username: identity?.username ?? discordId,
                displayName: identity?.displayName ?? null,
                avatar: identity?.avatar ?? null,
                roles: identity?.roles ?? [],
                isAdmin: identity?.isAdministrator ?? false,
                isOwner: identity?.isOwner ?? false,
                riskScore: identity?.riskScore ?? null,
                // Game State
                coins: gameUser.coins,
                createdAt: gameUser.createdAt,
                lastActiveAt: gameUser.updatedAt, // Use updatedAt as activity proxy
                // Homestead
                homesteadChannelId: homestead?.channelId ?? null,
                homesteadStatus: homestead?.status ?? null,
                // Metadata
                identityResolved: identity !== null,
                resolvedAt: new Date(),
            };
            // Cache result (LRU eviction)
            if (this.cache.size >= this.MAX_CACHE_SIZE) {
                const oldestKey = this.cache.keys().next().value;
                if (oldestKey) {
                    this.cache.delete(oldestKey);
                }
            }
            this.cache.set(cacheKey, {
                data: resolved,
                expiresAt: Date.now() + this.CACHE_TTL_MS,
            });
            logger.debug('player-resolver', 'resolve', 'Resolved player', {
                userId: discordId,
                durationMs: Date.now() - startTime,
                metadata: {
                    username: resolved.username,
                    identityResolved: resolved.identityResolved,
                },
            });
            return resolved;
        }
        catch (error) {
            logger.error('player-resolver', 'resolve', 'Resolution failed', {
                userId: discordId,
                guildId: options.guildId,
                metadata: { errorMsg: getErrorMessage(error) },
            });
            return null;
        }
    }
    /**
     * Resolve from a Discord.js User object
     * Convenience method for command handlers
     */
    async resolveFromDiscordUser(user, guildId, options) {
        return this.resolve(user.id, { guildId, ...options });
    }
    /**
     * Resolve from a Discord.js GuildMember object
     * Has direct access to guild context
     */
    async resolveFromMember(member, options) {
        return this.resolve(member.id, { guildId: member.guild.id, ...options });
    }
    /**
     * Get minimal player context (faster, less data)
     */
    async resolveContext(discordId, guildId) {
        const full = await this.resolve(discordId, {
            guildId,
            skipHomestead: true
        });
        if (!full)
            return null;
        return {
            id: full.id,
            discordId: full.discordId,
            guildId: full.guildId,
            username: full.username,
            displayName: full.displayName,
            coins: full.coins,
            isAdmin: full.isAdmin,
        };
    }
    // --------------------------------------------------------------------------
    // Batch Operations
    // --------------------------------------------------------------------------
    /**
     * Resolve multiple players at once
     * More efficient than individual calls for leaderboards, etc.
     * Uses parallel resolution with the existing resolve method.
     */
    async resolveBatch(discordIds, options) {
        const results = new Map();
        if (discordIds.length === 0) {
            return results;
        }
        // De-duplicate input
        const uniqueIds = [...new Set(discordIds)];
        // Parallel resolution using the existing resolve method (which handles caching)
        const resolutionPromises = uniqueIds.map(async (discordId) => {
            const player = await this.resolve(discordId, options);
            return { discordId, player };
        });
        const resolutions = await Promise.all(resolutionPromises);
        // Build result map
        for (const { discordId, player } of resolutions) {
            if (player) {
                results.set(discordId, player);
            }
        }
        return results;
    }
    // --------------------------------------------------------------------------
    // Utility Methods
    // --------------------------------------------------------------------------
    /**
     * Check if a player exists in the system
     */
    async exists(discordId) {
        const count = await prisma.user.count({
            where: { discordId }
        });
        return count > 0;
    }
    /**
     * Check if a player has Discord identity data
     */
    async hasIdentity(discordId, guildId) {
        return hasDiscordIdentity(discordId, guildId);
    }
    /**
     * Get formatted display name for a player
     * Returns: displayName (username) or just username
     */
    formatDisplayName(player) {
        if (player.displayName && player.displayName !== player.username) {
            return `${player.displayName} (${player.username})`;
        }
        return player.username;
    }
    /**
     * Get @ mention for a player
     */
    getMention(player) {
        return `<@${player.discordId}>`;
    }
    /**
     * Clear cache for a specific player
     */
    invalidateCache(discordId, guildId) {
        if (guildId) {
            this.cache.delete(`${discordId}:${guildId}`);
        }
        else {
            // Clear all entries for this user
            for (const key of this.cache.keys()) {
                if (key.startsWith(`${discordId}:`)) {
                    this.cache.delete(key);
                }
            }
        }
    }
    /**
     * Clear entire cache
     */
    clearCache() {
        this.cache.clear();
    }
    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            max: this.MAX_CACHE_SIZE,
            utilization: this.MAX_CACHE_SIZE > 0
                ? (this.cache.size / this.MAX_CACHE_SIZE) * 100
                : 0,
        };
    }
    // --------------------------------------------------------------------------
    // Private Helpers
    // --------------------------------------------------------------------------
    /**
     * Create a new player with minimal setup
     */
    async createNewPlayer(discordId, options) {
        // Get Discord identity first if available
        const identity = await resolveDiscordUser(discordId, options.guildId);
        // Create user with sensible defaults
        const newUser = await prisma.user.create({
            data: {
                discordId,
                coins: 500, // Starting coins
            }
        });
        logger.info('player-resolver', 'create', 'Created new player', {
            userId: discordId,
            metadata: {
                id: newUser.id,
                username: identity?.username ?? 'unknown',
            },
        });
        return {
            id: newUser.id,
            discordId,
            guildId: options.guildId,
            // From identity or fallback
            username: identity?.username ?? discordId,
            displayName: identity?.displayName ?? null,
            avatar: identity?.avatar ?? null,
            roles: identity?.roles ?? [],
            isAdmin: identity?.isAdministrator ?? false,
            isOwner: identity?.isOwner ?? false,
            riskScore: identity?.riskScore ?? null,
            // New user defaults
            coins: newUser.coins,
            createdAt: newUser.createdAt,
            lastActiveAt: null,
            // No homestead yet
            homesteadChannelId: null,
            homesteadStatus: null,
            identityResolved: identity !== null,
            resolvedAt: new Date(),
        };
    }
}
// ============================================================================
// Convenience Exports
// ============================================================================
/**
 * Get the PlayerResolver singleton
 */
export function getPlayerResolver() {
    return PlayerResolver.getInstance();
}
/**
 * Resolve a player by Discord ID
 *
 * @example
 * const player = await resolvePlayer(interaction.user.id, interaction.guildId!);
 * console.log(`Hello, ${player?.username}! You have ${player?.coins} coins.`);
 */
export async function resolvePlayer(discordId, guildId, options) {
    return PlayerResolver.getInstance().resolve(discordId, { guildId, ...options });
}
/**
 * Resolve player context (minimal data, faster)
 */
export async function resolvePlayerContext(discordId, guildId) {
    return PlayerResolver.getInstance().resolveContext(discordId, guildId);
}
/**
 * Check if a player exists in the system
 */
export async function playerExists(discordId) {
    return PlayerResolver.getInstance().exists(discordId);
}
