/**
 * @file role-assignment.ts
 * @description ARCHITECTURE OPTIMIZATION: Unified Role Assignment Logic
 * Week 3 Day 15-17: Consolidates 600+ lines of duplicate assignment logic
 *
 * Single source of truth for Trainer role assignment across all origins:
 * - member-join: New member auto-assignment
 * - member-update: Healing/backfill operations
 * - sweep: Mass assignment operations
 * - manual: Admin-triggered assignments
 *
 * Security features included:
 * - Distributed locking (race condition protection)
 * - Permission enforcement (strict validation)
 * - Cache management (TTL-based deduplication)
 * - Activity tracking (audit trail)
 *
 * Observability (Week 3 Day 20-21):
 * - Prometheus metrics instrumentation
 * - Role assignment counters and duration histograms
 * @module services/role-assignment
 */

import type { GuildMember, Role, Guild } from "discord.js";
import {
  acquireLock,
  releaseLock,
  type Lock,
} from "./distributed-lock.js";
import {
  recordRoleAssignment,
  recordRoleAssignmentDuration,
} from "./prometheus-metrics.js";
import { ensureError } from "../shared/utils/error-utils.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types & Interfaces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cache service interface for role assignment deduplication
 */
export interface CacheService {
  readCache: <T = unknown>(key: string) => T | null;
  writeCache: (key: string, data: unknown) => void;
}

/**
 * Cached assignment data
 */
export interface CachedAssignment {
  assigned: boolean;
  timestamp: number;
}

/**
 * Activity tracker interface
 */
export interface ActivityTracker {
  recordActivity: (
    type: string,
    message: string,
    metadata: Record<string, unknown>
  ) => void;
}

/**
 * Archive record for role assignments
 */
export interface ArchiveRecord {
  timestamp: number;
  type: "add" | "remove";
  guild: string;
  member: string;
  role: string;
  origin: string;
}

/**
 * Log function type
 */
export type LogFunction = (
  level: "info" | "warn" | "error" | "debug" | "detail",
  message: string,
  meta?: Record<string, unknown>
) => void;

/**
 * Report function type
 */
export type ReportFunction = (
  title: string,
  data: Record<string, unknown>,
  level?: "info" | "warn" | "error" | "success" | "detail"
) => void;

/**
 * Descriptor function type
 */
export type DescriptorFunction<T> = (item: T) => string;

/**
 * Role assignment origin types
 */
export type AssignmentOrigin =
  | "member-join"
  | "member-update"
  | "sweep"
  | "manual"
  | "unspecified";

/**
 * Assignment result status reasons
 */
export type AssignmentReason =
  | "assigned"
  | "invalid-member"
  | "bot-member"
  | "role-not-found"
  | "permission-denied"
  | "lock-failed"
  | "cached"
  | "assignment-error";

/**
 * Role assignment options
 */
export interface AssignRoleOptions {
  /** Assignment origin (member-join, member-update, sweep, manual) */
  origin?: AssignmentOrigin;
  /** Target role to assign (optional if using findRole) */
  role?: Role | null;
  /** Function to resolve role from guild */
  findRole: (guild: Guild) => Role | undefined | null;
  /** Permission validation function */
  enforcePermissions: (guild: Guild, role: Role) => void;
  /** Cache service for deduplication */
  cache: CacheService;
  /** Cache TTL in hours */
  cacheTTL?: number;
  /** Activity tracking service */
  activityTracker: ActivityTracker;
  /** Logging function */
  log: LogFunction;
  /** Reporting function */
  report: ReportFunction;
  /** Guild descriptor function */
  describeGuild: DescriptorFunction<Guild>;
  /** Member descriptor function */
  describeMember: DescriptorFunction<GuildMember>;
  /** Role descriptor function */
  describeRole: DescriptorFunction<Role>;
  /** Archive recording function (optional) */
  recordArchive?: ((record: ArchiveRecord) => void) | null;
}

/**
 * Role assignment result
 */
export interface AssignRoleResult {
  success: boolean;
  reason: AssignmentReason;
  cached?: boolean;
  locked?: boolean;
  skipped?: boolean;
  error?: Error;
}

/**
 * Batch assignment options (extends single assignment options)
 */
export interface AssignRoleBatchOptions extends AssignRoleOptions {
  /** Max concurrent assignments (default: 5) */
  concurrency?: number;
  /** Delay between batches in ms (default: 1000) */
  delayMs?: number;
}

/**
 * Batch assignment result
 */
export interface BatchResult {
  assigned: number;
  skipped: number;
  failed: number;
  errors: Array<{
    member: string | undefined;
    error: string;
  }>;
}

/**
 * Should assign check result
 */
export interface ShouldAssignResult {
  shouldAssign: boolean;
  reason: "already-has-role" | "has-other-roles" | "eligible";
}

/**
 * Function to check if member has no assignable roles
 */
export type HasNoAssignableRolesFunction = (member: GuildMember) => boolean;

// ─────────────────────────────────────────────────────────────────────────────
// Role Assignment Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unified role assignment function with comprehensive error handling
 *
 * @param member - Discord guild member to assign role
 * @param options - Assignment configuration
 * @returns Assignment result { success, reason, cached, locked }
 */
export async function assignRole(
  member: GuildMember | null | undefined,
  options: AssignRoleOptions
): Promise<AssignRoleResult> {
  const startTime = Date.now(); // Track duration for Prometheus histogram

  const {
    origin = "unspecified",
    role: providedRole = null,
    findRole,
    enforcePermissions,
    cache,
    cacheTTL = 24,
    activityTracker,
    log,
    report,
    describeGuild,
    describeMember,
    describeRole,
    recordArchive = null,
  } = options;

  // Step 1: Member Validation
  if (!member || !member.guild || !member.id || !member.user) {
    log("warn", "Cannot assign role: invalid member object", {
      origin,
      memberId: member?.id || "unknown",
      hasGuild: Boolean(member?.guild),
      hasUser: Boolean(member?.user),
    });

    // Record failed assignment (Week 3 Day 20-21)
    recordRoleAssignment(
      origin,
      member?.guild?.id || "unknown",
      member?.guild?.name || "unknown",
      "failed-invalid-member"
    );
    recordRoleAssignmentDuration(
      origin,
      "failed",
      (Date.now() - startTime) / 1000
    );

    return { success: false, reason: "invalid-member" };
  }

  // Step 2: Bot Check
  if (member.user.bot) {
    return { success: false, reason: "bot-member", skipped: true };
  }

  const guildSummary = describeGuild(member.guild);
  const memberSummary = describeMember(member);

  // Step 3: Role Resolution
  const role = providedRole || findRole(member.guild);
  if (!role) {
    report(
      "Role Missing",
      {
        origin,
        guild: guildSummary,
        member: memberSummary,
      },
      "warn"
    );

    // Record failed assignment (Week 3 Day 20-21)
    recordRoleAssignment(
      origin,
      member.guild.id,
      member.guild.name,
      "failed-role-not-found"
    );
    recordRoleAssignmentDuration(
      origin,
      "failed",
      (Date.now() - startTime) / 1000
    );

    return { success: false, reason: "role-not-found" };
  }

  // Step 4: Pre-Assignment Checks (Optional - caller can handle)
  // Some callers check hasNoAssignableRoles(), others check member.roles.cache.has()
  // This flexibility allows different assignment strategies

  // Step 5: Permission Enforcement (SECURITY FIX: Week 2 Day 11-12)
  try {
    enforcePermissions(member.guild, role);
  } catch (error) {
    const err = ensureError(error);
    log("error", "[SECURITY] Permission violation - cannot assign role", {
      origin,
      guild: guildSummary,
      member: memberSummary,
      role: describeRole(role),
      reason: err.message,
    });

    // Record failed assignment (Week 3 Day 20-21)
    recordRoleAssignment(
      origin,
      member.guild.id,
      member.guild.name,
      "failed-permission-denied"
    );
    recordRoleAssignmentDuration(
      origin,
      "failed",
      (Date.now() - startTime) / 1000
    );

    return { success: false, reason: "permission-denied", error: err };
  }

  // Step 6: Distributed Lock Acquisition (SECURITY FIX: Week 1 Day 3-5)
  const lockKey = `assign:${member.guild.id}:${member.id}:${role.id}`;
  const lock: Lock | null = await acquireLock(lockKey, 5000); // 5-second TTL

  if (!lock) {
    log(
      "warn",
      "Concurrent role assignment detected - skipping (protected by distributed lock)",
      {
        origin,
        guild: guildSummary,
        member: memberSummary,
        role: describeRole(role),
        reason: "lock_acquisition_failed",
      }
    );
    return { success: false, reason: "lock-failed", locked: false };
  }

  try {
    // Step 7: Cache Check (Inside Lock)
    const cacheKey = lockKey;
    const cached = cache.readCache<CachedAssignment>(cacheKey);
    if (
      cached &&
      cached.assigned &&
      Date.now() - cached.timestamp < cacheTTL * 3600 * 1000
    ) {
      report(
        "Assignment Skipped (Cache)",
        {
          origin,
          guild: guildSummary,
          member: memberSummary,
          role: describeRole(role),
          cachedAt: new Date(cached.timestamp).toISOString(),
          ttlHours: cacheTTL,
        },
        "detail"
      );
      return { success: false, reason: "cached", cached: true, locked: true };
    }

    // Step 8: Role Assignment (Discord API)
    await member.roles.add(role);

    // Step 9: Success Reporting
    report(
      "Assignment Success",
      {
        origin,
        guild: guildSummary,
        member: memberSummary,
        role: describeRole(role),
      },
      "success"
    );

    // Step 10: Activity Tracking
    activityTracker.recordActivity(
      "role-assignment",
      `Assigned ${describeRole(role)} to ${memberSummary}`,
      {
        origin,
        guild: guildSummary,
        member: memberSummary,
        role: describeRole(role),
      }
    );

    // Step 11: Archive Recording (Optional)
    if (recordArchive) {
      recordArchive({
        timestamp: Date.now(),
        type: "add",
        guild: guildSummary,
        member: memberSummary,
        role: describeRole(role),
        origin,
      });
    }

    // Step 12: Cache Write
    cache.writeCache(cacheKey, { assigned: true, timestamp: Date.now() });

    // Step 13: Prometheus Metrics (Week 3 Day 20-21)
    recordRoleAssignment(origin, member.guild.id, member.guild.name, "success");
    recordRoleAssignmentDuration(
      origin,
      "success",
      (Date.now() - startTime) / 1000
    );

    return { success: true, reason: "assigned", cached: false, locked: true };
  } catch (error) {
    const err = ensureError(error);

    // Step 14: Error Handling
    report(
      "Assignment Error",
      {
        origin,
        guild: guildSummary,
        member: memberSummary,
        role: describeRole(role),
        error: err.message,
      },
      "error"
    );

    log("error", "Role assignment failed", {
      origin,
      guild: guildSummary,
      member: memberSummary,
      role: describeRole(role),
      error: err.message,
      stack: err.stack,
    });

    // Record failed assignment (Week 3 Day 20-21)
    recordRoleAssignment(
      origin,
      member.guild.id,
      member.guild.name,
      "failed-error"
    );
    recordRoleAssignmentDuration(
      origin,
      "failed",
      (Date.now() - startTime) / 1000
    );

    return { success: false, reason: "assignment-error", error: err, locked: true };
  } finally {
    // Step 15: Lock Release (Always)
    await releaseLock(lock);
  }
}

/**
 * Batch role assignment with concurrency control and DoS protection
 * Used for sweep operations processing multiple members
 *
 * @param members - Members to assign role
 * @param options - Same as assignRole() options plus concurrency settings
 * @returns Batch result { assigned, skipped, failed, errors }
 */
export async function assignRoleBatch(
  members: GuildMember[],
  options: AssignRoleBatchOptions
): Promise<BatchResult> {
  const { concurrency = 5, delayMs = 1000, ...assignOptions } = options;

  const results: BatchResult = {
    assigned: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  // Process in batches to avoid overwhelming Discord API
  for (let i = 0; i < members.length; i += concurrency) {
    const batch = members.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map((member) => assignRole(member, assignOptions))
    );

    // Aggregate results
    batchResults.forEach((result) => {
      if (result.success) {
        results.assigned++;
      } else if (result.cached || result.skipped) {
        results.skipped++;
      } else {
        results.failed++;
        if (result.error) {
          results.errors.push({
            member: undefined, // Member info not preserved in result
            error: result.error.message,
          });
        }
      }
    });

    // Delay between batches (except last batch)
    if (i + concurrency < members.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

/**
 * Check if member should receive role assignment
 * Combines various business logic checks into single function
 *
 * @param member - Member to check
 * @param role - Target role
 * @param hasNoAssignableRoles - Function to check if member has no roles
 * @returns Check result { shouldAssign, reason }
 */
export function shouldAssignRole(
  member: GuildMember,
  role: Role,
  hasNoAssignableRoles: HasNoAssignableRolesFunction
): ShouldAssignResult {
  // Check 1: Member already has role
  if (member.roles.cache.has(role.id)) {
    return { shouldAssign: false, reason: "already-has-role" };
  }

  // Check 2: Member has other assignable roles (ensureTrainerFor pattern)
  if (!hasNoAssignableRoles(member)) {
    return { shouldAssign: false, reason: "has-other-roles" };
  }

  return { shouldAssign: true, reason: "eligible" };
}
