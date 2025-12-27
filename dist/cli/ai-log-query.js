#!/usr/bin/env node
import { program } from "commander";
import * as aiLogAnalyzer from "../services/ai/ai-log-analyzer.js";
import * as aiLogWriter from "../services/ai/ai-log-writer.js";
import { truncate } from "../shared/utils/index.js";
import chalk from "chalk";
const formatOutputPart = (part) => {
    if (typeof part === "string")
        return part;
    if (part instanceof Error)
        return part.message;
    return JSON.stringify(part);
};
const writeLine = (...parts) => {
    process.stdout.write(`${parts.map(formatOutputPart).join(" ")}\n`);
};
const writeError = (...parts) => {
    process.stderr.write(`${parts.map(formatOutputPart).join(" ")}\n`);
};
// ============================================================================
// Helper Functions
// ============================================================================
/**
 * Format timestamp for display.
 */
function formatTime(timestamp) {
    return new Date(timestamp).toISOString().replace("T", " ").substring(0, 19);
}
/**
 * Format duration in ms.
 */
function formatDuration(ms) {
    if (ms < 1)
        return `${(ms * 1000).toFixed(0)}μs`;
    if (ms < 1000)
        return `${ms.toFixed(1)}ms`;
    if (ms < 60000)
        return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}
/**
 * Colorize log level.
 */
function colorizeLevel(level) {
    const colors = {
        TRACE: chalk.gray,
        DEBUG: chalk.blue,
        INFO: chalk.green,
        NOTICE: chalk.cyan,
        WARN: chalk.yellow,
        ERROR: chalk.red,
        CRITICAL: chalk.redBright,
        FATAL: chalk.bgRed.white,
    };
    return (colors[level] || chalk.white)(level.padEnd(8));
}
/**
 * Colorize category.
 */
function colorizeCategory(category) {
    const colors = {
        system: chalk.magenta,
        database: chalk.blue,
        discord: chalk.cyan,
        "game-engine": chalk.green,
        security: chalk.red,
        performance: chalk.yellow,
        error: chalk.redBright,
        resource: chalk.blue,
        "user-action": chalk.cyan,
        integration: chalk.magenta,
    };
    return (colors[category] || chalk.white)(category.padEnd(15));
}
/**
 * Parse relative time string to Date
 */
function parseRelativeTime(timeStr) {
    if (timeStr.match(/^\d+[hms]$/)) {
        const unit = timeStr.slice(-1);
        const value = parseInt(timeStr.slice(0, -1));
        const multiplier = { h: 3600000, m: 60000, s: 1000 };
        return new Date(Date.now() - value * multiplier[unit]);
    }
    return new Date(timeStr);
}
// ============================================================================
// Query Command
// ============================================================================
program
    .command("query")
    .description("Query logs with filters")
    .option("-c, --category <category>", "Filter by category")
    .option("-l, --level <level>", "Filter by level")
    .option('-s, --since <since>', 'Filter since (ISO date or relative like "1h", "30m")')
    .option("-u, --until <until>", "Filter until (ISO date)")
    .option("-t, --tags <tags>", "Filter by tags (comma-separated)")
    .option("-g, --grep <pattern>", "Grep message text (case-insensitive)")
    .option("-n, --limit <n>", "Limit results", parseInt)
    .option("-f, --follow", "Follow logs in real-time (tail -f mode)")
    .option("--json", "Output as JSON")
    .option("--compact", "Compact output")
    .action(async (options) => {
    try {
        await aiLogAnalyzer.initialize();
        // Parse since time
        const since = options.since ? parseRelativeTime(options.since) : null;
        // Parse until time
        const until = options.until ? new Date(options.until) : null;
        // Parse tags
        const tags = options.tags ? options.tags.split(",").map((t) => t.trim()) : [];
        // Query logs
        const filters = {
            category: options.category,
            level: options.level,
            since,
            until,
            tags,
            limit: options.limit ? parseInt(options.limit, 10) : undefined,
        };
        let count = 0;
        for await (const entry of aiLogAnalyzer.query(filters)) {
            // Grep filter
            if (options.grep) {
                const pattern = new RegExp(options.grep, "i");
                if (!pattern.test(entry.message))
                    continue;
            }
            count++;
            if (options.json) {
                writeLine(JSON.stringify(entry));
            }
            else if (options.compact) {
                writeLine(`${formatTime(entry.timestamp)} ` +
                    `${colorizeLevel(entry.level)} ` +
                    `${colorizeCategory(entry.category)} ` +
                    `${truncate(entry.message, 60, "...")}`);
            }
            else {
                writeLine("");
                writeLine(chalk.gray("─".repeat(80)));
                writeLine(`${formatTime(entry.timestamp)} ` +
                    `${colorizeLevel(entry.level)} ` +
                    `${colorizeCategory(entry.category)}`);
                writeLine(chalk.white.bold(entry.message));
                if (entry.context?.file) {
                    writeLine(chalk.gray(`  at ${entry.context.file}:${entry.context.line} in ${entry.context.function}`));
                }
                if (entry.error) {
                    writeLine(chalk.red(`  Error: ${entry.error.name}: ${entry.error.message}`));
                }
                if (entry.data && Object.keys(entry.data).length > 0) {
                    writeLine(chalk.gray("  Data:"));
                    for (const [key, value] of Object.entries(entry.data)) {
                        const val = typeof value === "object" ? JSON.stringify(value) : value;
                        writeLine(chalk.gray(`    ${key}: ${truncate(String(val), 60, "...")}`));
                    }
                }
                if (entry.tags && entry.tags.length > 0) {
                    writeLine(chalk.gray(`  Tags: ${entry.tags.join(", ")}`));
                }
                writeLine(chalk.gray(`  Correlation ID: ${entry.correlationId}`));
            }
        }
        if (!options.json) {
            writeLine("");
            writeLine(chalk.gray(`Total: ${count} entries`));
        }
        await aiLogAnalyzer.shutdown();
        process.exit(0);
    }
    catch (error) {
        writeError(chalk.red("Query failed:"), error.message);
        process.exit(1);
    }
});
// ============================================================================
// Analyze Command
// ============================================================================
program
    .command("analyze")
    .description("Run full analysis pipeline (patterns, correlations, insights)")
    .option('-s, --since <since>', 'Analyze since (ISO date or relative like "1h")')
    .option("--json", "Output as JSON")
    .action(async (options) => {
    try {
        await aiLogAnalyzer.initialize();
        // Parse since time
        const since = options.since ? parseRelativeTime(options.since) : undefined;
        writeLine(chalk.cyan("Running analysis..."));
        const results = (await aiLogAnalyzer.analyze({ since }));
        if (options.json) {
            writeLine(JSON.stringify(results, null, 2));
        }
        else {
            writeLine("");
            writeLine(chalk.green.bold("═══ ANALYSIS RESULTS ═══"));
            writeLine("");
            // Error Patterns
            writeLine(chalk.yellow.bold(`Error Patterns: ${results.errorPatterns.length}`));
            for (const pattern of results.errorPatterns.slice(0, 5)) {
                writeLine(`  ${chalk.red("●")} ${pattern.errorName} (x${pattern.count})`);
                writeLine(chalk.gray(`    ${truncate(pattern.pattern, 70, "...")}`));
                writeLine(chalk.gray(`    Files: ${pattern.files.slice(0, 2).join(", ")}`));
            }
            writeLine("");
            // Performance Patterns
            writeLine(chalk.yellow.bold(`Performance Patterns: ${results.performancePatterns.length}`));
            for (const pattern of results.performancePatterns.slice(0, 5)) {
                writeLine(`  ${chalk.blue("●")} ${pattern.operation}`);
                writeLine(chalk.gray(`    Avg: ${formatDuration(pattern.avg)} | P95: ${formatDuration(pattern.p95)} | Max: ${formatDuration(pattern.max)}`));
            }
            writeLine("");
            // Correlations
            writeLine(chalk.yellow.bold(`Correlations: ${results.correlations.length}`));
            for (const corr of results.correlations.slice(0, 5)) {
                writeLine(`  ${chalk.cyan("●")} ${corr.event1} → ${corr.event2} (x${corr.count})`);
                writeLine(chalk.gray(`    Avg time delta: ${formatDuration(corr.avgTimeDelta)}`));
            }
            writeLine("");
            // Anomalies
            writeLine(chalk.yellow.bold(`Anomalies: ${results.anomalies.length}`));
            for (const anomaly of results.anomalies.slice(0, 5)) {
                writeLine(`  ${chalk.red("●")} ${anomaly.level} logs spike: ${anomaly.count} (baseline: ${anomaly.baseline.toFixed(0)})`);
                writeLine(chalk.gray(`    Deviation: ${anomaly.deviation.toFixed(1)}σ`));
            }
            writeLine("");
            // Insights
            writeLine(chalk.yellow.bold(`Insights: ${results.insights.length}`));
            for (const insight of results.insights.slice(0, 10)) {
                const icon = {
                    recurring_error: "❌",
                    performance_bottleneck: "🐌",
                    cascading_failure: "⚡",
                    anomaly: "📊",
                };
                writeLine(`  ${icon[insight.type] || "●"} [${insight.severity.toUpperCase()}] ${insight.title}`);
                writeLine(chalk.gray(`    ${insight.description}`));
                writeLine(chalk.cyan(`    → ${insight.recommendation}`));
                writeLine("");
            }
            // Stats
            writeLine(chalk.gray(`Stats: ${results.stats.logsAnalyzed} logs analyzed`));
        }
        await aiLogAnalyzer.shutdown();
        process.exit(0);
    }
    catch (error) {
        writeError(chalk.red("Analysis failed:"), error.message);
        process.exit(1);
    }
});
// ============================================================================
// Patterns Command
// ============================================================================
program
    .command("patterns")
    .description("Show detected error patterns")
    .option("--json", "Output as JSON")
    .action(async (options) => {
    try {
        await aiLogAnalyzer.initialize();
        const patterns = (await aiLogAnalyzer.detectErrorPatterns());
        if (options.json) {
            writeLine(JSON.stringify(patterns, null, 2));
        }
        else {
            writeLine("");
            writeLine(chalk.green.bold(`═══ ERROR PATTERNS (${patterns.length}) ═══`));
            writeLine("");
            for (const pattern of patterns) {
                writeLine(chalk.red(`● ${pattern.errorName}`));
                writeLine(chalk.gray(`  Pattern: ${truncate(pattern.pattern, 70, "...")}`));
                writeLine(chalk.gray(`  Occurrences: ${pattern.count}`));
                writeLine(chalk.gray(`  First seen: ${formatTime(pattern.firstSeen)}`));
                writeLine(chalk.gray(`  Last seen: ${formatTime(pattern.lastSeen)}`));
                writeLine(chalk.gray(`  Files: ${pattern.files.join(", ")}`));
                writeLine("");
            }
        }
        await aiLogAnalyzer.shutdown();
        process.exit(0);
    }
    catch (error) {
        writeError(chalk.red("Failed:"), error.message);
        process.exit(1);
    }
});
// ============================================================================
// Performance Command
// ============================================================================
program
    .command("performance")
    .description("Show performance baselines")
    .option("--json", "Output as JSON")
    .action(async (options) => {
    try {
        await aiLogAnalyzer.initialize();
        const patterns = (await aiLogAnalyzer.detectPerformancePatterns());
        if (options.json) {
            writeLine(JSON.stringify(patterns, null, 2));
        }
        else {
            writeLine("");
            writeLine(chalk.green.bold(`═══ PERFORMANCE BASELINES (${patterns.length}) ═══`));
            writeLine("");
            for (const pattern of patterns) {
                writeLine(chalk.blue(`● ${pattern.operation}`));
                writeLine(chalk.gray(`  Count: ${pattern.count}`));
                writeLine(chalk.gray(`  Avg: ${formatDuration(pattern.avg)}`));
                writeLine(chalk.gray(`  P95: ${formatDuration(pattern.p95)}`));
                writeLine(chalk.gray(`  Min: ${formatDuration(pattern.min)} | Max: ${formatDuration(pattern.max)}`));
                if (pattern.files && pattern.files.length > 0) {
                    writeLine(chalk.gray(`  Files: ${pattern.files.join(", ")}`));
                }
                writeLine("");
            }
        }
        await aiLogAnalyzer.shutdown();
        process.exit(0);
    }
    catch (error) {
        writeError(chalk.red("Failed:"), error.message);
        process.exit(1);
    }
});
// ============================================================================
// Insights Command
// ============================================================================
program
    .command("insights")
    .description("Show AI-generated insights")
    .option("--json", "Output as JSON")
    .action(async (options) => {
    try {
        await aiLogAnalyzer.initialize();
        const insights = (await aiLogAnalyzer.generateInsights());
        if (options.json) {
            writeLine(JSON.stringify(insights, null, 2));
        }
        else {
            writeLine("");
            writeLine(chalk.green.bold(`═══ AI INSIGHTS (${insights.length}) ═══`));
            writeLine("");
            for (const insight of insights) {
                let severityColor;
                if (insight.severity === "high") {
                    severityColor = chalk.red;
                }
                else if (insight.severity === "medium") {
                    severityColor = chalk.yellow;
                }
                else {
                    severityColor = chalk.green;
                }
                writeLine(severityColor.bold(`[${insight.severity.toUpperCase()}] ${insight.title}`));
                writeLine(chalk.gray(`  ${insight.description}`));
                writeLine(chalk.cyan(`  → Recommendation: ${insight.recommendation}`));
                if (insight.affectedFiles && insight.affectedFiles.length > 0) {
                    writeLine(chalk.gray(`  Affected files: ${insight.affectedFiles.join(", ")}`));
                }
                writeLine("");
            }
        }
        await aiLogAnalyzer.shutdown();
        process.exit(0);
    }
    catch (error) {
        writeError(chalk.red("Failed:"), error.message);
        process.exit(1);
    }
});
// ============================================================================
// Stats Command
// ============================================================================
program
    .command("stats")
    .description("Show logging statistics")
    .option("--writer", "Show writer stats")
    .option("--analyzer", "Show analyzer stats")
    .option("--json", "Output as JSON")
    .action(async (options) => {
    try {
        const stats = {};
        if (options.writer || (!options.writer && !options.analyzer)) {
            stats.writer = aiLogWriter.getStats();
        }
        if (options.analyzer || (!options.writer && !options.analyzer)) {
            await aiLogAnalyzer.initialize();
            stats.analyzer = aiLogAnalyzer.getKnowledgeSummary();
            await aiLogAnalyzer.shutdown();
        }
        if (options.json) {
            writeLine(JSON.stringify(stats, null, 2));
        }
        else {
            writeLine("");
            writeLine(chalk.green.bold("═══ AI LOG SYSTEM STATS ═══"));
            writeLine("");
            if (stats.writer) {
                writeLine(chalk.yellow.bold("Writer:"));
                writeLine(chalk.gray(`  Logs written: ${stats.writer.logsWritten}`));
                writeLine(chalk.gray(`  Bytes written: ${(stats.writer.bytesWritten / 1024 / 1024).toFixed(2)} MB`));
                writeLine(chalk.gray(`  Errors: ${stats.writer.errorsEncountered}`));
                writeLine(chalk.gray(`  Rotations: ${stats.writer.rotationsPerformed}`));
                writeLine(chalk.gray(`  Compressions: ${stats.writer.compressionsPerformed}`));
                writeLine(chalk.gray(`  Flushes: ${stats.writer.flushesPerformed}`));
                writeLine(chalk.gray(`  Uptime: ${stats.writer.uptime}s`));
                writeLine(chalk.gray(`  Current file: ${stats.writer.currentLogFile || "none"}`));
                writeLine(chalk.gray(`  Buffer size: ${stats.writer.bufferSize} entries`));
                writeLine("");
            }
            if (stats.analyzer) {
                writeLine(chalk.yellow.bold("Analyzer:"));
                writeLine(chalk.gray(`  Logs analyzed: ${stats.analyzer.stats.logsAnalyzed}`));
                writeLine(chalk.gray(`  Error patterns: ${stats.analyzer.errorPatterns}`));
                writeLine(chalk.gray(`  Performance baselines: ${stats.analyzer.performanceBaselines}`));
                writeLine(chalk.gray(`  Correlations: ${stats.analyzer.correlations}`));
                writeLine(chalk.gray(`  Anomalies: ${stats.analyzer.anomalies}`));
                writeLine(chalk.gray(`  Insights: ${stats.analyzer.insights}`));
                writeLine(chalk.gray(`  Last update: ${formatTime(stats.analyzer.lastUpdate)}`));
                writeLine("");
            }
        }
        process.exit(0);
    }
    catch (error) {
        writeError(chalk.red("Failed:"), error.message);
        process.exit(1);
    }
});
// ============================================================================
// Main
// ============================================================================
program.name("ai-log-query").description("AI Log Query and Analysis Tool").version("1.0.0");
program.parse(process.argv);
// Show help if no command provided
if (!process.argv.slice(2).length) {
    program.outputHelp();
}
