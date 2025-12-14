/**
 * @file Prometheus Metrics HTTP Server
 * @description Standalone HTTP server exposing /metrics endpoint for Prometheus scraping
 * 
 * **STATUS:** Active (Migration Strategy Under Review)
 * 
 * This service exposes a /metrics endpoint for Prometheus scraping and is
 * actively used by the security bot (src/bot/main.js).
 * 
 * **Future Consideration:**
 * - May integrate with TimescaleDB for unified observability
 * - Current implementation works well for Prometheus + Grafana stack
 * - Decision depends on monitoring strategy evolution
 * 
 * @module services/metrics-server
 * @since Week 3 Day 20-21 (Security Hardening Project)
 */

import express from 'express';
import {
  initializeMetrics,
  getMetricsText,
  getMetricsContentType,
  shutdownMetrics,
  isMetricsInitialized
} from './prometheus-metrics.js';

/**
 * Metrics server instance
 */
let metricsServer = null;
let metricsApp = null;
let metricsPath = '/metrics'; // Store configured path

/**
 * Start Prometheus metrics HTTP server
 * @param {Object} options - Server configuration
 * @param {number} options.port - HTTP port (default: 9090)
 * @param {string} options.host - HTTP host (default: '0.0.0.0')
 * @param {string} options.path - Metrics endpoint path (default: '/metrics')
 * @param {Object} options.metricsOptions - Prometheus metrics options (passed to initializeMetrics)
 * @param {Function} options.log - Logger function (optional)
 * @returns {Promise<Object>} Server instance and URL
 */
export async function startMetricsServer(options = {}) {
  const {
    port = 9090,
    host = '0.0.0.0',
    path = '/metrics',
    metricsOptions = {},
    log = (...args) => {
      // Default no-op logger (user should provide their own)
      if (process.env.DEBUG_METRICS) {
        // eslint-disable-next-line no-console
        console.log(...args);
      }
    }
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
  metricsApp.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metricsInitialized: isMetricsInitialized()
    });
  });
  
  // Metrics endpoint (Prometheus format)
  metricsApp.get(path, async (req, res) => {
    try {
      const metricsText = await getMetricsText();
      const contentType = getMetricsContentType();
      
      res.set('Content-Type', contentType);
      res.status(200).send(metricsText);
    } catch (error) {
      log('[metrics-server] Error generating metrics:', error);
      res.status(500).json({
        error: 'Failed to generate metrics',
        message: error.message
      });
    }
  });
  
  // Root endpoint (info)
  metricsApp.get('/', (req, res) => {
    res.status(200).json({
      service: 'Security Bot Metrics Server',
      version: '1.0.0',
      endpoints: [
        { path: '/metrics', description: 'Prometheus metrics' },
        { path: '/health', description: 'Health check' }
      ],
      documentation: 'https://prometheus.io/docs/instrumenting/exposition_formats/'
    });
  });
  
  // Start HTTP server
  return new Promise((resolve, reject) => {
    metricsServer = metricsApp.listen(port, host, (err) => {
      if (err) {
        reject(err);
        return;
      }
      
      const address = metricsServer.address();
      const url = `http://${address.address}:${address.port}${path}`;
      
      log(`[metrics-server] Prometheus metrics server started at ${url}`);
      log(`[metrics-server] Health check available at http://${address.address}:${address.port}/health`);
      
      resolve({
        server: metricsServer,
        app: metricsApp,
        url,
        port: address.port,
        host: address.address,
        path
      });
    });
  });
}

/**
 * Stop Prometheus metrics HTTP server
 * @param {Object} options - Shutdown options
 * @param {Function} options.log - Logger function (optional)
 * @returns {Promise<void>}
 */
export async function stopMetricsServer(options = {}) {
  const {
    log = (...args) => {
      if (process.env.DEBUG_METRICS) {
        // eslint-disable-next-line no-console
        console.log(...args);
      }
    }
  } = options;
  
  if (!metricsServer) {
    log('[metrics-server] No active metrics server to stop');
    return;
  }
  
  return new Promise((resolve, reject) => {
    metricsServer.close((err) => {
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
 * Check if metrics server is running
 * @returns {boolean}
 */
export function isMetricsServerRunning() {
  return metricsServer !== null && metricsServer.listening;
}

/**
 * Get metrics server info
 * @returns {Object|null} Server info or null if not running
 */
export function getMetricsServerInfo() {
  if (!metricsServer || !metricsServer.listening) {
    return null;
  }
  
  const address = metricsServer.address();
  
  return {
    host: address.address,
    port: address.port,
    path: metricsPath,
    listening: true
  };
}
