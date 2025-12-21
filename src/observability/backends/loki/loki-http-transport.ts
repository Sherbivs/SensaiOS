/**
 * Loki HTTP Transport
 * ===================
 *
 * HTTP client for Loki push API.
 * Handles payload formatting, timeouts, and health checks.
 *
 * @module observability/backends/loki/loki-http-transport
 * @since 2025-12-20
 */

import type {
  LokiLogEntry,
  LokiPushPayload,
  LokiStream,
  LokiTransportConfig,
} from './loki-types.js';
import { LOKI_CONFIG } from './loki-config.js';

// ============================================================================
// HTTP Transport Class
// ============================================================================

/**
 * HTTP transport for Loki push API.
 */
export class LokiHttpTransport {
  /** Loki push endpoint URL */
  private readonly endpoint: string;

  /** Request timeout in milliseconds */
  private readonly timeoutMs: number;

  /** Static labels added to all entries */
  private readonly staticLabels: Record<string, string>;

  /** Auth headers for Grafana Cloud (optional) */
  private readonly authHeaders: Record<string, string>;

  /**
   * Create a new HTTP transport.
   * @param config - Transport configuration
   */
  constructor(config: LokiTransportConfig) {
    this.endpoint = config.endpoint;
    this.timeoutMs = config.timeoutMs;
    this.staticLabels = {
      job: LOKI_CONFIG.labels.job,
      environment: LOKI_CONFIG.labels.environment,
    };

    // Build auth headers for Grafana Cloud if credentials provided
    this.authHeaders = this.buildAuthHeaders(config.username, config.password);
  }

  // --------------------------------------------------------------------------
  // Auth Support
  // --------------------------------------------------------------------------

  /**
   * Build auth headers for Grafana Cloud.
   * @private
   */
  private buildAuthHeaders(username?: string, password?: string): Record<string, string> {
    if (!username || !password) {
      return {};
    }
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    return { Authorization: `Basic ${auth}` };
  }

  // --------------------------------------------------------------------------
  // Push Operation
  // --------------------------------------------------------------------------

  /**
   * Push batch of entries to Loki.
   * @param entries - Log entries to push
   * @throws Error if push fails
   */
  async push(entries: LokiLogEntry[]): Promise<void> {
    if (entries.length === 0) return;

    const payload = this.buildPayload(entries);
    const pushUrl = `${this.endpoint}/loki/api/v1/push`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(pushUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => 'unknown');
        throw new Error(`Loki push failed: ${response.status} ${response.statusText} - ${text}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  // --------------------------------------------------------------------------
  // Health Check
  // --------------------------------------------------------------------------

  /**
   * Health check via /ready endpoint.
   * @returns true if Loki is ready
   */
  async healthCheck(): Promise<boolean> {
    const readyUrl = `${this.endpoint}/ready`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(readyUrl, {
        method: 'GET',
        headers: this.authHeaders,
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  // --------------------------------------------------------------------------
  // Payload Building
  // --------------------------------------------------------------------------

  /**
   * Build Loki push payload from entries.
   * Groups entries by label set for efficient batching.
   * @private
   */
  private buildPayload(entries: LokiLogEntry[]): LokiPushPayload {
    // Group entries by label set
    const streams = new Map<string, LokiStream>();

    for (const entry of entries) {
      // Build label set
      const labels: Record<string, string> = {
        ...this.staticLabels,
        level: entry.level,
        service: entry.service,
        topic: entry.topic,
      };

      // Create unique key for this label set
      const labelKey = this.labelsToString(labels);

      // Get or create stream
      let stream = streams.get(labelKey);
      if (!stream) {
        stream = { stream: labels, values: [] };
        streams.set(labelKey, stream);
      }

      // Add entry to stream
      const timestampNs = String(entry.timestamp.getTime() * 1_000_000);
      const logLine = this.formatLogLine(entry);
      stream.values.push([timestampNs, logLine]);
    }

    return { streams: Array.from(streams.values()) };
  }

  /**
   * Format log line from entry.
   * @private
   */
  private formatLogLine(entry: LokiLogEntry): string {
    const parts: Record<string, unknown> = {
      message: entry.message,
      timestamp: entry.timestamp.toISOString(),
    };

    if (entry.data && Object.keys(entry.data).length > 0) {
      parts.data = entry.data;
    }

    return JSON.stringify(parts);
  }

  /**
   * Convert labels object to stable string for grouping.
   * @private
   */
  private labelsToString(labels: Record<string, string>): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }
}
