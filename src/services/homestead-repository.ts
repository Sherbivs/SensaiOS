/**
 * Homestead Repository — Domain-specific Homestead Channel operations
 *
 * Provides type-safe access to HomesteadChannel data with:
 * - User/Guild-scoped queries (multi-guild support)
 * - Channel lifecycle management (active → suspended → archived)
 * - Health check tracking
 * - Bulk operations for admin/monitoring workflows
 *
 * @module services/homestead-repository
 * @task Phase 2.8 Code Consolidation
 * @see prisma/schema.prisma - HomesteadChannel model
 * @see src/services/homestead-manager.ts - Consumer of this repository
 */

import { prisma } from "../shared/prisma.js";
import type {
  HomesteadChannel,
  User,
} from "../generated/prisma/client.js";
import { daysAgo } from "../shared/utils/date-utils.js";

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Homestead status values
 */
export type HomesteadStatus = "active" | "suspended" | "archived";

/**
 * Homestead with user relation
 */
export interface HomesteadWithUser extends HomesteadChannel {
  user: User;
}

/**
 * Homestead creation data
 */
export interface CreateHomesteadData {
  userId: string;
  guildId: string;
  channelId: string;
  status?: HomesteadStatus;
  createdBy?: string;
  securityFingerprint?: string;
}

/**
 * Homestead update data (partial)
 */
export interface UpdateHomesteadData {
  channelId?: string;
  status?: HomesteadStatus;
  lastAccessedAt?: Date;
  lastHealthCheck?: Date;
  verifiedAt?: Date;
  securityFingerprint?: string;
}

/**
 * Query options for finding homesteads
 */
export interface HomesteadQueryOptions {
  includeUser?: boolean;
  status?: HomesteadStatus | HomesteadStatus[];
  inactiveDays?: number;
  limit?: number;
}

// =============================================================================
// HomesteadRepository Class
// =============================================================================

/**
 * Repository for HomesteadChannel operations
 *
 * Consolidates 15+ scattered Prisma queries into a single, type-safe API.
 * All methods are guild-scoped for multi-guild support.
 */
export class HomesteadRepository {
  private readonly db: typeof prisma;

  constructor(client?: typeof prisma) {
    this.db = client ?? prisma;
  }

  // -------------------------------------------------------------------------
  // Single Record Queries
  // -------------------------------------------------------------------------

  /**
   * Find homestead by user ID and guild ID
   * Most common lookup pattern - used in getOrCreateChannel, getChannel, deleteChannel
   */
  async findByUserAndGuild(
    userId: string,
    guildId: string,
    options?: { includeUser?: boolean }
  ): Promise<HomesteadChannel | HomesteadWithUser | null> {
    return this.db.homesteadChannel.findFirst({
      where: { userId, guildId },
      include: options?.includeUser ? { user: true } : undefined,
    }) as Promise<HomesteadChannel | HomesteadWithUser | null>;
  }

  /**
   * Find homestead by channel ID (unique lookup)
   * Used for channel → user resolution
   */
  async findByChannelId(channelId: string): Promise<HomesteadChannel | null> {
    return this.db.homesteadChannel.findUnique({
      where: { channelId },
    });
  }

  /**
   * Find homestead by channel ID with user relation
   */
  async findByChannelIdWithUser(
    channelId: string
  ): Promise<HomesteadWithUser | null> {
    return this.db.homesteadChannel.findUnique({
      where: { channelId },
      include: { user: true },
    }) as Promise<HomesteadWithUser | null>;
  }

  /**
   * Find homestead by ID (primary key)
   */
  async findById(id: string): Promise<HomesteadChannel | null> {
    return this.db.homesteadChannel.findUnique({
      where: { id },
    });
  }

  // -------------------------------------------------------------------------
  // Multi-Record Queries
  // -------------------------------------------------------------------------

  /**
   * Find all homesteads in a guild
   * Used for guild-wide operations and statistics
   */
  async findByGuild(
    guildId: string,
    options?: HomesteadQueryOptions
  ): Promise<HomesteadChannel[] | HomesteadWithUser[]> {
    const where: Record<string, unknown> = { guildId };

    if (options?.status) {
      where.status = Array.isArray(options.status)
        ? { in: options.status }
        : options.status;
    }

    if (options?.inactiveDays) {
      where.lastAccessedAt = { lt: daysAgo(options.inactiveDays) };
    }

    return this.db.homesteadChannel.findMany({
      where,
      include: options?.includeUser ? { user: true } : undefined,
      take: options?.limit,
    }) as Promise<HomesteadChannel[] | HomesteadWithUser[]>;
  }

  /**
   * Find inactive homesteads (for cleanup)
   * Replaces scattered inactive homestead queries
   */
  async findInactive(
    guildId: string,
    inactiveDays: number
  ): Promise<HomesteadChannel[]> {
    return this.db.homesteadChannel.findMany({
      where: {
        guildId,
        lastAccessedAt: { lt: daysAgo(inactiveDays) },
      },
    });
  }

  /**
   * Find all active homesteads across all guilds
   * Used for global monitoring and statistics
   */
  async findAllActive(
    options?: { includeUser?: boolean; limit?: number }
  ): Promise<HomesteadChannel[] | HomesteadWithUser[]> {
    return this.db.homesteadChannel.findMany({
      where: { status: "active" },
      include: options?.includeUser ? { user: true } : undefined,
      take: options?.limit,
    }) as Promise<HomesteadChannel[] | HomesteadWithUser[]>;
  }

  /**
   * Find distinct guild IDs with active homesteads
   * Used for multi-guild monitoring
   */
  async findActiveGuildIds(): Promise<string[]> {
    const guilds = await this.db.homesteadChannel.findMany({
      where: { status: "active" },
      select: { guildId: true },
      distinct: ["guildId"],
    });
    return guilds.map((g: { guildId: string }) => g.guildId);
  }

  /**
   * Find homesteads needing health check
   * Used by homestead-player-monitor
   */
  async findNeedingHealthCheck(
    guildId: string,
    maxAgeHours: number = 24
  ): Promise<HomesteadChannel[]> {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    return this.db.homesteadChannel.findMany({
      where: {
        guildId,
        OR: [
          { lastHealthCheck: null },
          { lastHealthCheck: { lt: cutoff } },
        ],
      },
    });
  }

  // -------------------------------------------------------------------------
  // Write Operations
  // -------------------------------------------------------------------------

  /**
   * Create a new homestead record
   */
  async create(data: CreateHomesteadData): Promise<HomesteadChannel> {
    return this.db.homesteadChannel.create({
      data: {
        userId: data.userId,
        guildId: data.guildId,
        channelId: data.channelId,
        status: data.status ?? "active",
        createdBy: data.createdBy ?? "system",
        securityFingerprint: data.securityFingerprint,
      },
    });
  }

  /**
   * Update homestead by ID
   */
  async update(
    id: string,
    data: UpdateHomesteadData
  ): Promise<HomesteadChannel> {
    return this.db.homesteadChannel.update({
      where: { id },
      data,
    });
  }

  /**
   * Update last accessed timestamp
   * Convenience method for the most common update
   */
  async touchLastAccessed(id: string): Promise<HomesteadChannel> {
    return this.db.homesteadChannel.update({
      where: { id },
      data: { lastAccessedAt: new Date() },
    });
  }

  /**
   * Update health check timestamp
   */
  async touchHealthCheck(id: string): Promise<HomesteadChannel> {
    return this.db.homesteadChannel.update({
      where: { id },
      data: { lastHealthCheck: new Date() },
    });
  }

  /**
   * Mark homestead as verified
   */
  async markVerified(id: string): Promise<HomesteadChannel> {
    return this.db.homesteadChannel.update({
      where: { id },
      data: {
        verifiedAt: new Date(),
        lastHealthCheck: new Date(),
      },
    });
  }

  /**
   * Update homestead status
   */
  async updateStatus(
    id: string,
    status: HomesteadStatus
  ): Promise<HomesteadChannel> {
    return this.db.homesteadChannel.update({
      where: { id },
      data: { status },
    });
  }

  /**
   * Delete homestead by ID
   */
  async delete(id: string): Promise<HomesteadChannel> {
    return this.db.homesteadChannel.delete({
      where: { id },
    });
  }

  /**
   * Delete homestead by user and guild
   * Convenience method matching the common pattern
   */
  async deleteByUserAndGuild(
    userId: string,
    guildId: string
  ): Promise<HomesteadChannel | null> {
    const homestead = await this.findByUserAndGuild(userId, guildId);
    if (!homestead) return null;
    return this.delete(homestead.id);
  }

  // -------------------------------------------------------------------------
  // Bulk Operations
  // -------------------------------------------------------------------------

  /**
   * Bulk update status for multiple homesteads
   */
  async bulkUpdateStatus(
    ids: string[],
    status: HomesteadStatus
  ): Promise<number> {
    const result = await this.db.homesteadChannel.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
    return result.count;
  }

  /**
   * Delete multiple homesteads by IDs
   */
  async bulkDelete(ids: string[]): Promise<number> {
    const result = await this.db.homesteadChannel.deleteMany({
      where: { id: { in: ids } },
    });
    return result.count;
  }

  // -------------------------------------------------------------------------
  // Statistics & Counts
  // -------------------------------------------------------------------------

  /**
   * Count homesteads by guild
   */
  async countByGuild(guildId: string): Promise<number> {
    return this.db.homesteadChannel.count({
      where: { guildId },
    });
  }

  /**
   * Count homesteads by status in a guild
   */
  async countByStatus(
    guildId: string,
    status: HomesteadStatus
  ): Promise<number> {
    return this.db.homesteadChannel.count({
      where: { guildId, status },
    });
  }

  /**
   * Count total homesteads across all guilds
   */
  async countTotal(): Promise<number> {
    return this.db.homesteadChannel.count();
  }

  /**
   * Get statistics for a guild
   */
  async getGuildStats(guildId: string): Promise<{
    total: number;
    active: number;
    suspended: number;
    archived: number;
    needingHealthCheck: number;
  }> {
    const [total, active, suspended, archived, needingHealthCheck] =
      await Promise.all([
        this.countByGuild(guildId),
        this.countByStatus(guildId, "active"),
        this.countByStatus(guildId, "suspended"),
        this.countByStatus(guildId, "archived"),
        this.db.homesteadChannel.count({
          where: {
            guildId,
            OR: [
              { lastHealthCheck: null },
              { lastHealthCheck: { lt: daysAgo(1) } },
            ],
          },
        }),
      ]);

    return { total, active, suspended, archived, needingHealthCheck };
  }

  // -------------------------------------------------------------------------
  // Existence Checks
  // -------------------------------------------------------------------------

  /**
   * Check if user has homestead in guild
   */
  async existsForUser(userId: string, guildId: string): Promise<boolean> {
    const count = await this.db.homesteadChannel.count({
      where: { userId, guildId },
    });
    return count > 0;
  }

  /**
   * Check if channel ID is a homestead
   */
  async isHomesteadChannel(channelId: string): Promise<boolean> {
    const count = await this.db.homesteadChannel.count({
      where: { channelId },
    });
    return count > 0;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * Default repository instance using the primary Prisma client
 */
export const homesteadRepository = new HomesteadRepository();

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new repository instance with a custom Prisma client
 * Useful for transactions or testing
 */
export function createHomesteadRepository(
  client: typeof prisma
): HomesteadRepository {
  return new HomesteadRepository(client);
}
