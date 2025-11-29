/**
 * Test Runner for Simulation Framework
 * 
 * Provides programmatic test execution with:
 * - Batch scenario running
 * - Timing metrics collection
 * - Performance benchmarking
 * - Detailed result reporting
 * - CI/CD integration support
 * 
 * **USAGE:**
 * ```typescript
 * import { TestRunner } from "./test-runner.js";
 * 
 * const runner = new TestRunner();
 * const results = await runner.runAll();
 * console.log(runner.generateReport(results));
 * ```
 * 
 * **CLI:**
 * ```bash
 * npm run test:sim              # Run all scenarios
 * npm run test:sim -- onboarding # Run specific scenario
 * npm run test:sim -- --watch    # Watch mode
 * ```
 * 
 * @module tests/simulation/test-runner
 */

import { spawn } from "child_process";
import { EventEmitter } from "events";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test scenario configuration
 */
export interface TestScenario {
  name: string;
  file: string;
  description: string;
  estimatedDuration: number; // milliseconds
  category: "core" | "integration" | "stress" | "examples";
}

/**
 * Test execution result
 */
export interface TestResult {
  scenario: string;
  success: boolean;
  duration: number;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  testsSkipped: number;
  coverage?: number;
  error?: string;
  output?: string;
}

/**
 * Test suite summary
 */
export interface TestSummary {
  totalScenarios: number;
  scenariosPassed: number;
  scenariosFailed: number;
  totalTests: number;
  testsPassed: number;
  testsFailed: number;
  testsSkipped: number;
  totalDuration: number;
  averageDuration: number;
  performanceTargetMet: boolean;
  results: TestResult[];
}

/**
 * Test Runner Options
 */
export interface TestRunnerOptions {
  verbose?: boolean;
  bail?: boolean; // Stop on first failure
  timeout?: number; // Per-scenario timeout (ms)
  parallel?: boolean; // Run scenarios in parallel
  performanceTarget?: number; // Target duration in ms
  coverage?: boolean; // Collect coverage
}

/**
 * Test Runner for Simulation Framework
 */
export class TestRunner extends EventEmitter {
  private scenarios: Map<string, TestScenario> = new Map();
  private options: TestRunnerOptions;

  constructor(options: TestRunnerOptions = {}) {
    super();
    this.options = {
      verbose: false,
      bail: false,
      timeout: 30000, // 30 seconds per scenario
      parallel: false,
      performanceTarget: 10000, // 10 seconds total
      coverage: false,
      ...options,
    };

    this.registerScenarios();
  }

  /**
   * Register all test scenarios
   */
  private registerScenarios(): void {
    const scenarios: TestScenario[] = [
      {
        name: "onboarding",
        file: "scenarios/onboarding.spec.ts",
        description: "Player onboarding, starter selection, homestead creation",
        estimatedDuration: 1500,
        category: "core",
      },
      {
        name: "wild-encounters",
        file: "scenarios/wild-encounters.spec.ts",
        description: "Wild encounters, AI decisions, catch/fight/run mechanics",
        estimatedDuration: 2000,
        category: "core",
      },
      {
        name: "battles",
        file: "scenarios/battles.spec.ts",
        description: "PvP battles, AI decisions, personality matchups",
        estimatedDuration: 2500,
        category: "core",
      },
      {
        name: "homestead",
        file: "scenarios/homestead.spec.ts",
        description: "Homestead channel validation, permissions, migration",
        estimatedDuration: 2000,
        category: "integration",
      },
      {
        name: "stress",
        file: "scenarios/stress.spec.ts",
        description: "Performance, concurrency, scalability tests",
        estimatedDuration: 4000,
        category: "stress",
      },
      {
        name: "assertion-examples",
        file: "examples/assertion-examples.spec.ts",
        description: "Custom assertion usage examples",
        estimatedDuration: 1000,
        category: "examples",
      },
    ];

    scenarios.forEach((scenario) => {
      this.scenarios.set(scenario.name, scenario);
    });
  }

  /**
   * Get list of available scenarios
   */
  getScenarios(): TestScenario[] {
    return Array.from(this.scenarios.values());
  }

  /**
   * Get scenario by name
   */
  getScenario(name: string): TestScenario | undefined {
    return this.scenarios.get(name);
  }

  /**
   * Run all test scenarios
   */
  async runAll(category?: string): Promise<TestSummary> {
    const scenarios = category
      ? this.getScenarios().filter((s) => s.category === category)
      : this.getScenarios();

    this.log(`Running ${scenarios.length} test scenarios...`);
    this.emit("start", { count: scenarios.length });

    const startTime = Date.now();
    const results: TestResult[] = [];

    if (this.options.parallel) {
      // Run scenarios in parallel
      const promises = scenarios.map((scenario) => this.runScenario(scenario.name));
      const parallelResults = await Promise.all(promises);
      results.push(...parallelResults);
    } else {
      // Run scenarios sequentially
      for (const scenario of scenarios) {
        const result = await this.runScenario(scenario.name);
        results.push(result);

        if (this.options.bail && !result.success) {
          this.log(`Bailing due to failure in: ${scenario.name}`);
          break;
        }
      }
    }

    const totalDuration = Date.now() - startTime;

    const summary = this.generateSummary(results, totalDuration);
    this.emit("complete", summary);

    return summary;
  }

  /**
   * Run a specific test scenario
   */
  async runScenario(name: string): Promise<TestResult> {
    const scenario = this.scenarios.get(name);
    if (!scenario) {
      throw new Error(`Unknown scenario: ${name}`);
    }

    this.log(`Running scenario: ${scenario.name}`);
    this.emit("scenario:start", { scenario: scenario.name });

    const startTime = Date.now();

    try {
      // Run Vitest for this specific file
      const result = await this.executeVitest(scenario);
      const duration = Date.now() - startTime;

      const testResult: TestResult = {
        scenario: scenario.name,
        success: result.success,
        duration,
        testsRun: result.testsRun,
        testsPassed: result.testsPassed,
        testsFailed: result.testsFailed,
        testsSkipped: result.testsSkipped,
        output: result.output,
        error: result.error,
      };

      this.emit("scenario:complete", testResult);
      return testResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      const testResult: TestResult = {
        scenario: scenario.name,
        success: false,
        duration,
        testsRun: 0,
        testsPassed: 0,
        testsFailed: 0,
        testsSkipped: 0,
        error: error instanceof Error ? error.message : String(error),
      };

      this.emit("scenario:error", testResult);
      return testResult;
    }
  }

  /**
   * Execute Vitest for a scenario
   */
  private executeVitest(
    scenario: TestScenario
  ): Promise<{
    success: boolean;
    testsRun: number;
    testsPassed: number;
    testsFailed: number;
    testsSkipped: number;
    output: string;
    error?: string;
  }> {
    return new Promise((resolve) => {
      const scenarioPath = path.join(__dirname, scenario.file);
      
      const args = [
        "run",
        scenarioPath,
        "--reporter=json",
        "--reporter=verbose",
      ];

      if (this.options.coverage) {
        args.push("--coverage");
      }

      const vitest = spawn("npx", ["vitest", ...args], {
        cwd: path.join(__dirname, "..", ".."),
        shell: true,
        timeout: this.options.timeout,
      });

      let output = "";
      let jsonOutput = "";

      vitest.stdout.on("data", (data) => {
        const text = data.toString();
        output += text;
        
        // Try to extract JSON report
        if (text.includes("{") && text.includes("testResults")) {
          jsonOutput += text;
        }

        if (this.options.verbose) {
          process.stdout.write(text);
        }
      });

      vitest.stderr.on("data", (data) => {
        output += data.toString();
        if (this.options.verbose) {
          process.stderr.write(data.toString());
        }
      });

      vitest.on("close", (code) => {
        // Parse output to extract test counts
        const stats = this.parseTestOutput(output, jsonOutput);

        resolve({
          success: code === 0,
          testsRun: stats.testsRun,
          testsPassed: stats.testsPassed,
          testsFailed: stats.testsFailed,
          testsSkipped: stats.testsSkipped,
          output,
          error: code !== 0 ? `Exit code: ${code}` : undefined,
        });
      });

      vitest.on("error", (error) => {
        resolve({
          success: false,
          testsRun: 0,
          testsPassed: 0,
          testsFailed: 0,
          testsSkipped: 0,
          output,
          error: error.message,
        });
      });
    });
  }

  /**
   * Parse Vitest output to extract test statistics
   */
  private parseTestOutput(
    output: string,
    jsonOutput: string
  ): {
    testsRun: number;
    testsPassed: number;
    testsFailed: number;
    testsSkipped: number;
  } {
    // Try to parse JSON output first
    if (jsonOutput) {
      try {
        const json = JSON.parse(jsonOutput);
        if (json.testResults) {
          const results = json.testResults;
          return {
            testsRun: results.numTotalTests || 0,
            testsPassed: results.numPassedTests || 0,
            testsFailed: results.numFailedTests || 0,
            testsSkipped: results.numPendingTests || 0,
          };
        }
      } catch {
        // Fall through to regex parsing
      }
    }

    // Fallback: Parse text output with regex
    const passedMatch = output.match(/(\d+) passed/);
    const failedMatch = output.match(/(\d+) failed/);
    const skippedMatch = output.match(/(\d+) skipped/);
    const totalMatch = output.match(/Test Files\s+\d+\s+passed.*\((\d+)\)/);

    const testsPassed = passedMatch ? parseInt(passedMatch[1]) : 0;
    const testsFailed = failedMatch ? parseInt(failedMatch[1]) : 0;
    const testsSkipped = skippedMatch ? parseInt(skippedMatch[1]) : 0;
    const testsRun = totalMatch
      ? parseInt(totalMatch[1])
      : testsPassed + testsFailed + testsSkipped;

    return {
      testsRun,
      testsPassed,
      testsFailed,
      testsSkipped,
    };
  }

  /**
   * Generate test summary
   */
  private generateSummary(
    results: TestResult[],
    totalDuration: number
  ): TestSummary {
    const scenariosPassed = results.filter((r) => r.success).length;
    const scenariosFailed = results.filter((r) => !r.success).length;
    const totalTests = results.reduce((sum, r) => sum + r.testsRun, 0);
    const testsPassed = results.reduce((sum, r) => sum + r.testsPassed, 0);
    const testsFailed = results.reduce((sum, r) => sum + r.testsFailed, 0);
    const testsSkipped = results.reduce((sum, r) => sum + r.testsSkipped, 0);
    const averageDuration =
      results.length > 0 ? totalDuration / results.length : 0;
    const performanceTargetMet =
      totalDuration <= (this.options.performanceTarget || 10000);

    return {
      totalScenarios: results.length,
      scenariosPassed,
      scenariosFailed,
      totalTests,
      testsPassed,
      testsFailed,
      testsSkipped,
      totalDuration,
      averageDuration,
      performanceTargetMet,
      results,
    };
  }

  /**
   * Log message if verbose mode enabled
   */
  private log(message: string): void {
    if (this.options.verbose) {
      console.log(`[TestRunner] ${message}`);
    }
  }
}

/**
 * CLI Entry Point
 */
export async function runCLI(): Promise<void> {
  const args = process.argv.slice(2);
  const scenarioName = args.find((arg) => !arg.startsWith("--"));
  const verbose = args.includes("--verbose") || args.includes("-v");
  const bail = args.includes("--bail");
  const parallel = args.includes("--parallel");
  const coverage = args.includes("--coverage");
  const category = args.find((arg) => arg.startsWith("--category="))?.split("=")[1];

  const runner = new TestRunner({
    verbose,
    bail,
    parallel,
    coverage,
  });

  // Listen to events for progress display
  runner.on("start", ({ count }) => {
    console.log(`\n🚀 Starting ${count} test scenarios...\n`);
  });

  runner.on("scenario:start", ({ scenario }) => {
    if (verbose) {
      console.log(`\n▶️  Running: ${scenario}`);
    }
  });

  runner.on("scenario:complete", (result: TestResult) => {
    const icon = result.success ? "✅" : "❌";
    const duration = (result.duration / 1000).toFixed(2);
    console.log(
      `${icon} ${result.scenario} - ${result.testsPassed}/${result.testsRun} passed (${duration}s)`
    );
  });

  runner.on("scenario:error", (result: TestResult) => {
    console.error(`❌ ${result.scenario} - Error: ${result.error}`);
  });

  try {
    let summary: TestSummary;

    if (scenarioName) {
      // Run specific scenario
      const result = await runner.runScenario(scenarioName);
      summary = runner["generateSummary"]([result], result.duration);
    } else if (category) {
      // Run by category
      summary = await runner.runAll(category);
    } else {
      // Run all scenarios
      summary = await runner.runAll();
    }

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(60));
    console.log(`Scenarios: ${summary.scenariosPassed}/${summary.totalScenarios} passed`);
    console.log(`Tests:     ${summary.testsPassed}/${summary.totalTests} passed`);
    console.log(`Duration:  ${(summary.totalDuration / 1000).toFixed(2)}s`);
    console.log(`Average:   ${(summary.averageDuration / 1000).toFixed(2)}s per scenario`);
    console.log(`Performance Target (<10s): ${summary.performanceTargetMet ? "✅ MET" : "❌ MISSED"}`);
    console.log("=".repeat(60) + "\n");

    if (summary.scenariosFailed > 0) {
      console.log("❌ Failed scenarios:");
      summary.results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`  - ${r.scenario}: ${r.error || "Unknown error"}`);
        });
      process.exit(1);
    } else {
      console.log("✅ All tests passed!");
      process.exit(0);
    }
  } catch (error) {
    console.error("❌ Test runner error:", error);
    process.exit(1);
  }
}

// Run CLI if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runCLI();
}
