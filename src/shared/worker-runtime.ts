import process from "node:process";

import { log } from "./log.js";

const DEFAULT_SNAPSHOT_INTERVAL_MS = Math.max(30_000, Number(process.env.WORKER_TELEMETRY_INTERVAL_MS ?? 60_000));
const DEFAULT_THRESHOLD_COOLDOWN_MS = Math.max(30_000, Number(process.env.WORKER_THRESHOLD_COOLDOWN_MS ?? 300_000));

type Comparator = "gte" | "lte";

export type MetricThreshold = {
  warn?: number;
  alert?: number;
  comparator?: Comparator;
  cooldownMs?: number;
};

type GaugeState = {
  value: number;
  thresholds?: MetricThreshold;
  lastWarnTs?: number;
  lastAlertTs?: number;
};

type TaskState = {
  runs: number;
  successes: number;
  failures: number;
  consecutiveFailures: number;
  totalDurationMs: number;
  lastSuccessAt?: string;
  lastFailure?: { at: string; message: string };
};

export type WorkerMetricsSnapshot = {
  gauges: Record<string, { value: number; thresholds?: MetricThreshold; lastWarnAt?: string | null; lastAlertAt?: string | null }>;
  counters: Record<string, number>;
  tasks: Record<string, {
    runs: number;
    successes: number;
    failures: number;
    consecutiveFailures: number;
    avgDurationMs: number | null;
    lastSuccessAt?: string;
    lastFailure?: { at: string; message: string };
  }>;
  updatedAt: string;
};

export interface WorkerMetrics {
  setGauge(name: string, value: number, thresholds?: MetricThreshold): void;
  incrementCounter(name: string, delta?: number): void;
  recordSuccess(label: string, meta?: { durationMs?: number; [key: string]: unknown }): void;
  recordFailure(label: string, error: unknown, meta?: { durationMs?: number; [key: string]: unknown }): void;
  snapshot(): WorkerMetricsSnapshot;
  emitSnapshot(): void;
}

function isoNow(): string {
  return new Date().toISOString();
}

function toDuration(meta?: { durationMs?: number }): number {
  if (!meta || typeof meta.durationMs !== "number" || !Number.isFinite(meta.durationMs)) {
    return 0;
  }
  return Math.max(0, meta.durationMs);
}

class WorkerMetricsImpl implements WorkerMetrics {
  private readonly gauges = new Map<string, GaugeState>();
  private readonly counters = new Map<string, number>();
  private readonly tasks = new Map<string, TaskState>();

  constructor(private readonly workerName: string) {}

  setGauge(name: string, value: number, thresholds?: MetricThreshold): void {
    const state = this.gauges.get(name) ?? { value: 0 };
    state.value = value;
    if (thresholds) {
      state.thresholds = thresholds;
    }
    this.gauges.set(name, state);
    if (state.thresholds) {
      this.checkGaugeThreshold(name, state);
    }
  }

  incrementCounter(name: string, delta = 1): void {
    const current = this.counters.get(name) ?? 0;
    this.counters.set(name, current + delta);
  }

  recordSuccess(label: string, meta?: { durationMs?: number; [key: string]: unknown }): void {
    const state = this.ensureTaskState(label);
    state.runs += 1;
    state.successes += 1;
    state.consecutiveFailures = 0;
    state.lastSuccessAt = isoNow();
    const duration = toDuration(meta);
    if (duration > 0) {
      state.totalDurationMs += duration;
    }
  }

  recordFailure(label: string, error: unknown, meta?: { durationMs?: number; [key: string]: unknown }): void {
    const state = this.ensureTaskState(label);
    state.runs += 1;
    state.failures += 1;
    state.consecutiveFailures += 1;
    const duration = toDuration(meta);
    if (duration > 0) {
      state.totalDurationMs += duration;
    }
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
    state.lastFailure = { at: isoNow(), message };

    if (state.consecutiveFailures === 3) {
      log.warn("worker.alert.failure_warn", { worker: this.workerName, label, consecutiveFailures: state.consecutiveFailures, error: message });
    }
    if (state.consecutiveFailures >= 5) {
      log.error("worker.alert.failure_critical", error, { worker: this.workerName, label, consecutiveFailures: state.consecutiveFailures });
    }
  }

  snapshot(): WorkerMetricsSnapshot {
    const gauges: WorkerMetricsSnapshot["gauges"] = {};
    for (const [name, state] of this.gauges.entries()) {
      gauges[name] = {
        value: state.value,
        thresholds: state.thresholds,
        lastWarnAt: state.lastWarnTs ? new Date(state.lastWarnTs).toISOString() : null,
        lastAlertAt: state.lastAlertTs ? new Date(state.lastAlertTs).toISOString() : null,
      };
    }

    const counters: WorkerMetricsSnapshot["counters"] = {};
    for (const [name, value] of this.counters.entries()) {
      counters[name] = value;
    }

    const tasks: WorkerMetricsSnapshot["tasks"] = {};
    for (const [label, state] of this.tasks.entries()) {
      const avgDuration = state.runs > 0 && state.totalDurationMs > 0 ? Math.round(state.totalDurationMs / state.runs) : null;
      tasks[label] = {
        runs: state.runs,
        successes: state.successes,
        failures: state.failures,
        consecutiveFailures: state.consecutiveFailures,
        avgDurationMs: avgDuration,
        lastSuccessAt: state.lastSuccessAt,
        lastFailure: state.lastFailure,
      };
    }

    return {
      gauges,
      counters,
      tasks,
      updatedAt: isoNow(),
    };
  }

  emitSnapshot(): void {
    log.info("worker.metrics.snapshot", { worker: this.workerName, metrics: this.snapshot() });
  }

  private ensureTaskState(label: string): TaskState {
    const existing = this.tasks.get(label);
    if (existing) {
      return existing;
    }
    const created: TaskState = {
      runs: 0,
      successes: 0,
      failures: 0,
      consecutiveFailures: 0,
      totalDurationMs: 0,
    };
    this.tasks.set(label, created);
    return created;
  }

  private compare(value: number, threshold: number, comparator: Comparator): boolean {
    if (comparator === "lte") {
      return value <= threshold;
    }
    return value >= threshold;
  }

  private cooldownElapsed(lastTs: number | undefined, override?: number): boolean {
    if (!lastTs) {
      return true;
    }
    const cooldown = override ?? DEFAULT_THRESHOLD_COOLDOWN_MS;
    return Date.now() - lastTs >= cooldown;
  }

  private checkGaugeThreshold(name: string, state: GaugeState): void {
    if (!state.thresholds) {
      return;
    }
    const comparator: Comparator = state.thresholds.comparator ?? "gte";
    const cooldownMs = state.thresholds.cooldownMs ?? DEFAULT_THRESHOLD_COOLDOWN_MS;

    if (state.thresholds.warn !== undefined && this.compare(state.value, state.thresholds.warn, comparator)) {
      if (this.cooldownElapsed(state.lastWarnTs, cooldownMs)) {
        state.lastWarnTs = Date.now();
        log.warn("worker.alert.gauge_warn", {
          worker: this.workerName,
          gauge: name,
          value: state.value,
          threshold: state.thresholds.warn,
          comparator,
        });
      }
    }

    if (state.thresholds.alert !== undefined && this.compare(state.value, state.thresholds.alert, comparator)) {
      if (this.cooldownElapsed(state.lastAlertTs, cooldownMs)) {
        state.lastAlertTs = Date.now();
        log.error("worker.alert.gauge_alert", undefined, {
          worker: this.workerName,
          gauge: name,
          value: state.value,
          threshold: state.thresholds.alert,
          comparator,
        });
      }
    }
  }
}

export type WorkerShutdownHandler = () => Promise<void> | void;

export type RepeatOptions = {
  intervalMs: number;
  /** When true, run the task once immediately before scheduling. */
  runImmediately?: boolean;
  /** Optional jitter in milliseconds applied to each delay (uniform between 0 and jitterMs). */
  jitterMs?: number;
  /** Friendly label that appears in logs. */
  label?: string;
};

export type RepeatHandle = {
  stop(): void;
};

export type WorkerContext = {
  readonly name: string;
  readonly logger: typeof log;
  isShuttingDown(): boolean;
  onShutdown(handler: WorkerShutdownHandler): void;
  runRepeating(task: () => Promise<void>, options: RepeatOptions): RepeatHandle;
  /** Await shutdown completion (used in entrypoints that prefer explicit awaiting). */
  waitForShutdown(): Promise<void>;
  readonly metrics: WorkerMetrics;
};

function computeDelay(base: number, jitterMs?: number): number {
  if (!jitterMs || jitterMs <= 0) {
    return base;
  }
  const jitter = Math.random() * jitterMs;
  return Math.max(0, base + jitter);
}

export async function runWorker(name: string, start: (ctx: WorkerContext) => Promise<void> | void): Promise<void> {
  const shutdownHandlers = new Set<WorkerShutdownHandler>();
  let shuttingDown = false;
  let shutdownPromise: Promise<void> | null = null;
  let resolveShutdown: (() => void) | null = null;

  const waitForShutdownPromise = new Promise<void>((resolve) => {
    resolveShutdown = resolve;
  });

  const metrics = new WorkerMetricsImpl(name);

  const context: WorkerContext = {
    name,
    logger: log,
    isShuttingDown: () => shuttingDown,
    onShutdown(handler: WorkerShutdownHandler) {
      shutdownHandlers.add(handler);
    },
    runRepeating(task: () => Promise<void>, options: RepeatOptions): RepeatHandle {
      const intervalMs = Math.max(0, options.intervalMs);
      const runImmediately = options.runImmediately ?? true;
      const jitterMs = Math.max(0, options.jitterMs ?? 0);
      const label = options.label ?? task.name ?? "task";

      let active = true;
      let timer: NodeJS.Timeout | null = null;
      let running = false;

      const scheduleNext = async (delay: number) => {
        if (!active || shuttingDown) {
          return;
        }
        timer = setTimeout(() => {
          timer = null;
          void invoke();
        }, delay);
        timer.unref?.();
      };

      const invoke = async () => {
        if (!active || shuttingDown) {
          return;
        }
        if (running) {
          log.warn("worker.repeat.skipped_overlap", { worker: name, label });
          return;
        }
        running = true;
        const startedAt = Date.now();
        try {
          await task();
          metrics.recordSuccess(label, { durationMs: Date.now() - startedAt });
        } catch (error) {
          log.error("worker.repeat.error", error, { worker: name, label });
          metrics.recordFailure(label, error, { durationMs: Date.now() - startedAt });
        } finally {
          running = false;
        }
        if (!active || shuttingDown) {
          return;
        }
        const delay = computeDelay(intervalMs, jitterMs);
        await scheduleNext(delay);
      };

      if (runImmediately) {
        void invoke();
      } else {
        void scheduleNext(computeDelay(intervalMs, jitterMs));
      }

      return {
        stop() {
          active = false;
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
        },
      };
    },
    metrics,
    waitForShutdown(): Promise<void> {
      return waitForShutdownPromise;
    },
  };

  const telemetryInterval = setInterval(() => {
    metrics.emitSnapshot();
  }, DEFAULT_SNAPSHOT_INTERVAL_MS);
  telemetryInterval.unref?.();

  context.onShutdown(() => {
    clearInterval(telemetryInterval);
  });

  const handleSignal = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    log.warn("worker.signal.stop", { worker: name, signal });
    if (!shutdownPromise) {
      shutdownPromise = (async () => {
        for (const handler of shutdownHandlers) {
          try {
            await handler();
          } catch (error) {
            log.error("worker.shutdown.handler_error", error, { worker: name });
          }
        }
      })().finally(() => {
        resolveShutdown?.();
      });
    }
    await shutdownPromise;
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);

  log.info("worker.start", { worker: name, pid: process.pid });
  try {
    await start(context);
  } catch (error) {
    log.error("worker.startup.error", error, { worker: name });
    process.exitCode = 1;
    await handleSignal("SIGTERM");
    return;
  }

  await waitForShutdownPromise;
  metrics.emitSnapshot();
  log.info("worker.stop", { worker: name });
}
