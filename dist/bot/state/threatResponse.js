/**
 * Automated Threat Response Module
 * Responds to detected security threats with appropriate actions
 * @module bot/state/threatResponse
 *
 * Security Intelligence Phase 3: Automated Response
 *
 * Response Levels:
 * - CRITICAL (3): Immediate freeze + escalation + admin alert
 * - HIGH (2): Admin alert + detailed evidence
 * - MEDIUM (1): Detailed logging + monitoring queue
 * - LOW (0): Informational logging only
 *
 * Integration with:
 * - threatDetector.ts → Receives threat assessments
 * - Performs inline integrity checks (deleted roles, permission drift, missing assignments)
 * - dripAlerts.ts → Sends admin notifications
 * - roleArchive.ts → Gets historical context
 *
 * MITRE ATT&CK Techniques Addressed:
 * - T1098: Account Manipulation
 * - T1531: Account Access Removal
 * - T1078: Valid Accounts (compromised)
 */
import { log } from '../../utils/logger.js';
import { getErrorMessage } from '../../shared/utils/index.js';
import { emitAlert } from '../eventbus-integration.js';
// ─────────────────────────────────────────────────────────────────────────────
// Severity Mapping
// ─────────────────────────────────────────────────────────────────────────────
const SEVERITY_LEVELS = {
    'CRITICAL': 3,
    'HIGH': 2,
    'MEDIUM': 1,
    'LOW': 0
};
/**
 * Convert severity string to numeric level
 */
function getSeverityLevel(severity) {
    return SEVERITY_LEVELS[severity] || 0;
}
// ─────────────────────────────────────────────────────────────────────────────
// Permission Freezing
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Freeze guild permissions to prevent further damage
 * CRITICAL action - requires explicit enablement
 */
async function freezePermissions(guild, threat, dryRun = false) {
    if (dryRun) {
        log('warn', '[ThreatResponse] [DRY RUN] Would freeze guild permissions', {
            guild: guild.name,
            threat: threat.type
        });
        return {
            threat: threat.type,
            success: true,
            dryRun: true,
            frozenRoles: 0
        };
    }
    // TODO: Implement actual permission freezing
    // - Snapshot current permissions
    // - Remove MANAGE_ROLES from all roles except bot
    // - Store rollback state
    // - Notify admins
    log('warn', '[ThreatResponse] Permission freeze NOT IMPLEMENTED', {
        guild: guild.name,
        threat: threat.type,
        note: 'Requires explicit implementation for safety'
    });
    return {
        threat: threat.type,
        success: false,
        dryRun: false,
        error: 'Not implemented - safety measure',
        frozenRoles: 0
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Admin Alerts
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Send admin alert via Drip system
 */
async function sendAdminAlert(guild, threat, severityStr, dryRun = false) {
    const alertMessage = {
        title: `🚨 Security Alert: ${threat.type.replace(/_/g, ' ').toUpperCase()}`,
        severity: severityStr,
        guild: guild.name,
        guildId: guild.id,
        confidence: `${(threat.confidence * 100).toFixed(0)}%`,
        mitreAttack: threat.mitreAttack,
        evidence: threat.evidence,
        recommendedAction: threat.recommendedAction,
        detectedAt: new Date().toISOString()
    };
    if (dryRun) {
        log('info', '[ThreatResponse] [DRY RUN] Would send admin alert', { ...alertMessage });
        return {
            threat: threat.type,
            success: true,
            dryRun: true
        };
    }
    // Emit alert via EventBus (Phase 2 - replaces Drip TODO)
    try {
        const alertSeverity = alertMessage.severity === 'CRITICAL' ? 'critical' :
            alertMessage.severity === 'HIGH' ? 'high' : 'medium';
        emitAlert(alertSeverity, alertMessage.message || 'Security threat detected', {
            threatType: alertMessage.threatType,
            evidence: alertMessage.evidence,
            recommendedAction: alertMessage.recommendedAction,
            guildId: alertMessage.guildId,
            guildName: alertMessage.guildName,
        });
        log('success', '[ThreatResponse] Alert sent via EventBus', {
            severity: alertSeverity,
            threatType: alertMessage.threatType,
        });
        return {
            threat: threat.type,
            success: true,
            dryRun: false,
            alertSent: true,
        };
    }
    catch (error) {
        log('error', '[ThreatResponse] Failed to send alert via EventBus', {
            error: getErrorMessage(error),
            alertMessage,
        });
        return {
            threat: threat.type,
            success: false,
            dryRun: false,
            alertSent: false,
            error: getErrorMessage(error),
        };
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Main Response Handler
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Respond to detected security threats with appropriate actions
 *
 * @param threats - Array of threat objects from detectSecurityThreats()
 * @param guild - Discord guild object
 * @param roleArchive - Role change archive for context
 * @param options - Response configuration
 * @returns Response summary with actions taken
 */
export async function respondToThreats(threats, guild, roleArchive, options = {}) {
    const { dryRun = false, enableFreeze = false, // CRITICAL: Default disabled for safety
    enableAlerts = true, enableHealing = true } = options;
    // Suppress unused variable warning - roleArchive reserved for future healing
    void roleArchive;
    void enableHealing;
    const actions = {
        frozen: [],
        alerts: [],
        healed: [],
        logged: [],
        errors: []
    };
    log('info', '[ThreatResponse] Processing security threats', {
        threatCount: threats.length,
        dryRun,
        enableFreeze,
        enableAlerts,
        enableHealing
    });
    for (const threat of threats) {
        try {
            const severity = getSeverityLevel(threat.severity);
            // CRITICAL: Immediate freeze + escalation
            if (severity === 3) {
                if (enableFreeze) {
                    const freezeResult = await freezePermissions(guild, threat, dryRun);
                    actions.frozen.push(freezeResult);
                }
                if (enableAlerts) {
                    const alertResult = await sendAdminAlert(guild, threat, 'CRITICAL', dryRun);
                    actions.alerts.push({ ...alertResult, severity: 'CRITICAL' });
                }
            }
            // HIGH: Admin alert + detailed evidence
            else if (severity === 2) {
                if (enableAlerts) {
                    const alertResult = await sendAdminAlert(guild, threat, 'HIGH', dryRun);
                    actions.alerts.push({ ...alertResult, severity: 'HIGH' });
                }
            }
            // MEDIUM: Detailed logging + monitoring queue
            else if (severity === 1) {
                log('warn', `[ThreatResponse] MEDIUM threat logged for monitoring`, {
                    type: threat.type,
                    confidence: threat.confidence,
                    evidence: threat.evidence,
                    guild: guild.name
                });
                actions.logged.push({
                    threat: threat.type,
                    severity: 'MEDIUM'
                });
            }
            // LOW: Informational logging
            else {
                log('detail', `[ThreatResponse] LOW threat informational`, {
                    type: threat.type,
                    confidence: threat.confidence,
                    guild: guild.name
                });
                actions.logged.push({
                    threat: threat.type,
                    severity: 'LOW'
                });
            }
        }
        catch (error) {
            log('error', '[ThreatResponse] Error processing threat', {
                threat: threat.type,
                error: getErrorMessage(error)
            });
            actions.errors.push({
                threat: threat.type,
                error: getErrorMessage(error)
            });
        }
    }
    log('info', '[ThreatResponse] Threat processing complete', {
        frozen: actions.frozen.length,
        alerts: actions.alerts.length,
        healed: actions.healed.length,
        logged: actions.logged.length,
        errors: actions.errors.length
    });
    return actions;
}
// ─────────────────────────────────────────────────────────────────────────────
// Guild Integrity Verification
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Verify guild integrity against expected state
 * Detects unauthorized role deletions, permission drift, missing assignments
 *
 * @param guild - Discord guild object
 * @param roleArchive - Role change archive
 * @param expectedState - Expected guild configuration
 * @returns Integrity report with issues found
 */
export async function verifyGuildIntegrity(guild, roleArchive, expectedState = {}) {
    log('detail', '[ThreatResponse] Verifying guild integrity', {
        guild: guild.name,
        guildId: guild.id
    });
    const issues = {
        deletedRoles: [],
        modifiedPermissions: [],
        missingAssignments: [],
        unexpectedChanges: []
    };
    try {
        // Check for deleted roles (roles in archive but not in guild)
        if (roleArchive.statistics?.roleIds) {
            const currentRoleIds = new Set(guild.roles.cache.keys());
            for (const archivedRoleId of roleArchive.statistics.roleIds) {
                if (!currentRoleIds.has(archivedRoleId)) {
                    const roleData = roleArchive.changes.find(c => c.roleId === archivedRoleId);
                    issues.deletedRoles.push({
                        roleId: archivedRoleId,
                        roleName: roleData?.roleName || 'unknown',
                        lastSeen: roleData?.timestamp || 'unknown'
                    });
                }
            }
        }
        // Check for permission drift (roles with unexpected permissions)
        if (expectedState.roles) {
            for (const [roleId, expectedPerms] of Object.entries(expectedState.roles)) {
                const role = guild.roles.cache.get(roleId);
                if (role) {
                    const currentPerms = role.permissions.bitfield.toString();
                    if (currentPerms !== expectedPerms) {
                        issues.modifiedPermissions.push({
                            roleId,
                            roleName: role.name,
                            expected: expectedPerms,
                            current: currentPerms
                        });
                    }
                }
            }
        }
        // Check for missing role assignments (members missing expected roles)
        if (expectedState.memberRoles) {
            for (const [memberId, expectedRoles] of Object.entries(expectedState.memberRoles)) {
                const member = await guild.members.fetch(memberId).catch(() => null);
                if (member) {
                    const currentRoles = new Set(member.roles.cache.keys());
                    const missing = expectedRoles.filter(roleId => !currentRoles.has(roleId));
                    if (missing.length > 0) {
                        issues.missingAssignments.push({
                            memberId,
                            memberTag: member.user.tag,
                            missingRoles: missing
                        });
                    }
                }
            }
        }
    }
    catch (error) {
        log('error', '[ThreatResponse] Error verifying guild integrity', {
            guild: guild.name,
            error: getErrorMessage(error)
        });
    }
    const totalIssues = issues.deletedRoles.length +
        issues.modifiedPermissions.length +
        issues.missingAssignments.length +
        issues.unexpectedChanges.length;
    log('info', '[ThreatResponse] Guild integrity check complete', {
        guild: guild.name,
        totalIssues,
        deletedRoles: issues.deletedRoles.length,
        modifiedPermissions: issues.modifiedPermissions.length,
        missingAssignments: issues.missingAssignments.length
    });
    return {
        healthy: totalIssues === 0,
        issues,
        checkedAt: new Date().toISOString()
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Auto-Healing
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Auto-heal missing role assignments
 * Restores roles that were unexpectedly removed
 *
 * @param guild - Discord guild object
 * @param missingAssignments - Array of missing assignment objects
 * @param dryRun - If true, log actions without executing
 * @returns Healing summary with success/failure counts
 */
export async function healMissingAssignments(guild, missingAssignments, dryRun = false) {
    log('info', '[ThreatResponse] Auto-healing missing role assignments', {
        guild: guild.name,
        count: missingAssignments.length,
        dryRun
    });
    const results = {
        healed: [],
        failed: [],
        skipped: []
    };
    for (const assignment of missingAssignments) {
        try {
            const member = await guild.members.fetch(assignment.memberId).catch(() => null);
            if (!member) {
                results.skipped.push({
                    memberId: assignment.memberId,
                    reason: 'Member not found'
                });
                continue;
            }
            for (const roleId of assignment.missingRoles) {
                const role = guild.roles.cache.get(roleId);
                if (!role) {
                    results.skipped.push({
                        memberId: assignment.memberId,
                        roleId,
                        reason: 'Role not found'
                    });
                    continue;
                }
                if (dryRun) {
                    log('detail', '[ThreatResponse] [DRY RUN] Would heal role assignment', {
                        member: member.user.tag,
                        role: role.name
                    });
                    results.healed.push({
                        memberId: assignment.memberId,
                        memberTag: member.user.tag,
                        roleId,
                        roleName: role.name,
                        dryRun: true
                    });
                }
                else {
                    await member.roles.add(role);
                    log('success', '[ThreatResponse] Healed missing role assignment', {
                        member: member.user.tag,
                        role: role.name
                    });
                    results.healed.push({
                        memberId: assignment.memberId,
                        memberTag: member.user.tag,
                        roleId,
                        roleName: role.name,
                        dryRun: false
                    });
                }
            }
        }
        catch (error) {
            log('error', '[ThreatResponse] Failed to heal assignment', {
                memberId: assignment.memberId,
                error: getErrorMessage(error)
            });
            results.failed.push({
                memberId: assignment.memberId,
                error: getErrorMessage(error)
            });
        }
    }
    log('info', '[ThreatResponse] Auto-healing complete', {
        healed: results.healed.length,
        failed: results.failed.length,
        skipped: results.skipped.length
    });
    return results;
}
// ─────────────────────────────────────────────────────────────────────────────
// Critical Threat Escalation
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Escalate CRITICAL threat with immediate freeze
 * Prevents further damage by locking down permissions
 *
 * @param threat - Threat object from detectSecurityThreats()
 * @param guild - Discord guild object
 * @param dryRun - If true, log actions without executing
 * @returns Escalation result
 */
export async function escalateCriticalThreat(threat, guild, dryRun = false) {
    log('error', '[ThreatResponse] 🚨 CRITICAL THREAT ESCALATION', {
        type: threat.type,
        severity: threat.severity,
        confidence: threat.confidence,
        guild: guild.name,
        evidence: threat.evidence,
        mitreAttack: threat.mitreAttack
    });
    const actions = [];
    // Step 1: Freeze permissions (if enabled)
    try {
        const freezeResult = await freezePermissions(guild, threat, dryRun);
        actions.push({
            action: 'freeze_permissions',
            success: freezeResult.success ?? false,
            dryRun: freezeResult.dryRun,
            frozenRoles: freezeResult.frozenRoles,
            error: freezeResult.error
        });
    }
    catch (error) {
        log('error', '[ThreatResponse] Failed to freeze permissions', {
            error: getErrorMessage(error)
        });
        actions.push({
            action: 'freeze_permissions',
            success: false,
            error: getErrorMessage(error)
        });
    }
    // Step 2: Send immediate admin alert
    try {
        const alertResult = await sendAdminAlert(guild, threat, 'CRITICAL', dryRun);
        actions.push({
            action: 'admin_alert',
            success: alertResult.success ?? false,
            dryRun: alertResult.dryRun,
            alertSent: alertResult.alertSent,
            error: alertResult.error
        });
    }
    catch (error) {
        log('error', '[ThreatResponse] Failed to send admin alert', {
            error: getErrorMessage(error)
        });
        actions.push({
            action: 'admin_alert',
            success: false,
            error: getErrorMessage(error)
        });
    }
    // Step 3: Create incident record (future: incident management system)
    actions.push({
        action: 'incident_record',
        success: true,
        incidentId: `INC-${Date.now()}`,
        timestamp: new Date().toISOString()
    });
    return {
        escalated: true,
        threat: threat.type,
        actions,
        timestamp: new Date().toISOString()
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Re-exports for backward compatibility
// ─────────────────────────────────────────────────────────────────────────────
export { getSeverityIndicator } from '../../shared/utils/severity-utils.js';
