import { setTimeout as sleep } from "node:timers/promises";
import process from "node:process";
import { log } from "./log.js";

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
        try {
          await task();
        } catch (error) {
          log.error("worker.repeat.error", error, { worker: name, label });
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
    waitForShutdown(): Promise<void> {
      return waitForShutdownPromise;
    },
  };

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
  log.info("worker.stop", { worker: name });
}

export async function untilShutdown(ctx: WorkerContext, pollIntervalMs = 1_000): Promise<void> {
  while (!ctx.isShuttingDown()) {
    await sleep(pollIntervalMs);
  }
}
