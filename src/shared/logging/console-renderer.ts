/**
 * Infinity Console Renderer — Visual Log Output System
 * 
 * ---------------------------------------------------------------------------
 * DESIGN: Professional console output with ASCII-safe characters
 * ---------------------------------------------------------------------------
 * 
 * Features:
 *   - Visual hierarchy with ASCII box characters
 *   - Progress bars for resource utilization
 *   - Status indicators for system health
 *   - Compact log stream with consistent formatting
 *   - Themed sections for different subsystems
 * 
 * @module shared/logging/console-renderer
 * @author Meeting #10 — Creative Design Specialist: Zara Okonkwo
 */

import { formatBytes, formatUptime } from '../utils/index.js';

// ---------------------------------------------------------------------------
// Visual Constants (ASCII-safe for cross-platform compatibility)
// ---------------------------------------------------------------------------

/** Box drawing characters for visual framing (ASCII-safe) */
const BOX = {
  // Double line equivalent (headers)
  TOP_LEFT: '+',
  TOP_RIGHT: '+',
  BOTTOM_LEFT: '+',
  BOTTOM_RIGHT: '+',
  HORIZONTAL: '=',
  VERTICAL: '|',
  
  // Single line equivalent (sections)
  S_TOP_LEFT: '+',
  S_TOP_RIGHT: '+',
  S_BOTTOM_LEFT: '+',
  S_BOTTOM_RIGHT: '+',
  S_HORIZONTAL: '-',
  S_VERTICAL: '|',
  
  // Connectors
  T_DOWN: '+',
  T_UP: '+',
  T_RIGHT: '+',
  T_LEFT: '+',
  CROSS: '+',
} as const;

/** Status indicator symbols (ASCII-safe) */
const STATUS = {
  ONLINE: '[*]',
  OFFLINE: '[ ]',
  DEGRADED: '[~]',
  SUCCESS: '[OK]',
  FAILURE: '[X]',
  PENDING: '[..]',
  WARNING: '[!]',
} as const;

/** Log level symbols (ASCII-safe, no emojis) */
const LEVEL_SYMBOLS = {
  success: '[OK]',
  info: '[i]',
  warn: '[!]',
  error: '[X]',
  fatal: '[XX]',
  debug: '[D]',
} as const;

/** Section prefixes (ASCII-safe, no emojis) */
const ICONS = {
  database: 'DB:',
  discord: 'BOT:',
  resources: 'RES:',
  cache: 'CACHE:',
  security: 'SEC:',
  battle: 'BTL:',
  pokemon: 'PKM:',
  system: 'SYS:',
  time: 'TIME:',
  infinity: '---',
} as const;

/** Progress bar characters (ASCII-safe) */
const PROGRESS = {
  FILLED: '#',
  EMPTY: '-',
  WIDTH: 16,
} as const;

/** Standard console width */
const CONSOLE_WIDTH = 80;

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export type LogLevel = 'success' | 'info' | 'warn' | 'error' | 'fatal' | 'debug';

export interface SystemStatus {
  name: string;
  status: 'online' | 'offline' | 'degraded';
  latency?: number;
  details?: string;
}

export interface ResourceMetrics {
  ram: { used: number; total: number };
  disk: { used: number; total: number };
  cpu: number;
}

export interface LogStreamEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: string;
}

export interface DashboardConfig {
  version: string;
  databases: SystemStatus[];
  discord?: {
    status: 'online' | 'offline';
    guilds: number;
    latency: number;
    uptime: number;
  };
  resources: ResourceMetrics;
}

// ---------------------------------------------------------------------------
// Visual Primitives
// ---------------------------------------------------------------------------

/**
 * Creates a horizontal line of specified width
 */
function horizontalLine(char: string, width: number): string {
  return char.repeat(width);
}

/**
 * Pads or truncates a string to exact width
 */
function fixedWidth(text: string, width: number, align: 'left' | 'right' | 'center' = 'left'): string {
  if (text.length > width) {
    return text.slice(0, width - 1) + '...';
  }
  const padding = width - text.length;
  if (align === 'right') {
    return ' '.repeat(padding) + text;
  }
  if (align === 'center') {
    const left = Math.floor(padding / 2);
    const right = padding - left;
    return ' '.repeat(left) + text + ' '.repeat(right);
  }
  return text + ' '.repeat(padding);
}

/**
 * Creates an ASCII progress bar
 */
export function progressBar(value: number, max: number, width: number = PROGRESS.WIDTH): string {
  const percent = Math.min(Math.max(value / max, 0), 1);
  const filled = Math.round(percent * width);
  const empty = width - filled;
  return PROGRESS.FILLED.repeat(filled) + PROGRESS.EMPTY.repeat(empty);
}

/**
 * Formats a percentage
 */
function formatPercent(value: number, max: number): string {
  const percent = Math.round((value / max) * 100);
  return `${percent}%`;
}

/**
 * Gets status indicator symbol
 */
function statusIndicator(status: 'online' | 'offline' | 'degraded'): string {
  switch (status) {
    case 'online': return STATUS.ONLINE;
    case 'offline': return STATUS.OFFLINE;
    case 'degraded': return STATUS.DEGRADED;
  }
}

/**
 * Gets status text
 */
function _statusText(status: 'online' | 'offline' | 'degraded'): string {
  switch (status) {
    case 'online': return `${STATUS.SUCCESS} Online`;
    case 'offline': return `${STATUS.FAILURE} Offline`;
    case 'degraded': return `${STATUS.WARNING} Degraded`;
  }
}

// ---------------------------------------------------------------------------
// Box Rendering
// ---------------------------------------------------------------------------

/**
 * Creates a double-line header box
 */
export function headerBox(title: string, subtitle: string, version: string): string[] {
  const lines: string[] = [];
  const innerWidth = CONSOLE_WIDTH - 4;
  
  // Top border
  lines.push(`${BOX.TOP_LEFT}${horizontalLine(BOX.HORIZONTAL, CONSOLE_WIDTH - 2)}${BOX.TOP_RIGHT}`);
  
  // Title line
  const titleLine = `  ${ICONS.infinity}  ${title}`;
  const versionPart = `v${version}  `;
  const titlePadding = innerWidth - titleLine.length - versionPart.length;
  lines.push(`${BOX.VERTICAL}${titleLine}${' '.repeat(Math.max(0, titlePadding))}${versionPart}${BOX.VERTICAL}`);
  
  // Separator
  lines.push(`${BOX.VERTICAL}${horizontalLine(BOX.S_HORIZONTAL, CONSOLE_WIDTH - 2)}${BOX.VERTICAL}`);
  
  // Subtitle with timestamp
  const now = new Date();
  const timeStr = `${ICONS.time} ${now.toISOString().slice(0, 19).replace('T', ' ')}`;
  const subLine = `  ${ICONS.system} ${subtitle}`;
  const subPadding = innerWidth - subLine.length - timeStr.length - 2;
  lines.push(`${BOX.VERTICAL}${subLine}${' '.repeat(Math.max(0, subPadding))}${timeStr}  ${BOX.VERTICAL}`);
  
  // Bottom border
  lines.push(`${BOX.BOTTOM_LEFT}${horizontalLine(BOX.HORIZONTAL, CONSOLE_WIDTH - 2)}${BOX.BOTTOM_RIGHT}`);
  
  return lines;
}

/**
 * Creates a single-line section box with title
 */
export function sectionBox(icon: string, title: string, content: string[]): string[] {
  const lines: string[] = [];
  const innerWidth = CONSOLE_WIDTH - 4;
  
  // Top border with title
  const titlePart = `${BOX.S_HORIZONTAL} ${icon} ${title} `;
  const remainingWidth = CONSOLE_WIDTH - 2 - titlePart.length;
  lines.push(`${BOX.S_TOP_LEFT}${titlePart}${horizontalLine(BOX.S_HORIZONTAL, remainingWidth)}${BOX.S_TOP_RIGHT}`);
  
  // Content lines
  for (const line of content) {
    const paddedLine = fixedWidth(line, innerWidth);
    lines.push(`${BOX.S_VERTICAL}  ${paddedLine}${BOX.S_VERTICAL}`);
  }
  
  // Bottom border
  lines.push(`${BOX.S_BOTTOM_LEFT}${horizontalLine(BOX.S_HORIZONTAL, CONSOLE_WIDTH - 2)}${BOX.S_BOTTOM_RIGHT}`);
  
  return lines;
}

// ---------------------------------------------------------------------------
// Dashboard Sections
// ---------------------------------------------------------------------------

/**
 * Renders database status section
 */
export function renderDatabaseSection(databases: SystemStatus[]): string[] {
  const content: string[] = [];
  
  for (const db of databases) {
    const indicator = statusIndicator(db.status);
    const statusStr = db.status === 'online' ? `${STATUS.SUCCESS} Online` : 
                      db.status === 'offline' ? `${STATUS.FAILURE} Offline` : 
                      `${STATUS.WARNING} Degraded`;
    const latencyStr = db.latency !== undefined ? `${db.latency}ms` : '---';
    const details = db.details || '';
    
    // Format: ● NAME      ✓ Online   │ 23ms  │ Details
    const namePart = fixedWidth(db.name, 14);
    const statusPart = fixedWidth(statusStr, 12);
    const latencyPart = fixedWidth(latencyStr, 6, 'right');
    const detailsPart = fixedWidth(details, 34);
    
    content.push(`${indicator} ${namePart}${statusPart}${BOX.S_VERTICAL} ${latencyPart} ${BOX.S_VERTICAL} ${detailsPart}`);
  }
  
  return sectionBox(ICONS.database, 'DATABASE', content);
}

/**
 * Renders Discord bot status section
 */
export function renderDiscordSection(discord: DashboardConfig['discord']): string[] {
  if (!discord) {
    return sectionBox(ICONS.discord, 'DISCORD', ['Bot: Not connected']);
  }
  
  const statusStr = discord.status === 'online' ? 'Online' : 'Offline';
  const uptimeStr = formatUptime(discord.uptime);
  
  const content = [
    `Bot: ${statusStr} ${BOX.S_VERTICAL} Guilds: ${discord.guilds} ${BOX.S_VERTICAL} Latency: ${discord.latency}ms ${BOX.S_VERTICAL} Uptime: ${uptimeStr}`,
  ];
  
  return sectionBox(ICONS.discord, 'DISCORD', content);
}

/**
 * Renders resource utilization section
 */
export function renderResourceSection(resources: ResourceMetrics): string[] {
  const ramBar = progressBar(resources.ram.used, resources.ram.total);
  const diskBar = progressBar(resources.disk.used, resources.disk.total);
  const cpuBar = progressBar(resources.cpu, 100);
  
  const ramUsed = formatBytes(resources.ram.used);
  const ramTotal = formatBytes(resources.ram.total);
  const ramPercent = formatPercent(resources.ram.used, resources.ram.total);
  
  const diskUsed = formatBytes(resources.disk.used);
  const diskTotal = formatBytes(resources.disk.total);
  const diskPercent = formatPercent(resources.disk.used, resources.disk.total);
  
  const content = [
    `RAM  ${ramBar}  ${ramUsed} / ${ramTotal}  (${ramPercent})`,
    `DISK ${diskBar}  ${diskUsed} / ${diskTotal}  (${diskPercent})`,
    `CPU  ${cpuBar}  ${resources.cpu}%`,
  ];
  
  return sectionBox(ICONS.resources, 'RESOURCES', content);
}

// ---------------------------------------------------------------------------
// Log Stream Formatting
// ---------------------------------------------------------------------------

/**
 * Formats a log entry for the stream view
 */
export function formatLogEntry(entry: LogStreamEntry): string {
  const time = entry.timestamp.toTimeString().slice(0, 8);
  const symbol = LEVEL_SYMBOLS[entry.level] || '[i]';
  const levelStr = fixedWidth(entry.level.toUpperCase(), 7);
  const message = fixedWidth(entry.message, 35);
  const context = entry.context ? `${BOX.S_VERTICAL} ${entry.context}` : '';
  
  return ` ${time}  ${symbol} ${levelStr}  ${message}${context}`;
}

/**
 * Creates a log stream separator
 */
export function logStreamSeparator(): string {
  return horizontalLine(BOX.S_HORIZONTAL, CONSOLE_WIDTH);
}

// ---------------------------------------------------------------------------
// Full Dashboard Rendering
// ---------------------------------------------------------------------------

/**
 * Renders the complete Infinity Console dashboard
 */
export function renderDashboard(config: DashboardConfig): string {
  const lines: string[] = [];
  
  // Header
  lines.push(...headerBox(
    'I N F I N I T Y   G A U N T L E T',
    'SYSTEMS ONLINE',
    config.version
  ));
  
  lines.push('');
  
  // Database section
  lines.push(...renderDatabaseSection(config.databases));
  
  lines.push('');
  
  // Discord section
  if (config.discord) {
    lines.push(...renderDiscordSection(config.discord));
    lines.push('');
  }
  
  // Resources section
  lines.push(...renderResourceSection(config.resources));
  
  lines.push('');
  lines.push(logStreamSeparator());
  
  return lines.join('\n');
}

/**
 * Renders a compact status line (for periodic updates)
 */
export function renderStatusLine(
  databases: { online: number; total: number },
  ram: { used: number; total: number },
  uptime: number
): string {
  const dbStatus = databases.online === databases.total 
    ? `${STATUS.SUCCESS} DB ${databases.online}/${databases.total}` 
    : `${STATUS.WARNING} DB ${databases.online}/${databases.total}`;
  
  const ramPercent = Math.round((ram.used / ram.total) * 100);
  const ramStatus = ramPercent < 80 ? STATUS.SUCCESS : ramPercent < 95 ? STATUS.WARNING : STATUS.FAILURE;
  
  const uptimeStr = formatUptime(uptime);
  
  return `[${ICONS.infinity}] ${dbStatus} ${BOX.S_VERTICAL} ${ramStatus} RAM ${ramPercent}% ${BOX.S_VERTICAL} UP: ${uptimeStr}`;
}

// ---------------------------------------------------------------------------
// Quick Log Functions (Convenience Wrappers)
// ---------------------------------------------------------------------------

/**
 * Quick success log
 */
export function success(message: string, context?: string): string {
  return formatLogEntry({
    timestamp: new Date(),
    level: 'success',
    message,
    context,
  });
}

/**
 * Quick info log
 */
export function info(message: string, context?: string): string {
  return formatLogEntry({
    timestamp: new Date(),
    level: 'info',
    message,
    context,
  });
}

/**
 * Quick warning log
 */
export function warn(message: string, context?: string): string {
  return formatLogEntry({
    timestamp: new Date(),
    level: 'warn',
    message,
    context,
  });
}

/**
 * Quick error log
 */
export function error(message: string, context?: string): string {
  return formatLogEntry({
    timestamp: new Date(),
    level: 'error',
    message,
    context,
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const ConsoleRenderer = {
  // Visual primitives
  progressBar,
  horizontalLine,
  fixedWidth,
  
  // Box rendering
  headerBox,
  sectionBox,
  
  // Section renderers
  renderDatabaseSection,
  renderDiscordSection,
  renderResourceSection,
  
  // Dashboard
  renderDashboard,
  renderStatusLine,
  
  // Log stream
  formatLogEntry,
  logStreamSeparator,
  
  // Quick logs
  success,
  info,
  warn,
  error,
  
  // Constants
  BOX,
  STATUS,
  LEVEL_SYMBOLS,
  ICONS,
  PROGRESS,
  CONSOLE_WIDTH,
};

export default ConsoleRenderer;
