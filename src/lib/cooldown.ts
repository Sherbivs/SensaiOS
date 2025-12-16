import fs from 'node:fs';
import path from 'node:path';
import { log } from '../utils/logger.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface CooldownResult {
  ok: boolean;
  waitMs: number;
}

export interface CooldownStats {
  total: number;
  active: number;
  expired: number;
  maxAgeSec: number;
  cleanupIntervalSec: number;
  persistIntervalSec: number;
}

export interface CooldownSnapshot {
  version: number;
  savedAt: number;
  entries: Record<string, number>;
  count: number;
}

// ============================================================================
// Module State
// ============================================================================

// In-memory cooldowns; suitable for a single running instance
const store = new Map<string, number>(); // key -> timestamp (ms)

// Configuration
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const PERSIST_INTERVAL_MS = 30 * 1000; // 30 seconds (reduced from 1min for seamless restart optimization - 50% data loss reduction)
const MAX_COOLDOWN_AGE_MS = 60 * 60 * 1000; // 1 hour TTL
const STORAGE_DIR = process.env.RENDER ? '/Store/cooldowns' : path.join(process.cwd(), 'Store', 'cooldowns');
const STORAGE_FILE = path.join(STORAGE_DIR, 'cooldowns.json');

let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let persistTimer: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// Internal Helpers
// ============================================================================

function keyFor(userId: string, commandName: string): string {
  return `${userId}:${commandName}`;
}

// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Check if user is on cooldown for command, and set new cooldown if not.
 * Returns { ok: boolean, waitMs: number }
 * If on cooldown, ok=false and waitMs=remaining.
 */
export function checkAndSet(userId: string, commandName: string, cooldownMs = 2000): CooldownResult {
  const now = Date.now();
  const key = keyFor(userId, commandName);
  const until = store.get(key) || 0;
  if (now < until) return { ok: false, waitMs: until - now };
  store.set(key, now + cooldownMs);
  return { ok: true, waitMs: 0 };
}

/**
 * Remove expired cooldown entries (older than MAX_COOLDOWN_AGE_MS).
 * Called periodically to prevent unbounded memory growth.
 */
export function cleanup(): void {
  const now = Date.now();
  const threshold = now - MAX_COOLDOWN_AGE_MS;
  let removed = 0;

  for (const [key, until] of store.entries()) {
    if (until < threshold) {
      store.delete(key);
      removed++;
    }
  }

  if (removed > 0) {
    log('info', `cooldown: Cleanup removed ${removed} expired entries (${store.size} remaining)`);
  }
}

/**
 * Persist cooldown state to disk for recovery after restarts.
 * Only saves entries that are still valid (not expired).
 */
export async function persist(): Promise<void> {
  try {
    const now = Date.now();
    const threshold = now - MAX_COOLDOWN_AGE_MS;
    const validEntries: Record<string, number> = {};

    for (const [key, until] of store.entries()) {
      if (until >= threshold) {
        validEntries[key] = until;
      }
    }

    // Ensure directory exists
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }

    const snapshot: CooldownSnapshot = {
      version: 1,
      savedAt: now,
      entries: validEntries,
      count: Object.keys(validEntries).length,
    };

    fs.writeFileSync(STORAGE_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
    log('info', `cooldown: Persisted ${snapshot.count} entries to disk`);
  } catch (err) {
    log('warn', `cooldown: Persist failed: ${(err as Error).message}`);
  }
}

/**
 * Load cooldown state from disk on startup.
 * Filters out expired entries during load.
 */
export function load(): void {
  try {
    if (!fs.existsSync(STORAGE_FILE)) {
      log('info', 'cooldown: No persisted state found (first startup)');
      return;
    }

    const content = fs.readFileSync(STORAGE_FILE, 'utf8');
    const snapshot = JSON.parse(content) as CooldownSnapshot;
    const now = Date.now();
    const threshold = now - MAX_COOLDOWN_AGE_MS;
    let loaded = 0;
    let skipped = 0;

    for (const [key, until] of Object.entries(snapshot.entries || {})) {
      if (until >= threshold && until > now) {
        store.set(key, until);
        loaded++;
      } else {
        skipped++;
      }
    }

    log('info', `cooldown: Loaded ${loaded} entries from disk (${skipped} expired, skipped)`);
  } catch (err) {
    log('warn', `cooldown: Load failed: ${(err as Error).message}`);
  }
}

/**
 * Start periodic cleanup and persistence timers.
 */
export function startMaintenance(): void {
  if (cleanupTimer || persistTimer) {
    log('warn', 'cooldown: Maintenance already running');
    return;
  }

  cleanupTimer = setInterval(cleanup, CLEANUP_INTERVAL_MS);
  persistTimer = setInterval(() => void persist(), PERSIST_INTERVAL_MS);
  log('info', 'cooldown: Started maintenance (cleanup: 10m, persist: 5m)');
}

/**
 * Stop periodic timers and save final state.
 */
export async function stopMaintenance(): Promise<void> {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  if (persistTimer) {
    clearInterval(persistTimer);
    persistTimer = null;
  }

  // Final persist on shutdown
  await persist();
  log('info', 'cooldown: Stopped maintenance, final state saved');
}

/**
 * Get current statistics for monitoring.
 */
export function getStats(): CooldownStats {
  const now = Date.now();
  const threshold = now - MAX_COOLDOWN_AGE_MS;
  let active = 0;
  let expired = 0;

  for (const [, until] of store.entries()) {
    if (until >= threshold && until > now) {
      active++;
    } else {
      expired++;
    }
  }

  return {
    total: store.size,
    active,
    expired,
    maxAgeSec: MAX_COOLDOWN_AGE_MS / 1000,
    cleanupIntervalSec: CLEANUP_INTERVAL_MS / 1000,
    persistIntervalSec: PERSIST_INTERVAL_MS / 1000,
  };
}

// ============================================================================
// Module Initialization
// ============================================================================

// Load persisted state on startup
load();

// Start maintenance timers
startMaintenance();

// Graceful shutdown handlers
process.on('SIGTERM', () => void stopMaintenance());
process.on('SIGINT', () => void stopMaintenance());

// ============================================================================
// Default Export
// ============================================================================

export default {
  checkAndSet,
  cleanup,
  persist,
  load,
  startMaintenance,
  stopMaintenance,
  getStats,
};
