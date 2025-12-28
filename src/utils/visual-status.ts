/**
 * Visual Status Display Module — Operator-Friendly System Health
 * 
 * Provides color-coded, visually clear status displays for system monitoring.
 * Designed for non-technical operators who need at-a-glance health checks.
 * 
 * @module visual-status
 * @priority HIGHEST (Role 0 - UX/Visual Simplification)
 */

// ============================================================================
// ANSI Color Codes (Terminal Safe)
// ============================================================================

export const COLORS = {
  // Status Colors
  green: '\x1b[32m',   // Good/Healthy/Success
  yellow: '\x1b[33m',  // Warning/Elevated/Caution
  red: '\x1b[31m',     // Critical/Error/Danger
  
  // Info Colors
  blue: '\x1b[34m',    // Info/Details
  cyan: '\x1b[36m',    // Headers/Sections
  magenta: '\x1b[35m', // Special/Highlight
  
  // Text Styles
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  reset: '\x1b[0m'
} as const;

/**
 * Disable colors for non-TTY outputs (CI, logs, etc.)
 */
export const NO_COLOR = process.env.NO_COLOR === '1' || !process.stdout.isTTY;

/**
 * Apply color only if TTY is available
 */
function color(code: string, text: string): string {
  return NO_COLOR ? text : `${code}${text}${COLORS.reset}`;
}

// ============================================================================
// Status Indicators (Visual Symbols)
// ============================================================================

export const STATUS = {
  // Health Status
  healthy: '🟢',
  warning: '🟡',
  critical: '🔴',
  
  // Operation Status
  success: '✅',
  failure: '❌',
  pending: '⏳',
  
  // General Indicators
  info: 'ℹ️',
  error: '⚠️',
  check: '✓',
  cross: '✗'
} as const;

// ============================================================================
// Health Metric Types
// ============================================================================

export interface HealthMetrics {
  // System Resources
  memoryMB: number;
  memoryLimitMB: number;
  diskPercent: number;
  
  // Application Health
  dbConnected: boolean;
  workersActive: number;
  workersTotal: number;
  errorsCount: number;
  
  // Uptime & Performance
  uptimeSeconds: number;
  requestsPerSecond?: number;
}

export interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  message?: string;
}

// ============================================================================
// Status Classification (Color Thresholds)
// ============================================================================

export function getMemoryStatus(usedMB: number, limitMB: number = 2048): {
  color: string;
  indicator: string;
  severity: 'healthy' | 'warning' | 'critical';
} {
  const percent = (usedMB / limitMB) * 100;
  
  if (percent < 50) {
    return { color: COLORS.green, indicator: STATUS.healthy, severity: 'healthy' };
  } else if (percent < 75) {
    return { color: COLORS.yellow, indicator: STATUS.warning, severity: 'warning' };
  } else {
    return { color: COLORS.red, indicator: STATUS.critical, severity: 'critical' };
  }
}

export function getDiskStatus(percent: number): {
  color: string;
  indicator: string;
  severity: 'healthy' | 'warning' | 'critical';
} {
  if (percent < 70) {
    return { color: COLORS.green, indicator: STATUS.healthy, severity: 'healthy' };
  } else if (percent < 85) {
    return { color: COLORS.yellow, indicator: STATUS.warning, severity: 'warning' };
  } else {
    return { color: COLORS.red, indicator: STATUS.critical, severity: 'critical' };
  }
}

export function getErrorStatus(errorCount: number): {
  color: string;
  indicator: string;
  severity: 'healthy' | 'warning' | 'critical';
} {
  if (errorCount === 0) {
    return { color: COLORS.green, indicator: STATUS.success, severity: 'healthy' };
  } else if (errorCount < 10) {
    return { color: COLORS.yellow, indicator: STATUS.warning, severity: 'warning' };
  } else {
    return { color: COLORS.red, indicator: STATUS.failure, severity: 'critical' };
  }
}

// ============================================================================
// Formatted Display Functions
// ============================================================================

/**
 * Format a status line with color coding
 * 
 * @example
 * formatStatusLine('Memory', '1234 MB', 'healthy') 
 * // => "🟢 Memory: 1234 MB"
 */
export function formatStatusLine(
  label: string,
  value: string,
  severity: 'healthy' | 'warning' | 'critical'
): string {
  const statusMap = {
    healthy: { color: COLORS.green, indicator: STATUS.healthy },
    warning: { color: COLORS.yellow, indicator: STATUS.warning },
    critical: { color: COLORS.red, indicator: STATUS.critical }
  };
  
  const { color: statusColor, indicator } = statusMap[severity];
  const labelText = color(COLORS.bold, label);
  const valueText = color(statusColor, value);
  
  return `${indicator} ${labelText}: ${valueText}`;
}

/**
 * Format uptime in human-readable format
 * 
 * @example
 * formatUptime(3665) // => "1h 1m 5s"
 */
export function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Format percentage with color based on threshold
 * 
 * @example
 * formatPercent(85.5, 75, 90) // => "85.5%" (yellow if between 75-90)
 */
export function formatPercent(
  value: number,
  warningThreshold: number,
  criticalThreshold: number
): string {
  const percentText = `${value.toFixed(1)}%`;
  
  if (value < warningThreshold) {
    return color(COLORS.green, percentText);
  } else if (value < criticalThreshold) {
    return color(COLORS.yellow, percentText);
  } else {
    return color(COLORS.red, percentText);
  }
}

// ============================================================================
// System Health Dashboard
// ============================================================================

/**
 * Generate a complete system health dashboard for operators
 * 
 * Displays:
 * - Overall health status (ALL SYSTEMS GO / ISSUES DETECTED / CRITICAL)
 * - Memory usage with color coding
 * - Disk usage with color coding
 * - Database connection status
 * - Worker health (active/total)
 * - Error count
 * - Uptime
 */
export function formatSystemHealth(metrics: HealthMetrics): string {
  // Overall Health Assessment
  const memStatus = getMemoryStatus(metrics.memoryMB, metrics.memoryLimitMB);
  const diskStatus = getDiskStatus(metrics.diskPercent);
  const errorStatus = getErrorStatus(metrics.errorsCount);
  
  const criticalIssues = [memStatus, diskStatus, errorStatus].filter(s => s.severity === 'critical').length;
  const warningIssues = [memStatus, diskStatus, errorStatus].filter(s => s.severity === 'warning').length;
  
  let overallStatus: string;
  let overallIndicator: string;
  if (criticalIssues > 0) {
    overallStatus = color(COLORS.red, 'CRITICAL ISSUES DETECTED');
    overallIndicator = STATUS.critical;
  } else if (warningIssues > 0) {
    overallStatus = color(COLORS.yellow, 'WARNINGS PRESENT');
    overallIndicator = STATUS.warning;
  } else {
    overallStatus = color(COLORS.green, 'ALL SYSTEMS GO');
    overallIndicator = STATUS.healthy;
  }
  
  // Format metrics
  const memoryText = `${metrics.memoryMB.toFixed(0)} MB / ${metrics.memoryLimitMB} MB (${((metrics.memoryMB / metrics.memoryLimitMB) * 100).toFixed(1)}%)`;
  const diskText = `${metrics.diskPercent.toFixed(1)}% used`;
  const dbText = metrics.dbConnected ? color(COLORS.green, 'Connected') : color(COLORS.red, 'Disconnected');
  const workersText = `${metrics.workersActive} / ${metrics.workersTotal}`;
  const errorsText = metrics.errorsCount === 0 ? color(COLORS.green, 'None') : `${metrics.errorsCount}`;
  const uptimeText = formatUptime(metrics.uptimeSeconds);
  
  // Build dashboard
  return `
╔════════════════════════════════════════════════════╗
║  ${color(COLORS.bold + COLORS.cyan, 'INFINITY GAUNTLET — SYSTEM STATUS')}           ║
╚════════════════════════════════════════════════════╝

${overallIndicator} HEALTH         ${overallStatus}

${memStatus.indicator} MEMORY         ${color(memStatus.color, memoryText)}
${diskStatus.indicator} DISK           ${color(diskStatus.color, diskText)}
${metrics.dbConnected ? STATUS.healthy : STATUS.critical} DATABASE       ${dbText}
${metrics.workersActive === metrics.workersTotal ? STATUS.healthy : STATUS.warning} WORKERS        ${workersText} active
${errorStatus.indicator} ERRORS         ${errorsText}
${STATUS.info} UPTIME         ${uptimeText}
${metrics.requestsPerSecond ? `${STATUS.info} REQUESTS       ${metrics.requestsPerSecond.toFixed(1)}/sec\n` : ''}
╚════════════════════════════════════════════════════╝
  `.trim();
}

/**
 * Generate a compact one-line system status summary
 * 
 * @example
 * formatCompactStatus(metrics) 
 * // => "🟢 Health: OK | Memory: 850 MB (42%) | Disk: 65% | DB: Connected | Workers: 6/6"
 */
export function formatCompactStatus(metrics: HealthMetrics): string {
  const memStatus = getMemoryStatus(metrics.memoryMB, metrics.memoryLimitMB);
  const diskStatus = getDiskStatus(metrics.diskPercent);
  
  const healthIndicator = memStatus.severity === 'critical' || diskStatus.severity === 'critical' || !metrics.dbConnected
    ? STATUS.critical
    : memStatus.severity === 'warning' || diskStatus.severity === 'warning'
    ? STATUS.warning
    : STATUS.healthy;
  
  const memPercent = ((metrics.memoryMB / metrics.memoryLimitMB) * 100).toFixed(0);
  
  return [
    `${healthIndicator} Health: ${memStatus.severity === 'healthy' && diskStatus.severity === 'healthy' ? 'OK' : 'ISSUES'}`,
    `Memory: ${metrics.memoryMB.toFixed(0)} MB (${memPercent}%)`,
    `Disk: ${metrics.diskPercent.toFixed(0)}%`,
    `DB: ${metrics.dbConnected ? 'Connected' : 'Disconnected'}`,
    `Workers: ${metrics.workersActive}/${metrics.workersTotal}`
  ].join(' | ');
}

/**
 * Format a service status list for multi-service monitoring
 * 
 * @example
 * formatServiceList([
 *   { name: 'Bot', status: 'healthy', message: 'Running' },
 *   { name: 'Outbox', status: 'degraded', message: 'High latency' }
 * ])
 */
export function formatServiceList(services: ServiceStatus[]): string {
  const lines = services.map(service => {
    let indicator: string;
    let statusText: string;
    
    switch (service.status) {
      case 'healthy':
        indicator = STATUS.healthy;
        statusText = color(COLORS.green, 'Healthy');
        break;
      case 'degraded':
        indicator = STATUS.warning;
        statusText = color(COLORS.yellow, 'Degraded');
        break;
      case 'down':
        indicator = STATUS.critical;
        statusText = color(COLORS.red, 'Down');
        break;
    }
    
    const nameText = color(COLORS.bold, service.name.padEnd(20));
    const messageText = service.message ? color(COLORS.dim, `(${service.message})`) : '';
    
    return `${indicator} ${nameText} ${statusText} ${messageText}`;
  });
  
  return lines.join('\n');
}

// ============================================================================
// Exports
// ============================================================================

export default {
  COLORS,
  STATUS,
  getMemoryStatus,
  getDiskStatus,
  getErrorStatus,
  formatStatusLine,
  formatUptime,
  formatPercent,
  formatSystemHealth,
  formatCompactStatus,
  formatServiceList
};
