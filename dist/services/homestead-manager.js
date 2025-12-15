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
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { prisma } from '../shared/prisma.js';
import { log } from '../utils/logger.js';
// ============================================================================
// Configuration
// ============================================================================
const HOMESTEAD_CATEGORY_NAME = process.env.HOMESTEAD_CATEGORY_NAME || 'Homesteads';
const HOMESTEAD_CHANNEL_PREFIX = 'homestead-';
const CHANNEL_CLEANUP_DAYS = parseInt(process.env.HOMESTEAD_CLEANUP_DAYS || '90', 10);
// ============================================================================
// Core Manager Class
// ============================================================================
export class HomesteadChannelManager {
    client;
    guild;
    constructor(client, guildId) {
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
    async getOrCreateChannel(user) {
        const userId = user.id;
        const guildId = this.guild.id;
        // Step 1: Check database for existing homestead in THIS guild (multi-guild support)
        let homesteadRecord = await prisma.homesteadChannel.findFirst({
            where: { userId, guildId }, // Scoped to this guild for multi-guild support
        });
        let channel = null;
        let isNew = false;
        // Step 2: If record exists, verify Discord channel
        if (homesteadRecord) {
            channel = await this.verifyChannel(homesteadRecord.channelId);
            if (!channel) {
                // Channel deleted in Discord but still in DB - recreate
                log.warn('[HomesteadManager] Channel deleted in Discord, recreating', {
                    userId,
                    guildId,
                    oldChannelId: homesteadRecord.channelId,
                });
                channel = await this.createDiscordChannel(user);
                isNew = true;
                // Update database with new channel ID (use record ID for update)
                homesteadRecord = await prisma.homesteadChannel.update({
                    where: { id: homesteadRecord.id },
                    data: {
                        channelId: channel.id,
                        lastAccessedAt: new Date(),
                        // status: 'active',  // TODO: Enable after Prisma migration
                    },
                });
            }
            else {
                // Channel exists, just update access time
                homesteadRecord = await prisma.homesteadChannel.update({
                    where: { id: homesteadRecord.id },
                    data: { lastAccessedAt: new Date() },
                });
            }
        }
        else {
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
    async verifyChannel(channelId) {
        try {
            const channel = await this.guild.channels.fetch(channelId);
            if (channel && channel.isTextBased() && channel.type === ChannelType.GuildText) {
                return channel;
            }
            return null;
        }
        catch (error) {
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
    async createDiscordChannel(user) {
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
                    id: this.client.user.id, // Bot-specific allow
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
    async getOrCreateCategory() {
        // Try to find existing category
        const existing = this.guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === HOMESTEAD_CATEGORY_NAME);
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
                    id: this.client.user.id, // Bot can see all homesteads
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
    sanitizeChannelName(username) {
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
    async cleanupInactiveChannels(daysInactive = CHANNEL_CLEANUP_DAYS) {
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
            }
            catch (error) {
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
     * Get homestead channel for user in THIS guild (without creating)
     * Returns null if doesn't exist
     */
    async getChannel(userId) {
        const guildId = this.guild.id;
        const homestead = await prisma.homesteadChannel.findFirst({
            where: { userId, guildId }, // Scoped to this guild
        });
        if (!homestead) {
            return null;
        }
        return this.verifyChannel(homestead.channelId);
    }
    /**
     * Delete homestead channel and database record for THIS guild
     */
    async deleteChannel(userId) {
        const guildId = this.guild.id;
        const homestead = await prisma.homesteadChannel.findFirst({
            where: { userId, guildId }, // Scoped to this guild
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
                guildId,
                channelId: homestead.channelId,
            });
            return true;
        }
        catch (error) {
            log.error('[HomesteadManager] Failed to delete homestead', {
                userId,
                guildId,
                error: error instanceof Error ? error.message : String(error),
            });
            return false;
        }
    }
    /**
     * Get statistics about homestead channels in THIS guild
     */
    async getStats() {
        const guildId = this.guild.id;
        // Total channels in this guild
        const total = await prisma.homesteadChannel.count({
            where: { guildId },
        });
        // Active in last 7 days
        const recentlyActive = await prisma.homesteadChannel.count({
            where: {
                guildId,
                lastAccessedAt: {
                    gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                },
            },
        });
        // Active in last 24 hours
        const activeToday = await prisma.homesteadChannel.count({
            where: {
                guildId,
                lastAccessedAt: {
                    gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                },
            },
        });
        // Inactive (no access in 30+ days)
        const inactive = await prisma.homesteadChannel.count({
            where: {
                guildId,
                lastAccessedAt: {
                    lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                },
            },
        });
        // Channels needing cleanup (90+ days inactive)
        const needingCleanup = await prisma.homesteadChannel.count({
            where: {
                guildId,
                lastAccessedAt: {
                    lt: new Date(Date.now() - CHANNEL_CLEANUP_DAYS * 24 * 60 * 60 * 1000),
                },
            },
        });
        return {
            guildId,
            guildName: this.guild.name,
            total,
            activeToday,
            recentlyActive,
            inactive,
            needingCleanup,
            cleanupDays: CHANNEL_CLEANUP_DAYS,
            timestamp: new Date().toISOString(),
        };
    }
    // ============================================================================
    // Bulk Operations
    // ============================================================================
    /**
     * List all homesteads in this guild
     * @param options Filter options
     */
    async listHomesteads(options = {}) {
        const { status, activeWithinDays, limit = 100, offset = 0 } = options;
        const guildId = this.guild.id;
        const where = { guildId };
        if (status) {
            where.status = status;
        }
        if (activeWithinDays !== undefined) {
            where.lastAccessedAt = {
                gte: new Date(Date.now() - activeWithinDays * 24 * 60 * 60 * 1000),
            };
        }
        const homesteads = await prisma.homesteadChannel.findMany({
            where,
            include: { user: { select: { id: true, discordId: true } } },
            orderBy: { lastAccessedAt: 'desc' },
            take: limit,
            skip: offset,
        });
        return homesteads;
    }
    /**
     * Bulk suspend homesteads (mark as suspended without deleting)
     * @param userIds List of user IDs to suspend
     * @param reason Suspension reason
     */
    async bulkSuspend(userIds, reason) {
        const guildId = this.guild.id;
        const errors = [];
        let suspended = 0;
        for (const userId of userIds) {
            try {
                const homestead = await prisma.homesteadChannel.findFirst({
                    where: { userId, guildId },
                });
                if (homestead) {
                    // Update status to suspended
                    await prisma.homesteadChannel.update({
                        where: { id: homestead.id },
                        data: {
                        // status: 'suspended',  // TODO: Enable after Prisma migration
                        },
                    });
                    // Remove user's channel permissions (they can see but not send)
                    const channel = await this.guild.channels.fetch(homestead.channelId).catch(() => null);
                    if (channel && channel.type === ChannelType.GuildText) {
                        await channel.permissionOverwrites.edit(userId, {
                            SendMessages: false,
                        });
                    }
                    suspended++;
                    log.info('[HomesteadManager] Suspended homestead', { userId, guildId, reason });
                }
            }
            catch (error) {
                errors.push(`Failed to suspend ${userId}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return { suspended, errors };
    }
    /**
     * Bulk delete homesteads
     * @param userIds List of user IDs to delete
     */
    async bulkDelete(userIds) {
        const errors = [];
        let deleted = 0;
        for (const userId of userIds) {
            try {
                const success = await this.deleteChannel(userId);
                if (success) {
                    deleted++;
                }
            }
            catch (error) {
                errors.push(`Failed to delete ${userId}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return { deleted, errors };
    }
    /**
     * Health check: Verify all homesteads have valid Discord channels
     * @returns Report of orphaned records
     */
    async healthCheck() {
        const guildId = this.guild.id;
        const homesteads = await prisma.homesteadChannel.findMany({
            where: { guildId },
        });
        const orphaned = [];
        let healthy = 0;
        let repaired = 0;
        for (const homestead of homesteads) {
            const channel = await this.verifyChannel(homestead.channelId);
            if (channel) {
                healthy++;
                // Update health check timestamp (TODO: enable after migration)
                // await prisma.homesteadChannel.update({
                //   where: { id: homestead.id },
                //   data: { lastHealthCheck: new Date() },
                // });
            }
            else {
                // Channel is orphaned (deleted in Discord)
                orphaned.push(homestead.userId);
                // Auto-repair: Delete orphaned record
                await prisma.homesteadChannel.delete({
                    where: { id: homestead.id },
                });
                repaired++;
                log.warn('[HomesteadManager] Removed orphaned homestead record', {
                    userId: homestead.userId,
                    guildId,
                    channelId: homestead.channelId,
                });
            }
        }
        return { healthy, orphaned, repaired };
    }
}
// ============================================================================
// Singleton Instance Management
// ============================================================================
const managerInstances = new Map();
/**
 * Get HomesteadChannelManager for guild
 * Caches instances per guild
 */
export function getHomesteadManager(client, guildId) {
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
export function clearManagerCache() {
    managerInstances.clear();
}
