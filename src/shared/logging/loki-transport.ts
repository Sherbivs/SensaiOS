/**
 * Loki Transport - Stream logs to Grafana Loki
 * @module shared/logging/loki-transport
 * 
 * Sends structured logs to a Loki instance for aggregation and querying.
 * Supports batching, retry logic, sampling, and graceful degradation.
 */

import { scopedLogger } from '../../observability/envelope/console.js';
import { shouldEmitLog, getSamplingStats } from './log-sampler.js';

interface LokiLogEntry {
  level: string;
  message: string;
  timestamp: string;
  service: string;
  correlationId?: string;
  data?: Record<string, unknown>;
  sampled?: boolean;
}

interface LokiStream {
  stream: Record<string, string>;
  values: Array<[string, string]>;
}

interface LokiPushPayload {
  streams: LokiStream[];
}

/** Scoped logger for Loki transport */
const log = scopedLogger('loki-transport');

class LokiTransport {
  private endpoint: string;
  private batch: LokiLogEntry[] = [];
  private priorityBatch: LokiLogEntry[] = []; // High-priority logs (errors, warnings)
  private batchSize: number = 100;
  private maxBatchAge: number = 1000; // Flush if batch is older than 1 second
  private flushInterval: number = 5000; // 5 seconds max between flushes
  private timer: NodeJS.Timeout | null = null;
  private batchStartTime: number = 0;
  private enabled: boolean;
  private authHeaders: Record<string, string>;
  private useCompression: boolean;

  // Stats for monitoring
  private stats = {
    totalPushed: 0,
    totalFailed: 0,
    batchesSent: 0,
    bytesCompressed: 0,
    bytesUncompressed: 0,
  };

  /** Timestamp of last error log emission (5-min suppression window) */
  private lastErrorLogAt = 0;
  /** Suppression window: only log Loki errors once per 5 minutes */
  private static readonly ERROR_SUPPRESS_MS = 5 * 60 * 1000;

  constructor(endpoint?: string) {
    this.endpoint = endpoint || process.env.LOKI_ENDPOINT || '';
    this.enabled = Boolean(this.endpoint);
    this.useCompression = process.env.LOKI_COMPRESSION !== 'false';

    // Build auth headers for Grafana Cloud if credentials provided
    this.authHeaders = this.buildAuthHeaders();

    if (this.enabled) {
      this.startBatchTimer();
      const authStatus = Object.keys(this.authHeaders).length > 0 ? ' (with auth)' : '';
      log.info('init', 'Transport initialized', { endpoint: this.endpoint, auth: authStatus !== '', compression: this.useCompression });
    }
  }

  /**
   * Build auth headers for Grafana Cloud.
   * @private
   */
  private buildAuthHeaders(): Record<string, string> {
    const username = process.env.LOKI_USERNAME;
    const password = process.env.LOKI_PASSWORD;
    
    if (!username || !password) {
      return {};
    }
    
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    return { Authorization: `Basic ${auth}` };
  }

  /**
   * Push a log entry to the batch (with sampling and priority queues)
   */
  push(entry: LokiLogEntry): void {
    if (!this.enabled) return;

    // Apply sampling - may drop high-volume INFO logs
    const { shouldLog, sampled } = shouldEmitLog(entry.level, entry.message);
    if (!shouldLog) return;

    // Add sampled flag if log was sampled
    const enrichedEntry = sampled ? { ...entry, sampled: true } : entry;

    // Route to priority or normal batch
    const isPriority = ['error', 'warn', 'fatal', 'critical'].includes(entry.level.toLowerCase());
    
    if (isPriority) {
      this.priorityBatch.push(enrichedEntry);
      // Flush priority immediately if it has entries
      if (this.priorityBatch.length >= 10) {
        this.flushPriority().catch((err) => {
          log.error('flushPriority', 'Priority flush error', { error: err.message });
        });
      }
    } else {
      // Track batch age for adaptive flushing
      if (this.batch.length === 0) {
        this.batchStartTime = Date.now();
      }
      this.batch.push(enrichedEntry);
    }

    // Adaptive flush conditions:
    // 1. Batch is full (>= 100 entries)
    // 2. Batch is older than maxBatchAge (1 second)
    const batchAge = Date.now() - this.batchStartTime;
    const shouldFlush = this.batch.length >= this.batchSize || 
                       (this.batch.length > 0 && batchAge >= this.maxBatchAge);

    if (shouldFlush) {
      this.flush().catch((err) => {
        log.error('flush', 'Flush error', { error: err.message });
      });
    }
  }

  /**
   * Flush priority batch immediately
   */
  private async flushPriority(): Promise<void> {
    if (this.priorityBatch.length === 0) return;

    const entries = [...this.priorityBatch];
    this.priorityBatch = [];

    await this.sendBatch(entries);
  }

  /**
   * Flush the batch to Loki
   */
  async flush(): Promise<void> {
    // Flush both priority and normal batches
    await this.flushPriority();

    if (this.batch.length === 0) return;

    const entries = [...this.batch];
    this.batch = [];
    this.batchStartTime = 0;

    await this.sendBatch(entries);
  }

  /**
   * Send a batch of entries to Loki
   */
  private async sendBatch(entries: LokiLogEntry[]): Promise<void> {
    if (entries.length === 0) return;

    try {
      const payload = this.buildPayload(entries);
      const body = JSON.stringify(payload);
      
      // Track uncompressed size
      this.stats.bytesUncompressed += body.length;

      // Use gzip compression if enabled
      let finalBody: BodyInit = body;
      let contentEncoding = '';

      if (this.useCompression) {
        try {
          const compressed = await this.compressPayload(body);
          this.stats.bytesCompressed += compressed.length;
          // Convert Buffer to Uint8Array for fetch compatibility
          finalBody = new Uint8Array(compressed);
          contentEncoding = 'gzip';
        } catch {
          // Fall back to uncompressed
          this.stats.bytesCompressed += body.length;
        }
      } else {
        this.stats.bytesCompressed += body.length;
      }
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        // ngrok free tier requires this header to bypass interstitial page
        'ngrok-skip-browser-warning': 'true',
        ...this.authHeaders,
      };

      if (contentEncoding) {
        headers['Content-Encoding'] = contentEncoding;
      }

      const response = await fetch(`${this.endpoint}/loki/api/v1/push`, {
        method: 'POST',
        headers,
        body: finalBody,
        signal: AbortSignal.timeout(5000), // 5s timeout
      });

      if (!response.ok) {
        throw new Error(`Loki push failed: ${response.status} ${response.statusText}`);
      }

      this.stats.totalPushed += entries.length;
      this.stats.batchesSent++;
      
      // Emit success metric
      this.emitMetric('success', entries.length);
    } catch (err) {
      this.stats.totalFailed += entries.length;
      
      // Emit failure metric
      this.emitMetric('error', entries.length);
      
      // Time-based suppression: log Loki errors at most once per 5 minutes
      // When Loki/ngrok is down, we don't need to spam console every 5 seconds
      const now = Date.now();
      if (now - this.lastErrorLogAt >= LokiTransport.ERROR_SUPPRESS_MS) {
        this.lastErrorLogAt = now;
        let errorMsg = err instanceof Error ? err.message : String(err);
        // Strip HTML (ngrok 404 pages) and truncate to 120 chars
        if (/<\/?[a-z][\s\S]*>/i.test(errorMsg)) {
          errorMsg = errorMsg.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        }
        if (errorMsg.length > 120) errorMsg = errorMsg.slice(0, 117) + '...';
        log.warn('send', `Loki unreachable (${this.stats.totalFailed} failed, suppressed 5m)`, { error: errorMsg });
      }
      
      // Re-add entries to batch for retry (up to batch size limit)
      this.batch = [...entries.slice(-this.batchSize), ...this.batch].slice(0, this.batchSize);
    }
  }
  
  /**
   * Emit Loki metrics to Prometheus (if available)
   */
  private emitMetric(status: 'success' | 'error' | 'dropped', count: number): void {
    // Lazy import to avoid circular dependencies
    void (async () => {
      try {
        const { recordLokiLogsSent, updateLokiQueueSize } = await import('../../services/prometheus-metrics.js');
        recordLokiLogsSent(status, count);
        updateLokiQueueSize(this.batch.length + this.priorityBatch.length);
      } catch {
        // Prometheus metrics not initialized yet, ignore
      }
    })();
  }

  /**
   * Compress payload using gzip (if available)
   */
  private async compressPayload(data: string): Promise<Buffer> {
    // Use zlib for Node.js environment
    const zlib = await import('node:zlib');
    return new Promise((resolve, reject) => {
      zlib.gzip(data, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  /**
   * Build Loki push payload from log entries
   * Phase 2: correlationId added to stream labels for Grafana filtering
   */
  private buildPayload(entries: LokiLogEntry[]): LokiPushPayload {
    const streams: Map<string, Array<[string, string]>> = new Map();

    for (const entry of entries) {
      // Phase 2: Include correlationId in stream labels for distributed tracing queries
      // correlationId enables Grafana queries like: {correlationId="abc-123"}
      const labelObj: Record<string, string> = {
        level: entry.level,
        service: entry.service,
        job: 'infinity-gauntlet',
        environment: process.env.NODE_ENV || 'production',
      };
      
      // Only add correlationId label if present (reduces label cardinality for logs without traces)
      if (entry.correlationId) {
        labelObj.correlationId = entry.correlationId;
      }
      
      const labels = JSON.stringify(labelObj);

      if (!streams.has(labels)) {
        streams.set(labels, []);
      }

      // Loki expects [timestamp_ns, log_line]
      const timestamp = new Date(entry.timestamp).getTime() * 1_000_000; // Convert to nanoseconds
      const logLine = JSON.stringify({
        message: entry.message,
        correlationId: entry.correlationId, // Keep in log line for JSON parsing
        data: entry.data,
      });

      streams.get(labels)!.push([timestamp.toString(), logLine]);
    }

    return {
      streams: Array.from(streams.entries()).map(([labels, values]) => ({
        stream: JSON.parse(labels),
        values,
      })),
    };
  }

  /**
   * Start the automatic flush timer
   */
  private startBatchTimer(): void {
    this.timer = setInterval(() => {
      this.flush().catch((err) => {
        log.error('timerFlush', 'Timer flush error', { error: err.message });
      });
    }, this.flushInterval);
  }

  /**
   * Get transport statistics
   */
  getStats(): typeof this.stats & { queueDepth: number; compressionRatio: number } {
    const compressionRatio = this.stats.bytesUncompressed > 0
      ? this.stats.bytesCompressed / this.stats.bytesUncompressed
      : 1;

    return {
      ...this.stats,
      queueDepth: this.batch.length + this.priorityBatch.length,
      compressionRatio,
    };
  }

  /**
   * Shutdown the transport
   */
  async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Log final sampling stats
    const samplingStats = getSamplingStats();
    if (samplingStats.totalEvents > 0) {
      const reduction = ((samplingStats.sampledOut / samplingStats.totalEvents) * 100).toFixed(1);
      log.info('shutdown', 'Final sampling stats', { sampledIn: samplingStats.sampledIn, sampledOut: samplingStats.sampledOut, reduction: `${reduction}%` });
    }

    // Log transport stats
    const stats = this.getStats();
    log.info('shutdown', 'Transport stats', { pushed: stats.totalPushed, failed: stats.totalFailed, batches: stats.batchesSent, compressionRatio: `${(stats.compressionRatio * 100).toFixed(0)}%` });

    await this.flush();
    log.info('shutdown', 'Transport shutdown complete');
  }
}

// Singleton instance
export const lokiTransport = new LokiTransport();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await lokiTransport.shutdown();
});

process.on('SIGINT', async () => {
  await lokiTransport.shutdown();
});
