/**
 * Homestead Channel Manager
 * 
 * Manages private guild channels for each user (homestead-{username}).
 * Replaces DM-based gameplay with guild channels for better moderation,
 * audit trail, and Discord UX consistency.
 * 
 * Architecture: docs/architecture-bible/14-private-channel-architecture.md
 * 
 * @module homestead-manager
 */

import { Client, Guild, TextChannel, ChannelType, PermissionFlagsBits, User } from 'discord.js';
import { prisma } from '../shared/prisma.js';
import { log } from '../utils/logger.js';

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

  constructor(client: Client, guildId: string) {
    this.client = client;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      throw new Error(`Guild ${guildId} not found in client cache`);
    }
    this.guild = guild;
  }

  /**
   * Get or create homestead channel for user
   * 
   * Flow:
   * 1. Look up or create internal User record from Discord ID
   * 2. Check database for existing homestead mapping
   * 3. If exists, verify channel still exists in Discord
   * 4. If not exists, create new channel with permissions
   * 5. Update lastAccessedAt timestamp
   * 6. Return channel reference
   * 
   * @param user Discord user object
   * @returns Channel and metadata
   */
  async getOrCreateChannel(user: User): Promise<ChannelCreationResult> {
    const discordId = user.id;
    const guildId = this.guild.id;

    // Step 0: Resolve internal User ID from Discord ID
    // The HomesteadChannel.userId foreign key references User.id, not Discord ID
    let dbUser = await prisma.user.findUnique({
      where: { discordId },
    });

    if (!dbUser) {
      // Auto-create user record for new players
      // This handles the onboarding case where user runs /home before any other command
      log.info('[HomesteadManager] Creating new User record for Discord user', {
        discordId,
        username: user.username,
      });
      
      dbUser = await prisma.user.create({
        data: {
          discordId,
          // Other fields will use schema defaults
        },
      });
    }

    const userId = dbUser.id; // Internal User ID (UUID/CUID), not Discord ID

    // Step 1: Check database for existing homestead
    let homesteadRecord = await prisma.homesteadChannel.findUnique({
      where: { userId },
    });

    let channel: TextChannel | null = null;
    let isNew = false;
    let wasRecovered = false;

    // Step 2: If record exists, verify Discord channel
    if (homesteadRecord) {
      channel = await this.verifyChannel(homesteadRecord.channelId);
      
      if (!channel) {
        // Channel deleted in Discord but still in DB - RECOVERY FLOW
        log.warn('[HomesteadManager] Channel deleted in Discord, initiating recovery', {
          userId,
          oldChannelId: homesteadRecord.channelId,
        });
        
        wasRecovered = true;
        channel = await this.createDiscordChannel(user);
        isNew = true;
        
        // Update database with new channel ID
        homesteadRecord = await prisma.homesteadChannel.update({
          where: { userId },
          data: {
            channelId: channel.id,
            lastAccessedAt: new Date(),
            status: 'active', // Reset status from 'deleted' if applicable
          },
        });
      } else {
        // Channel exists, just update access time
        homesteadRecord = await prisma.homesteadChannel.update({
          where: { userId },
          data: { lastAccessedAt: new Date() },
        });
      }
    } else {
      // Step 3: No record exists, create new channel + database entry
      channel = await this.createDiscordChannel(user);
      isNew = true;

      homesteadRecord = await prisma.homesteadChannel.create({
        data: {
          userId,
          guildId,
          channelId: channel.id,
        },
      });

      log.info('[HomesteadManager] Created new homestead', {
        userId,
        username: user.username,
        channelId: channel.id,
        channelName: channel.name,
      });
    }

    // Step 4: If channel was recovered from deletion, run diagnostics & send recovery message
    if (wasRecovered && channel) {
      // Fire and forget - don't block the main flow
      this.runRecoveryDiagnostics(user, channel).catch(error => {
        log.error('[HomesteadManager] Recovery diagnostics failed (non-fatal)', {
          userId,
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

    log.info('[HomesteadManager] Created Discord channel', {
      userId: user.id,
      channelId: channel.id,
      channelName: channel.name,
      categoryId: category.id,
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
