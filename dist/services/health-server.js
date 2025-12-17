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
import http from 'node:http';
import { HEALTH_CHECK_PATH, HEALTH_CHECK_TIMEOUT_MS } from '../config/engine-db-config.js';
import { log } from "../shared/logger.js";
import { ServiceRegistry } from '../shared/service-registry.js';
import { HEALTH_CHECK_PORT, HEALTH_CHECK_HOST } from '../config/env.js';
import { bytesToMB } from '../shared/utils/format-utils.js';
// ============================================================================
// Configuration
// ============================================================================
const PORT = HEALTH_CHECK_PORT;
const HOST = HEALTH_CHECK_HOST;
// ============================================================================
// Health Server State
// ============================================================================
let server = null;
let startTime = Date.now();
function getHealthStatus() {
    const now = Date.now();
    const uptimeMs = now - startTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const uptimeMinutes = Math.floor(uptimeSeconds / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);
    const uptimeDays = Math.floor(uptimeHours / 24);
    const uptimeHuman = uptimeDays > 0 ? `${uptimeDays}d ${uptimeHours % 24}h` :
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
    let status = 'initializing';
    let services;
    try {
        const registry = ServiceRegistry.getInstance();
        const registryStatus = registry.getStatus();
        if (registryStatus.isShuttingDown) {
            status = 'shutting_down';
        }
        else if (!engineReady) {
            status = 'initializing';
        }
        else if (registryStatus.errorCount > 0 || registryStatus.degradedCount > 0) {
            status = 'degraded';
        }
        else {
            status = 'healthy';
        }
        services = {
            healthy: registryStatus.healthyCount,
            degraded: registryStatus.degradedCount,
            error: registryStatus.errorCount,
            total: registryStatus.serviceCount,
        };
    }
    catch {
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
function handleRequest(req, res) {
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
    const statusCode = health.status === 'healthy' ? 200 : // Fully operational
        health.status === 'degraded' ? 200 : // Operational but degraded
            health.status === 'initializing' ? 206 : // Warmup phase (SEAMLESS RESTART)
                503; // shutting_down only
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Service-Status': health.status,
        'X-Engine-Ready': String(health.engine_ready),
    });
    res.end(JSON.stringify(health, null, 2));
    // Log health checks: 503 = warn (actual failure), 206 = info (warmup), 200 = silent (normal)
    if (statusCode === 503) {
        log.warn('Health check returned 503 (shutting down)', {
            status: health.status,
            engineReady: health.engine_ready,
            services: health.services,
        });
    }
    else if (statusCode === 206) {
        // 206 during warmup is expected (seamless restart), log once per boot
        log.info('Health check returned 206 (warmup phase - seamless restart)', {
            status: health.status,
            engineReady: health.engine_ready,
        });
    }
}
// ============================================================================
// Server Lifecycle
// ============================================================================
/**
 * Start HTTP health check server
 */
export function startHealthServer() {
    if (server) {
        log.warn('Health server already running', { port: PORT, host: HOST });
        return;
    }
    server = http.createServer(handleRequest);
    // Set timeouts to prevent hanging connections
    server.timeout = HEALTH_CHECK_TIMEOUT_MS;
    server.keepAliveTimeout = HEALTH_CHECK_TIMEOUT_MS;
    server.headersTimeout = HEALTH_CHECK_TIMEOUT_MS + 1000;
    server.listen(PORT, HOST, () => {
        log.info('Health check server started', {
            port: PORT,
            host: HOST,
            path: HEALTH_CHECK_PATH,
            timeout: `${HEALTH_CHECK_TIMEOUT_MS}ms`,
        });
    });
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            log.error('Health server port already in use', { port: PORT, host: HOST });
        }
        else {
            log.error('Health server error', { error: error.message });
        }
    });
    // Ensure server doesn't prevent process exit
    server.unref();
}
/**
 * Stop HTTP health check server
 */
export async function stopHealthServer() {
    if (!server) {
        return;
    }
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) {
                log.error('Health server shutdown error', { error: error.message });
                reject(error);
            }
            else {
                log.info('Health server stopped');
                server = null;
                resolve();
            }
        });
        // Force close after 5 seconds
        setTimeout(() => {
            if (server) {
                log.warn('Health server force closing after timeout');
                server = null;
                resolve();
            }
        }, 5000);
    });
}
/**
 * Reset start time (for testing)
 */
export function resetStartTime() {
    startTime = Date.now();
}
/**
 * Get current server instance (for testing)
 */
export function getServer() {
    return server;
}
