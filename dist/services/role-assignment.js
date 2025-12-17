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
import { acquireLock, releaseLock, } from "./distributed-lock.js";
import { recordRoleAssignment, recordRoleAssignmentDuration, } from "./prometheus-metrics.js";
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
export async function assignRole(member, options) {
    const startTime = Date.now(); // Track duration for Prometheus histogram
    const { origin = "unspecified", role: providedRole = null, findRole, enforcePermissions, cache, cacheTTL = 24, activityTracker, log, report, describeGuild, describeMember, describeRole, recordArchive = null, } = options;
    // Step 1: Member Validation
    if (!member || !member.guild || !member.id || !member.user) {
        log("warn", "Cannot assign role: invalid member object", {
            origin,
            memberId: member?.id || "unknown",
            hasGuild: Boolean(member?.guild),
            hasUser: Boolean(member?.user),
        });
        // Record failed assignment (Week 3 Day 20-21)
        recordRoleAssignment(origin, member?.guild?.id || "unknown", member?.guild?.name || "unknown", "failed-invalid-member");
        recordRoleAssignmentDuration(origin, "failed", (Date.now() - startTime) / 1000);
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
        report("Role Missing", {
            origin,
            guild: guildSummary,
            member: memberSummary,
        }, "warn");
        // Record failed assignment (Week 3 Day 20-21)
        recordRoleAssignment(origin, member.guild.id, member.guild.name, "failed-role-not-found");
        recordRoleAssignmentDuration(origin, "failed", (Date.now() - startTime) / 1000);
        return { success: false, reason: "role-not-found" };
    }
    // Step 4: Pre-Assignment Checks (Optional - caller can handle)
    // Some callers check hasNoAssignableRoles(), others check member.roles.cache.has()
    // This flexibility allows different assignment strategies
    // Step 5: Permission Enforcement (SECURITY FIX: Week 2 Day 11-12)
    try {
        enforcePermissions(member.guild, role);
    }
    catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        log("error", "[SECURITY] Permission violation - cannot assign role", {
            origin,
            guild: guildSummary,
            member: memberSummary,
            role: describeRole(role),
            reason: err.message,
        });
        // Record failed assignment (Week 3 Day 20-21)
        recordRoleAssignment(origin, member.guild.id, member.guild.name, "failed-permission-denied");
        recordRoleAssignmentDuration(origin, "failed", (Date.now() - startTime) / 1000);
        return { success: false, reason: "permission-denied", error: err };
    }
    // Step 6: Distributed Lock Acquisition (SECURITY FIX: Week 1 Day 3-5)
    const lockKey = `assign:${member.guild.id}:${member.id}:${role.id}`;
    const lock = await acquireLock(lockKey, 5000); // 5-second TTL
    if (!lock) {
        log("warn", "Concurrent role assignment detected - skipping (protected by distributed lock)", {
            origin,
            guild: guildSummary,
            member: memberSummary,
            role: describeRole(role),
            reason: "lock_acquisition_failed",
        });
        return { success: false, reason: "lock-failed", locked: false };
    }
    try {
        // Step 7: Cache Check (Inside Lock)
        const cacheKey = lockKey;
        const cached = cache.readCache(cacheKey);
        if (cached &&
            cached.assigned &&
            Date.now() - cached.timestamp < cacheTTL * 3600 * 1000) {
            report("Assignment Skipped (Cache)", {
                origin,
                guild: guildSummary,
                member: memberSummary,
                role: describeRole(role),
                cachedAt: new Date(cached.timestamp).toISOString(),
                ttlHours: cacheTTL,
            }, "detail");
            return { success: false, reason: "cached", cached: true, locked: true };
        }
        // Step 8: Role Assignment (Discord API)
        await member.roles.add(role);
        // Step 9: Success Reporting
        report("Assignment Success", {
            origin,
            guild: guildSummary,
            member: memberSummary,
            role: describeRole(role),
        }, "success");
        // Step 10: Activity Tracking
        activityTracker.recordActivity("role-assignment", `Assigned ${describeRole(role)} to ${memberSummary}`, {
            origin,
            guild: guildSummary,
            member: memberSummary,
            role: describeRole(role),
        });
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
        recordRoleAssignmentDuration(origin, "success", (Date.now() - startTime) / 1000);
        return { success: true, reason: "assigned", cached: false, locked: true };
    }
    catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        // Step 14: Error Handling
        report("Assignment Error", {
            origin,
            guild: guildSummary,
            member: memberSummary,
            role: describeRole(role),
            error: err.message,
        }, "error");
        log("error", "Role assignment failed", {
            origin,
            guild: guildSummary,
            member: memberSummary,
            role: describeRole(role),
            error: err.message,
            stack: err.stack,
        });
        // Record failed assignment (Week 3 Day 20-21)
        recordRoleAssignment(origin, member.guild.id, member.guild.name, "failed-error");
        recordRoleAssignmentDuration(origin, "failed", (Date.now() - startTime) / 1000);
        return { success: false, reason: "assignment-error", error: err, locked: true };
    }
    finally {
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
export async function assignRoleBatch(members, options) {
    const { concurrency = 5, delayMs = 1000, ...assignOptions } = options;
    const results = {
        assigned: 0,
        skipped: 0,
        failed: 0,
        errors: [],
    };
    // Process in batches to avoid overwhelming Discord API
    for (let i = 0; i < members.length; i += concurrency) {
        const batch = members.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map((member) => assignRole(member, assignOptions)));
        // Aggregate results
        batchResults.forEach((result) => {
            if (result.success) {
                results.assigned++;
            }
            else if (result.cached || result.skipped) {
                results.skipped++;
            }
            else {
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
export function shouldAssignRole(member, role, hasNoAssignableRoles) {
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
