import { Prisma, type PrismaClient, type BusPriority, type BusKind, type BusMessage } from "@prisma/client";

import { prisma } from "../shared/prisma.js";

type BusClient = Pick<PrismaClient, "busMessage" | "busIdemToken" | "$queryRaw">;

function getClient(client?: BusClient): BusClient {
  return client ?? prisma;
}

export type PublishOpts = {
  priority?: BusPriority;
  delayMs?: number;
  idempotencyKey?: string;
  shardKey?: string;
  kind?: BusKind;
};

export async function publish(
  topic: string,
  payload: Prisma.InputJsonValue,
  opts: PublishOpts = {},
  client?: BusClient,
): Promise<BusMessage> {
  const executor = getClient(client);
  const availableAt = new Date(Date.now() + (opts.delayMs ?? 0));
  const idempotencyKey = opts.idempotencyKey ?? `${topic}:${JSON.stringify(payload)}`;
  return executor.busMessage.upsert({
    where: { topic_idempotencyKey: { topic, idempotencyKey } },
    update: {},
    create: {
      topic,
      payload,
      priority: opts.priority ?? "normal",
      availableAt,
      idempotencyKey,
      shardKey: opts.shardKey,
      kind: opts.kind ?? "event",
    },
  });
}

type ClaimOptions = {
  topics?: string[];
};

export async function claimBatch(
  limit = 64,
  options: ClaimOptions = {},
  client?: BusClient,
): Promise<Array<{ id: string }>> {
  const executor = getClient(client);
  const topics = options.topics?.filter(Boolean) ?? [];
  const topicCondition = topics.length ? Prisma.sql`AND topic IN (${Prisma.join(topics)})` : Prisma.sql``;
  return executor.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH cte AS (
      SELECT id
      FROM "BusMessage"
      WHERE status = 'pending'
        AND "availableAt" <= now()
        ${topicCondition}
      ORDER BY CASE priority
                 WHEN 'high' THEN 0
                 WHEN 'normal' THEN 1
                 ELSE 2
               END, "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE "BusMessage" AS b
      SET status = 'processing', attempts = attempts + 1, "updatedAt" = now()
    FROM cte
    WHERE b.id = cte.id
    RETURNING b.id
  `);
}

export async function loadMessage(id: string, client?: BusClient): Promise<BusMessage> {
  const executor = getClient(client);
  return executor.busMessage.findUniqueOrThrow({ where: { id } });
}

export async function finish(id: string, client?: BusClient): Promise<void> {
  const executor = getClient(client);
  await executor.busMessage.update({
    where: { id },
    data: { status: "done", processedAt: new Date(), error: null },
  });
}

export async function fail(
  id: string,
  error: unknown,
  options: { backoffMs?: number; maxAttempts?: number } = {},
  client?: BusClient,
): Promise<void> {
  const executor = getClient(client);
  const backoffMs = Math.max(0, options.backoffMs ?? 5_000);
  const maxAttempts = options.maxAttempts ?? 20;
  const message = await executor.busMessage.findUniqueOrThrow({ where: { id } });
  const willRetry = message.attempts < maxAttempts;
  await executor.busMessage.update({
    where: { id },
    data: {
      status: willRetry ? "pending" : "error",
      error: String(error).slice(0, 512),
      availableAt: new Date(Date.now() + backoffMs),
    },
  });
}

export async function seenOnce(token: string, client?: BusClient): Promise<boolean> {
  const executor = getClient(client);
  try {
    await executor.busIdemToken.create({ data: { key: token } });
    return false;
  } catch {
    return true;
  }
}
