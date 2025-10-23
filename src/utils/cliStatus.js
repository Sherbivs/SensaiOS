const readline = require('node:readline');
const os = require('node:os');

const cache = require('../services/cache');
const activityTracker = require('./activityTracker');

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const UPDATE_INTERVAL_MS = 1000;
const NON_TTY_INTERVAL_MS = 60 * 1000;

let frameIndex = 0;
let startTime = Date.now();
let intervalHandle = null;
let latestStats = activityTracker.getStats();
let unsubscribe = null;
let currentPhase = 'Starting';
let guildCount = 0;
let lastRenderLine = '';
let lastNonTtyPrint = 0;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : value >= 100 ? 0 : 1)} ${units[unit]}`;
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

function formatRelativeTime(timestamp) {
  if (!timestamp) {
    return 'never';
  }
  const diffMs = Date.now() - timestamp.getTime();
  if (diffMs < 0) return 'now';
  const totalSeconds = Math.floor(diffMs / 1000);
  if (totalSeconds < 5) return 'just now';
  if (totalSeconds < 60) return `${totalSeconds}s ago`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m ago`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 48) return `${totalHours}h ago`;
  const totalDays = Math.floor(totalHours / 24);
  return `${totalDays}d ago`;
}

function formatStatsLine() {
  const stats = latestStats;
  const spinner = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length];
  const uptime = formatDuration(Date.now() - startTime);
  const lastChange = formatRelativeTime(stats.lastActivityAt);
  const lastSummary = formatRelativeTime(stats.lastSummaryAt);
  const assignments = stats.lifetimeCounts['role-assignment'] || 0;
  const heals = stats.lifetimeCounts['role-permissions-healed'] || 0;
  const alerts = stats.lifetimeCounts['security-alert'] || 0;
  const cacheSize = cache.getCacheSize();
  const budget = cache.getCacheBudget();
  const limitBytes = budget.maxAllowedBytes || 1;
  const percentUsed = Math.min(999, Math.round((cacheSize / limitBytes) * 100));
  const freeDisk = budget.diskFreeBytes ? formatBytes(budget.diskFreeBytes) : formatBytes(os.freemem());
  const pending = stats.pendingEvents;

  return `${spinner} ${currentPhase} | guilds ${guildCount} | uptime ${uptime} | last change ${lastChange} | summary ${lastSummary} | pending ${pending} | assigned ${assignments} | healed ${heals} | alerts ${alerts} | cache ${formatBytes(cacheSize)} / ${formatBytes(limitBytes)} (${percentUsed}%) | disk free ${freeDisk}`;
}

function render(force = false) {
  const line = formatStatsLine();
  if (!process.stdout.isTTY) {
    const now = Date.now();
    if (force || now - lastNonTtyPrint >= NON_TTY_INTERVAL_MS) {
      // eslint-disable-next-line no-console
      console.log(`[STATUS] ${line}`);
      lastNonTtyPrint = now;
    }
    return;
  }

  if (!force && line === lastRenderLine) {
    return;
  }
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(`${line}`);
  lastRenderLine = line;
}

function tick() {
  frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
  render();
}

function startStatusDisplay() {
  if (intervalHandle) {
    return;
  }
  startTime = Date.now();
  latestStats = activityTracker.getStats();
  unsubscribe = activityTracker.subscribe((stats) => {
    latestStats = stats;
    render(true);
  });
  render(true);
  intervalHandle = setInterval(tick, UPDATE_INTERVAL_MS);
}

function stopStatusDisplay() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (process.stdout.isTTY) {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
  }
  lastRenderLine = '';
}

function setPhase(phase) {
  currentPhase = phase;
  render(true);
}

function setGuildCount(count) {
  guildCount = Math.max(0, Number(count) || 0);
  render(true);
}

function interruptConsoleOutput(writeFn) {
  if (typeof writeFn !== 'function') {
    return;
  }
  if (!process.stdout.isTTY) {
    writeFn();
    return;
  }
  const hadLine = Boolean(lastRenderLine);
  if (hadLine) {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
  }
  try {
    writeFn();
  } finally {
    if (hadLine) {
      lastRenderLine = '';
      render(true);
    }
  }
}

module.exports = {
  startStatusDisplay,
  stopStatusDisplay,
  setPhase,
  setGuildCount,
  interruptConsoleOutput,
};
