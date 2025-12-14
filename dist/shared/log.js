// Minimal structured logger without external deps.
// Outputs JSON lines with timestamp, level, message, and optional context.
// Now includes optional buffering to reduce console noise.
import { config } from "./config.js";
import { safeError } from "./utils/error-utils.js";
import { getLogBuffer } from "./logBuffer.js";
const levelOrder = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};
const CLI_LEVEL_MAP = {
    debug: "detail",
    info: "info",
    warn: "warn",
    error: "error",
};
function envLevel() {
    const raw = (process.env.LOG_LEVEL || "").toLowerCase();
    if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
        return raw;
    }
    // Default more verbose in development/test, quieter in production.
    return config.nodeEnv === "production" ? "info" : "debug";
}
let currentLevel = envLevel();
function enabled(level) {
    return levelOrder[level] >= levelOrder[currentLevel];
}
function nowIso() {
    return new Date().toISOString();
}
function buildCliContext(record, level) {
    const context = {};
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
function formatRecord(level, msg, err, meta) {
    const base = { t: nowIso(), level, msg, env: config.nodeEnv };
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
let cliLogImpl = null;
let interruptConsoleOutput = null;
let cliLoggerLoading = false;
let cliLoggerLoaded = false;
/**
 * Lazy-load CLI logger to avoid circular dependency deadlock.
 * The top-level await was causing module initialization to hang because:
 * index.ts → log.ts (await import logger.js) → logger.js → resource-monitor.ts → intelligent-logger.ts → event-bus.ts
 * This creates a circular dependency where the await never resolves.
 *
 * Solution: Load logger.js lazily on first use instead of at module load time.
 */
async function ensureCliLoggerLoaded() {
    if (cliLoggerLoaded || cliLoggerLoading)
        return;
    cliLoggerLoading = true;
    try {
        // Lazy dynamic import of CLI logger module
        const loggerModule = await import("../utils/logger.js");
        cliLogImpl = loggerModule.log ?? loggerModule.default?.log ?? null;
        // Lazy dynamic import of CLI status helper
        const cliStatusModule = await import("../utils/cliStatus.js");
        interruptConsoleOutput =
            cliStatusModule.interruptConsoleOutput ?? cliStatusModule.default?.interruptConsoleOutput ?? null;
        cliLoggerLoaded = true;
    }
    catch {
        // Fallback to JSON-only logging if CLI logger unavailable
        cliLogImpl = null;
        interruptConsoleOutput = null;
        cliLoggerLoaded = true;
    }
}
const cliEnabled = Boolean(cliLogImpl) && (logFormat === "cli" || logFormat === "both" || (logFormat === "auto" && isTty));
const jsonEnabled = logFormat === "json" ||
    logFormat === "both" ||
    (logFormat === "auto" && (!cliEnabled || !cliLogImpl));
const cliDebugMode = config.nodeEnv !== "production";
/**
 * Emit a log entry - checks if buffering is enabled first
 */
function emit(level, msg, err, meta) {
    if (!enabled(level))
        return;
    // Lazy-load CLI logger on first use
    if (!cliLoggerLoaded && !cliLoggerLoading) {
        ensureCliLoggerLoaded().catch(() => {
            // Silently fall back to JSON-only logging
        });
    }
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
function emitImmediate(level, msg, err, meta) {
    const record = formatRecord(level, msg, err, meta);
    if (cliEnabled && cliLogImpl) {
        const context = buildCliContext(record, level);
        try {
            const payload = Object.keys(context).length > 0 ? context : undefined;
            cliLogImpl(CLI_LEVEL_MAP[level], msg, payload, { debugMode: cliDebugMode });
        }
        catch {
            // If CLI logging fails we still want to emit the JSON line below.
        }
    }
    if (jsonEnabled) {
        const line = JSON.stringify(record);
        if (interruptConsoleOutput) {
            interruptConsoleOutput(() => {
                console.log(line);
            });
        }
        else {
            console.log(line);
        }
    }
}
/**
 * Flush buffered logs (called by logBuffer)
 */
export function flushBufferedLogs(entries) {
    if (entries.length === 0)
        return;
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
    setLevel(level) {
        currentLevel = level;
    },
    debug(msg, meta) {
        emit("debug", msg, undefined, meta);
    },
    info(msg, meta) {
        emit("info", msg, undefined, meta);
    },
    warn(msg, meta) {
        emit("warn", msg, undefined, meta);
    },
    error(msg, err, meta) {
        emit("error", msg, err, meta);
    },
    // For unit tests: produce the object without writing it
    _format(level, msg, err, meta) {
        return { ...formatRecord(level, msg, err, meta), t: "<iso>" };
    },
};
