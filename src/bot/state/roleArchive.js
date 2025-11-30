/**
 * @file Role Archive Module
 * @description Tracks all role changes with 500-entry cold storage archive
 * @module bot/state/roleArchive
 * 
 * FEATURES:
 * - Records every role addition/removal
 * - Maintains last 500 changes in cold storage
 * - Integrates with Drip alerts for anomaly detection
 * - Provides statistical analysis for learning
 * - Fast lookups with indexed cache
 */

import fs from 'fs/promises';
import path from 'path';
import { log } from '../../utils/logger.js';

// Persistent storage location
const ARCHIVE_DIR = process.env.RENDER 
  ? '/Store/security-bot-state/role-archive'
  : './Store/security-bot-state/role-archive';
const ARCHIVE_FILE = path.join(ARCHIVE_DIR, 'role-changes.json');

const MAX_ARCHIVE_SIZE = 500; // Keep last 500 role changes

/**
 * In-memory cache of recent role changes
 */
let roleArchiveCache = {
  changes: [], // Array of role change events
  statistics: {
    totalChanges: 0,
    additionCount: 0,
    removalCount: 0,
    uniqueMembers: new Set(),
    rolesModified: new Map(), // role -> count
    lastUpdate: null
  },
  initialized: false
};

/**
 * Initialize the role archive system
 */
export async function initializeRoleArchive() {
  try {
    // Ensure directory exists
    await fs.mkdir(ARCHIVE_DIR, { recursive: true });
    
    // Load existing archive
    try {
      const data = await fs.readFile(ARCHIVE_FILE, 'utf8');
      const archived = JSON.parse(data);
      
      if (Array.isArray(archived.changes)) {
        roleArchiveCache.changes = archived.changes;
      }
      
      if (archived.statistics) {
        roleArchiveCache.statistics = {
          ...archived.statistics,
          uniqueMembers: new Set(archived.statistics.uniqueMembers || []),
          rolesModified: new Map(archived.statistics.rolesModified || [])
        };
      }
      
      log('info', '[RoleArchive] Loaded from disk', {
        changeCount: roleArchiveCache.changes.length,
        totalChanges: roleArchiveCache.statistics.totalChanges,
        file: ARCHIVE_FILE
      });
    } catch (err) {
      if (err.code !== 'ENOENT') {
        log('warn', '[RoleArchive] Failed to load existing archive', { error: err.message });
      }
      // No archive exists yet - start fresh
    }
    
    roleArchiveCache.initialized = true;
    return true;
  } catch (err) {
    log('error', '[RoleArchive] Initialization failed', { error: err.message, stack: err.stack });
    return false;
  }
}

/**
 * Record a role change event
 * 
 * @param {Object} event - Role change event
 * @param {string} event.memberId - Discord user ID
 * @param {string} event.memberTag - Username#discriminator
 * @param {string} event.guildId - Guild ID
 * @param {string} event.guildName - Guild name
 * @param {string} event.type - 'addition' or 'removal'
 * @param {string} event.roleId - Role ID
 * @param {string} event.roleName - Role name
 * @param {string} event.origin - Source of change ('member-join', 'member-update', 'sweep', 'manual', etc.)
 * @param {Object} event.metadata - Additional context
 */
export async function recordRoleChange(event) {
  if (!roleArchiveCache.initialized) {
    await initializeRoleArchive();
  }
  
  const timestamp = new Date().toISOString();
  const changeId = `${event.memberId}-${event.roleId}-${Date.now()}`;
  
  const changeRecord = {
    id: changeId,
    timestamp,
    memberId: event.memberId,
    memberTag: event.memberTag,
    guildId: event.guildId,
    guildName: event.guildName,
    type: event.type, // 'addition' or 'removal'
    roleId: event.roleId,
    roleName: event.roleName,
    origin: event.origin,
    metadata: event.metadata || {}
  };
  
  // Add to cache (FIFO - remove oldest if over limit)
  roleArchiveCache.changes.push(changeRecord);
  if (roleArchiveCache.changes.length > MAX_ARCHIVE_SIZE) {
    roleArchiveCache.changes.shift(); // Remove oldest
  }
  
  // Update statistics
  roleArchiveCache.statistics.totalChanges++;
  if (event.type === 'addition') {
    roleArchiveCache.statistics.additionCount++;
  } else if (event.type === 'removal') {
    roleArchiveCache.statistics.removalCount++;
  }
  
  roleArchiveCache.statistics.uniqueMembers.add(event.memberId);
  
  const roleKey = `${event.roleId}:${event.roleName}`;
  const currentCount = roleArchiveCache.statistics.rolesModified.get(roleKey) || 0;
  roleArchiveCache.statistics.rolesModified.set(roleKey, currentCount + 1);
  
  roleArchiveCache.statistics.lastUpdate = timestamp;
  
  // Async persist to disk (don't wait - fire and forget)
  persistArchive().catch(err => {
    log('error', '[RoleArchive] Failed to persist change', { error: err.message });
  });
  
  log('detail', '[RoleArchive] Recorded role change', {
    type: event.type,
    member: event.memberTag,
    role: event.roleName,
    origin: event.origin,
    archiveSize: roleArchiveCache.changes.length
  });
  
  return changeRecord;
}

/**
 * Persist archive to disk
 */
async function persistArchive() {
  try {
    const data = {
      changes: roleArchiveCache.changes,
      statistics: {
        ...roleArchiveCache.statistics,
        uniqueMembers: Array.from(roleArchiveCache.statistics.uniqueMembers),
        rolesModified: Array.from(roleArchiveCache.statistics.rolesModified.entries())
      },
      metadata: {
        lastPersisted: new Date().toISOString(),
        schemaVersion: '1.0.0'
      }
    };
    
    await fs.writeFile(ARCHIVE_FILE, JSON.stringify(data, null, 2), 'utf8');
    
    log('detail', '[RoleArchive] Persisted to disk', {
      changeCount: roleArchiveCache.changes.length,
      file: ARCHIVE_FILE
    });
  } catch (err) {
    log('error', '[RoleArchive] Failed to persist', { error: err.message });
    throw err;
  }
}

/**
 * Get role change statistics
 */
export function getRoleStatistics() {
  if (!roleArchiveCache.initialized) {
    return null;
  }
  
  return {
    totalChanges: roleArchiveCache.statistics.totalChanges,
    additionCount: roleArchiveCache.statistics.additionCount,
    removalCount: roleArchiveCache.statistics.removalCount,
    uniqueMemberCount: roleArchiveCache.statistics.uniqueMembers.size,
    rolesModified: Array.from(roleArchiveCache.statistics.rolesModified.entries())
      .map(([key, count]) => {
        const [roleId, roleName] = key.split(':');
        return { roleId, roleName, changeCount: count };
      })
      .sort((a, b) => b.changeCount - a.changeCount),
    lastUpdate: roleArchiveCache.statistics.lastUpdate,
    archiveSize: roleArchiveCache.changes.length,
    archiveCapacity: MAX_ARCHIVE_SIZE
  };
}

/**
 * Get recent role changes for a member
 */
export function getMemberRoleHistory(memberId, limit = 10) {
  if (!roleArchiveCache.initialized) {
    return [];
  }
  
  return roleArchiveCache.changes
    .filter(change => change.memberId === memberId)
    .slice(-limit)
    .reverse(); // Most recent first
}

/**
 * Get recent changes for a specific role
 */
export function getRoleChangeHistory(roleId, limit = 50) {
  if (!roleArchiveCache.initialized) {
    return [];
  }
  
  return roleArchiveCache.changes
    .filter(change => change.roleId === roleId)
    .slice(-limit)
    .reverse();
}

/**
 * Detect anomalous role changes (for Drip alert integration)
 * Returns true if the change is suspicious
 */
export function isAnomalousChange(event) {
  if (!roleArchiveCache.initialized || roleArchiveCache.changes.length < 50) {
    return false; // Need baseline data first
  }
  
  // Check for rapid role changes on same member
  const recentMemberChanges = roleArchiveCache.changes
    .filter(c => c.memberId === event.memberId)
    .slice(-10);
  
  if (recentMemberChanges.length >= 5) {
    const timeSpan = new Date(event.timestamp) - new Date(recentMemberChanges[0].timestamp);
    if (timeSpan < 5 * 60 * 1000) { // 5 changes in 5 minutes
      log('warn', '[RoleArchive] Anomaly detected: Rapid role changes', {
        member: event.memberTag,
        changeCount: recentMemberChanges.length,
        timeSpanMinutes: Math.round(timeSpan / 60000)
      });
      return true;
    }
  }
  
  // Check for unauthorized removal of critical roles
  if (event.type === 'removal' && event.metadata?.isUnauthorized) {
    log('warn', '[RoleArchive] Anomaly detected: Unauthorized role removal', {
      member: event.memberTag,
      role: event.roleName,
      origin: event.origin
    });
    return true;
  }
  
  return false;
}

/**
 * Export archive for analysis (last 500 entries)
 */
export function exportArchive() {
  if (!roleArchiveCache.initialized) {
    return { changes: [], statistics: {} };
  }
  
  return {
    changes: roleArchiveCache.changes,
    statistics: getRoleStatistics(),
    exportedAt: new Date().toISOString()
  };
}

/**
 * Shutdown - final persist
 */
export async function shutdownRoleArchive() {
  if (roleArchiveCache.initialized) {
    await persistArchive();
    log('info', '[RoleArchive] Shutdown complete', {
      finalChangeCount: roleArchiveCache.changes.length
    });
  }
}
