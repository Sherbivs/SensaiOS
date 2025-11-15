/**
 * Type definitions for dripAlerts.js
 * 
 * Provides TypeScript support for the DripAlertManager module.
 * Phase 2.3.1: Added to support Event Bus integration testing.
 * 
 * @module src/bot/dripAlerts
 */

/**
 * Alert severity levels
 */
export type AlertSeverity = 'critical' | 'security' | 'warning' | 'notice';

/**
 * Alert metadata (flexible type)
 */
export type AlertMeta = string | Record<string, any> | null | undefined;

/**
 * User object from Discord.js (simplified for alerts)
 */
export interface AlertUser {
  id: string;
  username: string;
  send(content: string): Promise<any>;
}

/**
 * Logging context object
 */
export interface LogContext {
  [key: string]: any;
}

/**
 * Activity recording metadata
 */
export interface ActivityMeta {
  [key: string]: any;
}

/**
 * Configuration options for DripAlertManager
 */
export interface DripAlertManagerConfig {
  /**
   * Discord user ID to receive alerts
   */
  recipient: string;
  
  /**
   * Function to resolve user ID to Discord User object
   */
  resolveAlertUser: (userId: string) => Promise<AlertUser | null>;
  
  /**
   * Function to describe user for logging
   */
  describeUser?: (user: AlertUser) => string;
  
  /**
   * Logging function
   */
  log?: (level: string, message: string, context?: LogContext) => void;
  
  /**
   * Activity recording function
   */
  recordActivity?: (type: string, summary: string, meta?: ActivityMeta) => void;
  
  /**
   * Time zone for digest scheduling (default: America/New_York)
   */
  timeZone?: string;
  
  /**
   * Hour of day for digest delivery (0-23, default: 2)
   */
  digestHour?: number;
  
  /**
   * Minute of hour for digest delivery (0-59, default: 0)
   */
  digestMinute?: number;
}

/**
 * DripAlertManager instance
 */
export interface DripAlertManager {
  /**
   * Start the alert manager (scheduled digest timer)
   */
  start(): void;
  
  /**
   * Stop the alert manager (clear timers, deliver pending alerts)
   */
  stop(): void;
  
  /**
   * Record an alert
   * 
   * Critical and security alerts are delivered immediately.
   * Warning and notice alerts are queued for digest delivery.
   * 
   * @param severity - Alert severity level
   * @param title - Alert title
   * @param meta - Additional alert metadata
   * @returns Promise resolving to true if delivered/queued, false if failed
   */
  recordAlert(severity: AlertSeverity, title: string, meta?: AlertMeta): Promise<boolean>;
  
  /**
   * Flush queued alerts immediately (manual digest delivery)
   * 
   * @returns Promise resolving to true if successful, false if failed
   */
  flushDigest(): Promise<boolean>;
}

/**
 * Create a new DripAlertManager instance
 * 
 * @param config - Configuration options
 * @returns DripAlertManager instance
 */
export function createDripAlertManager(config: DripAlertManagerConfig): DripAlertManager;
