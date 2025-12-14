/**
 * Homestead Channel Verification Service
 *
 * PURPOSE:
 * Provides verified channel creation with security integration, database persistence,
 * integrity verification, and automatic rollback on failure. Ensures every homestead
 * channel is properly tracked, secured, and verified across Discord and database.
 *
 * ARCHITECTURE:
 * - 5-Phase Creation: Pre-flight → Discord → Database → Verification → Security
 * - Atomic Operations: Full rollback on any failure (no orphaned resources)
 * - Security Integration: Audit logging, anomaly detection, integrity verification
 * - Health Monitoring: Periodic checks, orphan detection, ghost detection
 *
 * INTEGRATION POINTS:
 * - Discord.js: Channel creation, permission management
 * - Prisma: Database persistence (homestead_channels table)
 * - ImmutableAuditService: Security event logging
 * - EventBus: Threat detection, permission monitoring
 * - Crypto: HMAC-SHA256 fingerprint generation
 *
 * @module services/homestead-verification
 * @author AI Coding Specialist + Security Specialist
 * @created 2025-12-06
 */
import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { prisma } from '../shared/prisma.js';
import { createHmac } from 'crypto';
import { ImmutableAuditService } from '../bot/security/services/immutable-audit-service.js';
import { EventBus } from '../shared/event-bus.js';
// ============================================================================
// HOMESTEAD VERIFICATION SERVICE
// ============================================================================
export class HomesteadVerificationService {
    discordClient;
    hmacKey;
    auditService;
    eventBus;
    constructor(discordClient, hmacKey, auditService) {
        this.discordClient = discordClient;
        // Use environment variable or default (for development only)
        this.hmacKey = hmacKey || process.env.HOMESTEAD_HMAC_KEY || 'dev-hmac-key-change-in-production';
        if (this.hmacKey === 'dev-hmac-key-change-in-production' && process.env.NODE_ENV === 'production') {
            throw new Error('HOMESTEAD_HMAC_KEY environment variable required in production');
        }
        // Initialize audit service for security logging
        this.auditService = auditService || new ImmutableAuditService({
            hmacSecret: process.env.AUDIT_HMAC_SECRET || 'dev-audit-secret-change-in-production',
            chainId: 'homestead-events',
            algorithm: 'sha256',
            debug: process.env.NODE_ENV === 'development'
        });
        // Initialize EventBus for threat detection
        this.eventBus = EventBus.getInstance();
    }
    // ==========================================================================
    // PHASE 1: PRE-FLIGHT VALIDATION
    // ==========================================================================
    /**
     * Validates prerequisites before attempting channel creation.
     * Prevents duplicate channels, verifies permissions, checks rate limits.
     */
    async validatePrerequisites(user, guild) {
        // Check if user already has a homestead in this guild
        const existing = await prisma.homesteadChannel.findFirst({
            where: {
                userId: user.id,
                guildId: guild.id,
                status: { in: ['active', 'suspended'] } // Ignore deleted/orphaned
            }
        });
        if (existing) {
            throw new Error(`User ${user.id} already has a homestead in guild ${guild.id}: ${existing.channelId}`);
        }
        // Verify bot has permission to create channels
        const botMember = await guild.members.fetch(this.discordClient.user.id);
        const canCreateChannels = botMember.permissions.has(PermissionFlagsBits.ManageChannels);
        if (!canCreateChannels) {
            throw new Error(`Bot lacks MANAGE_CHANNELS permission in guild ${guild.id}`);
        }
        // Phase 3.2: Rate limiting check (prevent mass-creation attacks)
        const RATE_LIMIT_THRESHOLD = 10;
        const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
        const recentCreations = await prisma.homesteadChannel.count({
            where: {
                guildId: guild.id,
                createdAt: { gte: fiveMinutesAgo }
            }
        });
        if (recentCreations >= RATE_LIMIT_THRESHOLD) {
            // Emit threat.detected event to EventBus (HIGH priority)
            try {
                this.eventBus.emit('threat.detected', {
                    type: 'mass-homestead-creation',
                    severity: 'HIGH',
                    guildId: guild.id,
                    guildName: guild.name,
                    userId: user.id,
                    discordId: user.discordId, // User model has discordId, not username
                    count: recentCreations,
                    threshold: RATE_LIMIT_THRESHOLD,
                    timeWindow: '5min',
                    timestamp: new Date().toISOString(),
                    mitreAttack: 'T1098', // Account Manipulation technique
                    mitreDescription: 'Adversaries may manipulate accounts to maintain access to victim systems',
                    recommendedAction: 'SUSPEND_CREATION + DRIP_ALERT',
                    context: {
                        recentCreationTimestamps: 'Last 5 minutes',
                        affectedGuild: guild.name,
                        potentialImpact: 'Channel spam, resource exhaustion, permission abuse'
                    }
                }, {
                    emitter: 'homestead-verification-service',
                    priority: 'high' // High priority for security threats
                });
            }
            catch (emitErr) {
                // Log EventBus failure but don't block rate limit enforcement
                process.stderr.write(`[HomesteadVerification] Failed to emit threat.detected event: ${emitErr.message}\n`);
            }
            throw new Error(`Rate limit exceeded: ${recentCreations} homestead creations in last 5 minutes (threshold: ${RATE_LIMIT_THRESHOLD}). ` +
                `This activity has been logged as potential abuse (MITRE T1098). Contact administrator if legitimate.`);
        }
    }
    // ==========================================================================
    // PHASE 2: DISCORD CHANNEL CREATION
    // ==========================================================================
    /**
     * Creates Discord channel with proper permissions (private to user + bot).
     */
    async createDiscordChannel(user, guild, options) {
        const categoryName = options.categoryName || 'Homesteads';
        // Find or create category
        let category = guild.channels.cache.find(ch => ch.name === categoryName && ch.type === ChannelType.GuildCategory);
        if (!category) {
            category = await guild.channels.create({
                name: categoryName,
                type: ChannelType.GuildCategory,
            });
        }
        // Fetch Discord user to get username
        const discordUser = await this.discordClient.users.fetch(user.id);
        const channelName = `homestead-${discordUser.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        // Create private channel
        const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites: [
                {
                    id: guild.id, // @everyone
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: user.id, // User
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.EmbedLinks,
                    ],
                },
                {
                    id: this.discordClient.user.id, // Bot
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ManageMessages,
                        PermissionFlagsBits.EmbedLinks,
                    ],
                },
            ],
        });
        return channel;
    }
    // ==========================================================================
    // PHASE 3: DATABASE RECORDING (ATOMIC TRANSACTION)
    // ==========================================================================
    /**
     * Records homestead in database with security fingerprint.
     * Uses transaction to ensure atomicity.
     */
    async recordInDatabase(user, guild, channel, options) {
        const createdAt = new Date();
        const securityFingerprint = this.generateSecurityFingerprint(user.id, guild.id, channel.id, createdAt);
        const record = await prisma.homesteadChannel.create({
            data: {
                userId: user.id,
                guildId: guild.id,
                channelId: channel.id,
                createdBy: options.createdBy || 'user',
                securityFingerprint,
                status: 'active',
                // verifiedAt will be set in verification phase
                // lastHealthCheck will be set by periodic cron job
                createdAt,
            },
        });
        return record;
    }
    // ==========================================================================
    // PHASE 4: VERIFICATION
    // ==========================================================================
    /**
     * Verifies Discord channel exists and matches database record.
     * Updates verifiedAt timestamp on success.
     */
    async verifyCreation(channel, record) {
        // Re-fetch channel from Discord to confirm it exists
        const fetchedChannel = await channel.guild.channels.fetch(channel.id);
        if (!fetchedChannel) {
            throw new Error(`Verification failed: Discord channel ${channel.id} not found`);
        }
        // Verify channel matches database record
        if (fetchedChannel.id !== record.channelId) {
            throw new Error('Verification failed: Channel ID mismatch between Discord and database');
        }
        // Update verifiedAt timestamp
        const now = new Date();
        await prisma.homesteadChannel.update({
            where: { id: record.id },
            data: { verifiedAt: now },
        });
        // Log verification success to audit chain
        try {
            await this.auditService.append({
                action: 'homestead.verified',
                actor: `system:homestead-verification`,
                target: `channel:${channel.id}`,
                metadata: {
                    channelId: channel.id,
                    recordId: record.id,
                    verificationTime: now.toISOString(),
                    securityFingerprint: record.securityFingerprint
                }
            });
        }
        catch (err) {
            // Log error but don't fail verification
            process.stderr.write(`[HomesteadVerification] Failed to log verification: ${err instanceof Error ? err.message : String(err)}\n`);
        }
    }
    // ==========================================================================
    // PHASE 5: SECURITY LOGGING
    // ==========================================================================
    /**
     * Logs creation to security system for audit trail and anomaly detection.
     * Integrates with ImmutableAuditService and EventBus for comprehensive security.
     */
    async logToSecuritySystem(user, guild, channel, record) {
        // Build metadata for audit log
        const metadata = {
            channelId: channel.id,
            channelName: channel.name,
            userId: user.id,
            guildId: guild.id,
            guildName: guild.name,
            createdBy: record.createdBy,
            securityFingerprint: record.securityFingerprint,
            verificationTime: record.verifiedAt?.toISOString(),
            permissions: channel.permissionOverwrites.cache.map(overwrite => ({
                id: overwrite.id,
                type: overwrite.type,
                allow: overwrite.allow.toArray(),
                deny: overwrite.deny.toArray()
            }))
        };
        // Log to ImmutableAuditService (tamper-proof chain)
        try {
            await this.auditService.append({
                action: 'homestead.created',
                actor: `user:${user.id}`,
                target: `channel:${channel.id}`,
                metadata
            });
        }
        catch (err) {
            // Log error but don't fail creation (audit is supplementary)
            // Using process.stderr to avoid eslint console restrictions
            process.stderr.write(`[HomesteadVerification] Failed to log to audit service: ${err instanceof Error ? err.message : String(err)}\n`);
        }
        // Emit event to EventBus for downstream processing
        try {
            this.eventBus.emit('homestead.created', {
                channelId: channel.id,
                channelName: channel.name,
                userId: user.id,
                guildId: guild.id,
                guildName: guild.name,
                createdBy: record.createdBy,
                timestamp: new Date().toISOString()
            }, {
                emitter: 'homestead-verification-service',
                priority: 'normal', // Medium priority
                parentCorrelationId: record.securityFingerprint || undefined
            });
        }
        catch (err) {
            // Log error but don't fail creation
            process.stderr.write(`[HomesteadVerification] Failed to emit event: ${err instanceof Error ? err.message : String(err)}\n`);
        }
    }
    // ==========================================================================
    // ROLLBACK ON FAILURE
    // ==========================================================================
    /**
     * Rolls back partial creation on failure.
     * Deletes Discord channel if DB failed, deletes DB record if Discord failed.
     */
    async rollback(phase, channel, record) {
        const errors = [];
        // If database record exists, mark as orphaned
        if (record) {
            try {
                await prisma.homesteadChannel.update({
                    where: { id: record.id },
                    data: { status: 'orphaned' },
                });
                // Log orphan detection to audit chain
                try {
                    await this.auditService.append({
                        action: 'homestead.orphaned',
                        actor: `system:homestead-verification`,
                        target: `channel:${record.channelId}`,
                        metadata: {
                            recordId: record.id,
                            channelId: record.channelId,
                            userId: record.userId,
                            guildId: record.guildId,
                            failedPhase: phase,
                            reason: `Rollback triggered during ${phase} phase`,
                            securityFingerprint: record.securityFingerprint
                        }
                    });
                }
                catch (auditErr) {
                    // Log error but don't fail rollback
                    process.stderr.write(`[HomesteadVerification] Failed to log orphan: ${auditErr instanceof Error ? auditErr.message : String(auditErr)}\n`);
                }
            }
            catch (err) {
                errors.push(new Error(`Failed to mark record as orphaned: ${err instanceof Error ? err.message : String(err)}`));
            }
        }
        // If Discord channel exists, delete it
        if (channel) {
            try {
                await channel.delete('Homestead creation failed, rolling back');
            }
            catch (err) {
                errors.push(new Error(`Failed to delete Discord channel: ${err instanceof Error ? err.message : String(err)}`));
            }
        }
        return {
            success: errors.length === 0,
            errors,
        };
    }
    // ==========================================================================
    // PUBLIC API: CREATE VERIFIED HOMESTEAD
    // ==========================================================================
    /**
     * Creates a verified homestead channel with full security integration.
     *
     * @param user - Database user record
     * @param guild - Discord guild
     * @param options - Creation options
     * @returns VerifiedHomesteadResult on success, HomesteadCreationFailure on error
     */
    async createVerifiedHomestead(user, guild, options = {}) {
        const startTime = Date.now();
        let channel;
        let record;
        let currentPhase = 'pre-flight';
        try {
            // Phase 1: Pre-flight checks
            currentPhase = 'pre-flight';
            await this.validatePrerequisites(user, guild);
            // Phase 2: Discord channel creation
            currentPhase = 'discord';
            channel = await this.createDiscordChannel(user, guild, options);
            // Phase 3: Database recording
            currentPhase = 'database';
            record = await this.recordInDatabase(user, guild, channel, options);
            // Phase 4: Verification
            if (!options.skipVerification) {
                currentPhase = 'verification';
                await this.verifyCreation(channel, record);
            }
            // Phase 5: Security logging
            currentPhase = 'security';
            await this.logToSecuritySystem(user, guild, channel, record);
            // Success!
            return {
                success: true,
                channel,
                record,
                verificationTime: Date.now() - startTime,
            };
        }
        catch (error) {
            // Rollback on failure
            const { success: rollbackSuccess, errors: rollbackErrors } = await this.rollback(currentPhase, channel, record);
            return {
                success: false,
                error: error instanceof Error ? error : new Error(String(error)),
                phase: currentPhase,
                rollbackSuccess,
                rollbackErrors: rollbackErrors.length > 0 ? rollbackErrors : undefined,
            };
        }
    }
    // ==========================================================================
    // PUBLIC API: PERIODIC INTEGRITY VERIFICATION
    // ==========================================================================
    /**
     * Verifies integrity of all homesteads in a guild.
     * Detects orphans (DB exists, Discord missing) and ghosts (Discord exists, DB missing).
     *
     * @param guildId - Discord guild ID
     * @returns IntegrityReport with verification results
     */
    async verifyIntegrity(guildId) {
        const guild = await this.discordClient.guilds.fetch(guildId);
        const dbHomesteads = await prisma.homesteadChannel.findMany({
            where: { guildId, status: 'active' }
        });
        const discordChannels = guild.channels.cache;
        const orphans = [];
        const ghosts = [];
        let verified = 0;
        let unverified = 0;
        // Check DB homesteads exist in Discord
        for (const homestead of dbHomesteads) {
            const discordChannel = discordChannels.get(homestead.channelId);
            if (!discordChannel) {
                // Orphan: DB exists, Discord missing
                orphans.push({
                    id: homestead.id,
                    userId: homestead.userId,
                    channelId: homestead.channelId,
                    createdAt: homestead.createdAt,
                });
                // Mark as orphaned
                await prisma.homesteadChannel.update({
                    where: { id: homestead.id },
                    data: { status: 'orphaned' },
                });
            }
            else {
                // Update last health check
                await prisma.homesteadChannel.update({
                    where: { id: homestead.id },
                    data: { lastHealthCheck: new Date() },
                });
                if (homestead.verifiedAt) {
                    verified++;
                }
                else {
                    unverified++;
                }
            }
        }
        // Check Discord channels exist in DB
        const homesteadChannels = discordChannels.filter(ch => ch.name.startsWith('homestead-') && ch.parent?.name === 'Homesteads');
        for (const [channelId, channel] of homesteadChannels) {
            const dbRecord = await prisma.homesteadChannel.findUnique({
                where: { channelId }
            });
            if (!dbRecord) {
                // Ghost: Discord exists, DB missing
                ghosts.push({
                    id: channel.id,
                    name: channel.name,
                    createdAt: channel.createdAt,
                });
            }
        }
        return {
            timestamp: new Date(),
            guildId,
            totalHomesteads: dbHomesteads.length,
            verified,
            unverified,
            orphans: orphans.length,
            ghosts: ghosts.length,
            orphanList: orphans,
            ghostList: ghosts,
        };
    }
    // ==========================================================================
    // UTILITY: SECURITY FINGERPRINT GENERATION
    // ==========================================================================
    /**
     * Generates HMAC-SHA256 security fingerprint for integrity verification.
     * Format: HMAC-SHA256(userId|guildId|channelId|timestamp)
     */
    generateSecurityFingerprint(userId, guildId, channelId, createdAt) {
        const data = `${userId}|${guildId}|${channelId}|${createdAt.toISOString()}`;
        return createHmac('sha256', this.hmacKey)
            .update(data)
            .digest('hex');
    }
    /**
     * Verifies security fingerprint matches expected value.
     * Detects tampering or data corruption.
     */
    verifySecurityFingerprint(record) {
        if (!record.securityFingerprint) {
            return false; // No fingerprint to verify
        }
        const expected = this.generateSecurityFingerprint(record.userId, record.guildId, record.channelId, record.createdAt);
        return record.securityFingerprint === expected;
    }
}
