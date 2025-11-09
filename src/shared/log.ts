// Minimal structured logger without external deps.
// Outputs JSON lines with timestamp, level, message, and optional context.
// Now includes optional buffering to reduce console noise.

import { config } from "./config.js";
import { safeError } from "./utils/error-utils.js";
import { getLogBuffer, type BufferedLogEntry } from "./logBuffer.js";

type CliLogLevel = "success" | "info" | "detail" | "warn" | "error";
type CliLogOptions = { debugMode?: boolean };

export type LogLevel = "debug" | "info" | "warn" | "error";

type AnyObj = Record<string, unknown> | undefined;

type CliLogFn = (
  level: CliLogLevel,
  message: string,
  context?: unknown,
  options?: CliLogOptions
) => void;

type InterruptFn = (writer: () => void) => void;

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const CLI_LEVEL_MAP: Record<LogLevel, CliLogLevel> = {
  debug: "detail",
  info: "info",
  warn: "warn",
  error: "error",
};

function envLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || "").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  // Default more verbose in development/test, quieter in production.
  return config.nodeEnv === "production" ? "info" : "debug";
}

let currentLevel: LogLevel = envLevel();

function enabled(level: LogLevel): boolean {
  return levelOrder[level] >= levelOrder[currentLevel];
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildCliContext(record: Record<string, unknown>, level: LogLevel): Record<string, unknown> {
  const context: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === "t" || key === "level" || key === "msg") {
      continue;
    }
    if (value === undefined) {
      continue;
    }
    if (key === "err" && level === "error") {
      context.error = value;
      continue;
    }
    context[key] = value;
  }
  return context;
}

function formatRecord(level: LogLevel, msg: string, err?: unknown, meta?: AnyObj): Record<string, unknown> {
  const base: Record<string, unknown> = { t: nowIso(), level, msg, env: config.nodeEnv };
  if (meta && typeof meta === "object") {
    Object.assign(base, meta);
  }
  if (level === "error") {
    base.err = safeError(err);
  }
  return base;
}

const logFormat = (process.env.LOG_FORMAT || "both").toLowerCase();
const isTty = Boolean(process.stdout?.isTTY && process.stderr?.isTTY);

let cliLogImpl: CliLogFn | null = null;
let interruptConsoleOutput: InterruptFn | null = null;
try {
  // @ts-ignore - runtime import for CLI logger (no typed module in build output)
  const loggerModule: any = await import("../utils/logger.js");
  cliLogImpl = loggerModule.log ?? loggerModule.default?.log ?? null;
} catch {
  cliLogImpl = null;
}

try {
  // @ts-ignore - runtime import for CLI status helper (dynamic only)
  const cliStatusModule: any = await import("../utils/cliStatus.js");
  interruptConsoleOutput =
    cliStatusModule.interruptConsoleOutput ?? cliStatusModule.default?.interruptConsoleOutput ?? null;
} catch {
  interruptConsoleOutput = null;
}

const cliEnabled = Boolean(cliLogImpl) && (logFormat === "cli" || logFormat === "both" || (logFormat === "auto" && isTty));
const jsonEnabled =
  logFormat === "json" ||
  logFormat === "both" ||
  (logFormat === "auto" && (!cliEnabled || !cliLogImpl));

const cliDebugMode = config.nodeEnv !== "production";

/**
 * Emit a log entry - checks if buffering is enabled first
 */
function emit(level: LogLevel, msg: string, err?: unknown, meta?: AnyObj): void {
  if (!enabled(level)) return;

  // Check if we should buffer this log
  const buffer = getLogBuffer();
  if (buffer && level !== "error") {
    // Buffer non-error logs (errors always bypass for immediate visibility)
    const context = meta ? { ...meta } : {};
    if (err) {
      context.err = safeError(err);
    }
    buffer.add(level, msg, context);
    return;
  }

  // Immediate output (no buffering or error log)
  emitImmediate(level, msg, err, meta);
}

/**
 * Emit a log entry immediately (bypasses buffer)
 */
function emitImmediate(level: LogLevel, msg: string, err?: unknown, meta?: AnyObj): void {
  const record = formatRecord(level, msg, err, meta);

  if (cliEnabled && cliLogImpl) {
    const context = buildCliContext(record, level);
    try {
      const payload = Object.keys(context).length > 0 ? context : undefined;
      cliLogImpl(CLI_LEVEL_MAP[level], msg, payload, { debugMode: cliDebugMode });
    } catch {
      // If CLI logging fails we still want to emit the JSON line below.
    }
  }

  if (jsonEnabled) {
    const line = JSON.stringify(record);
    if (interruptConsoleOutput) {
      interruptConsoleOutput(() => {
         
        console.log(line);
      });
    } else {
       
      console.log(line);
    }
  }
}

/**
 * Flush buffered logs (called by logBuffer)
 */
export function flushBufferedLogs(entries: BufferedLogEntry[]): void {
  if (entries.length === 0) return;

  // Emit a summary header if multiple entries
  if (entries.length > 1) {
    const totalMessages = entries.reduce((sum, e) => sum + e.count, 0);
    emitImmediate("info", `📦 Log buffer flush: ${entries.length} unique messages, ${totalMessages} total`);
  }

  // Emit each buffered entry
  for (const entry of entries) {
    const meta = entry.context ? { ...entry.context } : {};
    
    // Add metadata about buffering
    if (entry.count > 1) {
      meta._buffered = {
        count: entry.count,
        firstSeen: new Date(entry.firstSeen).toISOString(),
        lastSeen: new Date(entry.lastSeen).toISOString(),
        durationMs: entry.lastSeen - entry.firstSeen,
      };
    }

    emitImmediate(entry.level, entry.message, undefined, meta);
  }
}

export const log = {
  setLevel(level: LogLevel) {
    currentLevel = level;
  },

  debug(msg: string, meta?: AnyObj) {
    emit("debug", msg, undefined, meta);
  },

  info(msg: string, meta?: AnyObj) {
    emit("info", msg, undefined, meta);
  },

  warn(msg: string, meta?: AnyObj) {
    emit("warn", msg, undefined, meta);
  },

  error(msg: string, err?: unknown, meta?: AnyObj) {
    emit("error", msg, err, meta);
  },

  // For unit tests: produce the object without writing it
  _format(level: LogLevel, msg: string, err?: unknown, meta?: AnyObj) {
    return { ...formatRecord(level, msg, err, meta), t: "<iso>" };
  },
};
