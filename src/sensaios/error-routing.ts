/**
 * SensaiOS Error Routing — Severity-Based Error Routing
 * 
 * Routes CanonicalErrors to appropriate destinations based on severity:
 * - LOW: Log only
 * - MEDIUM: Log + track
 * - HIGH: Log + track + Discord alert
 * - CRITICAL: Log + track + Discord alert + pager
 * 
 * @module sensaios/error-routing
 * @since 2025-12-28
 */

import { scopedLogger } from '../observability/envelope/console.js';
import type { CanonicalError } from './canonical-error.js';
import { serializeCanonicalError, summarizeError } from './canonical-error.js';
import type { ErrorSeverity, ExportDestination } from './types.js';

/** Scoped logger for error routing */
const log = scopedLogger('sensaios-error-routing');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Error route configuration
 */
export interface ErrorRoute {
  /** Destinations to send this error to */
  destinations: ExportDestination[];

  /** Should this error be tracked for trending? */
  track: boolean;

  /** Should this error trigger an immediate alert? */
  alert: boolean;

  /** Should this error trigger a pager? */
  page: boolean;
}

/**
 * Router configuration
 */
export interface ErrorRouterConfig {
  /** Routing rules by severity */
  routes: Record<ErrorSeverity, ErrorRoute>;

  /** Discord webhook URL for alerts (optional) */
  discordWebhookUrl?: string;

  /** Pager webhook URL (optional) */
  pagerWebhookUrl?: string;

  /** Whether to log to console */
  logToConsole: boolean;

  /** Whether routing is enabled */
  enabled: boolean;
}

/**
 * Output handler interface
 */
export interface ErrorOutputHandler {
  name: string;
  handle: (error: CanonicalError) => Promise<void>;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

/**
 * Default routing configuration
 */
export const DEFAULT_ERROR_ROUTES: Record<ErrorSeverity, ErrorRoute> = {
  low: {
    destinations: ['console'],
    track: false,
    alert: false,
    page: false,
  },
  medium: {
    destinations: ['console', 'database'],
    track: true,
    alert: false,
    page: false,
  },
  high: {
    destinations: ['console', 'database', 'loki'],
    track: true,
    alert: true,
    page: false,
  },
  critical: {
    destinations: ['console', 'database', 'loki', 'discord'],
    track: true,
    alert: true,
    page: true,
  },
};

// ============================================================================
// ERROR ROUTER CLASS
// ============================================================================

/**
 * Error Router — Routes errors based on severity
 */
export class ErrorRouter {
  private config: ErrorRouterConfig;
  private handlers: Map<ExportDestination, ErrorOutputHandler> = new Map();
  private routedCount = 0;
  private errorsByCategory: Map<string, number> = new Map();
  private errorsBySeverity: Map<ErrorSeverity, number> = new Map();

  constructor(config?: Partial<ErrorRouterConfig>) {
    this.config = {
      routes: config?.routes ?? DEFAULT_ERROR_ROUTES,
      discordWebhookUrl: config?.discordWebhookUrl,
      pagerWebhookUrl: config?.pagerWebhookUrl,
      logToConsole: config?.logToConsole ?? true,
      enabled: config?.enabled ?? true,
    };

    // Initialize default console handler
    this.registerHandler('console', {
      name: 'console',
      handle: async (error) => {
        if (this.config.logToConsole) {
          const summary = summarizeError(error);
          const context = { tenant: error.scope.tenant, fingerprint: error.fingerprint };

          if (error.severity === 'critical') {
            log.fatal('route-critical', `CRITICAL: ${summary}`, context);
          } else if (error.severity === 'high') {
            log.error('route-high', `HIGH: ${summary}`, context);
          } else if (error.severity === 'medium') {
            log.warn('route-medium', `MEDIUM: ${summary}`, context);
          } else {
            log.info('route-low', `LOW: ${summary}`, context);
          }

          if (error.stack && error.severity !== 'low') {
            log.debug('route-stack', error.stack.split('\n').slice(0, 5).join('\n'));
          }
        }
      },
    });

    // Initialize buffer handler (for batching)
    this.registerHandler('buffer', {
      name: 'buffer',
      handle: async () => {
        // Buffer handler is a no-op — errors are collected elsewhere
      },
    });
  }

  /**
   * Register a custom output handler
   */
  registerHandler(destination: ExportDestination, handler: ErrorOutputHandler): void {
    this.handlers.set(destination, handler);
  }

  /**
   * Route an error to appropriate destinations
   */
  async route(error: CanonicalError): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const route = this.config.routes[error.severity];
    if (!route) {
      log.warn('route-missing', `No route configured for severity: ${error.severity}`);
      return;
    }

    // Update statistics
    this.routedCount++;
    this.errorsByCategory.set(
      error.category,
      (this.errorsByCategory.get(error.category) ?? 0) + 1
    );
    this.errorsBySeverity.set(
      error.severity,
      (this.errorsBySeverity.get(error.severity) ?? 0) + 1
    );

    // Route to all configured destinations
    const routingPromises: Promise<void>[] = [];

    for (const destination of route.destinations) {
      const handler = this.handlers.get(destination);
      if (handler) {
        routingPromises.push(
          handler.handle(error).catch((handlerError) => {
            log.error('route-handler-failed', `Error routing to ${destination}`, {
              error: handlerError instanceof Error ? handlerError.message : String(handlerError),
            });
          })
        );
      }
    }

    // Handle alerts
    if (route.alert && this.config.discordWebhookUrl) {
      routingPromises.push(this.sendDiscordAlert(error));
    }

    // Handle paging
    if (route.page && this.config.pagerWebhookUrl) {
      routingPromises.push(this.sendPagerAlert(error));
    }

    await Promise.all(routingPromises);
  }

  /**
   * Send Discord webhook alert
   */
  private async sendDiscordAlert(error: CanonicalError): Promise<void> {
    if (!this.config.discordWebhookUrl) return;

    const color = error.severity === 'critical' ? 0xff0000 : 0xff6600;
    const prefix = error.severity === 'critical' ? '[CRITICAL]' : '[ERROR]';

    const embed = {
      title: `${prefix} ${error.severity.toUpperCase()}: ${error.code}`,
      description: error.message.substring(0, 200),
      color,
      fields: [
        { name: 'Category', value: error.category, inline: true },
        { name: 'Fingerprint', value: error.fingerprint, inline: true },
        { name: 'Tenant', value: error.scope.tenant, inline: true },
        { name: 'Component', value: error.scope.component, inline: true },
      ],
      timestamp: error.timestamp,
    };

    try {
      await fetch(this.config.discordWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
      });
    } catch (fetchError) {
      log.error('discord-alert-failed', 'Failed to send Discord alert', {
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
      });
    }
  }

  /**
   * Send pager alert
   */
  private async sendPagerAlert(error: CanonicalError): Promise<void> {
    if (!this.config.pagerWebhookUrl) return;

    const payload = {
      severity: error.severity,
      title: `${error.code}: ${error.message.substring(0, 100)}`,
      details: serializeCanonicalError(error),
      timestamp: error.timestamp,
    };

    try {
      await fetch(this.config.pagerWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (fetchError) {
      log.error('pager-alert-failed', 'Failed to send pager alert', {
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
      });
    }
  }

  /**
   * Get routing statistics
   */
  getStats(): {
    routedCount: number;
    byCategory: Record<string, number>;
    bySeverity: Record<ErrorSeverity, number>;
  } {
    return {
      routedCount: this.routedCount,
      byCategory: Object.fromEntries(this.errorsByCategory),
      bySeverity: {
        low: this.errorsBySeverity.get('low') ?? 0,
        medium: this.errorsBySeverity.get('medium') ?? 0,
        high: this.errorsBySeverity.get('high') ?? 0,
        critical: this.errorsBySeverity.get('critical') ?? 0,
      },
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.routedCount = 0;
    this.errorsByCategory.clear();
    this.errorsBySeverity.clear();
  }

  /**
   * Check if routing is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable or disable routing
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }
}

// ============================================================================
// SINGLETON ROUTER
// ============================================================================

/** Global error router instance */
let globalRouter: ErrorRouter | null = null;

/**
 * Get the global error router
 */
export function getErrorRouter(): ErrorRouter {
  if (!globalRouter) {
    globalRouter = new ErrorRouter();
  }
  return globalRouter;
}

/**
 * Initialize the global error router with custom config
 */
export function initializeErrorRouter(config?: Partial<ErrorRouterConfig>): ErrorRouter {
  globalRouter = new ErrorRouter(config);
  return globalRouter;
}

/**
 * Route an error using the global router
 */
export async function routeError(error: CanonicalError): Promise<void> {
  return getErrorRouter().route(error);
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Determine if an error should be tracked
 */
export function shouldTrackError(severity: ErrorSeverity): boolean {
  return DEFAULT_ERROR_ROUTES[severity].track;
}

/**
 * Determine if an error should trigger an alert
 */
export function shouldAlertError(severity: ErrorSeverity): boolean {
  return DEFAULT_ERROR_ROUTES[severity].alert;
}

/**
 * Get destinations for a severity level
 */
export function getDestinations(severity: ErrorSeverity): ExportDestination[] {
  return DEFAULT_ERROR_ROUTES[severity].destinations;
}
