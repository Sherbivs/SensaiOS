/**
 * Loki Transport - Stream logs to Grafana Loki
 * @module shared/logging/loki-transport
 * 
 * Sends structured logs to a Loki instance for aggregation and querying.
 * Supports batching, retry logic, and graceful degradation.
 */

/* eslint-disable no-console */

interface LokiLogEntry {
  level: string;
  message: string;
  timestamp: string;
  service: string;
  correlationId?: string;
  data?: Record<string, unknown>;
}

interface LokiStream {
  stream: Record<string, string>;
  values: Array<[string, string]>;
}

interface LokiPushPayload {
  streams: LokiStream[];
}

class LokiTransport {
  private endpoint: string;
  private batch: LokiLogEntry[] = [];
  private batchSize: number = 100;
  private flushInterval: number = 5000; // 5 seconds
  private timer: NodeJS.Timeout | null = null;
  private enabled: boolean;

  constructor(endpoint?: string) {
    this.endpoint = endpoint || process.env.LOKI_ENDPOINT || '';
    this.enabled = Boolean(this.endpoint);

    if (this.enabled) {
      this.startBatchTimer();
      console.log(`[Loki] Transport initialized: ${this.endpoint}`);
    }
  }

  /**
   * Push a log entry to the batch
   */
  push(entry: LokiLogEntry): void {
    if (!this.enabled) return;

    this.batch.push(entry);

    // Flush if batch is full
    if (this.batch.length >= this.batchSize) {
      this.flush().catch((err) => {
        console.error('[Loki] Flush error:', err.message);
      });
    }
  }

  /**
   * Flush the batch to Loki
   */
  async flush(): Promise<void> {
    if (this.batch.length === 0) return;

    const entries = [...this.batch];
    this.batch = [];

    try {
      const payload = this.buildPayload(entries);
      
      const response = await fetch(`${this.endpoint}/loki/api/v1/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000), // 5s timeout
      });

      if (!response.ok) {
        throw new Error(`Loki push failed: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      // Graceful degradation - log to console but don't crash
      console.error('[Loki] Failed to send logs:', err instanceof Error ? err.message : String(err));
      
      // Re-add entries to batch for retry (up to batch size limit)
      this.batch = [...entries.slice(-this.batchSize), ...this.batch].slice(0, this.batchSize);
    }
  }

  /**
   * Build Loki push payload from log entries
   */
  private buildPayload(entries: LokiLogEntry[]): LokiPushPayload {
    const streams: Map<string, Array<[string, string]>> = new Map();

    for (const entry of entries) {
      const labels = JSON.stringify({
        level: entry.level,
        service: entry.service,
        job: 'infinity-gauntlet',
        environment: process.env.NODE_ENV || 'production',
      });

      if (!streams.has(labels)) {
        streams.set(labels, []);
      }

      // Loki expects [timestamp_ns, log_line]
      const timestamp = new Date(entry.timestamp).getTime() * 1_000_000; // Convert to nanoseconds
      const logLine = JSON.stringify({
        message: entry.message,
        correlationId: entry.correlationId,
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
        console.error('[Loki] Timer flush error:', err.message);
      });
    }, this.flushInterval);
  }

  /**
   * Shutdown the transport
   */
  async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    await this.flush();
    console.log('[Loki] Transport shutdown complete');
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
