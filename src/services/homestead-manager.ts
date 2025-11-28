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
   * 1. Check database for existing mapping
   * 2. If exists, verify channel still exists in Discord
   * 3. If not exists, create new channel with permissions
   * 4. Update lastAccessedAt timestamp
   * 5. Return channel reference
   * 
   * @param user Discord user object
   * @returns Channel and metadata
   */
  async getOrCreateChannel(user: User): Promise<ChannelCreationResult> {
    const userId = user.id;
    const guildId = this.guild.id;

    // Step 1: Check database for existing homestead
    let homesteadRecord = await prisma.homesteadChannel.findUnique({
      where: { userId },
    });

    let channel: TextChannel | null = null;
    let isNew = false;

    // Step 2: If record exists, verify Discord channel
    if (homesteadRecord) {
      channel = await this.verifyChannel(homesteadRecord.channelId);
      
      if (!channel) {
        // Channel deleted in Discord but still in DB - recreate
        log.warn('[HomesteadManager] Channel deleted in Discord, recreating', {
          userId,
          oldChannelId: homesteadRecord.channelId,
        });
        
        channel = await this.createDiscordChannel(user);
        isNew = true;
        
        // Update database with new channel ID
        homesteadRecord = await prisma.homesteadChannel.update({
          where: { userId },
          data: {
            channelId: channel.id,
            lastAccessedAt: new Date(),
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

    return {
      channel,
      isNew,
      homesteadRecord,
    };
  }

  /**
   * Verify channel still exists in Discord
   * Returns null if deleted
   */
  private async verifyChannel(channelId: string): Promise<TextChannel | null> {
    try {
      const channel = await this.guild.channels.fetch(channelId);
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
        // Delete Discord channel
        const channel = await this.guild.channels.fetch(homestead.channelId).catch(() => null);
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
      // Delete Discord channel
      const channel = await this.guild.channels.fetch(homestead.channelId).catch(() => null);
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
