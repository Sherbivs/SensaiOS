/**
 * Battle Repository — Domain-specific Battle operations
 *
 * Provides type-safe access to Battle data with:
 * - Player-based queries (User p1/p2 participants)
 * - Battle state management (Pending → Active → Finished/Aborted)
 * - Battle log storage and retrieval
 * - Result tracking and statistics
 * - RLS context integration for security
 *
 * @module services/battle-repository
 * @see prisma/schema.prisma - Battle model
 * @see src/services/rls-context.ts - RLS context management
 */

import { PrismaClient, Prisma, type Battle, type User } from "../generated/prisma/client.js";
import type { RlsUserContext } from "./rls-context.js";
import { setUserContext, clearUserContext } from "./rls-context.js";

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Battle states
 */
export type BattleState = "Pending" | "Active" | "Finished" | "Aborted";

/**
 * Battle result structure
 */
export interface BattleResult {
  winnerId: string | null;
  loserId: string | null;
  isDraw: boolean;
  turns: number;
  forfeit: boolean;
  forfeitedBy?: string;
  endReason: "knockout" | "forfeit" | "draw" | "timeout" | "error";
}

/**
 * Compact log entry for battle replay
 */
export interface CompactLogEntry {
  turn: number;
  action: string;
  actor: "p1" | "p2";
  target?: string;
  damage?: number;
  effect?: string;
}

/**
 * Full log entry with detailed information
 */
export interface FullLogEntry extends CompactLogEntry {
  timestamp: number;
  stateSnapshot?: {
    p1Hp: number[];
    p2Hp: number[];
    p1Active: number;
    p2Active: number;
  };
}

/**
 * Battle with participant user data
 */
export interface BattleWithUsers extends Battle {
  p1: User;
  p2: User;
}

/**
 * Battle creation data
 */
export interface CreateBattleData {
  p1Id: string;
  p2Id: string;
  arenaThreadId?: string;
  rngSeed: string;
  ruleset: string;
  tenantId?: string;
  trainer1Id?: string;
  trainer2Id?: string;
}

/**
 * Battle update data (partial)
 */
export interface UpdateBattleData {
  state?: BattleState;
  logCompact?: CompactLogEntry[];
  logFull?: FullLogEntry[];
  resultJson?: BattleResult;
  endedAt?: Date;
  arenaThreadId?: string;
}

/**
 * Battle filter options
 */
export interface BattleFilterOptions {
  state?: BattleState;
  states?: BattleState[];
  afterDate?: Date;
  beforeDate?: Date;
  hasResult?: boolean;
}

/**
 * Battle statistics for a user
 */
export interface BattleStats {
  totalBattles: number;
  wins: number;
  losses: number;
  draws: number;
  forfeits: number;
  winRate: number;
  averageTurns: number;
  longestBattle: number;
  currentStreak: number;
  bestStreak: number;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  page: number;
  pageSize: number;
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// =============================================================================
// Battle Repository Implementation
// =============================================================================

/**
 * Battle Repository
 *
 * Standalone implementation for type safety and battle-specific operations.
 */
export class BattleRepository {
  private readonly prisma: PrismaClient;
  private readonly rlsContext?: RlsUserContext;

  constructor(prisma: PrismaClient, rlsContext?: RlsUserContext) {
    this.prisma = prisma;
    this.rlsContext = rlsContext;
  }

  // ===========================================================================
  // RLS Context Management
  // ===========================================================================

  /**
   * Execute operation with RLS context if configured
   */
  private async withRls<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.rlsContext) {
      return operation();
    }

    await setUserContext(this.prisma, this.rlsContext);
    try {
      return await operation();
    } finally {
      await clearUserContext(this.prisma);
    }
  }

  // ===========================================================================
  // Basic CRUD Operations
  // ===========================================================================

  /**
   * Find battle by ID
   */
  async findById(id: string): Promise<Battle | null> {
    return this.withRls(async () => {
      return this.prisma.battle.findUnique({
        where: { id },
      });
    });
  }

  /**
   * Find battle by ID with participant data
   */
  async findByIdWithUsers(id: string): Promise<BattleWithUsers | null> {
    return this.withRls(async () => {
      return this.prisma.battle.findUnique({
        where: { id },
        include: { p1: true, p2: true },
      });
    });
  }

  /**
   * Find battle by arena thread ID
   */
  async findByArenaThread(arenaThreadId: string): Promise<Battle | null> {
    return this.withRls(async () => {
      return this.prisma.battle.findFirst({
        where: { arenaThreadId },
        orderBy: { startedAt: "desc" },
      });
    });
  }

  /**
   * Create a new battle
   */
  async create(data: CreateBattleData): Promise<Battle> {
    return this.withRls(async () => {
      return this.prisma.battle.create({
        data: {
          p1Id: data.p1Id,
          p2Id: data.p2Id,
          arenaThreadId: data.arenaThreadId,
          state: "Pending",
          rngSeed: data.rngSeed,
          ruleset: data.ruleset,
          tenantId: data.tenantId,
          trainer1Id: data.trainer1Id,
          trainer2Id: data.trainer2Id,
        },
      });
    });
  }

  /**
   * Update a battle
   */
  async update(id: string, data: UpdateBattleData): Promise<Battle> {
    return this.withRls(async () => {
      const updateData: Prisma.BattleUpdateInput = {};

      if (data.state !== undefined) updateData.state = data.state;
      if (data.logCompact !== undefined) updateData.logCompact = data.logCompact as Prisma.InputJsonValue;
      if (data.logFull !== undefined) updateData.logFull = data.logFull as Prisma.InputJsonValue;
      if (data.resultJson !== undefined) updateData.resultJson = data.resultJson as Prisma.InputJsonValue;
      if (data.endedAt !== undefined) updateData.endedAt = data.endedAt;
      if (data.arenaThreadId !== undefined) updateData.arenaThreadId = data.arenaThreadId;

      return this.prisma.battle.update({
        where: { id },
        data: updateData,
      });
    });
  }

  /**
   * Delete a battle (for cleanup/admin purposes)
   */
  async delete(id: string): Promise<void> {
    return this.withRls(async () => {
      await this.prisma.battle.delete({ where: { id } });
    });
  }

  // ===========================================================================
  // State Management
  // ===========================================================================

  /**
   * Start a pending battle (transition to Active)
   */
  async startBattle(id: string): Promise<Battle> {
    return this.withRls(async () => {
      const battle = await this.prisma.battle.findUnique({
        where: { id },
        select: { state: true },
      });

      if (!battle) {
        throw new Error(`Battle ${id} not found`);
      }

      if (battle.state !== "Pending") {
        throw new Error(`Battle ${id} cannot be started from state: ${battle.state}`);
      }

      return this.prisma.battle.update({
        where: { id },
        data: { state: "Active" },
      });
    });
  }

  /**
   * Finish a battle with result
   */
  async finishBattle(id: string, result: BattleResult): Promise<Battle> {
    return this.withRls(async () => {
      const battle = await this.prisma.battle.findUnique({
        where: { id },
        select: { state: true },
      });

      if (!battle) {
        throw new Error(`Battle ${id} not found`);
      }

      if (battle.state !== "Active") {
        throw new Error(`Battle ${id} cannot be finished from state: ${battle.state}`);
      }

      return this.prisma.battle.update({
        where: { id },
        data: {
          state: "Finished",
          resultJson: result as Prisma.InputJsonValue,
          endedAt: new Date(),
        },
      });
    });
  }

  /**
   * Abort a battle
   */
  async abortBattle(id: string, _reason?: string): Promise<Battle> {
    return this.withRls(async () => {
      const battle = await this.prisma.battle.findUnique({
        where: { id },
        select: { state: true },
      });

      if (!battle) {
        throw new Error(`Battle ${id} not found`);
      }

      if (battle.state === "Finished" || battle.state === "Aborted") {
        throw new Error(`Battle ${id} cannot be aborted from state: ${battle.state}`);
      }

      const result: BattleResult = {
        winnerId: null,
        loserId: null,
        isDraw: false,
        turns: 0,
        forfeit: false,
        endReason: "error",
      };

      return this.prisma.battle.update({
        where: { id },
        data: {
          state: "Aborted",
          resultJson: result as Prisma.InputJsonValue,
          endedAt: new Date(),
        },
      });
    });
  }

  /**
   * Record forfeit
   */
  async forfeitBattle(id: string, forfeitingUserId: string, turns: number): Promise<Battle> {
    return this.withRls(async () => {
      const battle = await this.prisma.battle.findUnique({
        where: { id },
        select: { state: true, p1Id: true, p2Id: true },
      });

      if (!battle) {
        throw new Error(`Battle ${id} not found`);
      }

      if (battle.state !== "Active") {
        throw new Error(`Battle ${id} cannot be forfeited from state: ${battle.state}`);
      }

      const winnerId = forfeitingUserId === battle.p1Id ? battle.p2Id : battle.p1Id;
      const result: BattleResult = {
        winnerId,
        loserId: forfeitingUserId,
        isDraw: false,
        turns,
        forfeit: true,
        forfeitedBy: forfeitingUserId,
        endReason: "forfeit",
      };

      return this.prisma.battle.update({
        where: { id },
        data: {
          state: "Finished",
          resultJson: result as Prisma.InputJsonValue,
          endedAt: new Date(),
        },
      });
    });
  }

  // ===========================================================================
  // Log Management
  // ===========================================================================

  /**
   * Append to compact log
   */
  async appendCompactLog(id: string, entry: CompactLogEntry): Promise<Battle> {
    return this.withRls(async () => {
      const battle = await this.prisma.battle.findUnique({
        where: { id },
        select: { logCompact: true },
      });

      if (!battle) {
        throw new Error(`Battle ${id} not found`);
      }

      const currentLog = (battle.logCompact as CompactLogEntry[] | null) ?? [];
      const updatedLog = [...currentLog, entry];

      return this.prisma.battle.update({
        where: { id },
        data: { logCompact: updatedLog as Prisma.InputJsonValue },
      });
    });
  }

  /**
   * Append to full log
   */
  async appendFullLog(id: string, entry: FullLogEntry): Promise<Battle> {
    return this.withRls(async () => {
      const battle = await this.prisma.battle.findUnique({
        where: { id },
        select: { logFull: true },
      });

      if (!battle) {
        throw new Error(`Battle ${id} not found`);
      }

      const currentLog = (battle.logFull as FullLogEntry[] | null) ?? [];
      const updatedLog = [...currentLog, entry];

      return this.prisma.battle.update({
        where: { id },
        data: { logFull: updatedLog as Prisma.InputJsonValue },
      });
    });
  }

  /**
   * Get compact log
   */
  async getCompactLog(id: string): Promise<CompactLogEntry[]> {
    return this.withRls(async () => {
      const battle = await this.prisma.battle.findUnique({
        where: { id },
        select: { logCompact: true },
      });

      if (!battle) {
        throw new Error(`Battle ${id} not found`);
      }

      return (battle.logCompact as CompactLogEntry[] | null) ?? [];
    });
  }

  /**
   * Get full log
   */
  async getFullLog(id: string): Promise<FullLogEntry[]> {
    return this.withRls(async () => {
      const battle = await this.prisma.battle.findUnique({
        where: { id },
        select: { logFull: true },
      });

      if (!battle) {
        throw new Error(`Battle ${id} not found`);
      }

      return (battle.logFull as FullLogEntry[] | null) ?? [];
    });
  }

  // ===========================================================================
  // User Queries
  // ===========================================================================

  /**
   * Find battles by user ID (as either participant)
   */
  async findByUserId(userId: string, filters?: BattleFilterOptions): Promise<Battle[]> {
    return this.withRls(async () => {
      const where = this.buildWhereForUser(userId, filters);

      return this.prisma.battle.findMany({
        where,
        orderBy: { startedAt: "desc" },
      });
    });
  }

  /**
   * Find battles by user with pagination
   */
  async findByUserIdPaginated(
    userId: string,
    options: PaginationOptions,
    filters?: BattleFilterOptions
  ): Promise<PaginatedResult<Battle>> {
    return this.withRls(async () => {
      const { page, pageSize } = options;
      const skip = (page - 1) * pageSize;
      const where = this.buildWhereForUser(userId, filters);

      const [data, total] = await Promise.all([
        this.prisma.battle.findMany({
          where,
          orderBy: { startedAt: "desc" },
          skip,
          take: pageSize,
        }),
        this.prisma.battle.count({ where }),
      ]);

      return {
        data,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    });
  }

  /**
   * Find active battle for user
   */
  async findActiveBattle(userId: string): Promise<Battle | null> {
    return this.withRls(async () => {
      return this.prisma.battle.findFirst({
        where: {
          OR: [{ p1Id: userId }, { p2Id: userId }],
          state: "Active",
        },
        orderBy: { startedAt: "desc" },
      });
    });
  }

  /**
   * Find pending battle for user
   */
  async findPendingBattle(userId: string): Promise<Battle | null> {
    return this.withRls(async () => {
      return this.prisma.battle.findFirst({
        where: {
          OR: [{ p1Id: userId }, { p2Id: userId }],
          state: "Pending",
        },
        orderBy: { startedAt: "desc" },
      });
    });
  }

  /**
   * Check if user has active battle
   */
  async hasActiveBattle(userId: string): Promise<boolean> {
    return this.withRls(async () => {
      const count = await this.prisma.battle.count({
        where: {
          OR: [{ p1Id: userId }, { p2Id: userId }],
          state: "Active",
        },
      });
      return count > 0;
    });
  }

  /**
   * Build where clause for user queries
   */
  private buildWhereForUser(
    userId: string,
    filters?: BattleFilterOptions
  ): Prisma.BattleWhereInput {
    const where: Prisma.BattleWhereInput = {
      OR: [{ p1Id: userId }, { p2Id: userId }],
    };

    if (filters?.state) {
      where.state = filters.state;
    }

    if (filters?.states && filters.states.length > 0) {
      where.state = { in: filters.states };
    }

    if (filters?.afterDate) {
      where.startedAt = { ...(where.startedAt as object), gte: filters.afterDate };
    }

    if (filters?.beforeDate) {
      where.startedAt = { ...(where.startedAt as object), lte: filters.beforeDate };
    }

    if (filters?.hasResult !== undefined) {
      if (filters.hasResult) {
        where.resultJson = { not: Prisma.DbNull };
      } else {
        where.resultJson = { equals: Prisma.DbNull };
      }
    }

    return where;
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get battle statistics for a user
   */
  async getStats(userId: string): Promise<BattleStats> {
    return this.withRls(async () => {
      // Get all finished battles for user
      const battles = await this.prisma.battle.findMany({
        where: {
          OR: [{ p1Id: userId }, { p2Id: userId }],
          state: "Finished",
          resultJson: { not: null },
        },
        select: {
          p1Id: true,
          p2Id: true,
          resultJson: true,
          startedAt: true,
          endedAt: true,
        },
        orderBy: { endedAt: "desc" },
      });

      const total = battles.length;
      let wins = 0;
      let losses = 0;
      let draws = 0;
      let forfeits = 0;
      let totalTurns = 0;
      let longestBattle = 0;
      let currentStreak = 0;
      let bestStreak = 0;
      let onStreak = true;

      for (const battle of battles) {
        const result = battle.resultJson as BattleResult | null;
        if (!result) continue;

        totalTurns += result.turns;
        longestBattle = Math.max(longestBattle, result.turns);

        if (result.isDraw) {
          draws++;
          onStreak = false;
        } else if (result.winnerId === userId) {
          wins++;
          if (onStreak) {
            currentStreak++;
            bestStreak = Math.max(bestStreak, currentStreak);
          }
        } else {
          losses++;
          if (result.forfeit && result.forfeitedBy === userId) {
            forfeits++;
          }
          onStreak = false;
          currentStreak = 0;
        }
      }

      return {
        totalBattles: total,
        wins,
        losses,
        draws,
        forfeits,
        winRate: total > 0 ? Math.round((wins / total) * 1000) / 10 : 0,
        averageTurns: total > 0 ? Math.round((totalTurns / total) * 10) / 10 : 0,
        longestBattle,
        currentStreak,
        bestStreak,
      };
    });
  }

  /**
   * Get recent battles for a user
   */
  async getRecentBattles(userId: string, limit: number = 10): Promise<BattleWithUsers[]> {
    return this.withRls(async () => {
      return this.prisma.battle.findMany({
        where: {
          OR: [{ p1Id: userId }, { p2Id: userId }],
          state: "Finished",
        },
        include: { p1: true, p2: true },
        orderBy: { endedAt: "desc" },
        take: limit,
      });
    });
  }

  /**
   * Get head-to-head record between two users
   */
  async getHeadToHead(
    user1Id: string,
    user2Id: string
  ): Promise<{ user1Wins: number; user2Wins: number; draws: number; total: number }> {
    return this.withRls(async () => {
      const battles = await this.prisma.battle.findMany({
        where: {
          state: "Finished",
          resultJson: { not: null },
          OR: [
            { p1Id: user1Id, p2Id: user2Id },
            { p1Id: user2Id, p2Id: user1Id },
          ],
        },
        select: { resultJson: true },
      });

      let user1Wins = 0;
      let user2Wins = 0;
      let draws = 0;

      for (const battle of battles) {
        const result = battle.resultJson as BattleResult | null;
        if (!result) continue;

        if (result.isDraw) {
          draws++;
        } else if (result.winnerId === user1Id) {
          user1Wins++;
        } else if (result.winnerId === user2Id) {
          user2Wins++;
        }
      }

      return {
        user1Wins,
        user2Wins,
        draws,
        total: battles.length,
      };
    });
  }

  // ===========================================================================
  // Bulk Operations
  // ===========================================================================

  /**
   * Clean up old aborted battles
   */
  async cleanupAborted(olderThan: Date): Promise<number> {
    return this.withRls(async () => {
      const result = await this.prisma.battle.deleteMany({
        where: {
          state: "Aborted",
          endedAt: { lt: olderThan },
        },
      });
      return result.count;
    });
  }

  /**
   * Count battles by state
   */
  async countByState(): Promise<Record<BattleState, number>> {
    return this.withRls(async () => {
      const counts = await this.prisma.battle.groupBy({
        by: ["state"],
        _count: true,
      });

      const result: Record<BattleState, number> = {
        Pending: 0,
        Active: 0,
        Finished: 0,
        Aborted: 0,
      };

      for (const item of counts) {
        result[item.state as BattleState] = item._count;
      }

      return result;
    });
  }

  // ===========================================================================
  // Factory Methods
  // ===========================================================================

  /**
   * Create repository instance with RLS context
   */
  static withContext(prisma: PrismaClient, rlsContext: RlsUserContext): BattleRepository {
    return new BattleRepository(prisma, rlsContext);
  }

  /**
   * Create repository instance without RLS (for admin operations)
   */
  static withoutRls(prisma: PrismaClient): BattleRepository {
    return new BattleRepository(prisma);
  }
}

// =============================================================================
// Export Default Instance Factory
// =============================================================================

/**
 * Create a new BattleRepository instance
 */
export function createBattleRepository(
  prisma: PrismaClient,
  rlsContext?: RlsUserContext
): BattleRepository {
  return new BattleRepository(prisma, rlsContext);
}
