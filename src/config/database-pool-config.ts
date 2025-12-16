/**
 * Database Connection Pool Configuration — Centralized pooling settings
 * 
 * P0-001: Connection Pooling Setup (Database-Centric Development Plan)
 * 
 * Configures connection limits per service to prevent pool exhaustion.
 * Uses Prisma 7 driver adapter (PrismaPg) with pg Pool under the hood.
 * 
 * Service Distribution (Target: 28 total connections):
 * - Main Bot: 10 connections (Discord interactions, battles, encounters)
 * - Outbox Worker: 3 connections (Event bus message delivery)
 * - Cache Worker: 2 connections (Reference data refresh)
 * - Security Worker: 3 connections (Permission sweeps)
 * - Data Pipeline: 5 connections (Bulk data operations)
 * - TimescaleDB Ingest: 5 connections (Analytics write path)
 * 
 * Render PostgreSQL Limits (Starter plan):
 * - Max connections: 97 (default PostgreSQL limit)
 * - Target utilization: <30% (28/97 = ~29%)
 * 
 * Referenced By: src/shared/prisma.ts, docs/operations-bible/database-operations-runbook-comprehensive.md
 * 
 * @module config/database-pool-config
 */

import { log } from '../shared/log.js';
import { getErrorMessage } from '../shared/utils/error-utils.js';

// ============================================================================
// Service Identification
// ============================================================================

/**
 * Identify current service from environment variable
 * Set via SERVICE_NAME in render.yaml for each worker
 */
export function getCurrentServiceName(): string {
  return process.env.SERVICE_NAME ?? 'unknown';
}

// ============================================================================
// Connection Pool Limits Per Service
// ============================================================================

/**
 * Connection pool configuration per service
 * 
 * Fields:
 * - max: Maximum connections in pool
 * - min: Minimum idle connections to maintain
 * - idleTimeoutMs: How long a connection can be idle before closing
 * - connectionTimeoutMs: How long to wait for a connection from pool
 * - statementTimeoutMs: Max time for a single query (0 = no limit)
 */
export interface PoolConfig {
  max: number;
  min: number;
  idleTimeoutMs: number;
  connectionTimeoutMs: number;
  statementTimeoutMs: number;
}

/**
 * Service-specific pool configurations
 * 
 * CRITICAL: Total max connections should not exceed ~30% of PostgreSQL limit
 * to leave headroom for direct connections and admin operations.
 */
export const POOL_CONFIGS: Record<string, PoolConfig> = {
  // Main Discord bot - highest load, handles battles + encounters + user commands
  'discord-bots': {
    max: 10,
    min: 2,
    idleTimeoutMs: 30_000,       // 30s idle timeout
    connectionTimeoutMs: 10_000,  // 10s to acquire connection
    statementTimeoutMs: 30_000,   // 30s max query time
  },
  
  // Outbox worker - steady stream of event bus messages
  'outbox-worker': {
    max: 3,
    min: 1,
    idleTimeoutMs: 60_000,       // 1m idle timeout (lower traffic)
    connectionTimeoutMs: 10_000,
    statementTimeoutMs: 15_000,   // 15s max (messages should be fast)
  },
  
  // Cache worker - periodic bulk reads for reference data
  'cache-worker': {
    max: 2,
    min: 1,
    idleTimeoutMs: 120_000,      // 2m idle timeout (runs periodically)
    connectionTimeoutMs: 10_000,
    statementTimeoutMs: 60_000,   // 60s max (bulk reads can be slow)
  },
  
  // Security worker - permission sweeps and role checks
  'security-bot': {
    max: 3,
    min: 1,
    idleTimeoutMs: 60_000,
    connectionTimeoutMs: 10_000,
    statementTimeoutMs: 30_000,
  },
  
  // Data pipeline worker - bulk imports and transformations
  'data-pipeline-worker': {
    max: 5,
    min: 1,
    idleTimeoutMs: 120_000,      // 2m idle timeout (runs daily)
    connectionTimeoutMs: 30_000,  // 30s to acquire (may wait during bulk ops)
    statementTimeoutMs: 300_000,  // 5m max (bulk operations)
  },
  
  // TimescaleDB analytics ingest - high-volume time-series writes
  'timescaledb-ingest': {
    max: 5,
    min: 2,
    idleTimeoutMs: 30_000,
    connectionTimeoutMs: 10_000,
    statementTimeoutMs: 60_000,
  },
  
  // Default for unknown services (conservative)
  'unknown': {
    max: 3,
    min: 1,
    idleTimeoutMs: 30_000,
    connectionTimeoutMs: 10_000,
    statementTimeoutMs: 30_000,
  },
};

/**
 * Get pool configuration for current service
 */
export function getPoolConfig(): PoolConfig {
  const serviceName = getCurrentServiceName();
  const config = POOL_CONFIGS[serviceName] ?? POOL_CONFIGS['unknown'];
  
  log.info('database-pool: Using pool configuration', {
    service: serviceName,
    maxConnections: config.max,
    minConnections: config.min,
    idleTimeoutMs: config.idleTimeoutMs,
  });
  
  return config;
}

/**
 * Get total max connections across all services
 * Used for monitoring and capacity planning
 */
export function getTotalMaxConnections(): number {
  // Only count production services (exclude 'unknown')
  const productionServices = [
    'discord-bots',
    'outbox-worker', 
    'cache-worker',
    'security-bot',
    'data-pipeline-worker',
    'timescaledb-ingest',
  ];
  
  return productionServices.reduce((total, service) => {
    return total + (POOL_CONFIGS[service]?.max ?? 0);
  }, 0);
}

// ============================================================================
// Pool Metrics Collection
// ============================================================================

/**
 * Pool metrics for monitoring
 * Updated by prisma.ts heartbeat
 */
export interface PoolMetrics {
  serviceName: string;
  totalConnections: number;
  idleConnections: number;
  waitingRequests: number;
  acquiredConnections: number;
  timestamp: Date;
}

// Global metrics holder (updated by Prisma client)
let currentPoolMetrics: PoolMetrics | null = null;

/**
 * Update pool metrics (called by prisma.ts)
 */
export function updatePoolMetrics(metrics: PoolMetrics): void {
  currentPoolMetrics = metrics;
}

/**
 * Get current pool metrics
 */
export function getPoolMetrics(): PoolMetrics | null {
  return currentPoolMetrics;
}

// ============================================================================
// Connection URL Builder
// ============================================================================

/**
 * Build connection URL with pool parameters
 * 
 * Adds pool-related query parameters to the base URL:
 * - connection_limit: Max connections (mapped from pool config)
 * - pool_timeout: Connection acquire timeout (mapped from connectionTimeoutMs)
 * - statement_timeout: Query timeout (mapped from statementTimeoutMs)
 * 
 * @param baseUrl - Base PostgreSQL connection URL
 * @returns URL with pool parameters appended
 */
export function buildPooledConnectionUrl(baseUrl: string): string {
  const config = getPoolConfig();
  
  try {
    const url = new URL(baseUrl);
    
    // Prisma connection pool parameters
    url.searchParams.set('connection_limit', String(config.max));
    url.searchParams.set('pool_timeout', String(Math.floor(config.connectionTimeoutMs / 1000)));
    
    // PostgreSQL statement timeout (in milliseconds)
    url.searchParams.set('statement_timeout', String(config.statementTimeoutMs));
    
    return url.toString();
  } catch (error) {
    log.warn('database-pool: Failed to parse connection URL, using base URL', {
      error: getErrorMessage(error),
    });
    return baseUrl;
  }
}

// ============================================================================
// Pool Health Checks
// ============================================================================

/**
 * Check if pool is healthy based on metrics
 */
export function isPoolHealthy(): { healthy: boolean; reason?: string } {
  const metrics = currentPoolMetrics;
  
  if (!metrics) {
    return { healthy: true, reason: 'No metrics available yet' };
  }
  
  const config = getPoolConfig();
  
  // Warning thresholds
  const utilizationPercent = (metrics.acquiredConnections / config.max) * 100;
  const waitingQueueLength = metrics.waitingRequests;
  
  // Critical: Pool exhausted
  if (metrics.acquiredConnections >= config.max) {
    return { 
      healthy: false, 
      reason: `Pool exhausted: ${metrics.acquiredConnections}/${config.max} connections in use` 
    };
  }
  
  // Warning: High utilization (>80%)
  if (utilizationPercent > 80) {
    return { 
      healthy: true, // Still healthy, but warn
      reason: `High pool utilization: ${utilizationPercent.toFixed(0)}%` 
    };
  }
  
  // Warning: Requests waiting for connections
  if (waitingQueueLength > 0) {
    return { 
      healthy: true, // Still healthy, but warn
      reason: `${waitingQueueLength} requests waiting for connections` 
    };
  }
  
  return { healthy: true };
}

/**
 * Log pool health status (call periodically from heartbeat)
 */
export function logPoolHealth(): void {
  const metrics = currentPoolMetrics;
  const health = isPoolHealthy();
  const config = getPoolConfig();
  
  if (!metrics) {
    return; // No metrics yet
  }
  
  const utilizationPercent = (metrics.acquiredConnections / config.max) * 100;
  
  const level = health.healthy ? 'info' : 'warn';
  if (level === 'warn') {
    log.warn('database-pool: Health check', {
      service: metrics.serviceName,
      acquired: metrics.acquiredConnections,
      idle: metrics.idleConnections,
      waiting: metrics.waitingRequests,
      max: config.max,
      utilization: `${utilizationPercent.toFixed(0)}%`,
      healthy: health.healthy,
      ...(health.reason && !health.healthy ? { reason: health.reason } : {}),
    });
  } else {
    log.info('database-pool: Health check', {
      service: metrics.serviceName,
      acquired: metrics.acquiredConnections,
      idle: metrics.idleConnections,
      waiting: metrics.waitingRequests,
      max: config.max,
      utilization: `${utilizationPercent.toFixed(0)}%`,
      healthy: health.healthy,
    });
  }
}

// ============================================================================
// Export Summary
// ============================================================================

export default {
  getCurrentServiceName,
  getPoolConfig,
  getTotalMaxConnections,
  updatePoolMetrics,
  getPoolMetrics,
  buildPooledConnectionUrl,
  isPoolHealthy,
  logPoolHealth,
  POOL_CONFIGS,
};
