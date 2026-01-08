/**
 * OS Console — Minimal, streamlined output for SensaiOS
 * @module shared/logging/os-console
 * 
 * Philosophy: "We are an Operating System, 95% of output is skimming anyway"
 * 
 * Provides:
 * - Compact single-line boot banner
 * - Event-driven status updates (not periodic dumps)
 * - Smooth scrolling log stream
 * - Minimal ASCII formatting (no elaborate boxes)
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Feature flag for OS console mode */
export const OS_CONSOLE_ENABLED = process.env.SENSAI_CONSOLE !== 'classic';

/** Minimal prefix symbols */
const SYM = {
  ok: '✓',
  warn: '!',
  err: '✕',
  info: '·',
  boot: '▸',
  sys: '⚙',
  db: '◆',
  net: '◇',
  time: '○',
} as const;

/** Color codes (ANSI) - only when TTY */
const isTTY = process.stdout.isTTY ?? false;
const C = {
  reset: isTTY ? '\x1b[0m' : '',
  dim: isTTY ? '\x1b[2m' : '',
  green: isTTY ? '\x1b[32m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  red: isTTY ? '\x1b[31m' : '',
  cyan: isTTY ? '\x1b[36m' : '',
  gray: isTTY ? '\x1b[90m' : '',
} as const;

// ---------------------------------------------------------------------------
// Time Formatting
// ---------------------------------------------------------------------------

/** Returns HH:MM:SS */
function timeStamp(): string {
  return new Date().toTimeString().slice(0, 8);
}

/** Returns compact uptime like "4h23m" or "15m" or "45s" */
function compactUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

// ---------------------------------------------------------------------------
// Boot Banner
// ---------------------------------------------------------------------------

/**
 * Renders a compact boot banner (shown once at startup)
 */
export function bootBanner(version: string): string {
  const lines = [
    '',
    `${C.cyan}SensaiOS${C.reset} ${C.dim}v${version}${C.reset}`,
    `${C.dim}${SYM.boot} Booting kernel...${C.reset}`,
    '',
  ];
  return lines.join('\n');
}

/**
 * Renders a minimal "ready" message after boot completes
 */
export function bootComplete(services: {
  db?: 'online' | 'offline' | 'degraded';
  discord?: 'online' | 'offline';
  workers?: number;
}): string {
  const parts: string[] = [];
  
  if (services.db) {
    const dbSym = services.db === 'online' ? `${C.green}${SYM.ok}${C.reset}` :
                  services.db === 'degraded' ? `${C.yellow}${SYM.warn}${C.reset}` :
                  `${C.red}${SYM.err}${C.reset}`;
    parts.push(`${dbSym} DB`);
  }
  
  if (services.discord) {
    const discSym = services.discord === 'online' ? `${C.green}${SYM.ok}${C.reset}` :
                    `${C.red}${SYM.err}${C.reset}`;
    parts.push(`${discSym} Discord`);
  }
  
  if (services.workers !== undefined) {
    parts.push(`${SYM.sys} ${services.workers} workers`);
  }
  
  return `${C.green}${SYM.boot}${C.reset} Ready ${C.dim}[${parts.join(' ')}]${C.reset}`;
}

// ---------------------------------------------------------------------------
// Event Logging
// ---------------------------------------------------------------------------

type EventLevel = 'ok' | 'info' | 'warn' | 'err';

interface LogEvent {
  level: EventLevel;
  component: string;
  message: string;
  detail?: string;
}

/**
 * Formats a single event line for the stream
 * Format: HH:MM:SS ✓ COMPONENT  message (detail)
 */
export function formatEvent(event: LogEvent): string {
  const time = `${C.dim}${timeStamp()}${C.reset}`;
  
  const sym = event.level === 'ok' ? `${C.green}${SYM.ok}${C.reset}` :
              event.level === 'warn' ? `${C.yellow}${SYM.warn}${C.reset}` :
              event.level === 'err' ? `${C.red}${SYM.err}${C.reset}` :
              `${C.gray}${SYM.info}${C.reset}`;
  
  const comp = event.component.toUpperCase().padEnd(8).slice(0, 8);
  const detail = event.detail ? ` ${C.dim}(${event.detail})${C.reset}` : '';
  
  return `${time} ${sym} ${comp} ${event.message}${detail}`;
}

// ---------------------------------------------------------------------------
// Status Line (Compact System Status)
// ---------------------------------------------------------------------------

interface SystemSnapshot {
  db: 'online' | 'offline' | 'degraded';
  ram: number;      // percentage 0-100
  cpu: number;      // percentage 0-100
  uptime: number;   // seconds
  guilds?: number;
}

/**
 * Renders a single-line status summary
 * Format: ○ 4h23m | DB ✓ | RAM 45% | CPU 12%
 */
export function statusLine(snap: SystemSnapshot): string {
  const up = compactUptime(snap.uptime);
  
  const dbSym = snap.db === 'online' ? `${C.green}${SYM.ok}${C.reset}` :
                snap.db === 'degraded' ? `${C.yellow}${SYM.warn}${C.reset}` :
                `${C.red}${SYM.err}${C.reset}`;
  
  const ramColor = snap.ram < 75 ? C.green : snap.ram < 90 ? C.yellow : C.red;
  const cpuColor = snap.cpu < 75 ? C.green : snap.cpu < 90 ? C.yellow : C.red;
  
  let line = `${C.dim}${SYM.time}${C.reset} ${up} ${C.dim}|${C.reset} DB ${dbSym}`;
  line += ` ${C.dim}|${C.reset} ${ramColor}RAM ${snap.ram}%${C.reset}`;
  line += ` ${C.dim}|${C.reset} ${cpuColor}CPU ${snap.cpu}%${C.reset}`;
  
  if (snap.guilds !== undefined) {
    line += ` ${C.dim}|${C.reset} ${snap.guilds} guilds`;
  }
  
  return line;
}

// ---------------------------------------------------------------------------
// Progress Indicators
// ---------------------------------------------------------------------------

/**
 * Renders a minimal inline progress indicator
 * Format: ▸ Loading species... (1,025)
 */
export function progress(task: string, count?: number): string {
  const countStr = count !== undefined ? ` ${C.dim}(${count.toLocaleString()})${C.reset}` : '';
  return `${C.cyan}${SYM.boot}${C.reset} ${task}...${countStr}`;
}

/**
 * Renders task completion
 * Format: ✓ Loaded 1,025 species
 */
export function done(task: string, count?: number): string {
  const countStr = count !== undefined ? ` ${count.toLocaleString()}` : '';
  return `${C.green}${SYM.ok}${C.reset} ${task}${countStr}`;
}

// ---------------------------------------------------------------------------
// Error Display
// ---------------------------------------------------------------------------

/**
 * Formats an error event (stands out more)
 */
export function errorLine(component: string, message: string, code?: string): string {
  const time = `${C.dim}${timeStamp()}${C.reset}`;
  const codeStr = code ? ` ${C.dim}[${code}]${C.reset}` : '';
  return `${time} ${C.red}${SYM.err}${C.reset} ${component.toUpperCase()} ${message}${codeStr}`;
}

// ---------------------------------------------------------------------------
// Writer Functions
// ---------------------------------------------------------------------------

const write = (line: string): void => { process.stdout.write(`${line}\n`); };
const writeErr = (line: string): void => { process.stderr.write(`${line}\n`); };

/**
 * OS Console API
 */
export const osConsole = {
  // Boot
  boot: (version: string): void => { write(bootBanner(version)); },
  ready: (services: Parameters<typeof bootComplete>[0]): void => { write(bootComplete(services)); },
  
  // Events
  ok: (component: string, message: string, detail?: string): void => 
    write(formatEvent({ level: 'ok', component, message, detail })),
  info: (component: string, message: string, detail?: string): void => 
    write(formatEvent({ level: 'info', component, message, detail })),
  warn: (component: string, message: string, detail?: string): void => 
    write(formatEvent({ level: 'warn', component, message, detail })),
  err: (component: string, message: string, detail?: string): void => 
    writeErr(formatEvent({ level: 'err', component, message, detail })),
  
  // Status
  status: (snap: SystemSnapshot): void => write(statusLine(snap)),
  
  // Progress
  progress: (task: string, count?: number): void => write(progress(task, count)),
  done: (task: string, count?: number): void => write(done(task, count)),
  
  // Errors
  error: (component: string, message: string, code?: string): void => 
    writeErr(errorLine(component, message, code)),
};

export default osConsole;
