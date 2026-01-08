/**
 * Test Environment Setup
 * 
 * Configures environment variables and cleanup handlers for test runs.
 * Ensures tests don't hang due to dangling timers or connections.
 */

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://placeholder.invalid/test-db';
}

if (!process.env.RENDER_DB_INTERNAL_URL) {
  process.env.RENDER_DB_INTERNAL_URL = 'postgres://internal.invalid/test-db';
}

if (!process.env.PRISMA_SKIP_INITIAL_CONNECT) {
  process.env.PRISMA_SKIP_INITIAL_CONNECT = 'true';
}

// Disable any background workers during tests
process.env.DISABLE_BACKGROUND_WORKERS = 'true';

// Force non-interactive mode (prevents prompts)
process.env.CI = 'true';

// Track active timers for cleanup (optional debugging)
const activeTimers = new Set<NodeJS.Timeout>();
const originalSetTimeout = global.setTimeout;
const originalSetInterval = global.setInterval;

// Override to track timers (only in verbose mode)
if (process.env.VITEST_TRACK_TIMERS === 'true') {
  global.setTimeout = ((fn: () => void, ms?: number, ...args: unknown[]) => {
    const timer = originalSetTimeout(fn, ms, ...args);
    activeTimers.add(timer);
    return timer;
  }) as typeof setTimeout;

  global.setInterval = ((fn: () => void, ms?: number, ...args: unknown[]) => {
    const timer = originalSetInterval(fn, ms, ...args);
    activeTimers.add(timer);
    return timer;
  }) as typeof setInterval;
}
