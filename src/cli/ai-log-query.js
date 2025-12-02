#!/usr/bin/env node

/**
 * AI Log Query CLI - Log Search & Analysis Tool
 * 
 * ⚠️ **DEPRECATED** — This CLI tool will be replaced by SQL queries against TimescaleDB.
 * 
 * **Replacement:** psql queries against log_entries hypertable + TimescaleDB views
 * 
 * **Migration Path:**
 * 1. query → SELECT * FROM log_entries WHERE message LIKE '%search%'
 * 2. analyze → TimescaleDB continuous aggregates + window functions
 * 3. patterns → GROUP BY error_type + COUNT(*) queries
 * 4. performance → percentile_cont() aggregates on duration column
 * 5. correlations → JOIN ON correlation_id / parent_correlation_id
 * 6. insights → SQL queries + external analytics tools (Grafana, etc.)
 * 7. stats → SELECT COUNT(*), component, operation FROM log_entries GROUP BY ...
 * 
 * **Why Deprecated:**
 * - OLD: CLI parsing NDJSON files (slow, limited query capabilities)
 * - NEW: SQL queries against TimescaleDB (fast, flexible, standard SQL)
 * - TimescaleDB provides better query language than custom CLI filters
 * - Grafana dashboards replace CLI analytics (visual, real-time, shareable)
 * 
 * **Priority:** LOW - CLI tool used for debugging only (not production-critical)
 * **Removal Timeline:** After Grafana dashboards deployed (Task 11 complete)
 * 
 * @module cli/ai-log-query
 * @deprecated Use psql or Grafana to query TimescaleDB log_entries instead
 */

/* eslint-disable no-console */
import { program } from 'commander';
import * as aiLogAnalyzer from '../services/ai-log-analyzer.js';
import * as aiLogWriter from '../services/ai-log-writer.js';
import { truncate } from '../shared/utils/index.js';
import chalk from 'chalk';

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
// Helper Functions
// ============================================================================

/**
 * Format timestamp for display.
 */
function formatTime(timestamp) {
  return new Date(timestamp).toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Format duration in ms.
 */
function formatDuration(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
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
    'game-engine': chalk.green,
    security: chalk.red,
    performance: chalk.yellow,
    error: chalk.redBright,
    resource: chalk.blue,
    'user-action': chalk.cyan,
    integration: chalk.magenta,
  };
  
  return (colors[category] || chalk.white)(category.padEnd(15));
}

// ============================================================================
// Query Command
// ============================================================================

program
  .command('query')
  .description('Query logs with filters')
  .option('-c, --category <category>', 'Filter by category')
  .option('-l, --level <level>', 'Filter by level')
  .option('-s, --since <since>', 'Filter since (ISO date or relative like "1h", "30m")')
  .option('-u, --until <until>', 'Filter until (ISO date)')
  .option('-t, --tags <tags>', 'Filter by tags (comma-separated)')
  .option('-g, --grep <pattern>', 'Grep message text (case-insensitive)')
  .option('-n, --limit <n>', 'Limit results', parseInt)
  .option('-f, --follow', 'Follow logs in real-time (tail -f mode)')
  .option('--json', 'Output as JSON')
  .option('--compact', 'Compact output')
  .action(async (options) => {
    try {
      await aiLogAnalyzer.initialize();
      
      // Parse since time
      let since = null;
      if (options.since) {
        if (options.since.match(/^\d+[hms]$/)) {
          // Relative time
          const unit = options.since.slice(-1);
          const value = parseInt(options.since.slice(0, -1));
          const multiplier = { h: 3600000, m: 60000, s: 1000 }[unit];
          since = new Date(Date.now() - (value * multiplier));
        } else {
          since = new Date(options.since);
        }
      }
      
      // Parse until time
      const until = options.until ? new Date(options.until) : null;
      
      // Parse tags
      const tags = options.tags ? options.tags.split(',').map(t => t.trim()) : [];
      
      // Query logs
      const filters = {
        category: options.category,
        level: options.level,
        since,
        until,
        tags,
        limit: options.limit,
      };
      
      let count = 0;
      
      for await (const entry of aiLogAnalyzer.query(filters)) {
        // Grep filter
        if (options.grep) {
          const pattern = new RegExp(options.grep, 'i');
          if (!pattern.test(entry.message)) continue;
        }
        
        count++;
        
        if (options.json) {
          console.log(JSON.stringify(entry));
        } else if (options.compact) {
          console.log(
            `${formatTime(entry.timestamp)} ` +
            `${colorizeLevel(entry.level)} ` +
            `${colorizeCategory(entry.category)} ` +
            `${truncate(entry.message, 60, '...')}`
          );
        } else {
          console.log('');
          console.log(chalk.gray('─'.repeat(80)));
          console.log(
            `${formatTime(entry.timestamp)} ` +
            `${colorizeLevel(entry.level)} ` +
            `${colorizeCategory(entry.category)}`
          );
          console.log(chalk.white.bold(entry.message));
          
          if (entry.context?.file) {
            console.log(chalk.gray(`  at ${entry.context.file}:${entry.context.line} in ${entry.context.function}`));
          }
          
          if (entry.error) {
            console.log(chalk.red(`  Error: ${entry.error.name}: ${entry.error.message}`));
          }
          
          if (entry.data && Object.keys(entry.data).length > 0) {
            console.log(chalk.gray('  Data:'));
            for (const [key, value] of Object.entries(entry.data)) {
              const val = typeof value === 'object' ? JSON.stringify(value) : value;
              console.log(chalk.gray(`    ${key}: ${truncate(String(val), 60, '...')}`));
            }
          }
          
          if (entry.tags && entry.tags.length > 0) {
            console.log(chalk.gray(`  Tags: ${entry.tags.join(', ')}`));
          }
          
          console.log(chalk.gray(`  Correlation ID: ${entry.correlationId}`));
        }
      }
      
      if (!options.json) {
        console.log('');
        console.log(chalk.gray(`Total: ${count} entries`));
      }
      
      await aiLogAnalyzer.shutdown();
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Query failed:'), error.message);
      process.exit(1);
    }
  });

// ============================================================================
// Analyze Command
// ============================================================================

program
  .command('analyze')
  .description('Run full analysis pipeline (patterns, correlations, insights)')
  .option('-s, --since <since>', 'Analyze since (ISO date or relative like "1h")')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await aiLogAnalyzer.initialize();
      
      // Parse since time
      let since = null;
      if (options.since) {
        if (options.since.match(/^\d+[hms]$/)) {
          const unit = options.since.slice(-1);
          const value = parseInt(options.since.slice(0, -1));
          const multiplier = { h: 3600000, m: 60000, s: 1000 }[unit];
          since = new Date(Date.now() - (value * multiplier));
        } else {
          since = new Date(options.since);
        }
      }
      
      console.log(chalk.cyan('Running analysis...'));
      
      const results = await aiLogAnalyzer.analyze({ since });
      
      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log('');
        console.log(chalk.green.bold('═══ ANALYSIS RESULTS ═══'));
        console.log('');
        
        // Error Patterns
        console.log(chalk.yellow.bold(`Error Patterns: ${results.errorPatterns.length}`));
        for (const pattern of results.errorPatterns.slice(0, 5)) {
          console.log(`  ${chalk.red('●')} ${pattern.errorName} (x${pattern.count})`);
          console.log(chalk.gray(`    ${truncate(pattern.pattern, 70, '...')}`));
          console.log(chalk.gray(`    Files: ${pattern.files.slice(0, 2).join(', ')}`));
        }
        console.log('');
        
        // Performance Patterns
        console.log(chalk.yellow.bold(`Performance Patterns: ${results.performancePatterns.length}`));
        for (const pattern of results.performancePatterns.slice(0, 5)) {
          console.log(`  ${chalk.blue('●')} ${pattern.operation}`);
          console.log(chalk.gray(`    Avg: ${formatDuration(pattern.avg)} | P95: ${formatDuration(pattern.p95)} | Max: ${formatDuration(pattern.max)}`));
        }
        console.log('');
        
        // Correlations
        console.log(chalk.yellow.bold(`Correlations: ${results.correlations.length}`));
        for (const corr of results.correlations.slice(0, 5)) {
          console.log(`  ${chalk.cyan('●')} ${corr.event1} → ${corr.event2} (x${corr.count})`);
          console.log(chalk.gray(`    Avg time delta: ${formatDuration(corr.avgTimeDelta)}`));
        }
        console.log('');
        
        // Anomalies
        console.log(chalk.yellow.bold(`Anomalies: ${results.anomalies.length}`));
        for (const anomaly of results.anomalies.slice(0, 5)) {
          console.log(`  ${chalk.red('●')} ${anomaly.level} logs spike: ${anomaly.count} (baseline: ${anomaly.baseline.toFixed(0)})`);
          console.log(chalk.gray(`    Deviation: ${anomaly.deviation.toFixed(1)}σ`));
        }
        console.log('');
        
        // Insights
        console.log(chalk.yellow.bold(`Insights: ${results.insights.length}`));
        for (const insight of results.insights.slice(0, 10)) {
          const icon = {
            recurring_error: '❌',
            performance_bottleneck: '🐌',
            cascading_failure: '⚡',
            anomaly: '📊',
          }[insight.type] || '●';
          
          console.log(`  ${icon} [${insight.severity.toUpperCase()}] ${insight.title}`);
          console.log(chalk.gray(`    ${insight.description}`));
          console.log(chalk.cyan(`    → ${insight.recommendation}`));
          console.log('');
        }
        
        // Stats
        console.log(chalk.gray(`Stats: ${results.stats.logsAnalyzed} logs analyzed`));
      }
      
      await aiLogAnalyzer.shutdown();
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Analysis failed:'), error.message);
      process.exit(1);
    }
  });

// ============================================================================
// Patterns Command
// ============================================================================

program
  .command('patterns')
  .description('Show detected error patterns')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await aiLogAnalyzer.initialize();
      
      const patterns = await aiLogAnalyzer.detectErrorPatterns();
      
      if (options.json) {
        console.log(JSON.stringify(patterns, null, 2));
      } else {
        console.log('');
        console.log(chalk.green.bold(`═══ ERROR PATTERNS (${patterns.length}) ═══`));
        console.log('');
        
        for (const pattern of patterns) {
          console.log(chalk.red(`● ${pattern.errorName}`));
          console.log(chalk.gray(`  Pattern: ${truncate(pattern.pattern, 70, '...')}`));
          console.log(chalk.gray(`  Occurrences: ${pattern.count}`));
          console.log(chalk.gray(`  First seen: ${formatTime(pattern.firstSeen)}`));
          console.log(chalk.gray(`  Last seen: ${formatTime(pattern.lastSeen)}`));
          console.log(chalk.gray(`  Files: ${pattern.files.join(', ')}`));
          console.log('');
        }
      }
      
      await aiLogAnalyzer.shutdown();
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Failed:'), error.message);
      process.exit(1);
    }
  });

// ============================================================================
// Performance Command
// ============================================================================

program
  .command('performance')
  .description('Show performance baselines')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await aiLogAnalyzer.initialize();
      
      const patterns = await aiLogAnalyzer.detectPerformancePatterns();
      
      if (options.json) {
        console.log(JSON.stringify(patterns, null, 2));
      } else {
        console.log('');
        console.log(chalk.green.bold(`═══ PERFORMANCE BASELINES (${patterns.length}) ═══`));
        console.log('');
        
        for (const pattern of patterns) {
          console.log(chalk.blue(`● ${pattern.operation}`));
          console.log(chalk.gray(`  Count: ${pattern.count}`));
          console.log(chalk.gray(`  Avg: ${formatDuration(pattern.avg)}`));
          console.log(chalk.gray(`  P95: ${formatDuration(pattern.p95)}`));
          console.log(chalk.gray(`  Min: ${formatDuration(pattern.min)} | Max: ${formatDuration(pattern.max)}`));
          if (pattern.files && pattern.files.length > 0) {
            console.log(chalk.gray(`  Files: ${pattern.files.join(', ')}`));
          }
          console.log('');
        }
      }
      
      await aiLogAnalyzer.shutdown();
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Failed:'), error.message);
      process.exit(1);
    }
  });

// ============================================================================
// Insights Command
// ============================================================================

program
  .command('insights')
  .description('Show AI-generated insights')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await aiLogAnalyzer.initialize();
      
      const insights = await aiLogAnalyzer.generateInsights();
      
      if (options.json) {
        console.log(JSON.stringify(insights, null, 2));
      } else {
        console.log('');
        console.log(chalk.green.bold(`═══ AI INSIGHTS (${insights.length}) ═══`));
        console.log('');
        
        for (const insight of insights) {
          const severityColor = {
            high: chalk.red,
            medium: chalk.yellow,
            low: chalk.green,
          }[insight.severity] || chalk.white;
          
          console.log(severityColor.bold(`[${insight.severity.toUpperCase()}] ${insight.title}`));
          console.log(chalk.gray(`  ${insight.description}`));
          console.log(chalk.cyan(`  → Recommendation: ${insight.recommendation}`));
          
          if (insight.affectedFiles && insight.affectedFiles.length > 0) {
            console.log(chalk.gray(`  Affected files: ${insight.affectedFiles.join(', ')}`));
          }
          
          console.log('');
        }
      }
      
      await aiLogAnalyzer.shutdown();
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Failed:'), error.message);
      process.exit(1);
    }
  });

// ============================================================================
// Stats Command
// ============================================================================

program
  .command('stats')
  .description('Show logging statistics')
  .option('--writer', 'Show writer stats')
  .option('--analyzer', 'Show analyzer stats')
  .option('--json', 'Output as JSON')
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
        console.log(JSON.stringify(stats, null, 2));
      } else {
        console.log('');
        console.log(chalk.green.bold('═══ AI LOG SYSTEM STATS ═══'));
        console.log('');
        
        if (stats.writer) {
          console.log(chalk.yellow.bold('Writer:'));
          console.log(chalk.gray(`  Logs written: ${stats.writer.logsWritten}`));
          console.log(chalk.gray(`  Bytes written: ${(stats.writer.bytesWritten / 1024 / 1024).toFixed(2)} MB`));
          console.log(chalk.gray(`  Errors: ${stats.writer.errorsEncountered}`));
          console.log(chalk.gray(`  Rotations: ${stats.writer.rotationsPerformed}`));
          console.log(chalk.gray(`  Compressions: ${stats.writer.compressionsPerformed}`));
          console.log(chalk.gray(`  Flushes: ${stats.writer.flushesPerformed}`));
          console.log(chalk.gray(`  Uptime: ${stats.writer.uptime}s`));
          console.log(chalk.gray(`  Current file: ${stats.writer.currentLogFile || 'none'}`));
          console.log(chalk.gray(`  Buffer size: ${stats.writer.bufferSize} entries`));
          console.log('');
        }
        
        if (stats.analyzer) {
          console.log(chalk.yellow.bold('Analyzer:'));
          console.log(chalk.gray(`  Logs analyzed: ${stats.analyzer.stats.logsAnalyzed}`));
          console.log(chalk.gray(`  Error patterns: ${stats.analyzer.errorPatterns}`));
          console.log(chalk.gray(`  Performance baselines: ${stats.analyzer.performanceBaselines}`));
          console.log(chalk.gray(`  Correlations: ${stats.analyzer.correlations}`));
          console.log(chalk.gray(`  Anomalies: ${stats.analyzer.anomalies}`));
          console.log(chalk.gray(`  Insights: ${stats.analyzer.insights}`));
          console.log(chalk.gray(`  Last update: ${formatTime(stats.analyzer.lastUpdate)}`));
          console.log('');
        }
      }
      
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Failed:'), error.message);
      process.exit(1);
    }
  });

// ============================================================================
// Main
// ============================================================================

program
  .name('ai-log-query')
  .description('AI Log Query and Analysis Tool')
  .version('1.0.0');

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
