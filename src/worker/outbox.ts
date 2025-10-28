import { setTimeout as sleep } from "node:timers/promises";
import { loadConfig } from "../shared/config.js";
import { log } from "../shared/log.js";
import { cache } from "../shared/cache/memory.js";
import { ensurePrisma, prisma } from "../shared/prisma.js";
import { enqueue, getPending, markDone, markError, type OutboxMessage } from "../shared/outbox.js";
import { runWorker } from "../shared/worker-runtime.js";

const MIN_DELAY_MS = Math.max(50, Number(process.env.OUTBOX_MIN_DELAY_MS ?? 250));
const MAX_DELAY_MS = Math.max(MIN_DELAY_MS, Number(process.env.OUTBOX_MAX_DELAY_MS ?? 2000));
const HEALTH_EVERY = Math.max(1, Number(process.env.OUTBOX_HEALTH_INTERVAL ?? 20));
const BATCH_SIZE = Math.max(1, Number(process.env.OUTBOX_BATCH_SIZE ?? 100));

const config = loadConfig();

function jitterDelay(): number {
  if (MAX_DELAY_MS <= MIN_DELAY_MS) {
    return MIN_DELAY_MS;
  }
  return Math.floor(MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}

async function processMessage(message: OutboxMessage): Promise<void> {
  try {
    log.info("worker.outbox.dispatch", { topic: message.topic, id: message.id });

    // Placeholder durable sink; future task swaps with S3/R2 uploader.
    const processedAt = new Date().toISOString();
    cache.set(`outbox:last:${message.topic}`, { id: message.id, processedAt });
    cache.set("outbox:last-processed", processedAt);
    log.info("worker.outbox.sink", { topic: message.topic, id: message.id });

    await markDone(message.id);
  } catch (error) {
    log.error("worker.outbox.error", error, { id: message.id, topic: message.topic });
    await markError(message.id, error);
  }
}

async function processBatch(): Promise<number> {
  const messages = await getPending(BATCH_SIZE);
  if (messages.length === 0) {
    return 0;
  }

  for (const message of messages) {
    await processMessage(message);
  }

  return messages.length;
}

async function logHealth(): Promise<void> {
  try {
    const pending = await prisma.outboxMessage.count({ where: { status: "pending" } });
    cache.set("outbox:last-health-check", new Date().toISOString());

    const host = new URL(config.databaseUrl).host;
    log.info("worker.outbox.health", {
      service: config.serviceName,
      env: config.nodeEnv,
      pending,
      cacheSize: cache.size,
      dbHost: host,
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
      const processed = await processBatch();

      if (iteration % HEALTH_EVERY === 0) {
        await logHealth();
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
    try {
      await enqueue("worker.crash", { worker: "outbox", message: String(error) });
    } catch (enqueueError) {
      log.error("worker.outbox.crash_enqueue_failed", enqueueError);
    }
    process.exitCode = 1;
  }
});
