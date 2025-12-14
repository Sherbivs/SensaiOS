/**
 * Console Renderer - DB-First Console Output System
 *
 * This module implements the DB-First architecture where:
 * - ALL console output originates from database queries
 * - The Render console is merely a VIEW of database state
 * - Human-friendly formatting for production visibility
 *
 * Architecture: App → Logger → DATABASE → ConsoleRenderer → Render Console
 *
 * @module console-renderer
 * @version 2.0.0 - Enhanced Human-Friendly Edition
 */
// ═══════════════════════════════════════════════════════════════════════════════
// VISUAL CONSTANTS - Beautiful Human-Friendly Output
// ═══════════════════════════════════════════════════════════════════════════════
const ICONS = {
    // Log Levels
    error: "🔴",
    warn: "🟡",
    info: "🟢",
    debug: "🔵",
    trace: "⚪",
    // Status
    healthy: "💚",
    degraded: "💛",
    unhealthy: "💔",
    unknown: "❓",
    // Components
    database: "🗄️",
    bot: "🤖",
    battle: "⚔️",
    encounter: "🎯",
    cache: "📦",
    worker: "⚙️",
    security: "🛡️",
    api: "🌐",
    // Decorative
    separator: "═",
    bullet: "•",
    arrow: "→",
    check: "✓",
    cross: "✗",
    clock: "🕐",
    lightning: "⚡",
    chart: "📊",
    fire: "🔥",
    snowflake: "❄️",
};
const COLORS = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    gray: "\x1b[90m",
    bgRed: "\x1b[41m",
    bgGreen: "\x1b[42m",
    bgYellow: "\x1b[43m",
    bgBlue: "\x1b[44m",
};
// ═══════════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════
let prisma = null;
let pollInterval = null;
let healthInterval = null;
let lastLogTimestamp = new Date(0);
let lastConsoleOutputTimestamp = new Date(0);
let isRunning = false;
let cycleCount = 0;
let totalLogsRendered = 0;
const defaultConfig = {
    pollIntervalMs: 5000,
    batchSize: 100,
    showWorkerHealth: true,
    healthSummaryIntervalMs: 60000,
    format: "detailed",
    enableColors: true,
    showTimestamps: true,
    groupByComponent: true,
};
let config = { ...defaultConfig };
// ═══════════════════════════════════════════════════════════════════════════════
// FORMATTING UTILITIES - Human-Friendly Output
// ═══════════════════════════════════════════════════════════════════════════════
function color(text, colorCode) {
    if (!config.enableColors)
        return text;
    return `${colorCode}${text}${COLORS.reset}`;
}
function formatTimestamp(date) {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");
    const ms = date.getMilliseconds().toString().padStart(3, "0");
    return color(`${hours}:${minutes}:${seconds}.${ms}`, COLORS.gray);
}
function formatDuration(ms) {
    if (ms === null || ms === undefined)
        return "";
    if (ms < 1)
        return color(`<1ms`, COLORS.green);
    if (ms < 10)
        return color(`${ms}ms`, COLORS.green);
    if (ms < 100)
        return color(`${ms}ms`, COLORS.cyan);
    if (ms < 1000)
        return color(`${ms}ms`, COLORS.yellow);
    return color(`${(ms / 1000).toFixed(2)}s`, COLORS.red);
}
function formatBytes(bytes) {
    if (bytes === null || bytes === undefined)
        return "N/A";
    const num = typeof bytes === "bigint" ? Number(bytes) : bytes;
    if (num < 1024)
        return `${num}B`;
    if (num < 1024 * 1024)
        return `${(num / 1024).toFixed(1)}KB`;
    if (num < 1024 * 1024 * 1024)
        return `${(num / (1024 * 1024)).toFixed(1)}MB`;
    return `${(num / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}
function formatPercentage(pct) {
    if (pct === null || pct === undefined)
        return "N/A";
    const rounded = Math.round(pct);
    if (rounded < 50)
        return color(`${rounded}%`, COLORS.green);
    if (rounded < 75)
        return color(`${rounded}%`, COLORS.yellow);
    return color(`${rounded}%`, COLORS.red);
}
function getLevelIcon(level) {
    const normalizedLevel = level.toLowerCase();
    return ICONS[normalizedLevel] || ICONS.info;
}
function getLevelColor(level) {
    const normalizedLevel = level.toLowerCase();
    switch (normalizedLevel) {
        case "error": return COLORS.red;
        case "warn": return COLORS.yellow;
        case "info": return COLORS.green;
        case "debug": return COLORS.blue;
        case "trace": return COLORS.gray;
        default: return COLORS.white;
    }
}
function getComponentIcon(component) {
    if (!component)
        return ICONS.bullet;
    const normalized = component.toLowerCase();
    return ICONS[normalized] || ICONS.bullet;
}
function getHealthIcon(status) {
    const normalized = status.toLowerCase();
    return ICONS[normalized] || ICONS.unknown;
}
function getHealthColor(status) {
    const normalized = status.toLowerCase();
    switch (normalized) {
        case "healthy": return COLORS.green;
        case "degraded": return COLORS.yellow;
        case "unhealthy": return COLORS.red;
        default: return COLORS.gray;
    }
}
// ═══════════════════════════════════════════════════════════════════════════════
// VISUAL SEPARATORS & HEADERS
// ═══════════════════════════════════════════════════════════════════════════════
function printSeparator(char = ICONS.separator, length = 80) {
    console.log(color(char.repeat(length), COLORS.dim));
}
function printHeader(title, icon = "") {
    const padding = Math.max(0, 76 - title.length - icon.length) / 2;
    const leftPad = " ".repeat(Math.floor(padding));
    const rightPad = " ".repeat(Math.ceil(padding));
    printSeparator();
    console.log(color(`║${leftPad}${icon} ${title}${rightPad}║`, COLORS.cyan));
    printSeparator();
}
function printSubHeader(title) {
    console.log("");
    console.log(color(`┌─ ${title} ─${"─".repeat(Math.max(0, 70 - title.length))}┐`, COLORS.dim));
}
function printFooter() {
    console.log(color(`└${"─".repeat(78)}┘`, COLORS.dim));
}
// ═══════════════════════════════════════════════════════════════════════════════
// LOG ENTRY FORMATTING
// ═══════════════════════════════════════════════════════════════════════════════
function formatLogEntry(entry) {
    const icon = getLevelIcon(entry.level);
    const levelColor = getLevelColor(entry.level);
    const componentIcon = getComponentIcon(entry.component);
    const duration = formatDuration(entry.durationMs);
    const timestamp = config.showTimestamps ? `${formatTimestamp(entry.timestamp)} ` : "";
    const level = color(entry.level.toUpperCase().padEnd(5), levelColor);
    const component = entry.component ? color(`[${entry.component}]`, COLORS.cyan) : "";
    const operation = entry.operation ? color(`.${entry.operation}()`, COLORS.magenta) : "";
    const durationStr = duration ? ` ${ICONS.clock}${duration}` : "";
    let line = `${timestamp}${icon} ${level} ${componentIcon} ${component}${operation}${durationStr}`;
    line += `\n   ${ICONS.arrow} ${entry.message}`;
    // Add context if present and meaningful
    if (entry.context && typeof entry.context === "object" && Object.keys(entry.context).length > 0) {
        const contextStr = JSON.stringify(entry.context, null, 2)
            .split("\n")
            .map(l => `      ${l}`)
            .join("\n");
        line += `\n${color(contextStr, COLORS.dim)}`;
    }
    // Add correlation ID for tracing
    if (entry.correlationId) {
        line += `\n   ${color(`correlation: ${entry.correlationId}`, COLORS.gray)}`;
    }
    return line;
}
function formatLogEntryCompact(entry) {
    const icon = getLevelIcon(entry.level);
    const timestamp = entry.timestamp.toISOString().substring(11, 23);
    const component = entry.component ? `[${entry.component}]` : "";
    const duration = entry.durationMs ? ` (${entry.durationMs}ms)` : "";
    return `${timestamp} ${icon} ${component} ${entry.message}${duration}`;
}
function formatLogEntryJson(entry) {
    return JSON.stringify({
        timestamp: entry.timestamp.toISOString(),
        level: entry.level,
        component: entry.component,
        operation: entry.operation,
        message: entry.message,
        durationMs: entry.durationMs,
        correlationId: entry.correlationId,
        context: entry.context,
    });
}
// ═══════════════════════════════════════════════════════════════════════════════
// WORKER HEALTH FORMATTING
// ═══════════════════════════════════════════════════════════════════════════════
function formatWorkerHealthSummary(metrics) {
    if (metrics.length === 0) {
        return color("  No worker metrics available", COLORS.gray);
    }
    const lines = [];
    // Group by worker
    const workerGroups = new Map();
    for (const m of metrics) {
        const existing = workerGroups.get(m.workerName);
        if (!existing || m.timestamp > existing.timestamp) {
            workerGroups.set(m.workerName, m);
        }
    }
    // Header row
    lines.push(color("  ┌────────────────────────┬────────┬─────────┬─────────┬──────────┬────────────┐", COLORS.dim));
    lines.push(color("  │ Worker                 │ Status │ Success │ Failure │ Avg Lat  │ Memory     │", COLORS.dim));
    lines.push(color("  ├────────────────────────┼────────┼─────────┼─────────┼──────────┼────────────┤", COLORS.dim));
    for (const [name, m] of workerGroups) {
        const healthIcon = getHealthIcon(m.healthStatus);
        const healthColor = getHealthColor(m.healthStatus);
        const workerName = name.padEnd(20).substring(0, 20);
        const status = color(m.healthStatus.padEnd(6), healthColor);
        const success = color(m.successCount.toString().padStart(7), COLORS.green);
        const failure = m.failureCount > 0
            ? color(m.failureCount.toString().padStart(7), COLORS.red)
            : color(m.failureCount.toString().padStart(7), COLORS.dim);
        const latency = formatDuration(m.avgLatencyMs).padStart(8);
        const memory = formatBytes(m.memoryUsedBytes).padStart(10);
        lines.push(`  │ ${healthIcon} ${workerName} │ ${status} │ ${success} │ ${failure} │ ${latency} │ ${memory} │`);
        // Show last error if any
        if (m.lastError) {
            const errorLine = `     ${ICONS.fire} ${color(m.lastError.substring(0, 70), COLORS.red)}`;
            lines.push(errorLine);
        }
    }
    lines.push(color("  └────────────────────────┴────────┴─────────┴─────────┴──────────┴────────────┘", COLORS.dim));
    return lines.join("\n");
}
// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE QUERIES
// ═══════════════════════════════════════════════════════════════════════════════
async function queryRecentLogs(since, limit = 100) {
    if (!prisma)
        return [];
    try {
        const rows = await prisma.$queryRaw `
      SELECT id, timestamp, level, message, context, "correlationId", component, operation, "durationMs"
      FROM log_entries
      WHERE timestamp > ${since}
      ORDER BY timestamp ASC
      LIMIT ${limit}
    `;
        return rows;
    }
    catch {
        // Table might not exist yet - return empty
        return [];
    }
}
async function queryRecentConsoleOutputs(since, limit = 50) {
    if (!prisma)
        return [];
    try {
        const rows = await prisma.$queryRaw `
      SELECT id, timestamp, "serviceName", "outputType", "outputLevel", "rawOutput", "parsedData"
      FROM console_outputs
      WHERE timestamp > ${since}
      ORDER BY timestamp ASC
      LIMIT ${limit}
    `;
        return rows;
    }
    catch {
        return [];
    }
}
async function queryWorkerHealth(limit = 20) {
    if (!prisma)
        return [];
    try {
        const rows = await prisma.$queryRaw `
      SELECT DISTINCT ON ("workerName")
        id, timestamp, "workerId", "workerName", "operationCount", 
        "successCount", "failureCount", "avgLatencyMs", "healthStatus", 
        "lastError", "memoryUsedBytes", "bufferUtilizationPct"
      FROM worker_metrics
      ORDER BY "workerName", timestamp DESC
      LIMIT ${limit}
    `;
        return rows;
    }
    catch {
        return [];
    }
}
// ═══════════════════════════════════════════════════════════════════════════════
// RENDERING ENGINE
// ═══════════════════════════════════════════════════════════════════════════════
async function renderLogs(logs) {
    if (logs.length === 0)
        return;
    if (config.groupByComponent) {
        // Group logs by component for cleaner output
        const grouped = new Map();
        for (const log of logs) {
            const key = log.component || "general";
            if (!grouped.has(key))
                grouped.set(key, []);
            grouped.get(key).push(log);
        }
        for (const [component, componentLogs] of grouped) {
            if (componentLogs.length > 3) {
                printSubHeader(`${getComponentIcon(component)} ${component} (${componentLogs.length} entries)`);
            }
            for (const log of componentLogs) {
                const formatted = config.format === "compact"
                    ? formatLogEntryCompact(log)
                    : config.format === "json"
                        ? formatLogEntryJson(log)
                        : formatLogEntry(log);
                console.log(formatted);
            }
        }
    }
    else {
        for (const log of logs) {
            const formatted = config.format === "compact"
                ? formatLogEntryCompact(log)
                : config.format === "json"
                    ? formatLogEntryJson(log)
                    : formatLogEntry(log);
            console.log(formatted);
        }
    }
    totalLogsRendered += logs.length;
}
async function renderConsoleOutputs(outputs) {
    if (outputs.length === 0)
        return;
    for (const output of outputs) {
        const icon = getLevelIcon(output.outputLevel);
        const timestamp = formatTimestamp(output.timestamp);
        const service = color(`[${output.serviceName}]`, COLORS.cyan);
        const type = color(`(${output.outputType})`, COLORS.dim);
        console.log(`${timestamp} ${icon} ${service} ${type}`);
        console.log(`   ${output.rawOutput}`);
    }
}
async function renderWorkerHealth() {
    const metrics = await queryWorkerHealth();
    if (metrics.length === 0)
        return;
    printHeader("Worker Health Dashboard", ICONS.chart);
    console.log(formatWorkerHealthSummary(metrics));
    // Calculate overall health
    const healthyCount = metrics.filter(m => m.healthStatus === "healthy").length;
    const totalWorkers = metrics.length;
    const healthPct = (healthyCount / totalWorkers) * 100;
    console.log("");
    console.log(`  ${ICONS.chart} Overall Health: ${formatPercentage(healthPct)} (${healthyCount}/${totalWorkers} workers healthy)`);
    console.log(`  ${ICONS.clock} Last updated: ${new Date().toISOString()}`);
    printFooter();
}
// ═══════════════════════════════════════════════════════════════════════════════
// MAIN POLLING LOOP
// ═══════════════════════════════════════════════════════════════════════════════
async function pollAndRender() {
    if (!prisma || !isRunning)
        return;
    cycleCount++;
    try {
        // Query new logs
        const logs = await queryRecentLogs(lastLogTimestamp, config.batchSize);
        if (logs.length > 0) {
            await renderLogs(logs);
            lastLogTimestamp = logs[logs.length - 1].timestamp;
        }
        // Query new console outputs
        const outputs = await queryRecentConsoleOutputs(lastConsoleOutputTimestamp, config.batchSize);
        if (outputs.length > 0) {
            await renderConsoleOutputs(outputs);
            lastConsoleOutputTimestamp = outputs[outputs.length - 1].timestamp;
        }
        // Periodic status (every 10 cycles)
        if (cycleCount % 10 === 0 && logs.length === 0 && outputs.length === 0) {
            console.log(color(`${ICONS.snowflake} Console renderer active - ${totalLogsRendered} logs rendered (cycle ${cycleCount})`, COLORS.dim));
        }
    }
    catch (error) {
        console.error(`${ICONS.error} Console renderer poll error:`, error);
    }
}
// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Initialize the console renderer with a Prisma client
 */
export function initConsoleRenderer(prismaClient, options) {
    prisma = prismaClient;
    config = { ...defaultConfig, ...options };
    lastLogTimestamp = new Date();
    lastConsoleOutputTimestamp = new Date();
    cycleCount = 0;
    totalLogsRendered = 0;
    console.log(`${ICONS.check} Console renderer initialized`);
    console.log(`   ${ICONS.bullet} Poll interval: ${config.pollIntervalMs}ms`);
    console.log(`   ${ICONS.bullet} Format: ${config.format}`);
    console.log(`   ${ICONS.bullet} Health summaries: ${config.showWorkerHealth ? "enabled" : "disabled"}`);
}
/**
 * Start the polling loop
 */
export function startConsoleRenderer() {
    if (!prisma) {
        console.error(`${ICONS.cross} Cannot start console renderer - not initialized`);
        return;
    }
    if (isRunning) {
        console.warn(`${ICONS.warn} Console renderer already running`);
        return;
    }
    isRunning = true;
    // Start main polling
    pollInterval = setInterval(() => {
        pollAndRender().catch(err => {
            console.error(`${ICONS.error} Poll error:`, err);
        });
    }, config.pollIntervalMs);
    // Start health summary interval if enabled
    if (config.showWorkerHealth) {
        healthInterval = setInterval(() => {
            renderWorkerHealth().catch(err => {
                console.error(`${ICONS.error} Health render error:`, err);
            });
        }, config.healthSummaryIntervalMs);
    }
    printHeader("DB-First Console Renderer Started", ICONS.lightning);
    console.log(`   ${ICONS.bullet} Polling database every ${config.pollIntervalMs}ms`);
    console.log(`   ${ICONS.bullet} ALL console output now comes from database queries`);
    console.log(`   ${ICONS.bullet} This IS the single source of truth for logs`);
    printFooter();
}
/**
 * Stop the polling loop
 */
export function stopConsoleRenderer() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
    if (healthInterval) {
        clearInterval(healthInterval);
        healthInterval = null;
    }
    isRunning = false;
    console.log(`${ICONS.check} Console renderer stopped`);
    console.log(`   ${ICONS.bullet} Total logs rendered: ${totalLogsRendered}`);
    console.log(`   ${ICONS.bullet} Total cycles: ${cycleCount}`);
}
/**
 * Query and immediately display recent logs (on-demand)
 */
export async function queryAndDisplayLogs(minutes = 5) {
    const since = new Date(Date.now() - minutes * 60 * 1000);
    printHeader(`Logs from last ${minutes} minutes`, ICONS.clock);
    const logs = await queryRecentLogs(since, 500);
    if (logs.length === 0) {
        console.log(color("  No logs found in the specified time range", COLORS.gray));
    }
    else {
        await renderLogs(logs);
        console.log("");
        console.log(`  ${ICONS.chart} Total: ${logs.length} log entries`);
    }
    printFooter();
}
/**
 * Display the worker health dashboard (on-demand)
 */
export async function displayHealthDashboard() {
    await renderWorkerHealth();
}
/**
 * Get renderer statistics
 */
export function getRendererStats() {
    return {
        isRunning,
        cycleCount,
        totalLogsRendered,
        config: { ...config },
    };
}
/**
 * Update renderer configuration at runtime
 */
export function updateConfig(newConfig) {
    config = { ...config, ...newConfig };
    console.log(`${ICONS.check} Console renderer config updated`);
}
export { config as rendererConfig };
