import os from 'node:os';
import readline from 'node:readline';

import activityTracker from './activityTracker.js';
import opsNotifier from './opsNotifier.js';

const NORMAL_UPDATE_INTERVAL_MS = 5 * 60 * 1000;
const ALERT_UPDATE_INTERVAL_MS = 30 * 1000;
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
  lastUpdatedAt: null,
  lastRenderAt: null,
};

const PRIMARY_SECTIONS = [
  { id: 'security', title: 'Security Bot' },
  { id: 'database', title: 'Database' },
  { id: 'pokedex', title: 'PokéAPI Cache' },
  { id: 'discord', title: 'Discord Bot' },
  { id: 'cache', title: 'Runtime Cache' },
];

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
let currentIntervalMs = NORMAL_UPDATE_INTERVAL_MS;

function noteUpdate() {
  state.lastUpdatedAt = new Date();
}

function describeInterval(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return 'n/a';
  }
  const seconds = Math.round(ms / 1000);
  if (seconds % 3600 === 0) {
    return `${seconds / 3600}h`;
  }
  if (seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }
  if (ms % 1000 === 0) {
    return `${seconds}s`;
  }
  return `${ms}ms`;
}

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

function formatCategoryBlock(title, rows = []) {
  const label = title || 'Section';
  if (!Array.isArray(rows) || rows.length === 0) {
    return [`${label}: No data available`];
  }

  const [firstLineRaw, ...rest] = rows;
  const firstLine = firstLineRaw && String(firstLineRaw).trim().length > 0
    ? String(firstLineRaw).trim()
    : 'Status: pending';

  const block = [`${label} | ${firstLine}`];
  for (const row of rest) {
    if (row === null || row === undefined) {
      continue;
    }
    const text = String(row).trimEnd();
    if (text.length === 0) {
      block.push('');
    } else {
      block.push(`  ${text.trimStart()}`);
    }
  }
  return block;
}

function computeCapacityInsight() {
  const statuses = [];
  for (const section of state.sections.values()) {
    if (!section) {
      continue;
    }
    const rawStatus = typeof section.status === 'string' ? section.status : 'pending';
    statuses.push(rawStatus.toLowerCase());
  }

  const alerts = Array.isArray(state.recentErrors) ? state.recentErrors.length : 0;
  const pendingEvents = state.activityStats?.pendingEvents ?? 0;

  let rating = 'nominal';
  const drivers = [];

  if (alerts > 0) {
    rating = 'critical';
    drivers.push(`${alerts} active alert${alerts === 1 ? '' : 's'}`);
  }

  if (statuses.some((status) => ['error', 'offline', 'failed'].includes(status))) {
    rating = 'critical';
    drivers.push('component outage detected');
  } else if (
    rating !== 'critical' &&
    statuses.some((status) => ['degraded', 'reconnecting', 'warming', 'checking', 'pending'].includes(status))
  ) {
    rating = 'guarded';
    drivers.push('systems stabilising');
  }

  if (pendingEvents > 25) {
    rating = 'critical';
    drivers.push(`pending queue high (${pendingEvents})`);
  } else if (pendingEvents > 10 && rating !== 'critical') {
    rating = 'guarded';
    drivers.push(`pending queue elevated (${pendingEvents})`);
  }

  const detail = drivers.length > 0 ? drivers.join('; ') : 'All systems nominal';

  return {
    rating,
    detail,
    alerts,
    pendingEvents,
    guildCount: state.guildCount ?? 0,
  };
}

function buildSectionBlock(sectionId, fallbackTitle) {
  const section = state.sections.get(sectionId);
  const title = section?.title || fallbackTitle || sectionId || 'Section';
  if (!section) {
    return formatCategoryBlock(title, [
      'Status: unavailable',
      'Telemetry pending from supervisor',
    ]);
  }
  const status = section.status || 'pending';
  const normalizedStatus = typeof status === 'string' ? status.toLowerCase() : 'pending';
  const rows = [`Status: ${status}`];
  const metricLines = toMetricRows(section.metrics);
  if (metricLines.length > 0) {
    rows.push(...metricLines);
  } else if (!['disabled', 'offline', 'unavailable'].includes(normalizedStatus)) {
    rows.push('No metrics reported');
  }
  return formatCategoryBlock(title, rows);
}

function buildSectionBlocks() {
  const blocks = [];
  const seen = new Set();
  for (const { id, title } of PRIMARY_SECTIONS) {
    blocks.push(buildSectionBlock(id, title));
    seen.add(id);
  }
  for (const [id, section] of state.sections.entries()) {
    if (seen.has(id)) {
      continue;
    }
    blocks.push(buildSectionBlock(id, section?.title || id));
  }
  return blocks;
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

function buildActivityBlock() {
  if (!state.activityStats) {
    return [];
  }
  const { totalEvents, pendingEvents, lastActivityAt, lastSummaryAt, lifetimeCounts } = state.activityStats;
  const status = pendingEvents && pendingEvents > 0 ? 'active' : 'idle';
  const rows = [
    `Status: ${status}`,
    `Total events: ${totalEvents ?? 0}`,
    `Pending queue: ${pendingEvents ?? 0}`,
    `Last activity: ${formatTimestamp(lastActivityAt)}`,
    `Last summary: ${formatTimestamp(lastSummaryAt)}`,
  ];
  const lifetimeLines = formatLifetimeCounts(lifetimeCounts);
  if (lifetimeLines.length > 0) {
    rows.push('Lifetime counts:');
    rows.push(...lifetimeLines);
  }
  const recentLines = formatRecentActivities();
  if (recentLines.length > 0) {
    rows.push('Recent pending:');
    rows.push(...recentLines);
  }
  return formatCategoryBlock('Activity', rows);
}

function buildAlertsBlock() {
  if (!Array.isArray(state.recentErrors) || state.recentErrors.length === 0) {
    return [];
  }
  const latest = state.recentErrors.slice(-5).reverse();
  const rows = [`Active alerts: ${state.recentErrors.length}`];
  for (const entry of latest) {
    let timestampValue = entry ? entry.timestamp : null;
    if (timestampValue && !(timestampValue instanceof Date)) {
      const parsed = new Date(timestampValue);
      timestampValue = Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const when = timestampValue ? formatTimestamp(timestampValue) : 'unknown';
    const details = [];
    if (entry?.detail) {
      details.push(entry.detail);
    }
    if (entry?.source) {
      details.push(`source=${entry.source}`);
    }
    rows.push(`• ${entry?.message ?? 'alert'}`);
    const descriptor = [...details, when].filter(Boolean).join(' • ');
    rows.push(`  ${descriptor}`);
  }
  return formatCategoryBlock('Alerts', rows);
}

function buildDisplayLines() {
  const now = new Date();
  const uptime = formatDuration(now - state.startedAt);
  const capacity = computeCapacityInsight();
  const phase = state.phase || 'unknown';
  const guilds = state.guildCount ?? 0;

  const lines = [
    HEADER,
    '='.repeat(HEADER.length),
    `Phase: ${phase}   Guilds: ${guilds}   Uptime: ${uptime}`,
    `Status: ${capacity.rating}   Alerts: ${capacity.alerts}   Pending Ops: ${capacity.pendingEvents}`,
  ];

  if (capacity.detail) {
    lines.push(`Detail: ${capacity.detail}`);
  }

  const blocks = [...buildSectionBlocks()];
  const alertsBlock = buildAlertsBlock();
  if (alertsBlock.length > 0) {
    blocks.push(alertsBlock);
  }
  const activityBlock = buildActivityBlock();
  if (activityBlock.length > 0) {
    blocks.push(activityBlock);
  }

  for (const block of blocks) {
    if (!block || block.length === 0) {
      continue;
    }
    lines.push('');
    lines.push(...block);
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
function summarizeTimestamp(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return 'never';
  }
  return formatTimestamp(value).replace(/\s+/g, '_');
}

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

  const normalizeValue = (value) => String(value ?? 'unknown').replace(/\s+/g, '_');

  const segments = [];
  const phase = state.phase || 'unknown';
  const status = dbSection.status || 'pending';
  segments.push(`phase=${normalizeValue(phase)}`);
  segments.push(`database=${normalizeValue(status)}`);

  const securitySection = state.sections.get('security');
  if (securitySection) {
    segments.push(`security=${normalizeValue(securitySection.status || 'pending')}`);
  }

  const pokedexSection = state.sections.get('pokedex');
  if (pokedexSection) {
    segments.push(`pokedex=${normalizeValue(pokedexSection.status || 'pending')}`);
  }

  const cacheSection = state.sections.get('cache');
  if (cacheSection) {
    segments.push(`runtimeCache=${normalizeValue(cacheSection.status || 'pending')}`);
  }

  const capacity = computeCapacityInsight();
  segments.push(`capacity=${normalizeValue(capacity.rating)}`);
  segments.push(`alerts=${capacity.alerts}`);
  segments.push(`pendingOps=${capacity.pendingEvents}`);
  if (capacity.detail) {
    segments.push(`capacityDetail=${capacity.detail.replace(/\s+/g, '_')}`);
  }

  if (state.lastUpdatedAt) {
    segments.push(`refreshed=${summarizeTimestamp(state.lastUpdatedAt)}`);
  }

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
  pickMetric('transport', 'transport');
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

function desiredInterval() {
  return Array.isArray(state.recentErrors) && state.recentErrors.length > 0
    ? ALERT_UPDATE_INTERVAL_MS
    : NORMAL_UPDATE_INTERVAL_MS;
}

function configureRenderInterval() {
  if (SIMPLE_MODE && QUIET_SIMPLE_MODE) {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
    currentIntervalMs = desiredInterval();
    return;
  }

  const target = desiredInterval();
  if (intervalHandle && currentIntervalMs === target) {
    return;
  }

  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }

  intervalHandle = setInterval(render, target);
  intervalHandle.unref?.();
  currentIntervalMs = target;
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
    state.lastRenderAt = new Date();
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
  noteUpdate();
  if (displayActive) {
    render();
  }
}

function handleOpsErrorUpdate() {
  if (typeof opsNotifier?.getRecentErrors !== 'function') {
    return;
  }
  state.recentErrors = opsNotifier.getRecentErrors();
  noteUpdate();
  configureRenderInterval();
  if (displayActive) {
    render();
  }
}

function startStatusDisplay() {
  if (displayActive) {
    return;
  }

  displayActive = true;
  state.startedAt = new Date();
  state.lastUpdatedAt = state.startedAt;
  state.lastRenderAt = null;
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

  render();
  configureRenderInterval();
}

function stopStatusDisplay() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  currentIntervalMs = NORMAL_UPDATE_INTERVAL_MS;

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
  const nextPhase = value || state.phase;
  if (!nextPhase || state.phase === nextPhase) {
    return;
  }
  state.phase = nextPhase;
  noteUpdate();
  if (displayActive) {
    render();
  }
}

function setGuildCount(value) {
  let changed = false;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const nextCount = Math.max(0, Math.round(value));
    if (state.guildCount !== nextCount) {
      state.guildCount = nextCount;
      noteUpdate();
      changed = true;
    }
  }
  if (changed && displayActive) {
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
  noteUpdate();
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
