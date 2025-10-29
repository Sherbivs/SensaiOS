import { claimBatch, loadMessage, finish, fail, seenOnce } from "./bus.js";

type HandlerMessage = {
  id: string;
  topic: string;
  payload: unknown;
  idempotencyKey: string;
  shardKey: string | null;
};

type Handler = (msg: HandlerMessage) => Promise<void>;

type Registration = {
  topic: string;
  handler: Handler;
  category: string;
  concurrency: number;
};

const REGISTRY: Registration[] = [];

export function on(topic: string, category: string, concurrency: number, handler: Handler): void {
  if (concurrency <= 0 || !Number.isFinite(concurrency)) {
    throw new Error(`Invalid concurrency for topic ${topic}: ${concurrency}`);
  }
  REGISTRY.push({ topic, category, concurrency, handler });
}

export async function run(): Promise<void> {
  await Promise.all(
    REGISTRY.map(async (reg) => {
      try {
        await loop(reg);
      } catch (error) {
        console.error("worker.loop.crash", error);
      }
    }),
  );
}

async function loop(reg: Registration): Promise<void> {
  const inflight = new Set<Promise<void>>();
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (inflight.size >= reg.concurrency) {
      await Promise.race(inflight);
      continue;
    }

    const claimed = await claimBatch(64, { topics: [reg.topic] });
    if (claimed.length === 0) {
      await sleep(250);
      continue;
    }

    for (const row of claimed) {
      const task = (async () => {
        try {
          const msg = await loadMessage(row.id);
          if (msg.topic !== reg.topic) {
            await fail(msg.id, new Error(`Unexpected topic for ${reg.topic}`), { backoffMs: 1_000, maxAttempts: 0 });
            return;
          }

          const token = `${reg.topic}:${msg.idempotencyKey}:${reg.category}`;
          if (await seenOnce(token)) {
            await finish(msg.id);
            return;
          }

          await reg.handler({
            id: msg.id,
            topic: msg.topic,
            payload: msg.payload,
            idempotencyKey: msg.idempotencyKey,
            shardKey: msg.shardKey ?? null,
          });
          await finish(msg.id);
        } catch (error) {
          try {
            await fail(row.id, error);
          } catch (failError) {
            console.error("worker.loop.fail_error", failError);
          }
        }
      })();

      inflight.add(
        task.finally(() => {
          inflight.delete(task);
        }),
      );

      if (inflight.size >= reg.concurrency) {
        break;
      }
    }
  }
}
