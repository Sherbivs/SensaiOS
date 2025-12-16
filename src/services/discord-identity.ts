/**
 * Discord Identity Service
 * 
 * Provides lookup and resolution of Discord identities (users, guilds) from
 * the security bot's data pool. This is the CANONICAL SOURCE for Discord
 * identity information across the application.
 * 
 * The security bot maintains discord_members and discord_guilds tables through
 * periodic sweeps. This service provides type-safe access to that data.
 * 
 * @module discord-identity
 * @see discord_members — Member profiles synced by security bot
 * @see discord_guilds — Guild metadata synced by security bot
 */

import { prisma } from "../shared/prisma.js";
import { getErrorMessage } from "../shared/utils/error-utils.js";
import { log } from "../utils/logger.js";

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Resolved Discord user identity from security database
 */
export interface DiscordUserIdentity {
  /** Internal database ID (CUID) */
  id: string;
  /** Discord user snowflake ID (17-19 digits) */
  discordUserId: string;
  /** Discord guild snowflake ID */
  guildId: string;
  /** Current Discord username */
  username: string;
  /** Guild-specific display name (nickname) */
  displayName: string | null;
  /** Avatar hash */
  avatar: string | null;
  /** Whether this is a bot account */
  isBot: boolean;
  /** Guild join timestamp */
  joinedAt: Date | null;
  /** Role IDs array */
  roles: string[];
  /** Has ADMINISTRATOR permission */
  isAdministrator: boolean;
  /** Is guild owner */
  isOwner: boolean;
  /** Security risk score (0.0-1.0) */
  riskScore: number | null;
  /** Last activity timestamp */
  lastActivityAt: Date | null;
  /** When record was last updated */
  lastUpdatedAt: Date;
}

/**
 * Resolved Discord guild identity from security database
 */
export interface DiscordGuildIdentity {
  /** Discord guild snowflake ID */
  id: string;
  /** Guild name */
  name: string;
  /** Guild owner's Discord user ID */
  ownerId: string;
  /** Guild icon hash */
  icon: string | null;
  /** Total member count */
  memberCount: number;
  /** Total role count */
  roleCount: number;
  /** Total channel count */
  channelCount: number;
  /** Whether security monitoring is enabled */
  monitoringEnabled: boolean;
  /** Last security sweep timestamp */
  lastSweepAt: Date | null;
  /** When record was last updated */
  lastUpdatedAt: Date;
}

/**
 * Options for user lookup
 */
export interface UserLookupOptions {
  /** Guild ID to scope the lookup */
  guildId?: string;
  /** Include members marked as bots */
  includeBots?: boolean;
}

/**
 * Batch lookup result
 */
export interface BatchLookupResult<T> {
  found: Map<string, T>;
  notFound: string[];
}

// ============================================================================
// Discord Identity Service Class
// ============================================================================

/**
 * Service for resolving Discord identities from the security database.
 * 
 * Usage:
 * ```typescript
 * const identity = DiscordIdentityService.getInstance();
 * 
 * // Look up a user by Discord ID
 * const user = await identity.getUserByDiscordId('563220840708177927', guildId);
 * console.log(user?.username); // 'driptvdd'
 * 
 * // Look up a guild
 * const guild = await identity.getGuild('1100976155579912222');
 * console.log(guild?.name); // 'Black Infinity Gauntlet'
 * 
 * // Batch lookup
 * const users = await identity.getUsersByDiscordIds(['123...', '456...'], guildId);
 * ```
 */
export class DiscordIdentityService {
  private static instance: DiscordIdentityService | null = null;
  
  // In-memory cache with TTL (5 minutes)
  private userCache: Map<string, { data: DiscordUserIdentity; expiresAt: number }> = new Map();
  private guildCache: Map<string, { data: DiscordGuildIdentity; expiresAt: number }> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  
  private constructor() {
    // Private constructor for singleton
  }
  
  /**
   * Get the singleton instance
   */
  static getInstance(): DiscordIdentityService {
    if (!DiscordIdentityService.instance) {
      DiscordIdentityService.instance = new DiscordIdentityService();
    }
    return DiscordIdentityService.instance;
  }
  
  /**
   * Reset the singleton (for testing)
   */
  static resetInstance(): void {
    DiscordIdentityService.instance = null;
  }
  
  // --------------------------------------------------------------------------
  // User Lookups
  // --------------------------------------------------------------------------
  
  /**
   * Get a user by their Discord snowflake ID
   * 
   * @param discordUserId - Discord user snowflake (e.g., '563220840708177927')
   * @param guildId - Guild to scope the lookup (required for multi-guild bots)
   * @returns User identity or null if not found
   */
  async getUserByDiscordId(
    discordUserId: string,
    guildId: string
  ): Promise<DiscordUserIdentity | null> {
    const cacheKey = `${discordUserId}:${guildId}`;
    
    // Check cache first
    const cached = this.userCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    
    try {
      const member = await prisma.discordMember.findUnique({
        where: {
          discordUserId_guildId: {
            discordUserId,
            guildId,
          }
        }
      });
      
      if (!member) {
        return null;
      }
      
      const identity = this.mapMemberToIdentity(member);
      
      // Cache the result
      this.userCache.set(cacheKey, {
        data: identity,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });
      
      return identity;
    } catch (error) {
      log.error('[DiscordIdentity] Failed to fetch user', {
        discordUserId,
        guildId,
        error: getErrorMessage(error),
      });
      return null;
    }
  }
  
  /**
   * Get a user by their username (case-insensitive)
   * 
   * @param username - Discord username to search
   * @param guildId - Guild to scope the lookup
   * @returns User identity or null if not found
   */
  async getUserByUsername(
    username: string,
    guildId: string
  ): Promise<DiscordUserIdentity | null> {
    try {
      const member = await prisma.discordMember.findFirst({
        where: {
          guildId,
          username: {
            equals: username,
            mode: 'insensitive',
          }
        }
      });
      
      if (!member) {
        return null;
      }
      
      const identity = this.mapMemberToIdentity(member);
      
      // Cache by Discord ID
      const cacheKey = `${member.discordUserId}:${guildId}`;
      this.userCache.set(cacheKey, {
        data: identity,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });
      
      return identity;
    } catch (error) {
      log.error('[DiscordIdentity] Failed to fetch user by username', {
        username,
        guildId,
        error: getErrorMessage(error),
      });
      return null;
    }
  }
  
  /**
   * Batch lookup multiple users by Discord IDs
   * 
   * @param discordUserIds - Array of Discord user snowflakes
   * @param guildId - Guild to scope the lookup
   * @returns Map of found users and array of not found IDs
   */
  async getUsersByDiscordIds(
    discordUserIds: string[],
    guildId: string
  ): Promise<BatchLookupResult<DiscordUserIdentity>> {
    const found = new Map<string, DiscordUserIdentity>();
    const notFound: string[] = [];
    const toFetch: string[] = [];
    
    // Check cache first
    for (const discordUserId of discordUserIds) {
      const cacheKey = `${discordUserId}:${guildId}`;
      const cached = this.userCache.get(cacheKey);
      
      if (cached && cached.expiresAt > Date.now()) {
        found.set(discordUserId, cached.data);
      } else {
        toFetch.push(discordUserId);
      }
    }
    
    // Fetch uncached from database
    if (toFetch.length > 0) {
      try {
        const members = await prisma.discordMember.findMany({
          where: {
            guildId,
            discordUserId: { in: toFetch }
          }
        });
        
        const foundIds = new Set<string>();
        
        for (const member of members) {
          const identity = this.mapMemberToIdentity(member);
          found.set(member.discordUserId, identity);
          foundIds.add(member.discordUserId);
          
          // Cache
          const cacheKey = `${member.discordUserId}:${guildId}`;
          this.userCache.set(cacheKey, {
            data: identity,
            expiresAt: Date.now() + this.CACHE_TTL_MS,
          });
        }
        
        // Track not found
        for (const id of toFetch) {
          if (!foundIds.has(id)) {
            notFound.push(id);
          }
        }
      } catch (error) {
        log.error('[DiscordIdentity] Batch user lookup failed', {
          guildId,
          count: toFetch.length,
          error: getErrorMessage(error),
        });
        // All unfetched IDs are considered not found
        notFound.push(...toFetch);
      }
    }
    
    return { found, notFound };
  }
  
  /**
   * Search users by partial username match
   * 
   * @param query - Partial username to search
   * @param guildId - Guild to scope the lookup
   * @param limit - Maximum results to return (default 10)
   * @returns Array of matching user identities
   */
  async searchUsers(
    query: string,
    guildId: string,
    limit: number = 10
  ): Promise<DiscordUserIdentity[]> {
    try {
      const members = await prisma.discordMember.findMany({
        where: {
          guildId,
          OR: [
            { username: { contains: query, mode: 'insensitive' } },
            { displayName: { contains: query, mode: 'insensitive' } },
          ]
        },
        take: limit,
        orderBy: { username: 'asc' }
      });
      
      return members.map(m => this.mapMemberToIdentity(m));
    } catch (error) {
      log.error('[DiscordIdentity] User search failed', {
        query,
        guildId,
        error: getErrorMessage(error),
      });
      return [];
    }
  }
  
  /**
   * Get all administrators in a guild
   */
  async getAdministrators(guildId: string): Promise<DiscordUserIdentity[]> {
    try {
      const members = await prisma.discordMember.findMany({
        where: {
          guildId,
          OR: [
            { isAdministrator: true },
            { isOwner: true },
          ]
        },
        orderBy: { highestRolePosition: 'desc' }
      });
      
      return members.map(m => this.mapMemberToIdentity(m));
    } catch (error) {
      log.error('[DiscordIdentity] Admin lookup failed', {
        guildId,
        error: getErrorMessage(error),
      });
      return [];
    }
  }
  
  /**
   * Get the guild owner
   */
  async getGuildOwner(guildId: string): Promise<DiscordUserIdentity | null> {
    try {
      const member = await prisma.discordMember.findFirst({
        where: {
          guildId,
          isOwner: true,
        }
      });
      
      return member ? this.mapMemberToIdentity(member) : null;
    } catch (error) {
      log.error('[DiscordIdentity] Owner lookup failed', {
        guildId,
        error: getErrorMessage(error),
      });
      return null;
    }
  }
  
  // --------------------------------------------------------------------------
  // Guild Lookups
  // --------------------------------------------------------------------------
  
  /**
   * Get a guild by its Discord snowflake ID
   * 
   * @param guildId - Discord guild snowflake (e.g., '1100976155579912222')
   * @returns Guild identity or null if not found
   */
  async getGuild(guildId: string): Promise<DiscordGuildIdentity | null> {
    // Check cache first
    const cached = this.guildCache.get(guildId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    
    try {
      const guild = await prisma.discordGuild.findUnique({
        where: { id: guildId }
      });
      
      if (!guild) {
        return null;
      }
      
      const identity = this.mapGuildToIdentity(guild);
      
      // Cache the result
      this.guildCache.set(guildId, {
        data: identity,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });
      
      return identity;
    } catch (error) {
      log.error('[DiscordIdentity] Failed to fetch guild', {
        guildId,
        error: getErrorMessage(error),
      });
      return null;
    }
  }
  
  /**
   * Get all monitored guilds
   */
  async getAllGuilds(): Promise<DiscordGuildIdentity[]> {
    try {
      const guilds = await prisma.discordGuild.findMany({
        orderBy: { name: 'asc' }
      });
      
      return guilds.map(g => this.mapGuildToIdentity(g));
    } catch (error) {
      log.error('[DiscordIdentity] Failed to fetch all guilds', {
        error: getErrorMessage(error),
      });
      return [];
    }
  }
  
  /**
   * Get guild member count
   */
  async getGuildMemberCount(guildId: string): Promise<number> {
    try {
      return await prisma.discordMember.count({
        where: { guildId }
      });
    } catch (error) {
      log.error('[DiscordIdentity] Failed to count guild members', {
        guildId,
        error: getErrorMessage(error),
      });
      return 0;
    }
  }
  
  // --------------------------------------------------------------------------
  // Utility Methods
  // --------------------------------------------------------------------------
  
  /**
   * Check if a Discord ID exists in the security database
   */
  async userExists(discordUserId: string, guildId: string): Promise<boolean> {
    try {
      const count = await prisma.discordMember.count({
        where: {
          discordUserId,
          guildId,
        }
      });
      return count > 0;
    } catch {
      return false;
    }
  }
  
  /**
   * Check if a guild exists in the security database
   */
  async guildExists(guildId: string): Promise<boolean> {
    try {
      const count = await prisma.discordGuild.count({
        where: { id: guildId }
      });
      return count > 0;
    } catch {
      return false;
    }
  }
  
  /**
   * Get formatted display string for a user
   * Returns: displayName (username) or just username
   */
  formatUserDisplay(identity: DiscordUserIdentity): string {
    if (identity.displayName && identity.displayName !== identity.username) {
      return `${identity.displayName} (${identity.username})`;
    }
    return identity.username;
  }
  
  /**
   * Clear all caches (call after security bot sweep)
   */
  clearCache(): void {
    this.userCache.clear();
    this.guildCache.clear();
    log.info('[DiscordIdentity] Cache cleared');
  }
  
  /**
   * Clear cache for a specific guild
   */
  clearGuildCache(guildId: string): void {
    // Clear guild
    this.guildCache.delete(guildId);
    
    // Clear all users in that guild
    for (const [key] of this.userCache) {
      if (key.endsWith(`:${guildId}`)) {
        this.userCache.delete(key);
      }
    }
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): { users: number; guilds: number } {
    return {
      users: this.userCache.size,
      guilds: this.guildCache.size,
    };
  }
  
  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------
  
  /**
   * Map Prisma DiscordMember to DiscordUserIdentity
   */
  private mapMemberToIdentity(member: {
    id: string;
    discordUserId: string;
    guildId: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
    bot: boolean;
    joinedAt: Date | null;
    roles: string[];
    isAdministrator: boolean;
    isOwner: boolean;
    riskScore: number | null;
    lastActivityAt: Date | null;
    lastUpdatedAt: Date;
  }): DiscordUserIdentity {
    return {
      id: member.id,
      discordUserId: member.discordUserId,
      guildId: member.guildId,
      username: member.username,
      displayName: member.displayName,
      avatar: member.avatar,
      isBot: member.bot,
      joinedAt: member.joinedAt,
      roles: member.roles,
      isAdministrator: member.isAdministrator,
      isOwner: member.isOwner,
      riskScore: member.riskScore,
      lastActivityAt: member.lastActivityAt,
      lastUpdatedAt: member.lastUpdatedAt,
    };
  }
  
  /**
   * Map Prisma DiscordGuild to DiscordGuildIdentity
   */
  private mapGuildToIdentity(guild: {
    id: string;
    name: string;
    ownerId: string;
    icon: string | null;
    memberCount: number;
    roleCount: number;
    channelCount: number;
    monitoringEnabled: boolean;
    lastSweepAt: Date | null;
    lastUpdatedAt: Date;
  }): DiscordGuildIdentity {
    return {
      id: guild.id,
      name: guild.name,
      ownerId: guild.ownerId,
      icon: guild.icon,
      memberCount: guild.memberCount,
      roleCount: guild.roleCount,
      channelCount: guild.channelCount,
      monitoringEnabled: guild.monitoringEnabled,
      lastSweepAt: guild.lastSweepAt,
      lastUpdatedAt: guild.lastUpdatedAt,
    };
  }
}

// ============================================================================
// Convenience Functions (Module-level exports)
// ============================================================================

/**
 * Get the Discord Identity Service singleton
 */
export function getDiscordIdentityService(): DiscordIdentityService {
  return DiscordIdentityService.getInstance();
}

/**
 * Resolve a Discord user ID to their identity
 * 
 * Convenience function for quick lookups.
 * 
 * @example
 * const user = await resolveDiscordUser('563220840708177927', guildId);
 * console.log(user?.username); // 'driptvdd'
 */
export async function resolveDiscordUser(
  discordUserId: string,
  guildId: string
): Promise<DiscordUserIdentity | null> {
  return DiscordIdentityService.getInstance().getUserByDiscordId(discordUserId, guildId);
}

/**
 * Resolve a guild ID to its identity
 */
export async function resolveGuild(
  guildId: string
): Promise<DiscordGuildIdentity | null> {
  return DiscordIdentityService.getInstance().getGuild(guildId);
}

/**
 * Check if we have identity data for a Discord user
 */
export async function hasDiscordIdentity(
  discordUserId: string,
  guildId: string
): Promise<boolean> {
  return DiscordIdentityService.getInstance().userExists(discordUserId, guildId);
}
