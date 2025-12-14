/**
 * @file Guild Integrity Verifier
 * @description Detects unauthorized role deletions, missing assignments, and permission drift
 * @module bot/state/integrityVerifier
 * 
 * PHASE 3: INTEGRITY VERIFICATION
 * 
 * FEATURES:
 * - Detects unauthorized role deletions (archive says exists, guild says deleted)
 * - Detects missing role assignments (expected by archive, not currently assigned)
 * - Detects permission drift (role permissions changed without archive entry)
 * - Returns integrity score 0-100 with detailed findings
 * - Integrates with auto-healing (re-assign missing roles)
 * 
 * TEAM: Security Specialist
 * TASK: #4 - Integrity verification module
 */

import { log } from '../../utils/logger.js';

/**
 * Verify guild integrity against archive history
 * Detects unauthorized changes and permission drift
 * 
 * @param {Object} guild - Discord.js Guild object
 * @param {Object} roleArchive - Role archive cache with history
 * @returns {Promise<Object>} Integrity assessment
 * 
 * @example
 * const assessment = await verifyGuildIntegrity(guild, roleArchive);
 * console.log(`Integrity Score: ${assessment.score}/100`);
 * if (assessment.issues.length > 0) {
 *   // Handle integrity issues
 * }
 */
export async function verifyGuildIntegrity(guild, roleArchive) {
  try {
    log('detail', '[IntegrityVerifier] Starting guild integrity verification', {
      guildId: guild.id,
      guildName: guild.name
    });
    
    const issues = [];
    let checksPerformed = 0;
    let checksPassed = 0;
    
    // CHECK 1: Unauthorized Role Deletions
    // Archive has record of role existing, but guild says it's deleted
    const deletionIssues = await checkUnauthorizedDeletions(guild, roleArchive);
    issues.push(...deletionIssues);
    checksPerformed++;
    if (deletionIssues.length === 0) checksPassed++;
    
    // CHECK 2: Missing Role Assignments
    // Archive shows member should have role, but they don't currently
    const missingAssignments = await checkMissingAssignments(guild, roleArchive);
    issues.push(...missingAssignments);
    checksPerformed++;
    if (missingAssignments.length === 0) checksPassed++;
    
    // CHECK 3: Permission Drift
    // Role permissions changed without corresponding archive entry
    const permissionDrift = await checkPermissionDrift(guild, roleArchive);
    issues.push(...permissionDrift);
    checksPerformed++;
    if (permissionDrift.length === 0) checksPassed++;
    
    // Calculate integrity score (0-100)
    const issueDeductions = issues.reduce((total, issue) => {
      // Deduct points based on severity
      const severityWeights = {
        'CRITICAL': 25,
        'HIGH': 15,
        'MEDIUM': 10,
        'LOW': 5
      };
      return total + (severityWeights[issue.severity] || 5);
    }, 0);
    
    const score = Math.max(0, Math.min(100, 100 - issueDeductions));
    
    // Categorize issues by type
    const issuesByType = {
      unauthorizedDeletions: deletionIssues.length,
      missingAssignments: missingAssignments.length,
      permissionDrift: permissionDrift.length
    };
    
    // Determine overall status
    let status = 'HEALTHY';
    if (score < 50) status = 'CRITICAL';
    else if (score < 70) status = 'DEGRADED';
    else if (score < 90) status = 'WARNING';
    
    const assessment = {
      score,
      status,
      checksPerformed,
      checksPassed,
      issueCount: issues.length,
      issuesByType,
      issues,
      guildId: guild.id,
      guildName: guild.name,
      verifiedAt: new Date().toISOString(),
      metadata: {
        totalRoles: guild.roles.cache.size,
        totalMembers: guild.memberCount,
        archiveSize: roleArchive.changes.length
      }
    };
    
    log('info', `[IntegrityVerifier] ✅ Verification complete - Score: ${score}/100 (${status})`, {
      guildName: guild.name,
      issueCount: issues.length,
      checksPerformed,
      checksPassed
    });
    
    return assessment;
    
  } catch (err) {
    log('error', '[IntegrityVerifier] Verification failed', {
      error: err.message,
      stack: err.stack,
      guildId: guild?.id
    });
    
    // Return degraded assessment on error
    return {
      score: 0,
      status: 'ERROR',
      checksPerformed: 0,
      checksPassed: 0,
      issueCount: 0,
      issuesByType: {},
      issues: [],
      error: err.message,
      verifiedAt: new Date().toISOString()
    };
  }
}

/**
 * CHECK 1: Detect unauthorized role deletions
 * Archive shows role existed, but it's now deleted from guild
 * 
 * @private
 */
async function checkUnauthorizedDeletions(guild, roleArchive) {
  const issues = [];
  
  try {
    // Get all roles from archive that were active recently (last 7 days)
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentRoles = new Map(); // roleId → roleName
    
    for (const change of roleArchive.changes) {
      const changeTime = new Date(change.timestamp).getTime();
      if (changeTime > sevenDaysAgo) {
        recentRoles.set(change.roleId, change.roleName);
      }
    }
    
    // Check if these roles still exist in guild
    for (const [roleId, roleName] of recentRoles.entries()) {
      const roleExists = guild.roles.cache.has(roleId);
      
      if (!roleExists) {
        // Role was in archive but is now deleted
        // Check if deletion was authorized (has removal entry in archive)
        const deletionEntry = roleArchive.changes.find(change => 
          change.roleId === roleId && 
          change.type === 'deletion' && // Explicit role deletion (not just member removal)
          new Date(change.timestamp).getTime() > sevenDaysAgo
        );
        
        if (!deletionEntry) {
          // Unauthorized deletion detected
          issues.push({
            type: 'unauthorized_deletion',
            severity: 'CRITICAL',
            roleId,
            roleName,
            description: `Role "${roleName}" was deleted without archive entry`,
            evidence: {
              lastSeenInArchive: getLastSeenTimestamp(roleArchive, roleId),
              expectedInGuild: true,
              actualInGuild: false
            },
            recommendedAction: 'RECREATE_ROLE',
            detectedAt: new Date().toISOString()
          });
        }
      }
    }
    
  } catch (err) {
    log('error', '[IntegrityVerifier] Failed to check unauthorized deletions', {
      error: err.message
    });
  }
  
  return issues;
}

/**
 * CHECK 2: Detect missing role assignments
 * Archive shows member should have role, but they don't currently
 * 
 * @private
 */
async function checkMissingAssignments(guild, roleArchive) {
  const issues = [];
  
  try {
    // Build expected state from archive (last 24 hours)
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const expectedAssignments = new Map(); // memberId → Set(roleIds)
    
    for (const change of roleArchive.changes) {
      const changeTime = new Date(change.timestamp).getTime();
      if (changeTime < oneDayAgo) continue;
      
      if (!expectedAssignments.has(change.memberId)) {
        expectedAssignments.set(change.memberId, new Set());
      }
      
      const memberRoles = expectedAssignments.get(change.memberId);
      
      if (change.type === 'addition') {
        memberRoles.add(change.roleId);
      } else if (change.type === 'removal') {
        memberRoles.delete(change.roleId);
      }
    }
    
    // Fetch guild members and verify assignments (force: true for fresh data)
    await guild.members.fetch({ force: true });
    
    // Check each member's expected roles
    for (const [memberId, expectedRoles] of expectedAssignments.entries()) {
      const member = guild.members.cache.get(memberId);
      
      if (!member) {
        // Member left guild - not an integrity issue
        continue;
      }
      
      for (const roleId of expectedRoles) {
        const hasRole = member.roles.cache.has(roleId);
        
        if (!hasRole) {
          // Missing assignment detected
          const role = guild.roles.cache.get(roleId);
          
          issues.push({
            type: 'missing_assignment',
            severity: 'HIGH',
            memberId,
            memberTag: member.user.tag,
            roleId,
            roleName: role?.name || 'Unknown Role',
            description: `Member "${member.user.tag}" missing expected role "${role?.name || roleId}"`,
            evidence: {
              expectedByArchive: true,
              actuallyAssigned: false,
              lastArchiveEntry: getLastMemberRoleChange(roleArchive, memberId, roleId)
            },
            recommendedAction: 'AUTO_REASSIGN',
            detectedAt: new Date().toISOString()
          });
        }
      }
    }
    
  } catch (err) {
    log('error', '[IntegrityVerifier] Failed to check missing assignments', {
      error: err.message
    });
  }
  
  return issues;
}

/**
 * CHECK 3: Detect permission drift
 * Role permissions changed without corresponding archive entry
 * 
 * @private
 */
async function checkPermissionDrift(guild, roleArchive) {
  const issues = [];
  
  try {
    // Build expected permissions from archive (last 7 days)
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const rolePermissions = new Map(); // roleId → { permissions, lastUpdate }
    
    for (const change of roleArchive.changes) {
      const changeTime = new Date(change.timestamp).getTime();
      if (changeTime < sevenDaysAgo) continue;
      
      // If change includes permission metadata, track it
      if (change.metadata?.permissions) {
        rolePermissions.set(change.roleId, {
          permissions: change.metadata.permissions,
          lastUpdate: change.timestamp,
          roleName: change.roleName
        });
      }
    }
    
    // Fetch current roles (force: true for fresh data)
    await guild.roles.fetch({ force: true });
    
    // Compare current permissions with archived permissions
    for (const [roleId, archived] of rolePermissions.entries()) {
      const role = guild.roles.cache.get(roleId);
      
      if (!role) {
        // Role deleted - handled by CHECK 1
        continue;
      }
      
      const currentPermissions = role.permissions.bitfield.toString();
      const archivedPermissions = archived.permissions.toString();
      
      if (currentPermissions !== archivedPermissions) {
        // Permission drift detected
        issues.push({
          type: 'permission_drift',
          severity: 'MEDIUM',
          roleId,
          roleName: role.name,
          description: `Role "${role.name}" permissions changed without archive entry`,
          evidence: {
            archivedPermissions,
            currentPermissions,
            lastArchiveUpdate: archived.lastUpdate,
            permissionsChanged: true
          },
          recommendedAction: 'LOG_FOR_REVIEW',
          detectedAt: new Date().toISOString()
        });
      }
    }
    
  } catch (err) {
    log('error', '[IntegrityVerifier] Failed to check permission drift', {
      error: err.message
    });
  }
  
  return issues;
}

/**
 * Get last seen timestamp for a role in archive
 * @private
 */
function getLastSeenTimestamp(roleArchive, roleId) {
  const lastChange = roleArchive.changes
    .filter(c => c.roleId === roleId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  
  return lastChange?.timestamp || null;
}

/**
 * Get last archive entry for member+role combination
 * @private
 */
function getLastMemberRoleChange(roleArchive, memberId, roleId) {
  const lastChange = roleArchive.changes
    .filter(c => c.memberId === memberId && c.roleId === roleId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  
  return lastChange?.timestamp || null;
}

/**
 * Auto-heal integrity issues (re-assign missing roles)
 * Called after verifyGuildIntegrity when issues detected
 * 
 * @param {Object} guild - Discord.js Guild object
 * @param {Array} issues - Issues from integrity assessment
 * @returns {Promise<Object>} Healing results
 */
export async function healGuildIntegrity(guild, issues) {
  const results = {
    attempted: 0,
    successful: 0,
    failed: 0,
    errors: []
  };
  
  try {
    // Filter issues that can be auto-healed
    const healableIssues = issues.filter(issue => 
      issue.recommendedAction === 'AUTO_REASSIGN'
    );
    
    for (const issue of healableIssues) {
      results.attempted++;
      
      try {
        const member = guild.members.cache.get(issue.memberId);
        const role = guild.roles.cache.get(issue.roleId);
        
        if (!member || !role) {
          results.failed++;
          results.errors.push({
            issue: issue.type,
            error: 'Member or role not found',
            memberId: issue.memberId,
            roleId: issue.roleId
          });
          continue;
        }
        
        // Re-assign the role
        await member.roles.add(role, 'Auto-heal: Restoring missing assignment');
        
        results.successful++;
        
        log('info', '[IntegrityVerifier] ✅ Auto-healed missing assignment', {
          memberTag: member.user.tag,
          roleName: role.name
        });
        
      } catch (err) {
        results.failed++;
        results.errors.push({
          issue: issue.type,
          error: err.message,
          memberId: issue.memberId,
          roleId: issue.roleId
        });
      }
    }
    
    log('info', `[IntegrityVerifier] Auto-healing complete: ${results.successful}/${results.attempted} successful`, {
      attempted: results.attempted,
      successful: results.successful,
      failed: results.failed
    });
    
  } catch (err) {
    log('error', '[IntegrityVerifier] Auto-healing failed', {
      error: err.message,
      stack: err.stack
    });
  }
  
  return results;
}

/**
 * Get integrity score interpretation
 * @param {number} score - Integrity score (0-100)
 * @returns {string} Human-readable status
 */
export function getIntegrityStatus(score) {
  if (score >= 90) return '🟢 HEALTHY';
  if (score >= 70) return '🟡 WARNING';
  if (score >= 50) return '🟠 DEGRADED';
  return '🔴 CRITICAL';
}
