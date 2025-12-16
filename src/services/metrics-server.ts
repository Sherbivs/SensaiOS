/**
 * Prometheus Metrics HTTP Server
 * @module services/metrics-server
 *
 * Standalone HTTP server exposing /metrics endpoint for Prometheus scraping.
 *
 * **STATUS:** Active (Migration Strategy Under Review)
 *
 * This service exposes a /metrics endpoint for Prometheus scraping and is
 * actively used by the security bot (src/bot/main.js).
 *
 * **Future Consideration:**
 *   - May integrate with TimescaleDB for unified observability
 *   - Current implementation works well for Prometheus + Grafana stack
 *   - Decision depends on monitoring strategy evolution
 */

import express, { Application, Request, Response } from 'express';
import type { Server, AddressInfo } from 'node:net';
import {
  initializeMetrics,
  getMetricsText,
  getMetricsContentType,
  shutdownMetrics,
  isMetricsInitialized,
} from './prometheus-metrics.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type LogFunction = (...args: unknown[]) => void;

interface MetricsOptions {
  prefix?: string;
  [key: string]: unknown;
}

interface StartOptions {
  port?: number;
  host?: string;
  path?: string;
  metricsOptions?: MetricsOptions;
  log?: LogFunction;
}

interface StopOptions {
  log?: LogFunction;
}

interface ServerResult {
  server: Server;
  app: Application;
  url: string;
  port: number;
  host: string;
  path: string;
}

interface ServerInfo {
  host: string;
  port: number;
  path: string;
  listening: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Metrics server instance.
 */
let metricsServer: Server | null = null;
let metricsApp: Application | null = null;
let metricsPath = '/metrics'; // Store configured path

// ─────────────────────────────────────────────────────────────────────────────
// Default Logger
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default no-op logger (user should provide their own).
 */
function defaultLogger(...args: unknown[]): void {
  if (process.env['DEBUG_METRICS']) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start Prometheus metrics HTTP server.
 *
 * @param options - Server configuration
 * @returns Server instance and URL
 */
export async function startMetricsServer(options: StartOptions = {}): Promise<ServerResult> {
  const {
    port = 9090,
    host = '0.0.0.0',
    path = '/metrics',
    metricsOptions = {},
    log = defaultLogger,
  } = options;

  // Initialize metrics if not already done
  if (!isMetricsInitialized()) {
    initializeMetrics(metricsOptions);
    log('[metrics-server] Prometheus metrics initialized');
  }

  // Create Express app
  metricsApp = express();

  // Store path for later retrieval
  metricsPath = path;

  // Health check endpoint
  metricsApp.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metricsInitialized: isMetricsInitialized(),
    });
  });

  // Metrics endpoint (Prometheus format)
  metricsApp.get(path, async (_req: Request, res: Response) => {
    try {
      const metricsText = await getMetricsText();
      const contentType = getMetricsContentType();

      res.set('Content-Type', contentType);
      res.status(200).send(metricsText);
    } catch (error) {
      log('[metrics-server] Error generating metrics:', error);
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        error: 'Failed to generate metrics',
        message,
      });
    }
  });

  // Root endpoint (info)
  metricsApp.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      service: 'Security Bot Metrics Server',
      version: '1.0.0',
      endpoints: [
        { path: '/metrics', description: 'Prometheus metrics' },
        { path: '/health', description: 'Health check' },
      ],
      documentation: 'https://prometheus.io/docs/instrumenting/exposition_formats/',
    });
  });

  // Start HTTP server
  return new Promise((resolve, reject) => {
    metricsServer = metricsApp!.listen(port, host, () => {
      const address = metricsServer!.address() as AddressInfo;
      const url = `http://${address.address}:${address.port}${path}`;

      log(`[metrics-server] Prometheus metrics server started at ${url}`);
      log(`[metrics-server] Health check available at http://${address.address}:${address.port}/health`);

      resolve({
        server: metricsServer!,
        app: metricsApp!,
        url,
        port: address.port,
        host: address.address,
        path,
      });
    });

    metricsServer.on('error', (err: Error) => {
      reject(err);
    });
  });
}

/**
 * Stop Prometheus metrics HTTP server.
 *
 * @param options - Shutdown options
 */
export async function stopMetricsServer(options: StopOptions = {}): Promise<void> {
  const { log = defaultLogger } = options;

  if (!metricsServer) {
    log('[metrics-server] No active metrics server to stop');
    return;
  }

  return new Promise((resolve, reject) => {
    metricsServer!.close((err) => {
      if (err) {
        log('[metrics-server] Error stopping metrics server:', err);
        reject(err);
        return;
      }

      log('[metrics-server] Prometheus metrics server stopped');
      metricsServer = null;
      metricsApp = null;

      // Shutdown metrics registry
      shutdownMetrics();

      resolve();
    });
  });
}

/**
 * Check if metrics server is running.
 */
export function isMetricsServerRunning(): boolean {
  return metricsServer !== null && metricsServer.listening;
}

/**
 * Get metrics server info.
 *
 * @returns Server info or null if not running
 */
export function getMetricsServerInfo(): ServerInfo | null {
  if (!metricsServer || !metricsServer.listening) {
    return null;
  }

  const address = metricsServer.address() as AddressInfo;

  return {
    host: address.address,
    port: address.port,
    path: metricsPath,
    listening: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Exports
// ─────────────────────────────────────────────────────────────────────────────

export type { StartOptions, StopOptions, ServerResult, ServerInfo };
