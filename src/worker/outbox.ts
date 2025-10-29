import { setTimeout as sleep } from "node:timers/promises";
import { loadConfig } from "../shared/config.js";
import { log } from "../shared/log.js";
import { cache } from "../shared/cache/memory.js";
import { ensurePrisma, prisma } from "../shared/prisma.js";
import {
  enqueue,
  claimPendingBatch,
  markProcessed,
  markError,
} from "../shared/outbox.js";
import { runWorker, type WorkerContext } from "../shared/worker-runtime.js";
import { storeBackup, getBackupProvider } from "../shared/storage/backup-sink.js";

const MIN_DELAY_MS = Math.max(50, Number(process.env.OUTBOX_MIN_DELAY_MS ?? 250));
const MAX_DELAY_MS = Math.max(MIN_DELAY_MS, Number(process.env.OUTBOX_MAX_DELAY_MS ?? 2000));
const HEALTH_EVERY = Math.max(1, Number(process.env.OUTBOX_HEALTH_INTERVAL ?? 20));
const BATCH_SIZE = Math.max(1, Number(process.env.OUTBOX_BATCH_SIZE ?? 100));
const QUEUE_WARN_THRESHOLD = Math.max(25, Number(process.env.OUTBOX_QUEUE_WARN_THRESHOLD ?? 50));
const QUEUE_ALERT_THRESHOLD = Math.max(QUEUE_WARN_THRESHOLD, Number(process.env.OUTBOX_QUEUE_ALERT_THRESHOLD ?? 200));

const config = loadConfig();

function jitterDelay(): number {
  if (MAX_DELAY_MS <= MIN_DELAY_MS) {
    return MIN_DELAY_MS;
  }
  return Math.floor(MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}

type PendingOutboxMessage = Awaited<ReturnType<typeof claimPendingBatch>>[number];

async function processMessage(ctx: WorkerContext, message: PendingOutboxMessage): Promise<void> {
  const startedAt = Date.now();
  try {
    log.info("worker.outbox.dispatch", { topic: message.topic, id: message.id });

    const processedAt = new Date().toISOString();
    const createdAt = message.createdAt instanceof Date ? message.createdAt : new Date(message.createdAt);
    const result = await storeBackup({
      id: message.id,
      topic: message.topic,
      payload: message.payload,
      createdAt,
      processedAt,
    });

    cache.set(`outbox:last:${message.topic}`, { id: message.id, processedAt, provider: result.provider });
    cache.set("outbox:last-processed", processedAt);
    log.info("worker.outbox.sink", {
      topic: message.topic,
      id: message.id,
      provider: result.provider,
      location: result.location,
    });

    await markProcessed(message.id);
    ctx.metrics.incrementCounter("messages.processed", 1);
    ctx.metrics.recordSuccess("dispatch", { durationMs: Date.now() - startedAt });
  } catch (error) {
    log.error("worker.outbox.error", error, { id: message.id, topic: message.topic });
    await markError(message.id, error);
    ctx.metrics.incrementCounter("messages.failed", 1);
    ctx.metrics.recordFailure("dispatch", error, { durationMs: Date.now() - startedAt });
  }
}

async function processBatch(ctx: WorkerContext): Promise<number> {
  const startedAt = Date.now();
  const messages = await claimPendingBatch(BATCH_SIZE);
  if (messages.length === 0) {
    ctx.metrics.recordSuccess("batch", { durationMs: Date.now() - startedAt });
    return 0;
  }

  for (const message of messages) {
    await processMessage(ctx, message);
  }

  ctx.metrics.recordSuccess("batch", { durationMs: Date.now() - startedAt });
  return messages.length;
}

async function logHealth(ctx: WorkerContext): Promise<void> {
  try {
  const pending = await prisma.outboxMessage.count({ where: { status: "pending" } });
    cache.set("outbox:last-health-check", new Date().toISOString());
    ctx.metrics.setGauge("queue.depth", pending, {
      warn: QUEUE_WARN_THRESHOLD,
      alert: QUEUE_ALERT_THRESHOLD,
    });
    ctx.metrics.setGauge("cache.size", cache.size);

    const host = new URL(config.databaseUrl).host;
    log.info("worker.outbox.health", {
      service: config.serviceName,
      env: config.nodeEnv,
      pending,
      cacheSize: cache.size,
      dbHost: host,
      backupProvider: getBackupProvider(),
    });
  } catch (error) {
    log.error("worker.outbox.health_error", error);
  }
}

await runWorker("outbox-drain", async (ctx) => {
  await ensurePrisma();
  log.info("worker.outbox.start", {
    service: config.serviceName,
    env: config.nodeEnv,
    batchSize: BATCH_SIZE,
    minDelayMs: MIN_DELAY_MS,
    maxDelayMs: MAX_DELAY_MS,
  });

  let iteration = 0;

  try {
    while (!ctx.isShuttingDown()) {
      iteration += 1;
      const processed = await processBatch(ctx);

      if (iteration % HEALTH_EVERY === 0) {
        await logHealth(ctx);
      }

      if (ctx.isShuttingDown()) {
        break;
      }

      if (processed === 0) {
        await sleep(jitterDelay());
      }
    }
  } catch (error) {
    log.error("worker.outbox.loop_crash", error);
    ctx.metrics.recordFailure("loop", error);
    try {
      await enqueue("worker.crash", { worker: "outbox", message: String(error) });
    } catch (enqueueError) {
      log.error("worker.outbox.crash_enqueue_failed", enqueueError);
    }
    process.exitCode = 1;
  }
});
