/**
 * DB-First Observability System - Unified Initialization
 * 
 * This module provides a single entry point to initialize the entire
 * DB-First observability system:
 * 
 * Components:
 *   1. Console Renderer — Polls DB, outputs to Render console
 *   2. Metrics Collector — Gathers worker health metrics
 *   3. Log Aggregator — Pattern detection, correlation, deduplication
 *   4. Health Monitor — Real-time health scoring and alerting
 * 
 * Architecture: App → Logger → DATABASE → ConsoleRenderer → Render Console
 * 
 * Usage in src/index.ts:
 *   import { initializeObservability, shutdownObservability } from './shared/observability.js';
 *   
 *   // After Prisma initialization:
 *   await initializeObservability(prisma);
 *   
 *   // On shutdown:
 *   await shutdownObservability();
 * 
 * @module observability
 * @version 1.0.0
 */

import type { PrismaClient } from "../generated/prisma/client.js";
import { getLogger } from "./logger.js";
import { initConsoleRenderer, startConsoleRenderer, stopConsoleRenderer, getRendererStats } from "./console-renderer.js";
import { startMetricsCollection, stopMetricsCollection, getCollectionStats, forceCollect, setCollectionInterval, type CollectionStats } from "./metrics-collector.js";
import { initLogAggregator, runAggregation, getAggregatorConfig, type AggregationStats } from "./log-aggregator.js";
import { initHealthMonitor, startHealthMonitor, stopHealthMonitor, getSystemHealth, getMonitorConfig, type SystemHealth } from "./system-health-monitor.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface ObservabilityConfig {
  // Console Renderer
  consolePollIntervalMs?: number;
  consoleFormat?: "detailed" | "compact" | "json";
  showWorkerHealth?: boolean;
  
  // Metrics Collector
  metricsCollectionIntervalMs?: number;
  
  // Log Aggregator
  enablePatternDetection?: boolean;
  enableCorrelation?: boolean;
  enableAnomalyDetection?: boolean;
  deduplicationWindowMs?: number;
  
  // Health Monitor
  healthCheckIntervalMs?: number;
  enablePredictiveAlerts?: boolean;
  
  // Feature Flags
  enableConsoleRenderer?: boolean;
  enableMetricsCollector?: boolean;
  enableLogAggregator?: boolean;
  enableHealthMonitor?: boolean;
}

interface ObservabilityStatus {
  initialized: boolean;
  running: boolean;
  consoleRenderer: {
    enabled: boolean;
    running: boolean;
    cycleCount: number;
    totalLogsRendered: number;
  };
  metricsCollector: {
    enabled: boolean;
    running: boolean;
    stats: CollectionStats | null;
  };
  logAggregator: {
    enabled: boolean;
    lastAggregation: AggregationStats | null;
  };
  healthMonitor: {
    enabled: boolean;
    running: boolean;
    health: SystemHealth | null;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════════

let isInitialized = false;
let isRunning = false;
let _prismaClient: PrismaClient | null = null; // Stored for potential future use
let aggregationInterval: ReturnType<typeof setInterval> | null = null;

const defaultConfig: Required<ObservabilityConfig> = {
  consolePollIntervalMs: 5000,
  consoleFormat: "detailed",
  showWorkerHealth: true,
  metricsCollectionIntervalMs: 15000,
  enablePatternDetection: true,
  enableCorrelation: true,
  enableAnomalyDetection: true,
  deduplicationWindowMs: 60000,
  healthCheckIntervalMs: 30000,
  enablePredictiveAlerts: true,
  enableConsoleRenderer: true,
  enableMetricsCollector: true,
  enableLogAggregator: true,
  enableHealthMonitor: true,
};

let config: Required<ObservabilityConfig> = { ...defaultConfig };

// ═══════════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initialize the entire observability system
 * 
 * This sets up:
 * - Console Renderer (DB → Console output)
 * - Metrics Collector (Worker health tracking)
 * - Log Aggregator (Pattern detection, correlation)
 * - Health Monitor (Real-time health scoring)
 * 
 * @param prisma - Prisma client instance
 * @param options - Configuration options
 */
export async function initializeObservability(
  prisma: PrismaClient,
  options?: ObservabilityConfig
): Promise<void> {
  const logger = getLogger();
  
  if (isInitialized) {
    logger.warn("observability", "initialize", "Observability system already initialized");
    return;
  }
  
  _prismaClient = prisma;
  config = { ...defaultConfig, ...options };
  
  logger.info("observability", "initialize", "Initializing DB-First observability system", {
    metadata: {
      consoleRenderer: config.enableConsoleRenderer,
      metricsCollector: config.enableMetricsCollector,
      logAggregator: config.enableLogAggregator,
      healthMonitor: config.enableHealthMonitor,
    },
  });
  
  // Initialize Console Renderer
  if (config.enableConsoleRenderer) {
    initConsoleRenderer(prisma, {
      pollIntervalMs: config.consolePollIntervalMs,
      format: config.consoleFormat,
      showWorkerHealth: config.showWorkerHealth,
    });
    logger.debug("observability", "initialize", "Console renderer initialized");
  }
  
  // Note: Metrics Collector uses startMetricsCollection() - it doesn't need separate init
  // It will be started in startObservability()
  if (config.enableMetricsCollector) {
    // Store interval config for later start
    logger.debug("observability", "initialize", "Metrics collector configured", {
      metadata: { intervalMs: config.metricsCollectionIntervalMs },
    });
  }
  
  // Initialize Log Aggregator
  if (config.enableLogAggregator) {
    initLogAggregator(prisma, {
      patternDetectionEnabled: config.enablePatternDetection,
      correlationEnabled: config.enableCorrelation,
      anomalyDetectionEnabled: config.enableAnomalyDetection,
      deduplicationWindowMs: config.deduplicationWindowMs,
    });
    logger.debug("observability", "initialize", "Log aggregator initialized");
  }
  
  // Initialize Health Monitor
  if (config.enableHealthMonitor) {
    initHealthMonitor(prisma, {
      checkIntervalMs: config.healthCheckIntervalMs,
      enablePredictiveAlerts: config.enablePredictiveAlerts,
    });
    logger.debug("observability", "initialize", "Health monitor initialized");
  }
  
  isInitialized = true;
  
  logger.info("observability", "initialize", "✓ Observability system initialized successfully");
}

/**
 * Start all observability services
 * 
 * This starts:
 * - Console polling loop
 * - Metrics collection loop
 * - Periodic aggregation
 * - Health monitoring loop
 */
export function startObservability(): void {
  const logger = getLogger();
  
  if (!isInitialized) {
    logger.error("observability", "start", "Cannot start - system not initialized");
    return;
  }
  
  if (isRunning) {
    logger.warn("observability", "start", "Observability system already running");
    return;
  }
  
  logger.info("observability", "start", "Starting observability services...");
  
  // Start Console Renderer
  if (config.enableConsoleRenderer) {
    startConsoleRenderer();
    logger.debug("observability", "start", "Console renderer started");
  }
  
  // Start Metrics Collector
  if (config.enableMetricsCollector) {
    startMetricsCollection({ intervalMs: config.metricsCollectionIntervalMs });
    logger.debug("observability", "start", "Metrics collection started");
  }
  
  // Start periodic aggregation (every 5 minutes)
  if (config.enableLogAggregator) {
    aggregationInterval = setInterval(async () => {
      try {
        const stats = await runAggregation();
        logger.debug("observability", "aggregation", "Log aggregation complete", {
          metadata: {
            patterns: stats.stats.patternsDetected,
            correlations: stats.stats.correlationsFound,
            anomalies: stats.stats.anomaliesDetected,
            processingMs: stats.stats.processingTimeMs,
          },
        });
      } catch (err) {
        logger.error("observability", "aggregation", "Aggregation failed", {
          error: {
            name: "AggregationError",
            message: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }, 5 * 60 * 1000); // Every 5 minutes
    logger.debug("observability", "start", "Log aggregation scheduled");
  }
  
  // Start Health Monitor
  if (config.enableHealthMonitor) {
    startHealthMonitor();
    logger.debug("observability", "start", "Health monitor started");
  }
  
  isRunning = true;
  
  logger.info("observability", "start", "✓ All observability services started");
}

/**
 * Stop all observability services gracefully
 */
export async function shutdownObservability(): Promise<void> {
  const logger = getLogger();
  
  if (!isRunning) {
    logger.debug("observability", "shutdown", "Observability system not running");
    return;
  }
  
  logger.info("observability", "shutdown", "Shutting down observability services...");
  
  // Stop aggregation interval
  if (aggregationInterval) {
    clearInterval(aggregationInterval);
    aggregationInterval = null;
  }
  
  // Stop Health Monitor
  if (config.enableHealthMonitor) {
    stopHealthMonitor();
    logger.debug("observability", "shutdown", "Health monitor stopped");
  }
  
  // Stop Metrics Collector
  if (config.enableMetricsCollector) {
    await stopMetricsCollection();
    logger.debug("observability", "shutdown", "Metrics collection stopped");
  }
  
  // Stop Console Renderer
  if (config.enableConsoleRenderer) {
    stopConsoleRenderer();
    logger.debug("observability", "shutdown", "Console renderer stopped");
  }
  
  isRunning = false;
  
  logger.info("observability", "shutdown", "✓ Observability services shut down gracefully");
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS & MONITORING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get current status of all observability components
 */
export function getObservabilityStatus(): ObservabilityStatus {
  const rendererStats = config.enableConsoleRenderer ? getRendererStats() : null;
  const collectorStats = config.enableMetricsCollector ? getCollectionStats() : null;
  const health = config.enableHealthMonitor ? getSystemHealth() : null;
  
  return {
    initialized: isInitialized,
    running: isRunning,
    consoleRenderer: {
      enabled: config.enableConsoleRenderer,
      running: rendererStats?.isRunning ?? false,
      cycleCount: rendererStats?.cycleCount ?? 0,
      totalLogsRendered: rendererStats?.totalLogsRendered ?? 0,
    },
    metricsCollector: {
      enabled: config.enableMetricsCollector,
      running: collectorStats?.isRunning ?? false,
      stats: collectorStats,
    },
    logAggregator: {
      enabled: config.enableLogAggregator,
      lastAggregation: null, // Populated on next aggregation
    },
    healthMonitor: {
      enabled: config.enableHealthMonitor,
      running: isRunning && config.enableHealthMonitor,
      health,
    },
  };
}

/**
 * Get current configuration
 */
export function getObservabilityConfig(): Required<ObservabilityConfig> {
  return { ...config };
}

/**
 * Run aggregation on demand
 */
export async function runAggregationNow(): Promise<AggregationStats> {
  const result = await runAggregation();
  return result.stats;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

// Re-export individual components for direct access if needed
export { 
  // Console Renderer
  initConsoleRenderer,
  startConsoleRenderer,
  stopConsoleRenderer,
  getRendererStats,
  
  // Metrics Collector
  startMetricsCollection,
  stopMetricsCollection,
  getCollectionStats,
  forceCollect,
  setCollectionInterval,
  
  // Log Aggregator
  initLogAggregator,
  runAggregation,
  getAggregatorConfig,
  
  // Health Monitor
  initHealthMonitor,
  startHealthMonitor,
  stopHealthMonitor,
  getSystemHealth,
  getMonitorConfig,
};

// Export types
export type { ObservabilityConfig, ObservabilityStatus };
