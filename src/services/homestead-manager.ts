/**
 * Homestead Channel Manager
 * 
 * Manages private guild channels for each user (homestead-{username}).
 * Replaces DM-based gameplay with guild channels for better moderation,
 * audit trail, and Discord UX consistency.
 * 
 * Architecture: docs/architecture-bible/14-private-channel-architecture.md
 * 
 * CRITICAL: This module bridges Discord IDs to internal User.id for homestead lookup.
 * The homestead_channels table uses internal User.id (e.g., "driptvdd-founder-001"),
 * NOT Discord snowflake IDs. All lookups must go through ensureUser() first.
 * 
 * @module homestead-manager
 */

import { Client, Guild, TextChannel, ChannelType, PermissionFlagsBits, User } from 'discord.js';
import { prisma } from '../shared/prisma.js';
import { log } from '../utils/logger.js';
import { resolveDiscordUser } from './discord-identity.js';
import { ensureUser } from '../shared/models/user-queries-pg.js';

// Lazy import to avoid circular dependency
let checkpointServiceModule: typeof import('./player-checkpoint.js') | null = null;

async function getCheckpointService() {
  if (!checkpointServiceModule) {
    checkpointServiceModule = await import('./player-checkpoint.js');
  }
  return checkpointServiceModule;
}

// ============================================================================
// Configuration
// ============================================================================

const HOMESTEAD_CATEGORY_NAME = process.env.HOMESTEAD_CATEGORY_NAME || 'Homesteads';
const HOMESTEAD_CHANNEL_PREFIX = 'homestead-';
const CHANNEL_CLEANUP_DAYS = parseInt(process.env.HOMESTEAD_CLEANUP_DAYS || '90', 10);

// ============================================================================
// Types
// ============================================================================

export interface HomesteadChannel {
  id: string;
  userId: string;
  guildId: string;
  channelId: string;
  createdAt: Date;
  lastAccessedAt: Date;
}

export interface ChannelCreationResult {
  channel: TextChannel;
  isNew: boolean;
  homesteadRecord: HomesteadChannel;
}

// ============================================================================
// Core Manager Class
// ============================================================================

export class HomesteadChannelManager {
  private client: Client;
  private guild: Guild;

  /**
   * Create HomesteadChannelManager
   * @param client Discord client
   * @param guildId Guild ID to manage
   * @param prefetchedGuild Optional pre-fetched guild (for bootstrap where cache may be empty)
   */
  constructor(client: Client, guildId: string, prefetchedGuild?: Guild) {
    this.client = client;
    
    // Use pre-fetched guild if provided (for startup bootstrap)
    // Otherwise fall back to cache (for runtime operations)
    const guild = prefetchedGuild ?? client.guilds.cache.get(guildId);
    if (!guild) {
      throw new Error(`Guild ${guildId} not found - use prefetchedGuild parameter during startup`);
    }
    this.guild = guild;
  }

  /**
   * Get or create homestead channel for user
   * 
   * Flow:
   * 1. Resolve Discord ID to internal User.id (creates User if needed)
   * 2. Check database for existing homestead mapping using internal User.id
   * 3. If exists, verify channel still exists in Discord
   * 4. If not exists, create new channel with permissions
   * 5. Update lastAccessedAt timestamp
   * 6. Return channel reference
   * 
   * CRITICAL: homestead_channels.userId references User.id (internal), NOT Discord ID.
   * Must call ensureUser() first to get or create the internal User record.
   * 
   * @param user Discord user object
   * @returns Channel and metadata
   */
  async getOrCreateChannel(user: User): Promise<ChannelCreationResult> {
    const discordId = user.id; // Discord snowflake ID
    const guildId = this.guild.id;

    // Step 1: Resolve Discord ID to internal User.id
    // This creates the User record if it doesn't exist
    const internalUser = await ensureUser(discordId);
    const internalUserId = internalUser.id; // e.g., "driptvdd-founder-001" or CUID

    log.info('[HomesteadManager] Resolved Discord user to internal ID', {
      discordId,
      internalUserId,
      username: user.username,
    });

    // Step 2: Check database for existing homestead using internal User.id
    let homesteadRecord = await prisma.homesteadChannel.findUnique({
      where: { userId: internalUserId },
    });

    let channel: TextChannel | null = null;
    let isNew = false;
    let wasRecovered = false;

    // Step 3: If record exists, verify Discord channel
    if (homesteadRecord) {
      channel = await this.verifyChannel(homesteadRecord.channelId);
      
      if (!channel) {
        // Channel deleted in Discord but still in DB - RECOVERY FLOW
        log.warn('[HomesteadManager] Channel deleted in Discord, initiating recovery', {
          discordId,
          internalUserId,
          oldChannelId: homesteadRecord.channelId,
        });
        
        wasRecovered = true;
        channel = await this.createDiscordChannel(user);
        isNew = true;
        
        // Update database with new channel ID
        homesteadRecord = await prisma.homesteadChannel.update({
          where: { userId: internalUserId },
          data: {
            channelId: channel.id,
            lastAccessedAt: new Date(),
            status: 'active', // Reset status from 'deleted' if applicable
          },
        });
      } else {
        // Channel exists, just update access time
        homesteadRecord = await prisma.homesteadChannel.update({
          where: { userId: internalUserId },
          data: { lastAccessedAt: new Date() },
        });
      }
    } else {
      // Step 4: No record exists, create new channel + database entry
      channel = await this.createDiscordChannel(user);
      isNew = true;

      homesteadRecord = await prisma.homesteadChannel.create({
        data: {
          userId: internalUserId, // CRITICAL: Use internal User.id, NOT Discord ID
          guildId,
          channelId: channel.id,
        },
      });

      // Enrich log with canonical identity from security DB
      const identityContext = await this.getIdentityContext(discordId);
      log.info('[HomesteadManager] Created new homestead', {
        discordId,
        internalUserId,
        username: user.username,
        channelId: channel.id,
        channelName: channel.name,
        ...identityContext,
      });
    }

    // Step 5: If channel was recovered from deletion, run diagnostics & send recovery message
    if (wasRecovered && channel) {
      // Fire and forget - don't block the main flow
      this.runRecoveryDiagnostics(user, channel).catch(error => {
        log.error('[HomesteadManager] Recovery diagnostics failed (non-fatal)', {
          discordId,
          internalUserId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    return {
      channel,
      isNew,
      homesteadRecord,
    };
  }

  /**
   * Run recovery diagnostics and send status message to user
   * Called when a deleted homestead is recreated
   */
  private async runRecoveryDiagnostics(user: User, channel: TextChannel): Promise<void> {
    try {
      const { PlayerCheckpointService } = await getCheckpointService();
      const checkpointService = new PlayerCheckpointService(this.client, this.guild.id);
      
      // Look up the user's internal ID from Discord ID
      const dbUser = await prisma.user.findUnique({
        where: { discordId: user.id }
      });
      
      if (!dbUser) {
        // New user, no recovery needed
        return;
      }
      
      // Run full recovery flow
      const { report, recoveryMessage } = await checkpointService.handleHomesteadDeletion(
        dbUser.id, 
        user
      );
      
      // Send recovery status to the new channel
      await channel.send({ embeds: [recoveryMessage] });
      
      log.info('[HomesteadManager] Recovery diagnostics complete', {
        userId: dbUser.id,
        discordId: user.id,
        status: report.overallStatus,
        healingSuccessful: report.healingSuccessful,
      });
    } catch (error) {
      log.error('[HomesteadManager] Recovery diagnostics error', {
        discordId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Verify channel still exists in Discord
   * Returns null if deleted
   */
  private async verifyChannel(channelId: string): Promise<TextChannel | null> {
    try {
      // Force fresh channel data to ensure accurate state verification
      const channel = await this.guild.channels.fetch(channelId, { force: true });
      if (channel && channel.isTextBased() && channel.type === ChannelType.GuildText) {
        return channel as TextChannel;
      }
      return null;
    } catch (error) {
      // Channel not found or permission error
      log.warn('[HomesteadManager] Channel verification failed', {
        channelId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Create Discord channel with proper permissions
   */
  private async createDiscordChannel(user: User): Promise<TextChannel> {
    // Step 1: Get or create Homesteads category
    const category = await this.getOrCreateCategory();

    // Step 2: Sanitize username for channel name
    const channelName = this.sanitizeChannelName(user.username);

    // Step 3: Create channel with permissions
    const channel = await this.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id: this.guild.id, // @everyone role
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: user.id, // User-specific allow
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
        {
          id: this.client.user!.id, // Bot-specific allow
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
      ],
    });

    // Enrich log with canonical identity from security DB
    const identityContext = await this.getIdentityContext(user.id);
    log.info('[HomesteadManager] Created Discord channel', {
      userId: user.id,
      channelId: channel.id,
      channelName: channel.name,
      categoryId: category.id,
      ...identityContext,
    });

    return channel;
  }

  /**
   * Get or create Homesteads category
   */
  private async getOrCreateCategory() {
    // Try to find existing category
    const existing = this.guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === HOMESTEAD_CATEGORY_NAME
    );

    if (existing) {
      return existing;
    }

    // Create new category
    const category = await this.guild.channels.create({
      name: HOMESTEAD_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: this.guild.id, // @everyone role
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: this.client.user!.id, // Bot can see all homesteads
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels],
        },
      ],
    });

    log.info('[HomesteadManager] Created Homesteads category', {
      categoryId: category.id,
      guildId: this.guild.id,
    });

    return category;
  }

  /**
   * Enrich log context with canonical identity from security DB
   * Used to add displayName, roles, riskScore to log entries
   * 
   * @param discordId Discord user ID
   * @returns Identity context for logging (empty object if not found)
   */
  private async getIdentityContext(discordId: string): Promise<Record<string, unknown>> {
    try {
      const identity = await resolveDiscordUser(discordId, this.guild.id);
      if (identity) {
        return {
          canonicalUsername: identity.username,
          displayName: identity.displayName,
          roles: identity.roles.slice(0, 3), // Top 3 roles for brevity
          riskScore: identity.riskScore,
        };
      }
    } catch {
      // Identity lookup failed, not critical
    }
    return {};
  }

  /**
   * Sanitize username for Discord channel name
   * Rules: lowercase, alphanumeric + hyphens only, max 100 chars
   */
  private sanitizeChannelName(username: string): string {
    const sanitized = username
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-') // Replace invalid chars with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, ''); // Trim leading/trailing hyphens

    const channelName = `${HOMESTEAD_CHANNEL_PREFIX}${sanitized}`;

    // Discord max channel name length is 100
    return channelName.substring(0, 100);
  }

  /**
   * Clean up inactive channels (ran by scheduled job)
   * 
   * @param daysInactive Number of days since last access
   * @returns Number of channels cleaned up
   */
  async cleanupInactiveChannels(daysInactive: number = CHANNEL_CLEANUP_DAYS): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

    // Find inactive homesteads
    const inactiveHomesteads = await prisma.homesteadChannel.findMany({
      where: {
        guildId: this.guild.id,
        lastAccessedAt: {
          lt: cutoffDate,
        },
      },
    });

    let cleanedCount = 0;

    for (const homestead of inactiveHomesteads) {
      try {
        // Delete Discord channel (force fresh data to ensure it exists before deletion)
        const channel = await this.guild.channels.fetch(homestead.channelId, { force: true }).catch(() => null);
        if (channel) {
          await channel.delete(`Inactive for ${daysInactive} days`);
        }

        // Delete database record
        await prisma.homesteadChannel.delete({
          where: { id: homestead.id },
        });

        cleanedCount++;

        log.info('[HomesteadManager] Cleaned up inactive channel', {
          userId: homestead.userId,
          channelId: homestead.channelId,
          lastAccessed: homestead.lastAccessedAt,
        });
      } catch (error) {
        log.error('[HomesteadManager] Failed to clean up channel', {
          homesteadId: homestead.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    log.info('[HomesteadManager] Cleanup complete', {
      guildId: this.guild.id,
      inactiveDays: daysInactive,
      cleanedCount,
      totalInactive: inactiveHomesteads.length,
    });

    return cleanedCount;
  }

  /**
   * Get homestead channel for user (without creating)
   * Returns null if doesn't exist
   */
  async getChannel(userId: string): Promise<TextChannel | null> {
    const homestead = await prisma.homesteadChannel.findUnique({
      where: { userId },
    });

    if (!homestead) {
      return null;
    }

    return this.verifyChannel(homestead.channelId);
  }

  /**
   * Delete homestead channel and database record
   */
  async deleteChannel(userId: string): Promise<boolean> {
    const homestead = await prisma.homesteadChannel.findUnique({
      where: { userId },
    });

    if (!homestead) {
      return false;
    }

    try {
      // Delete Discord channel (force fresh data to ensure it exists before deletion)
      const channel = await this.guild.channels.fetch(homestead.channelId, { force: true }).catch(() => null);
      if (channel) {
        await channel.delete('Homestead deleted by user or admin');
      }

      // Delete database record
      await prisma.homesteadChannel.delete({
        where: { id: homestead.id },
      });

      log.info('[HomesteadManager] Deleted homestead', {
        userId,
        channelId: homestead.channelId,
      });

      return true;
    } catch (error) {
      log.error('[HomesteadManager] Failed to delete homestead', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get statistics about homestead channels
   */
  async getStats() {
    const total = await prisma.homesteadChannel.count({
      where: { guildId: this.guild.id },
    });

    const recentlyActive = await prisma.homesteadChannel.count({
      where: {
        guildId: this.guild.id,
        lastAccessedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
      },
    });

    return {
      total,
      recentlyActive,
      guildId: this.guild.id,
    };
  }
}

// ============================================================================
// Singleton Instance Management
// ============================================================================

const managerInstances = new Map<string, HomesteadChannelManager>();

/**
 * Get HomesteadChannelManager for guild
 * Caches instances per guild
 */
export function getHomesteadManager(client: Client, guildId: string): HomesteadChannelManager {
  let manager = managerInstances.get(guildId);
  
  if (!manager) {
    manager = new HomesteadChannelManager(client, guildId);
    managerInstances.set(guildId, manager);
  }
  
  return manager;
}

/**
 * Clear cached manager (for testing)
 */
export function clearManagerCache(): void {
  managerInstances.clear();
}

// ============================================================================
// Startup Bootstrap — Recover Deleted/Pending Homesteads
// ============================================================================

export interface BootstrapResult {
  guildId: string;
  total: number;
  recovered: number;
  failed: number;
  skipped: number;
  errors: Array<{ userId: string; error: string }>;
}

/**
 * Bootstrap deleted/pending homesteads on startup
 * 
 * Called from ClientReady event to ensure all players have working homestead channels.
 * Without this, players whose channels were deleted would be locked out until they
 * run a command that triggers getOrCreateChannel().
 * 
 * This proactive recovery ensures:
 * 1. Players can always receive messages in their homestead
 * 2. The bot can send notifications, battle results, etc.
 * 3. No player is ever permanently locked out
 * 
 * @param client Discord client
 * @param guildId Guild to bootstrap
 */
export async function bootstrapDeletedHomesteads(
  client: Client,
  guildId: string
): Promise<BootstrapResult> {
  const result: BootstrapResult = {
    guildId,
    total: 0,
    recovered: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  try {
    // Find all homesteads that need recovery
    const deletedHomesteads = await prisma.homesteadChannel.findMany({
      where: {
        guildId,
        OR: [
          { status: 'deleted' },
          { status: 'pending-creation' },
          { channelId: 'pending-creation' },
        ],
      },
      include: {
        user: true, // Get the User record for Discord ID lookup
      },
    });

    result.total = deletedHomesteads.length;

    if (deletedHomesteads.length === 0) {
      log.info('[HomesteadManager] No deleted homesteads to bootstrap', { guildId });
      return result;
    }

    log.info('[HomesteadManager] Bootstrapping deleted homesteads', {
      guildId,
      count: deletedHomesteads.length,
    });

    // CRITICAL: Use fetch() not cache.get() - cache may be empty on startup
    log.info('[HomesteadManager] Attempting to fetch guild for bootstrap', { guildId });
    const guild = await client.guilds.fetch(guildId).catch((err) => {
      log.error('[HomesteadManager] Failed to fetch guild', { 
        guildId, 
        error: err instanceof Error ? err.message : String(err),
        errorStack: err instanceof Error ? err.stack : undefined,
      });
      return null;
    });

    if (!guild) {
      log.error('[HomesteadManager] Guild not found for bootstrap', { guildId });
      result.failed = result.total;
      return result;
    }

    log.info('[HomesteadManager] Successfully fetched guild', { guildId, guildName: guild.name });

    // Create manager with fetched guild
    const manager = new HomesteadChannelManager(client, guildId, guild);

    for (const homestead of deletedHomesteads) {
      try {
        // Get Discord user from the User record's discordId
        const discordId = homestead.user.discordId;
        
        if (!discordId) {
          log.warn('[HomesteadManager] User has no Discord ID, skipping', {
            userId: homestead.userId,
          });
          result.skipped++;
          continue;
        }

        // Fetch Discord user
        log.info('[HomesteadManager] Fetching Discord user for bootstrap', { discordId, userId: homestead.userId });
        const discordUser = await client.users.fetch(discordId).catch((err) => {
          log.error('[HomesteadManager] Failed to fetch Discord user', {
            discordId,
            userId: homestead.userId,
            error: err instanceof Error ? err.message : String(err),
          });
          return null;
        });
        
        if (!discordUser) {
          log.warn('[HomesteadManager] Discord user not found, skipping', {
            userId: homestead.userId,
            discordId,
          });
          result.skipped++;
          continue;
        }

        // Create the channel
        const channelResult = await manager.getOrCreateChannel(discordUser);
        
        log.info('[HomesteadManager] Recovered homestead on startup', {
          userId: homestead.userId,
          discordId,
          channelId: channelResult.channel.id,
          wasNew: channelResult.isNew,
        });
        
        result.recovered++;

        // Send welcome back message
        try {
          await channelResult.channel.send({
            content: `🏠 **Welcome back!** Your homestead channel has been restored.\n\n` +
                     `Your Pokémon and progress are safe. Use the buttons below to continue your adventure!`,
          });
        } catch (msgError) {
          // Non-fatal - channel was created, message just failed
          log.warn('[HomesteadManager] Failed to send welcome message', {
            channelId: channelResult.channel.id,
            error: msgError instanceof Error ? msgError.message : String(msgError),
          });
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log.error('[HomesteadManager] Failed to bootstrap homestead', {
          userId: homestead.userId,
          error: errorMsg,
        });
        result.failed++;
        result.errors.push({ userId: homestead.userId, error: errorMsg });
      }
    }

    log.info('[HomesteadManager] Bootstrap complete', {
      guildId,
      total: result.total,
      recovered: result.recovered,
      failed: result.failed,
      skipped: result.skipped,
    });

    return result;

  } catch (error) {
    log.error('[HomesteadManager] Bootstrap failed', {
      guildId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Bootstrap all guilds the bot is in
 * Call this from ClientReady event
 */
export async function bootstrapAllHomesteads(client: Client): Promise<BootstrapResult[]> {
  const results: BootstrapResult[] = [];

  log.info('[HomesteadManager] bootstrapAllHomesteads starting...');

  // Get all guilds with homesteads
  const guilds = await prisma.homesteadChannel.findMany({
    select: { guildId: true },
    distinct: ['guildId'],
  });

  log.info('[HomesteadManager] Starting bootstrap for all guilds', {
    guildCount: guilds.length,
    guildIds: guilds.map(g => g.guildId),
  });

  for (const { guildId } of guilds) {
    log.info('[HomesteadManager] Processing guild for bootstrap', { guildId });
    try {
      const result = await bootstrapDeletedHomesteads(client, guildId);
      log.info('[HomesteadManager] Guild bootstrap result', { 
        guildId, 
        total: result.total, 
        recovered: result.recovered, 
        failed: result.failed,
        skipped: result.skipped,
        errorCount: result.errors.length,
      });
      results.push(result);
    } catch (error) {
      log.error('[HomesteadManager] Guild bootstrap failed', {
        guildId,
        error: error instanceof Error ? error.message : String(error),
      });
      results.push({
        guildId,
        total: 0,
        recovered: 0,
        failed: 1,
        skipped: 0,
        errors: [{ userId: 'GUILD_ERROR', error: String(error) }],
      });
    }
  }

  const totalRecovered = results.reduce((sum, r) => sum + r.recovered, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);

  log.info('[HomesteadManager] All guilds bootstrapped', {
    guilds: results.length,
    totalRecovered,
    totalFailed,
  });

  return results;
}
