import { setTimeout as sleep } from "node:timers/promises";
import { loadConfig } from "../shared/config.js";
import { log } from "../shared/log.js";
import { cache } from "../shared/cache/memory.js";
import { ensurePrisma, prisma } from "../shared/prisma.js";
import {
  getPending,
  markDone,
  markError,
  enqueue,
  type OutboxMessage,
} from "../shared/outbox.js";

const config = loadConfig();

let shuttingDown = false;
let iteration = 0;

const MIN_DELAY_MS = 250;
const MAX_DELAY_MS = 2000;
const HEALTH_EVERY = 20;

function jitterDelay(): number {
  return Math.floor(MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}

async function processMessage(message: OutboxMessage): Promise<void> {
  try {
    log.info("backup.outbox.dispatch", {
      topic: message.topic,
      id: message.id,
    });

    // Placeholder durable sink; swap with S3/R2 uploader in META.RUNTIME.BACKUP_SINK
    const processedAt = new Date().toISOString();
    cache.set(`outbox:last:${message.topic}`, { id: message.id, processedAt });
    cache.set("outbox:last-processed", processedAt);
    log.info("backup.outbox.sink", { topic: message.topic, id: message.id });

    await markDone(message.id);
  } catch (error) {
    log.error("backup.outbox.error", error);
    await markError(message.id, error);
  }
}

async function processBatch(): Promise<number> {
  const messages = await getPending(100);
  if (messages.length === 0) {
    return 0;
  }

  for (const message of messages) {
    if (shuttingDown) break;
    await processMessage(message);
  }

  return messages.length;
}

async function logHealth(): Promise<void> {
  try {
    const pending = await prisma.outboxMessage.count({ where: { status: "pending" } });
    cache.set("outbox:last-health-check", new Date().toISOString());

    const host = new URL(config.databaseUrl).host;
    log.info("backup.health", {
      service: config.serviceName,
      env: config.nodeEnv,
      pending,
      cacheSize: cache.size,
      dbHost: host,
    });
  } catch (error) {
    log.error("backup.health.error", error);
  }
}

async function main(): Promise<void> {
  await ensurePrisma();
  log.info("backup.worker.start", {
    service: config.serviceName,
    env: config.nodeEnv,
  });

  while (!shuttingDown) {
    iteration += 1;
    const processed = await processBatch();
    if (iteration % HEALTH_EVERY === 0) {
      await logHealth();
    }
    if (processed === 0) {
      await sleep(jitterDelay());
    }
  }

  log.info("backup.worker.stop", { service: config.serviceName });
}

function setupSignalHandlers(): void {
  const handle = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.warn("backup.worker.shutdown", { signal });
  };

  process.on("SIGTERM", handle);
  process.on("SIGINT", handle);
}

setupSignalHandlers();

main().catch(async (error) => {
  log.error("backup.worker.crash", error);
  try {
    await enqueue("worker.crash", { message: String(error) });
  } catch (enqueueError) {
    log.error("backup.worker.crash_outbox_failed", enqueueError);
  } finally {
    process.exitCode = 1;
  }
});
