/**
 * Test Report Generator
 * 
 * Generates formatted reports for simulation test results:
 * - Console reports (colored, formatted)
 * - JSON reports (machine-readable)
 * - HTML reports (browser-viewable)
 * - Markdown reports (documentation)
 * 
 * **USAGE:**
 * ```typescript
 * import { ReportGenerator } from "./report-generator.js";
 * 
 * const generator = new ReportGenerator();
 * const report = generator.generateConsoleReport(summary);
 * console.log(report);
 * ```
 * 
 * @module tests/simulation/report-generator
 */

import fs from "fs";
import path from "path";
import type { TestSummary } from "./test-runner.js";

/**
 * Report format options
 */
export type ReportFormat = "console" | "json" | "html" | "markdown";

/**
 * Report Generator Options
 */
export interface ReportGeneratorOptions {
  colors?: boolean;
  verbose?: boolean;
  outputDir?: string;
  timestamp?: boolean;
}

/**
 * Report Generator for Test Results
 */
export class ReportGenerator {
  private options: ReportGeneratorOptions;

  constructor(options: ReportGeneratorOptions = {}) {
    this.options = {
      colors: true,
      verbose: false,
      outputDir: "reports",
      timestamp: true,
      ...options,
    };
  }

  /**
   * Generate console report with colors
   */
  generateConsoleReport(summary: TestSummary): string {
    const c = this.options.colors ? this.colors : this.noColors;
    const lines: string[] = [];

    // Header
    lines.push("");
    lines.push(c.cyan("═".repeat(70)));
    lines.push(c.bold("   📊 SIMULATION TEST REPORT"));
    lines.push(c.cyan("═".repeat(70)));
    lines.push("");

    // Overall Summary
    lines.push(c.yellow("🎯 OVERALL RESULTS:"));
    lines.push("");
    lines.push(
      `  Scenarios:  ${this.formatPassFail(summary.scenariosPassed, summary.totalScenarios, c)}`
    );
    lines.push(
      `  Tests:      ${this.formatPassFail(summary.testsPassed, summary.totalTests, c)}`
    );
    if (summary.testsFailed > 0) {
      lines.push(`  Failed:     ${c.red(String(summary.testsFailed))}`);
    }
    if (summary.testsSkipped > 0) {
      lines.push(`  Skipped:    ${c.gray(String(summary.testsSkipped))}`);
    }
    lines.push("");

    // Performance Metrics
    lines.push(c.yellow("⚡ PERFORMANCE:"));
    lines.push("");
    lines.push(
      `  Total Duration:    ${this.formatDuration(summary.totalDuration, c)}`
    );
    lines.push(
      `  Average Duration:  ${this.formatDuration(summary.averageDuration, c)}`
    );
    lines.push(
      `  Target (<10s):     ${summary.performanceTargetMet ? c.green("✅ MET") : c.red("❌ MISSED")}`
    );
    lines.push("");

    // Scenario Results
    lines.push(c.yellow("📦 SCENARIO RESULTS:"));
    lines.push("");

    summary.results.forEach((result) => {
      const icon = result.success ? c.green("✅") : c.red("❌");
      const duration = this.formatDuration(result.duration, c);
      const stats = `${result.testsPassed}/${result.testsRun}`;

      lines.push(`  ${icon} ${result.scenario.padEnd(25)} ${stats.padEnd(10)} ${duration}`);

      if (this.options.verbose && result.error) {
        lines.push(`     ${c.red("Error:")} ${result.error}`);
      }
    });

    lines.push("");

    // Performance Breakdown
    if (this.options.verbose) {
      lines.push(c.yellow("📈 PERFORMANCE BREAKDOWN:"));
      lines.push("");

      const sorted = [...summary.results].sort((a, b) => b.duration - a.duration);
      sorted.forEach((result) => {
        const percent = ((result.duration / summary.totalDuration) * 100).toFixed(1);
        const bar = this.createBar(result.duration, summary.totalDuration, 30);
        lines.push(`  ${result.scenario.padEnd(25)} ${bar} ${percent}%`);
      });

      lines.push("");
    }

    // Footer
    lines.push(c.cyan("═".repeat(70)));
    lines.push("");

    if (summary.scenariosFailed === 0) {
      lines.push(c.green("  ✅ All tests passed!"));
    } else {
      lines.push(c.red(`  ❌ ${summary.scenariosFailed} scenario(s) failed`));
    }

    lines.push("");
    lines.push(c.cyan("═".repeat(70)));
    lines.push("");

    return lines.join("\n");
  }

  /**
   * Generate JSON report
   */
  generateJSONReport(summary: TestSummary): string {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalScenarios: summary.totalScenarios,
        scenariosPassed: summary.scenariosPassed,
        scenariosFailed: summary.scenariosFailed,
        totalTests: summary.totalTests,
        testsPassed: summary.testsPassed,
        testsFailed: summary.testsFailed,
        testsSkipped: summary.testsSkipped,
        totalDuration: summary.totalDuration,
        averageDuration: summary.averageDuration,
        performanceTargetMet: summary.performanceTargetMet,
      },
      results: summary.results.map((result) => ({
        scenario: result.scenario,
        success: result.success,
        duration: result.duration,
        testsRun: result.testsRun,
        testsPassed: result.testsPassed,
        testsFailed: result.testsFailed,
        testsSkipped: result.testsSkipped,
        error: result.error,
      })),
    };

    return JSON.stringify(report, null, 2);
  }

  /**
   * Generate Markdown report
   */
  generateMarkdownReport(summary: TestSummary): string {
    const lines: string[] = [];

    // Header
    lines.push("# Simulation Test Report");
    lines.push("");
    if (this.options.timestamp) {
      lines.push(`**Generated:** ${new Date().toISOString()}`);
      lines.push("");
    }

    // Overall Summary
    lines.push("## Overall Results");
    lines.push("");
    lines.push("| Metric | Value |");
    lines.push("|--------|-------|");
    lines.push(`| Scenarios Passed | ${summary.scenariosPassed}/${summary.totalScenarios} |`);
    lines.push(`| Tests Passed | ${summary.testsPassed}/${summary.totalTests} |`);
    lines.push(`| Tests Failed | ${summary.testsFailed} |`);
    lines.push(`| Tests Skipped | ${summary.testsSkipped} |`);
    lines.push(`| Total Duration | ${(summary.totalDuration / 1000).toFixed(2)}s |`);
    lines.push(`| Average Duration | ${(summary.averageDuration / 1000).toFixed(2)}s |`);
    lines.push(`| Performance Target | ${summary.performanceTargetMet ? "✅ MET" : "❌ MISSED"} |`);
    lines.push("");

    // Scenario Results
    lines.push("## Scenario Results");
    lines.push("");
    lines.push("| Scenario | Status | Tests Passed | Duration |");
    lines.push("|----------|--------|--------------|----------|");

    summary.results.forEach((result) => {
      const status = result.success ? "✅ PASS" : "❌ FAIL";
      const stats = `${result.testsPassed}/${result.testsRun}`;
      const duration = `${(result.duration / 1000).toFixed(2)}s`;

      lines.push(`| ${result.scenario} | ${status} | ${stats} | ${duration} |`);
    });

    lines.push("");

    // Failed Scenarios (if any)
    const failed = summary.results.filter((r) => !r.success);
    if (failed.length > 0) {
      lines.push("## Failed Scenarios");
      lines.push("");

      failed.forEach((result) => {
        lines.push(`### ${result.scenario}`);
        lines.push("");
        lines.push(`**Error:** ${result.error || "Unknown error"}`);
        lines.push("");
      });
    }

    // Performance Breakdown
    lines.push("## Performance Breakdown");
    lines.push("");
    lines.push("| Scenario | Duration | Percentage |");
    lines.push("|----------|----------|------------|");

    const sorted = [...summary.results].sort((a, b) => b.duration - a.duration);
    sorted.forEach((result) => {
      const percent = ((result.duration / summary.totalDuration) * 100).toFixed(1);
      const duration = `${(result.duration / 1000).toFixed(2)}s`;
      lines.push(`| ${result.scenario} | ${duration} | ${percent}% |`);
    });

    lines.push("");

    return lines.join("\n");
  }

  /**
   * Generate HTML report
   */
  generateHTMLReport(summary: TestSummary): string {
    const successRate = ((summary.testsPassed / summary.totalTests) * 100).toFixed(1);
    const timestamp = new Date().toISOString();

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Simulation Test Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a1a;
      color: #e0e0e0;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 30px;
      border-radius: 10px;
      margin-bottom: 20px;
    }
    .header h1 { color: white; font-size: 32px; margin-bottom: 10px; }
    .header .timestamp { color: rgba(255,255,255,0.8); font-size: 14px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .card {
      background: #2a2a2a;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #667eea;
    }
    .card h3 { color: #667eea; margin-bottom: 10px; font-size: 14px; text-transform: uppercase; }
    .card .value { font-size: 32px; font-weight: bold; }
    .card .subtext { font-size: 14px; color: #999; margin-top: 5px; }
    .success { color: #4ade80; }
    .failure { color: #f87171; }
    .warning { color: #fbbf24; }
    table {
      width: 100%;
      background: #2a2a2a;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 20px;
    }
    th, td { padding: 15px; text-align: left; }
    th { background: #333; color: #667eea; font-weight: 600; }
    tr:nth-child(even) { background: #252525; }
    .status-icon { font-size: 20px; }
    .progress-bar {
      height: 8px;
      background: #333;
      border-radius: 4px;
      overflow: hidden;
      margin-top: 10px;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      transition: width 0.3s ease;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Simulation Test Report</h1>
      <div class="timestamp">Generated: ${timestamp}</div>
    </div>

    <div class="summary">
      <div class="card">
        <h3>Test Success Rate</h3>
        <div class="value ${summary.testsPassed === summary.totalTests ? "success" : "failure"}">
          ${successRate}%
        </div>
        <div class="subtext">${summary.testsPassed}/${summary.totalTests} tests passed</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${successRate}%"></div>
        </div>
      </div>

      <div class="card">
        <h3>Scenarios</h3>
        <div class="value ${summary.scenariosPassed === summary.totalScenarios ? "success" : "failure"}">
          ${summary.scenariosPassed}/${summary.totalScenarios}
        </div>
        <div class="subtext">${summary.scenariosFailed} failed</div>
      </div>

      <div class="card">
        <h3>Duration</h3>
        <div class="value">${(summary.totalDuration / 1000).toFixed(2)}s</div>
        <div class="subtext">Average: ${(summary.averageDuration / 1000).toFixed(2)}s</div>
      </div>

      <div class="card">
        <h3>Performance Target</h3>
        <div class="value ${summary.performanceTargetMet ? "success" : "failure"}">
          ${summary.performanceTargetMet ? "✅ MET" : "❌ MISSED"}
        </div>
        <div class="subtext">&lt;10s target</div>
      </div>
    </div>

    <h2 style="color: #667eea; margin-bottom: 15px;">Scenario Results</h2>
    <table>
      <thead>
        <tr>
          <th>Status</th>
          <th>Scenario</th>
          <th>Tests Passed</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        ${summary.results
          .map(
            (result) => `
          <tr>
            <td class="status-icon">${result.success ? "✅" : "❌"}</td>
            <td>${result.scenario}</td>
            <td>${result.testsPassed}/${result.testsRun}</td>
            <td>${(result.duration / 1000).toFixed(2)}s</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>

    ${
      summary.results.filter((r) => !r.success).length > 0
        ? `
      <h2 style="color: #f87171; margin-bottom: 15px;">Failed Scenarios</h2>
      <div style="background: #2a2a2a; padding: 20px; border-radius: 8px;">
        ${summary.results
          .filter((r) => !r.success)
          .map(
            (result) => `
          <div style="margin-bottom: 15px;">
            <h3 style="color: #667eea;">${result.scenario}</h3>
            <p style="color: #f87171; margin-top: 5px;">${result.error || "Unknown error"}</p>
          </div>
        `
          )
          .join("")}
      </div>
    `
        : ""
    }
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Save report to file
   */
  async saveReport(
    summary: TestSummary,
    format: ReportFormat = "json"
  ): Promise<string> {
    const outputDir = this.options.outputDir || "reports";
    
    // Create reports directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = this.options.timestamp
      ? `-${new Date().toISOString().replace(/[:.]/g, "-")}`
      : "";
    
    const extension = format === "console" ? "txt" : format;
    const filename = `test-report${timestamp}.${extension}`;
    const filepath = path.join(outputDir, filename);

    let content: string;
    switch (format) {
      case "console":
        content = this.generateConsoleReport(summary);
        break;
      case "json":
        content = this.generateJSONReport(summary);
        break;
      case "html":
        content = this.generateHTMLReport(summary);
        break;
      case "markdown":
        content = this.generateMarkdownReport(summary);
        break;
      default:
        throw new Error(`Unknown format: ${format}`);
    }

    fs.writeFileSync(filepath, content, "utf-8");
    return filepath;
  }

  /**
   * Format pass/fail ratio
   */
  private formatPassFail(
    passed: number,
    total: number,
    c: typeof this.colors
  ): string {
    const ratio = `${passed}/${total}`;
    return passed === total ? c.green(ratio) : c.red(ratio);
  }

  /**
   * Format duration
   */
  private formatDuration(ms: number, c: typeof this.colors): string {
    const seconds = (ms / 1000).toFixed(2);
    if (ms < 1000) {
      return c.green(`${seconds}s`);
    } else if (ms < 3000) {
      return c.yellow(`${seconds}s`);
    } else {
      return c.red(`${seconds}s`);
    }
  }

  /**
   * Create ASCII progress bar
   */
  private createBar(value: number, max: number, width: number): string {
    const filled = Math.round((value / max) * width);
    const empty = width - filled;
    return "█".repeat(filled) + "░".repeat(empty);
  }

  /**
   * Color utilities (ANSI codes)
   */
  private colors = {
    reset: (text: string) => `\x1b[0m${text}\x1b[0m`,
    bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
    red: (text: string) => `\x1b[31m${text}\x1b[0m`,
    green: (text: string) => `\x1b[32m${text}\x1b[0m`,
    yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
    cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
    gray: (text: string) => `\x1b[90m${text}\x1b[0m`,
  };

  /**
   * No-color utilities (for when colors are disabled)
   */
  private noColors = {
    reset: (text: string) => text,
    bold: (text: string) => text,
    red: (text: string) => text,
    green: (text: string) => text,
    yellow: (text: string) => text,
    cyan: (text: string) => text,
    gray: (text: string) => text,
  };
}
