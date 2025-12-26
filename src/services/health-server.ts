/**
 * HTTP Health Check Server
 * 
 * Purpose: Lightweight HTTP server that external monitors can ping to detect downtime.
 * Strategy: Don't rely on Render's auto-restart - implement our own monitoring layer.
 * 
 * Features:
 * - Returns 200 OK when application is healthy (engineReady = true)
 * - Returns 206 Partial Content during warmup (initializing, cache loading)
 * - Returns 503 Service Unavailable during shutdown only
 * - Includes uptime, memory, service health in response body
 * - Port configurable via HEALTH_CHECK_PORT (default: 3000)
 * 
 * OPTIMIZATION (Phase 4 - Seamless Restart):
 * - 206 Partial Content signals "still booting but functional" (prevents false alarms)
 * - External monitors recognize 206 as valid (GitHub Actions, UptimeRobot)
 * - Target: Zero health check failures during planned restarts
 * 
 * Integration:
 * - External monitors (UptimeRobot, Pingdom) ping /health endpoint
 * - GitHub Actions watchdog pings every 35 minutes (accepts 200 or 206)
 * - Discord webhooks trigger on consecutive failures
 * - Render API restart triggered after threshold exceeded
 * 
 * @module health-server
 */

// LOGGER FIRST — Must be early import to capture initialization errors
import { getLogger } from "../shared/logging/index.js";
const logger = getLogger();

import http from 'node:http';
import { HEALTH_CHECK_PATH, HEALTH_CHECK_TIMEOUT_MS } from '../config/engine-db-config.js';
import { ServiceRegistry } from '../shared/service-registry.js';
import { HEALTH_CHECK_PORT, HEALTH_CHECK_HOST } from '../config/env.js';
import { bytesToMB } from '../shared/utils/format-utils.js';
import { handleMetricsRequest, isMetricsInitialized } from './prometheus-metrics.js';

// ============================================================================
// Configuration
// ============================================================================

const PORT = HEALTH_CHECK_PORT;
const HOST = HEALTH_CHECK_HOST;

// ============================================================================
// Health Server State
// ============================================================================

let server: http.Server | null = null;
let startTime = Date.now();

// ============================================================================
// Health Check Logic
// ============================================================================

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'initializing' | 'shutting_down';
  timestamp: number;
  uptime_ms: number;
  uptime_human: string;
  memory: {
    rss_mb: number;
    heap_used_mb: number;
    heap_total_mb: number;
    external_mb: number;
  };
  services?: {
    healthy: number;
    degraded: number;
    error: number;
    total: number;
  };
  engine_ready: boolean;
}

function getHealthStatus(): HealthResponse {
  const now = Date.now();
  const uptimeMs = now - startTime;
  const uptimeSeconds = Math.floor(uptimeMs / 1000);
  const uptimeMinutes = Math.floor(uptimeSeconds / 60);
  const uptimeHours = Math.floor(uptimeMinutes / 60);
  const uptimeDays = Math.floor(uptimeHours / 24);

  const uptimeHuman = 
    uptimeDays > 0 ? `${uptimeDays}d ${uptimeHours % 24}h` :
    uptimeHours > 0 ? `${uptimeHours}h ${uptimeMinutes % 60}m` :
    uptimeMinutes > 0 ? `${uptimeMinutes}m ${uptimeSeconds % 60}s` :
    `${uptimeSeconds}s`;

  const memUsage = process.memoryUsage();
  const memory = {
    rss_mb: bytesToMB(memUsage.rss),
    heap_used_mb: bytesToMB(memUsage.heapUsed),
    heap_total_mb: bytesToMB(memUsage.heapTotal),
    external_mb: bytesToMB(memUsage.external),
  };

  const engineReady = global.engineReady ?? false;

  // Check Service Registry health
  let status: HealthResponse['status'] = 'initializing';
  let services: HealthResponse['services'] | undefined;

  try {
    const registry = ServiceRegistry.getInstance();
    const registryStatus = registry.getStatus();

    if (registryStatus.isShuttingDown) {
      status = 'shutting_down';
    } else if (!engineReady) {
      status = 'initializing';
    } else if (registryStatus.errorCount > 0 || registryStatus.degradedCount > 0) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    services = {
      healthy: registryStatus.healthyCount,
      degraded: registryStatus.degradedCount,
      error: registryStatus.errorCount,
      total: registryStatus.serviceCount,
    };
  } catch {
    // Service Registry not initialized yet
    status = 'initializing';
  }

  return {
    status,
    timestamp: now,
    uptime_ms: uptimeMs,
    uptime_human: uptimeHuman,
    memory,
    services,
    engine_ready: engineReady,
  };
}

// ============================================================================
// HTTP Request Handler
// ============================================================================

/** Prometheus metrics endpoint path */
const METRICS_PATH = '/metrics';

function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): void {
  // ─────────────────────────────────────────────────────────────────────────────
  // P5: Prometheus /metrics endpoint
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'GET' && req.url === METRICS_PATH) {
    if (isMetricsInitialized()) {
      // Delegate to prometheus-metrics handler (async)
      handleMetricsRequest(res).catch((error) => {
        logger.error('health-server', 'metrics', 'Prometheus metrics request failed', { metadata: { errorMsg: String(error) } });
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      });
      return;
    } else {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('# Metrics not initialized yet\n');
      return;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Health check endpoint (original)
  // ─────────────────────────────────────────────────────────────────────────────
  // Only respond to GET requests on HEALTH_CHECK_PATH
  if (req.method !== 'GET' || req.url !== HEALTH_CHECK_PATH) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  const health = getHealthStatus();

  // ═════════════════════════════════════════════════════════════════════════════
  // PHASE 4: HEALTH CHECK 206 PARTIAL CONTENT (Seamless Restart Optimization)
  // ═════════════════════════════════════════════════════════════════════════════
  // During warmup (initializing), return 206 instead of 503
  // This signals "still booting but functional" to external monitors
  // Prevents false alarms during 2-3s boot window after restart
  // GitHub Actions watchdog recognizes 206 as valid (non-failure)
  
  // Determine HTTP status code
  const statusCode = 
    health.status === 'healthy' ? 200 :       // Fully operational
    health.status === 'degraded' ? 200 :      // Operational but degraded
    health.status === 'initializing' ? 206 :  // Warmup phase (SEAMLESS RESTART)
    503;                                       // shutting_down only

  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'X-Service-Status': health.status,
    'X-Engine-Ready': String(health.engine_ready),
  });

  res.end(JSON.stringify(health, null, 2));

  // Log health checks: 503 = warn (actual failure), 206 = info (warmup), 200 = silent (normal)
  if (statusCode === 503) {
    logger.warn('health-server', 'health-check', 'Health check returned 503 (shutting down)', {
      metadata: {
        status: health.status,
        engineReady: health.engine_ready,
        services: health.services,
      },
    });
  } else if (statusCode === 206) {
    // 206 during warmup is expected (seamless restart), log once per boot
    logger.info('health-server', 'health-check', 'Health check returned 206 (warmup phase - seamless restart)', {
      metadata: {
        status: health.status,
        engineReady: health.engine_ready,
      },
    });
  }
}

// ============================================================================
// Server Lifecycle
// ============================================================================

/**
 * Start HTTP health check server
 */
export function startHealthServer(): void {
  if (server) {
    logger.warn('health-server', 'start', 'Health server already running', { metadata: { port: PORT, host: HOST } });
    return;
  }

  server = http.createServer(handleRequest);

  // Set timeouts to prevent hanging connections
  server.timeout = HEALTH_CHECK_TIMEOUT_MS;
  server.keepAliveTimeout = HEALTH_CHECK_TIMEOUT_MS;
  server.headersTimeout = HEALTH_CHECK_TIMEOUT_MS + 1000;

  server.listen(PORT, HOST, () => {
    logger.info('health-server', 'start', 'Health check server started', {
      metadata: {
        port: PORT,
        host: HOST,
        path: HEALTH_CHECK_PATH,
        timeout: `${HEALTH_CHECK_TIMEOUT_MS}ms`,
      },
    });
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.error('health-server', 'error', 'Health server port already in use', { metadata: { port: PORT, host: HOST } });
    } else {
      logger.error('health-server', 'error', 'Health server error', { error: { name: error.name, message: error.message } });
    }
  });

  // Ensure server doesn't prevent process exit
  server.unref();
}

/**
 * Stop HTTP health check server
 */
export async function stopHealthServer(): Promise<void> {
  if (!server) {
    return;
  }

  return new Promise((resolve, reject) => {
    server!.close((error) => {
      if (error) {
        logger.error('health-server', 'shutdown', 'Health server shutdown error', { error: { name: error.name, message: error.message } });
        reject(error);
      } else {
        logger.info('health-server', 'shutdown', 'Health server stopped');
        server = null;
        resolve();
      }
    });

    // Force close after 5 seconds
    setTimeout(() => {
      if (server) {
        logger.warn('health-server', 'shutdown', 'Health server force closing after timeout');
        server = null;
        resolve();
      }
    }, 5000);
  });
}

/**
 * Reset start time (for testing)
 */
export function resetStartTime(): void {
  startTime = Date.now();
}

/**
 * Get current server instance (for testing)
 */
export function getServer(): http.Server | null {
  return server;
}

