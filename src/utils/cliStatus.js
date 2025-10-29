import os from 'node:os';
import readline from 'node:readline';

import activityTracker from './activityTracker.js';
import opsNotifier from './opsNotifier.js';

const UPDATE_INTERVAL_MS = 5000;
const HEADER = 'Infinity Gauntlet Ops Monitor';

const initialErrors = typeof opsNotifier?.getRecentErrors === 'function'
  ? opsNotifier.getRecentErrors()
  : [];

const state = {
  startedAt: new Date(),
  phase: 'Booting',
  guildCount: 0,
  sections: new Map(),
  activityStats: null,
  recentActivities: [],
  recentErrors: initialErrors,
};

const SIMPLE_MODE = !(process.stdout && process.stdout.isTTY && process.stderr && process.stderr.isTTY);
const SIMPLE_VERBOSE_MODE = ['1', 'true', 'yes', 'verbose', 'default', 'legacy', 'full']
  .includes(String(process.env.CLI_STATUS_VERBOSE ?? process.env.CLI_STATUS_SIMPLE ?? '').toLowerCase());
const QUIET_SIMPLE_MODE = SIMPLE_MODE && !SIMPLE_VERBOSE_MODE;

let intervalHandle = null;
let unsubscribe = null;
let unsubscribeErrors = null;
let lastOutputWasDot = false;
let lastRenderLines = 0;
let isRendering = false;
let displayActive = false;
let lastSimpleRender = '';

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    return '0s';
  }
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60) % 24;
  const days = Math.floor(totalMinutes / 60 / 24);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

function formatTimestamp(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return 'never';
  }
  const now = Date.now();
  const diff = now - date.getTime();
  const prefix = diff < 0 ? 'in ' : '';
  const magnitude = Math.abs(diff);
  if (magnitude < 1000) {
    return diff < 0 ? 'soon' : 'just now';
  }
  return `${prefix}${formatDuration(magnitude)}${diff < 0 ? '' : ' ago'}`;
}

function toMetricRows(metrics = []) {
  if (!Array.isArray(metrics) || metrics.length === 0) {
    return [];
  }
  return metrics
    .map((entry) => {
      if (!entry) {
        return null;
      }
      if (Array.isArray(entry)) {
        const [label, value] = entry;
        if (label === undefined && value === undefined) {
          return null;
        }
        if (label === undefined) {
          return `  • ${String(value)}`;
        }
        return `  • ${label}: ${value === undefined ? '' : String(value)}`;
      }
      if (typeof entry === 'object') {
        return Object.entries(entry)
          .map(([label, value]) => `  • ${label}: ${value}`)
          .join(os.EOL);
      }
      return `  • ${String(entry)}`;
    })
    .filter(Boolean)
    .flatMap((line) => line.split(/\r?\n/));
}

function buildSectionLines() {
  if (!state.sections || state.sections.size === 0) {
    return [];
  }
  const lines = [];
  for (const section of state.sections.values()) {
    if (!section) {
      continue;
    }
    const title = section.title || section.id || 'Section';
    const status = section.status || 'pending';
    lines.push(title);
    lines.push(`  Status: ${status}`);
    const metricLines = toMetricRows(section.metrics);
    if (metricLines.length > 0) {
      lines.push(...metricLines);
    }
    lines.push('');
  }
  lines.pop();
  return lines;
}

function formatLifetimeCounts(counts = {}) {
  const entries = Object.entries(counts || {});
  if (entries.length === 0) {
    return [];
  }
  entries.sort((a, b) => b[1] - a[1]);
  const topEntries = entries.slice(0, 4);
  return topEntries.map(([type, count]) => `  • ${type}: ${count}`);
}

function formatActivityMeta(activity) {
  if (!activity || typeof activity !== 'object') {
    return '';
  }
  const meta = activity.meta && typeof activity.meta === 'object' ? activity.meta : {};
  const details = [];
  if (meta.guild) {
    details.push(String(meta.guild));
  }
  if (meta.member) {
    details.push(String(meta.member));
  }
  if (meta.role) {
    details.push(String(meta.role));
  }
  if (meta.origin) {
    details.push(`origin=${meta.origin}`);
  }
  if (meta.actor) {
    details.push(String(meta.actor));
  }
  return details.join(' • ');
}

function formatRecentActivities() {
  if (!Array.isArray(state.recentActivities) || state.recentActivities.length === 0) {
    return [];
  }
  const entries = state.recentActivities.slice(-10).reverse();
  return entries.map((activity) => {
    const summary = activity && activity.summary ? activity.summary : activity?.type || 'activity';
    let timestampValue = activity ? activity.timestamp : null;
    if (timestampValue && !(timestampValue instanceof Date)) {
      const parsed = new Date(timestampValue);
      timestampValue = Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const timestamp = timestampValue ? formatTimestamp(timestampValue) : 'unknown';
    const type = activity && activity.type ? ` [${activity.type}]` : '';
    const meta = formatActivityMeta(activity);
    const suffix = meta ? ` — ${meta}` : '';
    return `  • ${summary}${type} (${timestamp})${suffix}`;
  });
}

function buildActivityLines() {
  if (!state.activityStats) {
    return [];
  }
  const { totalEvents, pendingEvents, lastActivityAt, lastSummaryAt, lifetimeCounts } = state.activityStats;
  const lines = ['Activity'];
  lines.push(`  Total events: ${totalEvents ?? 0}`);
  lines.push(`  Pending queue: ${pendingEvents ?? 0}`);
  lines.push(`  Last activity: ${formatTimestamp(lastActivityAt)}`);
  lines.push(`  Last summary: ${formatTimestamp(lastSummaryAt)}`);
  const lifetimeLines = formatLifetimeCounts(lifetimeCounts);
  if (lifetimeLines.length > 0) {
    lines.push('  Lifetime counts:');
    lines.push(...lifetimeLines);
  }
  const recentLines = formatRecentActivities();
  if (recentLines.length > 0) {
    lines.push('  Recent pending:');
    lines.push(...recentLines);
  }
  return lines;
}

function buildErrorLines() {
  if (!Array.isArray(state.recentErrors) || state.recentErrors.length === 0) {
    return [];
  }
  const latest = state.recentErrors.slice(-3).reverse();
  const lines = ['Alerts'];
  for (const entry of latest) {
    const when = formatTimestamp(entry.timestamp);
    const parts = [];
    if (entry.detail) {
      parts.push(entry.detail);
    }
    if (entry.source) {
      parts.push(`source: ${entry.source}`);
    }
    parts.push(when);
    lines.push(`  • ${entry.message}`);
    lines.push(`    ${parts.filter(Boolean).join(' • ')}`);
  }
  return lines;
}

function buildDisplayLines() {
  const now = new Date();
  const uptime = formatDuration(now - state.startedAt);
  const lines = [
    HEADER,
    '-'.repeat(HEADER.length),
    `Phase: ${state.phase || 'unknown'}`,
    `Guilds observed: ${state.guildCount ?? 0}`,
    `Uptime: ${uptime}`,
  ];

  const sectionLines = buildSectionLines();
  if (sectionLines.length > 0) {
    lines.push('');
    lines.push(...sectionLines);
  }

  const errorLines = buildErrorLines();
  if (errorLines.length > 0) {
    lines.push('');
    lines.push(...errorLines);
  }

  const activityLines = buildActivityLines();
  if (activityLines.length > 0) {
    lines.push('');
    lines.push(...activityLines);
  }

  return lines;
}

function clearDisplay() {
  if (SIMPLE_MODE || lastRenderLines === 0) {
    return;
  }
  readline.moveCursor(process.stdout, 0, -lastRenderLines);
  readline.clearScreenDown(process.stdout);
  lastRenderLines = 0;
}

// Compose a condensed single-line snapshot for Render logs when no TTY is present.
function buildQuietSummary() {
  const dbSection = state.sections.get('database');
  if (!dbSection) {
    return null;
  }

  const metrics = new Map();
  const looseNotes = [];

  for (const entry of dbSection.metrics ?? []) {
    if (!entry) {
      continue;
    }
    if (Array.isArray(entry)) {
      const [label, value] = entry;
      if ((label === undefined || label === null) && value !== undefined && value !== null && value !== '') {
        looseNotes.push(String(value));
        continue;
      }
      if (label !== undefined && label !== null && !metrics.has(label)) {
        metrics.set(label, value);
      }
      continue;
    }
    if (typeof entry === 'object') {
      for (const [label, value] of Object.entries(entry)) {
        if (!metrics.has(label)) {
          metrics.set(label, value);
        }
      }
      continue;
    }
    looseNotes.push(String(entry));
  }

  const segments = [];
  const phase = state.phase || 'unknown';
  const status = dbSection.status || 'pending';
  segments.push(`phase=${phase}`);
  segments.push(`database=${status}`);

  const pickMetric = (key, label, formatter) => {
    if (!metrics.has(key)) {
      return;
    }
    const raw = metrics.get(key);
    if (raw === undefined || raw === null || raw === '') {
      metrics.delete(key);
      return;
    }
    const rendered = formatter ? formatter(raw) : `${label}=${String(raw)}`;
    if (rendered) {
      segments.push(rendered);
    }
    metrics.delete(key);
  };

  pickMetric('latency', 'latency');
  pickMetric('Δ latency', 'delta');
  pickMetric('since last', 'interval');
  pickMetric('connect', 'connect');
  pickMetric('sample', 'sample');
  pickMetric('route', 'route');
  pickMetric('preference', 'preference');
  pickMetric('mode', 'mode');
  pickMetric('source', 'source');
  pickMetric('failures', 'failures', (value) => {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric <= 0) {
      return '';
    }
    return `failures=${value}`;
  });
  pickMetric('error', 'error', (value) => `error=${value}`);

  if (looseNotes.length > 0) {
    segments.push(`note=${looseNotes.join(' | ')}`);
  }

  for (const [label, value] of metrics.entries()) {
    if (label.toLowerCase() === 'status') {
      continue;
    }
    if (value === undefined || value === null || value === '') {
      continue;
    }
    const normalizedLabel = String(label).trim().replace(/\s+/g, '_');
    segments.push(`${normalizedLabel}=${String(value)}`);
  }

  return segments.join(' | ');
}

function render() {
  if (!displayActive || isRendering) {
    return;
  }

  isRendering = true;
  try {
    if (SIMPLE_MODE) {
      if (QUIET_SIMPLE_MODE) {
        const summary = buildQuietSummary();
        if (summary && summary !== lastSimpleRender) {
          const line = `${new Date().toISOString()} ${summary}${os.EOL}`;
          process.stdout.write(line);
          lastSimpleRender = summary;
        }
        lastOutputWasDot = false;
        return;
      }
      const lines = buildDisplayLines();
      const output = `${lines.join(os.EOL)}${os.EOL}`;
      if (output !== lastSimpleRender) {
        process.stdout.write(output);
        lastSimpleRender = output;
      }
      lastOutputWasDot = false;
      return;
    }

    const lines = buildDisplayLines();
    if (lastRenderLines > 0) {
      readline.moveCursor(process.stdout, 0, -lastRenderLines);
      readline.clearScreenDown(process.stdout);
    }
    const output = `${lines.join(os.EOL)}${os.EOL}`;
    process.stdout.write(output);
    lastRenderLines = lines.length;
    lastOutputWasDot = false;
  } finally {
    isRendering = false;
  }
}

function handleActivityUpdate(stats) {
  state.activityStats = stats;
  if (typeof activityTracker.getPendingActivities === 'function') {
    try {
      state.recentActivities = activityTracker.getPendingActivities();
    } catch {
      state.recentActivities = [];
    }
  }
  if (!SIMPLE_MODE && displayActive) {
    render();
  }
}

function handleOpsErrorUpdate() {
  if (typeof opsNotifier?.getRecentErrors !== 'function') {
    return;
  }
  state.recentErrors = opsNotifier.getRecentErrors();
  if (!SIMPLE_MODE && displayActive) {
    render();
  }
}

function startStatusDisplay() {
  if (displayActive) {
    return;
  }

  displayActive = true;
  state.startedAt = new Date();
  lastSimpleRender = '';

  if (typeof activityTracker.subscribe === 'function') {
    unsubscribe = activityTracker.subscribe(handleActivityUpdate);
  }

  if (typeof opsNotifier?.subscribe === 'function' && !unsubscribeErrors) {
    unsubscribeErrors = opsNotifier.subscribe(handleOpsErrorUpdate);
    if (typeof opsNotifier.getRecentErrors === 'function') {
      state.recentErrors = opsNotifier.getRecentErrors();
    }
  }

  if (!SIMPLE_MODE) {
    process.stdout.write('\u001B[?25l');
  }

  if (SIMPLE_MODE) {
    render();
    if (!QUIET_SIMPLE_MODE) {
      intervalHandle = setInterval(render, UPDATE_INTERVAL_MS);
    }
    return;
  }

  render();
  intervalHandle = setInterval(render, UPDATE_INTERVAL_MS);
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

  if (unsubscribeErrors) {
    unsubscribeErrors();
    unsubscribeErrors = null;
  }

  if (!displayActive) {
    return;
  }

  if (SIMPLE_MODE) {
    displayActive = false;
    lastSimpleRender = '';
    return;
  }

  clearDisplay();
  process.stdout.write('\u001B[?25h');
  process.stdout.write('\n');
  displayActive = false;
  lastRenderLines = 0;
}

function setPhase(value) {
  state.phase = value || state.phase;
  if (displayActive) {
    render();
  }
}

function setGuildCount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    state.guildCount = Math.max(0, Math.round(value));
  }
  if (displayActive) {
    render();
  }
}

function normalizeSection(sectionId, data) {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const normalized = {
    id: sectionId,
    title: data.title || sectionId,
    status: data.status || 'pending',
  };
  if (Array.isArray(data.metrics)) {
    normalized.metrics = data.metrics;
  } else if (data.metrics && typeof data.metrics === 'object') {
    normalized.metrics = Object.entries(data.metrics);
  } else {
    normalized.metrics = [];
  }
  return normalized;
}

function setSection(sectionId, data) {
  if (!sectionId) {
    return;
  }
  if (data === null) {
    state.sections.delete(sectionId);
  } else {
    const normalized = normalizeSection(sectionId, data);
    if (normalized) {
      state.sections.set(sectionId, normalized);
    }
  }
  if (displayActive) {
    render();
  }
}

function interruptConsoleOutput(writeFn) {
  if (typeof writeFn !== 'function') {
    return;
  }

  if (!displayActive) {
    writeFn();
    return;
  }

  if (SIMPLE_MODE) {
    writeFn();
    return;
  }

  if (isRendering) {
    writeFn();
    return;
  }

  clearDisplay();
  writeFn();
  render();
}

export {
  startStatusDisplay,
  stopStatusDisplay,
  setPhase,
  setGuildCount,
  setSection,
  interruptConsoleOutput,
};

export default {
  startStatusDisplay,
  stopStatusDisplay,
  setPhase,
  setGuildCount,
  setSection,
  interruptConsoleOutput,
};
