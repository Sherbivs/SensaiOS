/**
 * Data Pool Service
 * =================
 *
 * Central data ingestion coordinator for Discord entity capture.
 * Captures guilds, members, and roles from Discord.js client and persists
 * to database for security analysis, forensics, and cross-reference validation.
 *
 * @module services/data-pool/data-pool-service
 * @created Sprint 5.0 (2025-12-06) - Critical gap remediation
 *
 * **Purpose:**
 * - Capture Discord guild/member/role data during security sweeps
 * - Maintain up-to-date member information pool for security analysis
 * - Track role changes for forensics and pattern detection
 * - Enable cross-reference validation for 4-layer integrity
 *
 * **Architecture:**
 * ```
 * Discord.js Client
 *       │
 *       ▼
 * DataPoolService (this)
 *       │
 *       ├── syncGuild() ───► discord_guilds table
 *       ├── syncMembers() ──► discord_members table
 *       ├── syncRoles() ────► discord_roles table
 *       └── trackRoleChange() ► member_role_history table
 *       │
 *       ▼
 * SecurityEventService (events)
 * ```
 *
 * @example
 * ```typescript
 * import { DataPoolService } from './data-pool-service';
 * import { prisma } from '../../shared/prisma';
 *
 * const dataPool = new DataPoolService(prisma);
 *
 * // On ClientReady - sync all data
 * client.on('ready', async () => {
 *   for (const guild of client.guilds.cache.values()) {
 *     await dataPool.syncGuild(guild);
 *     await dataPool.syncMembers(guild);
 *     await dataPool.syncRoles(guild);
 *   }
 * });
 *
 * // On role change - track history
 * client.on('guildMemberUpdate', async (oldMember, newMember) => {
 *   await dataPool.trackRoleChanges(oldMember, newMember, 'guildMemberUpdate');
 * });
 * ```
 */
// ============================================================================
// TYPES
// ============================================================================
/**
 * Discord permissions that indicate admin-level access
 */
const ADMIN_PERMISSIONS = BigInt(0x8); // ADMINISTRATOR
/**
 * Discord permissions that are considered dangerous
 */
const DANGEROUS_PERMISSIONS = [
    BigInt(0x4), // BAN_MEMBERS
    BigInt(0x2), // KICK_MEMBERS
    BigInt(0x10000000), // MANAGE_ROLES
    BigInt(0x10), // MANAGE_GUILD
    BigInt(0x20), // MANAGE_CHANNELS
];
// ============================================================================
// DATA POOL SERVICE
// ============================================================================
/**
 * Central data ingestion coordinator for Discord entities.
 *
 * Responsible for:
 * - Syncing guild metadata to database
 * - Capturing member information during sweeps
 * - Tracking role assignments and permissions
 * - Recording role change history for forensics
 */
export class DataPoolService {
    prisma;
    initialized = false;
    constructor(prisma) {
        this.prisma = prisma;
    }
    // ==========================================================================
    // INITIALIZATION
    // ==========================================================================
    /**
     * Initialize the data pool service.
     * Verifies database connectivity and initializes sync status records.
     */
    async initialize() {
        if (this.initialized)
            return;
        try {
            // Verify sync status table is seeded
            const syncStatuses = await this.prisma.$queryRaw `
        SELECT id FROM data_pool_sync_status WHERE id IN ('guilds', 'members', 'roles')
      `;
            if (syncStatuses.length < 3) {
                // Seed missing sync status records
                await this.prisma.$executeRaw `
          INSERT INTO data_pool_sync_status (id)
          SELECT unnest(ARRAY['guilds', 'members', 'roles'])
          ON CONFLICT (id) DO NOTHING
        `;
            }
            this.initialized = true;
            console.log('[DataPoolService] ✅ Initialized successfully');
        }
        catch (error) {
            console.error('[DataPoolService] ❌ Initialization failed:', error);
            throw error;
        }
    }
    // ==========================================================================
    // GUILD SYNC
    // ==========================================================================
    /**
     * Sync a guild's metadata to the database.
     *
     * @param guild - Discord.js Guild object
     * @returns Success status
     */
    async syncGuild(guild) {
        try {
            await this.prisma.$executeRaw `
        INSERT INTO discord_guilds (
          id, name, owner_id, icon, member_count, role_count, channel_count,
          monitoring_enabled, last_sweep_at, sweep_count, first_seen_at, last_updated_at
        ) VALUES (
          ${guild.id},
          ${guild.name},
          ${guild.ownerId},
          ${guild.icon ?? null},
          ${guild.memberCount},
          ${guild.roles.cache.size},
          ${guild.channels.cache.size},
          true,
          NOW(),
          1,
          NOW(),
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          owner_id = EXCLUDED.owner_id,
          icon = EXCLUDED.icon,
          member_count = EXCLUDED.member_count,
          role_count = EXCLUDED.role_count,
          channel_count = EXCLUDED.channel_count,
          last_sweep_at = NOW(),
          sweep_count = discord_guilds.sweep_count + 1,
          last_updated_at = NOW()
      `;
            return true;
        }
        catch (error) {
            console.error(`[DataPoolService] ❌ Failed to sync guild ${guild.id}:`, error);
            await this.recordSyncError('guilds', error);
            return false;
        }
    }
    // ==========================================================================
    // MEMBER SYNC
    // ==========================================================================
    /**
     * Sync all members of a guild to the database.
     *
     * @param guild - Discord.js Guild object
     * @returns Sync result with statistics
     */
    async syncMembers(guild) {
        const startTime = Date.now();
        const errors = [];
        let synced = 0;
        let failed = 0;
        try {
            // Fetch all members (may require intent)
            const members = guild.members.cache;
            for (const [memberId, member] of members) {
                try {
                    await this.syncMember(member, guild);
                    synced++;
                }
                catch (error) {
                    failed++;
                    errors.push(`Member ${memberId}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            // Update sync status
            await this.updateSyncStatus('members', synced, failed, errors[0] ?? null);
            return {
                success: failed === 0,
                synced,
                failed,
                errors,
                duration: Date.now() - startTime,
            };
        }
        catch (error) {
            console.error(`[DataPoolService] ❌ Failed to sync members for guild ${guild.id}:`, error);
            await this.recordSyncError('members', error);
            return {
                success: false,
                synced,
                failed: failed + 1,
                errors: [...errors, error instanceof Error ? error.message : String(error)],
                duration: Date.now() - startTime,
            };
        }
    }
    /**
     * Sync a single member to the database.
     *
     * @param member - Discord.js GuildMember object
     * @param guild - Discord.js Guild object
     */
    async syncMember(member, guild) {
        const isOwner = member.id === guild.ownerId;
        const isAdmin = member.permissions.has(ADMIN_PERMISSIONS);
        const roleIds = Array.from(member.roles.cache.keys());
        const highestRolePosition = member.roles.highest?.position ?? 0;
        // Determine security flags
        const securityFlags = [];
        if (isAdmin)
            securityFlags.push('administrator');
        if (isOwner)
            securityFlags.push('owner');
        if (member.joinedAt && Date.now() - member.joinedAt.getTime() < 7 * 24 * 60 * 60 * 1000) {
            securityFlags.push('new_member');
        }
        if (roleIds.length > 10)
            securityFlags.push('many_roles');
        await this.prisma.$executeRaw `
      INSERT INTO discord_members (
        id, discord_user_id, guild_id, username, discriminator, display_name,
        avatar, bot, roles, joined_at, premium_since, pending,
        communication_disabled_until, role_count, highest_role_position,
        is_administrator, is_owner, last_activity_at, security_flags,
        risk_score, first_seen_at, last_updated_at
      ) VALUES (
        gen_random_uuid()::TEXT,
        ${member.id},
        ${guild.id},
        ${member.user.username},
        ${member.user.discriminator ?? null},
        ${member.displayName},
        ${member.user.avatar ?? null},
        ${member.user.bot},
        ${roleIds}::TEXT[],
        ${member.joinedAt ?? null},
        ${member.premiumSince ?? null},
        ${member.pending ?? false},
        ${member.communicationDisabledUntil ?? null},
        ${roleIds.length},
        ${highestRolePosition},
        ${isAdmin},
        ${isOwner},
        NOW(),
        ${securityFlags}::TEXT[],
        ${this.calculateRiskScore(member, securityFlags)},
        NOW(),
        NOW()
      )
      ON CONFLICT (discord_user_id, guild_id) DO UPDATE SET
        username = EXCLUDED.username,
        discriminator = EXCLUDED.discriminator,
        display_name = EXCLUDED.display_name,
        avatar = EXCLUDED.avatar,
        roles = EXCLUDED.roles,
        premium_since = EXCLUDED.premium_since,
        pending = EXCLUDED.pending,
        communication_disabled_until = EXCLUDED.communication_disabled_until,
        role_count = EXCLUDED.role_count,
        highest_role_position = EXCLUDED.highest_role_position,
        is_administrator = EXCLUDED.is_administrator,
        is_owner = EXCLUDED.is_owner,
        last_activity_at = NOW(),
        security_flags = EXCLUDED.security_flags,
        risk_score = EXCLUDED.risk_score,
        last_updated_at = NOW()
    `;
    }
    /**
     * Calculate a risk score for a member based on their attributes.
     *
     * @param member - GuildMember
     * @param flags - Security flags
     * @returns Risk score 0.0 - 1.0
     */
    calculateRiskScore(member, flags) {
        let score = 0.0;
        // Base risk factors
        if (flags.includes('administrator'))
            score += 0.3;
        if (flags.includes('new_member'))
            score += 0.2;
        if (flags.includes('many_roles'))
            score += 0.1;
        // Bot accounts have lower risk (expected behavior)
        if (member.user.bot)
            score -= 0.1;
        // Owner is trusted
        if (flags.includes('owner'))
            score -= 0.2;
        // Clamp to 0.0 - 1.0
        return Math.max(0, Math.min(1, score));
    }
    // ==========================================================================
    // ROLE SYNC
    // ==========================================================================
    /**
     * Sync all roles of a guild to the database.
     *
     * @param guild - Discord.js Guild object
     * @returns Sync result with statistics
     */
    async syncRoles(guild) {
        const startTime = Date.now();
        const errors = [];
        let synced = 0;
        let failed = 0;
        try {
            const roles = guild.roles.cache;
            for (const [roleId, role] of roles) {
                try {
                    await this.syncRole(role, guild);
                    synced++;
                }
                catch (error) {
                    failed++;
                    errors.push(`Role ${roleId}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            // Update sync status
            await this.updateSyncStatus('roles', synced, failed, errors[0] ?? null);
            return {
                success: failed === 0,
                synced,
                failed,
                errors,
                duration: Date.now() - startTime,
            };
        }
        catch (error) {
            console.error(`[DataPoolService] ❌ Failed to sync roles for guild ${guild.id}:`, error);
            await this.recordSyncError('roles', error);
            return {
                success: false,
                synced,
                failed: failed + 1,
                errors: [...errors, error instanceof Error ? error.message : String(error)],
                duration: Date.now() - startTime,
            };
        }
    }
    /**
     * Sync a single role to the database.
     *
     * @param role - Discord.js Role object
     * @param guild - Discord.js Guild object
     */
    async syncRole(role, guild) {
        const permissions = role.permissions.bitfield;
        const isAdmin = (permissions & ADMIN_PERMISSIONS) !== BigInt(0);
        const isDangerous = DANGEROUS_PERMISSIONS.some(p => (permissions & p) !== BigInt(0));
        // Count members with this role
        const memberCount = role.members?.size ?? 0;
        await this.prisma.$executeRaw `
      INSERT INTO discord_roles (
        id, discord_role_id, guild_id, name, color, hoist, position,
        permissions, mentionable, managed, is_admin, is_dangerous,
        member_count, first_seen_at, last_updated_at
      ) VALUES (
        gen_random_uuid()::TEXT,
        ${role.id},
        ${guild.id},
        ${role.name},
        ${role.color},
        ${role.hoist},
        ${role.position},
        ${permissions.toString()},
        ${role.mentionable},
        ${role.managed},
        ${isAdmin},
        ${isDangerous},
        ${memberCount},
        NOW(),
        NOW()
      )
      ON CONFLICT (discord_role_id, guild_id) DO UPDATE SET
        name = EXCLUDED.name,
        color = EXCLUDED.color,
        hoist = EXCLUDED.hoist,
        position = EXCLUDED.position,
        permissions = EXCLUDED.permissions,
        mentionable = EXCLUDED.mentionable,
        managed = EXCLUDED.managed,
        is_admin = EXCLUDED.is_admin,
        is_dangerous = EXCLUDED.is_dangerous,
        member_count = EXCLUDED.member_count,
        last_updated_at = NOW()
    `;
    }
    // ==========================================================================
    // ROLE CHANGE TRACKING
    // ==========================================================================
    /**
     * Track role changes between old and new member state.
     *
     * @param oldMember - Previous member state
     * @param newMember - New member state
     * @param source - Source of the change (e.g., 'guildMemberUpdate', 'security-sweep')
     * @param executorId - ID of the user who made the change (if known)
     * @param executorTag - Tag of the user who made the change (if known)
     */
    async trackRoleChanges(oldMember, newMember, source, executorId, executorTag) {
        const oldRoles = new Set(oldMember.roles.cache.keys());
        const newRoles = new Set(newMember.roles.cache.keys());
        const previousRoleIds = Array.from(oldRoles);
        const newRoleIds = Array.from(newRoles);
        // Find added roles
        for (const roleId of newRoles) {
            if (!oldRoles.has(roleId)) {
                const role = newMember.roles.cache.get(roleId);
                if (role) {
                    await this.recordRoleChange(newMember, role, 'added', previousRoleIds, newRoleIds, source, executorId, executorTag);
                }
            }
        }
        // Find removed roles
        for (const roleId of oldRoles) {
            if (!newRoles.has(roleId)) {
                const role = oldMember.roles.cache.get(roleId);
                if (role) {
                    await this.recordRoleChange(newMember, role, 'removed', previousRoleIds, newRoleIds, source, executorId, executorTag);
                }
            }
        }
    }
    /**
     * Record a single role change to the history table.
     */
    async recordRoleChange(member, role, action, previousRoles, newRoles, source, executorId, executorTag) {
        try {
            await this.prisma.$executeRaw `
        INSERT INTO member_role_history (
          discord_user_id, guild_id, member_tag, discord_role_id, role_name,
          action, executor_id, executor_tag, source, previous_roles, new_roles, changed_at
        ) VALUES (
          ${member.id},
          ${member.guild.id},
          ${member.user.tag},
          ${role.id},
          ${role.name},
          ${action},
          ${executorId ?? null},
          ${executorTag ?? null},
          ${source},
          ${previousRoles}::TEXT[],
          ${newRoles}::TEXT[],
          NOW()
        )
      `;
        }
        catch (error) {
            console.error(`[DataPoolService] ❌ Failed to record role change:`, error);
        }
    }
    // ==========================================================================
    // FULL SYNC (ClientReady)
    // ==========================================================================
    /**
     * Perform a full sync of all guilds the client is in.
     *
     * @param client - Discord.js Client
     * @returns Combined sync results
     */
    async fullSync(client) {
        const startTime = Date.now();
        let guildsSynced = 0;
        const membersResult = { success: true, synced: 0, failed: 0, errors: [], duration: 0 };
        const rolesResult = { success: true, synced: 0, failed: 0, errors: [], duration: 0 };
        console.log(`[DataPoolService] 🔄 Starting full sync of ${client.guilds.cache.size} guilds...`);
        for (const [guildId, guild] of client.guilds.cache) {
            console.log(`[DataPoolService] 📥 Syncing guild: ${guild.name} (${guildId})`);
            // Sync guild metadata
            if (await this.syncGuild(guild)) {
                guildsSynced++;
            }
            // Sync members
            const memberResult = await this.syncMembers(guild);
            membersResult.synced += memberResult.synced;
            membersResult.failed += memberResult.failed;
            membersResult.errors.push(...memberResult.errors);
            if (!memberResult.success)
                membersResult.success = false;
            // Sync roles
            const roleResult = await this.syncRoles(guild);
            rolesResult.synced += roleResult.synced;
            rolesResult.failed += roleResult.failed;
            rolesResult.errors.push(...roleResult.errors);
            if (!roleResult.success)
                rolesResult.success = false;
        }
        const duration = Date.now() - startTime;
        console.log(`[DataPoolService] ✅ Full sync complete in ${duration}ms`);
        console.log(`[DataPoolService]    Guilds: ${guildsSynced}`);
        console.log(`[DataPoolService]    Members: ${membersResult.synced} synced, ${membersResult.failed} failed`);
        console.log(`[DataPoolService]    Roles: ${rolesResult.synced} synced, ${rolesResult.failed} failed`);
        // Update full sync timestamp
        await this.prisma.$executeRaw `
      UPDATE data_pool_sync_status
      SET last_full_sync_at = NOW(), updated_at = NOW()
      WHERE id IN ('guilds', 'members', 'roles')
    `;
        return {
            guilds: guildsSynced,
            members: membersResult,
            roles: rolesResult,
            duration,
        };
    }
    // ==========================================================================
    // STATISTICS
    // ==========================================================================
    /**
     * Get statistics about the data pool.
     */
    async getStats() {
        const [result] = await this.prisma.$queryRaw `
      SELECT
        (SELECT COUNT(*) FROM discord_guilds) as guild_count,
        (SELECT COUNT(*) FROM discord_members) as total_members,
        (SELECT COUNT(*) FROM discord_roles) as total_roles,
        (SELECT COUNT(*) FROM discord_members WHERE is_administrator = true) as admin_members,
        (SELECT COUNT(*) FROM discord_roles WHERE is_dangerous = true) as dangerous_roles
    `;
        return {
            guildCount: Number(result?.guild_count ?? 0),
            totalMembers: Number(result?.total_members ?? 0),
            totalRoles: Number(result?.total_roles ?? 0),
            adminMembers: Number(result?.admin_members ?? 0),
            dangerousRoles: Number(result?.dangerous_roles ?? 0),
        };
    }
    /**
     * Get sync status for all entity types.
     */
    async getSyncStatus() {
        const statuses = await this.prisma.$queryRaw `
      SELECT * FROM data_pool_sync_status ORDER BY id
    `;
        return statuses.map(s => ({
            id: s.id,
            lastFullSyncAt: s.last_full_sync_at,
            lastIncrementalAt: s.last_incremental_at,
            totalEntities: s.total_entities,
            entitiesSynced: s.entities_synced,
            entitiesFailed: s.entities_failed,
            lastError: s.last_error,
            lastErrorAt: s.last_error_at,
            consecutiveErrors: s.consecutive_errors,
        }));
    }
    // ==========================================================================
    // HELPERS
    // ==========================================================================
    /**
     * Update sync status after a sync operation.
     */
    async updateSyncStatus(entityType, synced, failed, lastError) {
        await this.prisma.$executeRaw `
      UPDATE data_pool_sync_status
      SET
        last_incremental_at = NOW(),
        entities_synced = ${synced},
        entities_failed = ${failed},
        total_entities = ${synced + failed},
        last_error = ${lastError},
        last_error_at = CASE WHEN ${lastError}::TEXT IS NOT NULL THEN NOW() ELSE last_error_at END,
        consecutive_errors = CASE
          WHEN ${failed} > 0 THEN consecutive_errors + 1
          ELSE 0
        END,
        updated_at = NOW()
      WHERE id = ${entityType}
    `;
    }
    /**
     * Record a sync error.
     */
    async recordSyncError(entityType, error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await this.prisma.$executeRaw `
      UPDATE data_pool_sync_status
      SET
        last_error = ${errorMessage},
        last_error_at = NOW(),
        consecutive_errors = consecutive_errors + 1,
        entities_failed = entities_failed + 1,
        updated_at = NOW()
      WHERE id = ${entityType}
    `;
    }
}
// ============================================================================
// SINGLETON EXPORT
// ============================================================================
let dataPoolInstance = null;
/**
 * Get or create the DataPoolService singleton.
 *
 * @param prisma - PrismaClient instance
 * @returns DataPoolService instance
 */
export function getDataPoolService(prisma) {
    if (!dataPoolInstance) {
        dataPoolInstance = new DataPoolService(prisma);
    }
    return dataPoolInstance;
}
/**
 * Reset the singleton (for testing).
 */
export function resetDataPoolService() {
    dataPoolInstance = null;
}
