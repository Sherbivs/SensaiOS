#!/usr/bin/env node

import { program } from "commander";
import * as aiLogAnalyzer from "../services/ai/ai-log-analyzer.js";
import * as aiLogWriter from "../services/ai/ai-log-writer.js";
import { truncate } from "../shared/utils/index.js";
import chalk from "chalk";

const formatOutputPart = (part: unknown): string => {
  if (typeof part === "string") return part;
  if (part instanceof Error) return part.message;
  return JSON.stringify(part);
};

const writeLine = (...parts: unknown[]): void => {
  process.stdout.write(`${parts.map(formatOutputPart).join(" ")}\n`);
};

const writeError = (...parts: unknown[]): void => {
  process.stderr.write(`${parts.map(formatOutputPart).join(" ")}\n`);
};

// ============================================================================
// AI LOG QUERY CLI
// ============================================================================
// Purpose: Query and analyze AI logs via SSH
// Usage: ai-log-query <command> [options]
// Commands:
//   - query: Search logs with filters
//   - analyze: Run pattern detection and generate insights
//   - patterns: Show detected error patterns
//   - performance: Show performance baselines
//   - correlations: Show correlated events
//   - insights: Show AI-generated insights
//   - stats: Show logging statistics
// ============================================================================

// ============================================================================
// Types
// ============================================================================

/** Chalk color function type */
type ChalkColorFn = (text: string) => string;

/** Valid log level */
type LogLevel =
  | "TRACE"
  | "DEBUG"
  | "INFO"
  | "NOTICE"
  | "WARN"
  | "ERROR"
  | "CRITICAL"
  | "FATAL";

/** Valid log category */
type LogCategory =
  | "system"
  | "database"
  | "discord"
  | "game-engine"
  | "security"
  | "performance"
  | "error"
  | "resource"
  | "user-action"
  | "integration";

/** Log entry context */
interface LogEntryContext {
  file?: string;
  line?: number;
  function?: string;
}

/** Log entry error info */
interface LogEntryError {
  name: string;
  message: string;
  stack?: string;
}

/** Log entry structure */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  context?: LogEntryContext;
  error?: LogEntryError;
  data?: Record<string, unknown>;
  tags?: string[];
  correlationId: string;
}

/** Query filters */
interface _QueryFilters {
  category?: string;
  level?: string;
  since?: Date | null;
  until?: Date | null;
  tags: string[];
  limit?: number;
}

/** Command options for query */
interface QueryOptions {
  category?: string;
  level?: string;
  since?: string;
  until?: string;
  tags?: string;
  grep?: string;
  limit?: string;
  follow?: boolean;
  json?: boolean;
  compact?: boolean;
}

/** Command options for analyze */
interface AnalyzeOptions {
  since?: string;
  json?: boolean;
}

/** Command options for json output */
interface JsonOutputOptions {
  json?: boolean;
}

/** Command options for stats */
interface StatsOptions {
  writer?: boolean;
  analyzer?: boolean;
  json?: boolean;
}

/** Error pattern from analyzer */
interface ErrorPattern {
  errorName: string;
  pattern: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  files: string[];
}

/** Performance pattern from analyzer */
interface PerformancePattern {
  operation: string;
  count: number;
  avg: number;
  p95: number;
  min: number;
  max: number;
  files?: string[];
}

/** Correlation from analyzer */
interface Correlation {
  event1: string;
  event2: string;
  count: number;
  avgTimeDelta: number;
}

/** Anomaly from analyzer */
interface Anomaly {
  level: string;
  count: number;
  baseline: number;
  deviation: number;
}

/** Insight from analyzer */
interface Insight {
  type: "recurring_error" | "performance_bottleneck" | "cascading_failure" | "anomaly";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  recommendation: string;
  affectedFiles?: string[];
}

/** Analysis results */
interface AnalysisResults {
  errorPatterns: ErrorPattern[];
  performancePatterns: PerformancePattern[];
  correlations: Correlation[];
  anomalies: Anomaly[];
  insights: Insight[];
  stats: { logsAnalyzed: number };
}

/** Writer stats */
interface WriterStats {
  logsWritten: number;
  bytesWritten: number;
  errorsEncountered: number;
  rotationsPerformed: number;
  compressionsPerformed: number;
  flushesPerformed: number;
  uptime: number;
  currentLogFile: string | null;
  bufferSize: number;
}

/** Analyzer knowledge summary */
interface AnalyzerKnowledgeSummary {
  stats: { logsAnalyzed: number };
  errorPatterns: number;
  performanceBaselines: number;
  correlations: number;
  anomalies: number;
  insights: number;
  lastUpdate: string;
}

/** Combined stats */
interface CombinedStats {
  writer?: WriterStats;
  analyzer?: AnalyzerKnowledgeSummary;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format timestamp for display.
 */
function formatTime(timestamp: string | Date): string {
  return new Date(timestamp).toISOString().replace("T", " ").substring(0, 19);
}

/**
 * Format duration in ms.
 */
function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Colorize log level.
 */
function colorizeLevel(level: string): string {
  const colors: Record<string, ChalkColorFn> = {
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
function colorizeCategory(category: string): string {
  const colors: Record<string, ChalkColorFn> = {
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
function parseRelativeTime(timeStr: string): Date {
  if (timeStr.match(/^\d+[hms]$/)) {
    const unit = timeStr.slice(-1);
    const value = parseInt(timeStr.slice(0, -1));
    const multiplier: Record<string, number> = { h: 3600000, m: 60000, s: 1000 };
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
  .action(async (options: QueryOptions) => {
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

      for await (const entry of aiLogAnalyzer.query(filters as Parameters<typeof aiLogAnalyzer.query>[0]) as AsyncIterable<LogEntry>) {
        // Grep filter
        if (options.grep) {
          const pattern = new RegExp(options.grep, "i");
          if (!pattern.test(entry.message)) continue;
        }

        count++;

        if (options.json) {
          writeLine(JSON.stringify(entry));
        } else if (options.compact) {
          writeLine(
            `${formatTime(entry.timestamp)} ` +
              `${colorizeLevel(entry.level)} ` +
              `${colorizeCategory(entry.category)} ` +
              `${truncate(entry.message, 60, "...")}`
          );
        } else {
          writeLine("");
          writeLine(chalk.gray("─".repeat(80)));
          writeLine(
            `${formatTime(entry.timestamp)} ` +
              `${colorizeLevel(entry.level)} ` +
              `${colorizeCategory(entry.category)}`
          );
          writeLine(chalk.white.bold(entry.message));

          if (entry.context?.file) {
            writeLine(
              chalk.gray(`  at ${entry.context.file}:${entry.context.line} in ${entry.context.function}`)
            );
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
    } catch (error) {
      writeError(chalk.red("Query failed:"), (error as Error).message);
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
  .action(async (options: AnalyzeOptions) => {
    try {
      await aiLogAnalyzer.initialize();

      // Parse since time
      const since = options.since ? parseRelativeTime(options.since) : undefined;

      writeLine(chalk.cyan("Running analysis..."));

      const results = (await aiLogAnalyzer.analyze({ since })) as AnalysisResults;

      if (options.json) {
        writeLine(JSON.stringify(results, null, 2));
      } else {
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
          writeLine(
            chalk.gray(
              `    Avg: ${formatDuration(pattern.avg)} | P95: ${formatDuration(pattern.p95)} | Max: ${formatDuration(pattern.max)}`
            )
          );
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
          writeLine(
            `  ${chalk.red("●")} ${anomaly.level} logs spike: ${anomaly.count} (baseline: ${anomaly.baseline.toFixed(0)})`
          );
          writeLine(chalk.gray(`    Deviation: ${anomaly.deviation.toFixed(1)}σ`));
        }
        writeLine("");

        // Insights
        writeLine(chalk.yellow.bold(`Insights: ${results.insights.length}`));
        for (const insight of results.insights.slice(0, 10)) {
          const icon: Record<string, string> = {
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
    } catch (error) {
      writeError(chalk.red("Analysis failed:"), (error as Error).message);
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
  .action(async (options: JsonOutputOptions) => {
    try {
      await aiLogAnalyzer.initialize();

      const patterns = (await aiLogAnalyzer.detectErrorPatterns()) as ErrorPattern[];

      if (options.json) {
        writeLine(JSON.stringify(patterns, null, 2));
      } else {
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
    } catch (error) {
      writeError(chalk.red("Failed:"), (error as Error).message);
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
  .action(async (options: JsonOutputOptions) => {
    try {
      await aiLogAnalyzer.initialize();

      const patterns = (await aiLogAnalyzer.detectPerformancePatterns()) as PerformancePattern[];

      if (options.json) {
        writeLine(JSON.stringify(patterns, null, 2));
      } else {
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
    } catch (error) {
      writeError(chalk.red("Failed:"), (error as Error).message);
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
  .action(async (options: JsonOutputOptions) => {
    try {
      await aiLogAnalyzer.initialize();

      const insights = (await aiLogAnalyzer.generateInsights()) as Insight[];

      if (options.json) {
        writeLine(JSON.stringify(insights, null, 2));
      } else {
        writeLine("");
        writeLine(chalk.green.bold(`═══ AI INSIGHTS (${insights.length}) ═══`));
        writeLine("");

        for (const insight of insights) {
          let severityColor: typeof chalk.red;
          if (insight.severity === "high") {
            severityColor = chalk.red;
          } else if (insight.severity === "medium") {
            severityColor = chalk.yellow;
          } else {
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
    } catch (error) {
      writeError(chalk.red("Failed:"), (error as Error).message);
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
  .action(async (options: StatsOptions) => {
    try {
      const stats: CombinedStats = {};

      if (options.writer || (!options.writer && !options.analyzer)) {
        stats.writer = aiLogWriter.getStats() as WriterStats;
      }

      if (options.analyzer || (!options.writer && !options.analyzer)) {
        await aiLogAnalyzer.initialize();
        stats.analyzer = aiLogAnalyzer.getKnowledgeSummary() as unknown as AnalyzerKnowledgeSummary;
        await aiLogAnalyzer.shutdown();
      }

      if (options.json) {
        writeLine(JSON.stringify(stats, null, 2));
      } else {
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
    } catch (error) {
      writeError(chalk.red("Failed:"), (error as Error).message);
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
