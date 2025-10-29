import { Prisma, type PrismaClient, type BusMessage } from "@prisma/client";
import { prisma } from "./prisma.js";

export type OutboxMessage = BusMessage;

type PrismaExecutor = Pick<PrismaClient, "busMessage" | "$queryRaw">;

function getClient(executor?: PrismaExecutor): PrismaExecutor {
  return executor ?? prisma;
}

export async function enqueue(
  topic: string,
  payload: Prisma.InputJsonValue,
  executor?: PrismaExecutor,
): Promise<OutboxMessage> {
  const client = getClient(executor);
  const idempotencyKey = `${topic}:${JSON.stringify(payload)}`;
  return client.busMessage.upsert({
    where: { topic_idempotencyKey: { topic, idempotencyKey } },
    update: {},
    create: {
      topic,
      payload,
      status: "pending",
      idempotencyKey,
      priority: "normal",
      kind: "event",
    },
  });
}

type ClaimedOutboxMessage = Pick<OutboxMessage, "id" | "topic" | "payload" | "createdAt" | "idempotencyKey" | "shardKey">;

export async function claimPendingBatch(
  limit = 100,
  executor?: PrismaClient,
): Promise<ClaimedOutboxMessage[]> {
  const client = executor ?? prisma;
  const claimed = await client.$queryRaw<ClaimedOutboxMessage[]>(Prisma.sql`
    WITH picked AS (
      SELECT id
      FROM "BusMessage"
      WHERE status = 'pending'
        AND "availableAt" <= now()
      ORDER BY CASE priority
                 WHEN 'high' THEN 0
                 WHEN 'normal' THEN 1
                 ELSE 2
               END, "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE "BusMessage" AS b
    SET status = 'processing', attempts = attempts + 1, "updatedAt" = NOW()
    FROM picked
    WHERE b.id = picked.id
    RETURNING b.id, b.topic, b.payload, b."createdAt", b."idempotencyKey", b."shardKey";
  `);
  return claimed;
}

export async function markProcessed(
  id: string,
  executor?: PrismaExecutor,
): Promise<OutboxMessage> {
  const client = getClient(executor);
  return client.busMessage.update({
    where: { id },
    data: { status: "done", processedAt: new Date(), error: null },
  });
}

export async function markError(
  id: string,
  error: unknown,
  executor?: PrismaExecutor,
): Promise<OutboxMessage> {
  const client = getClient(executor);
  const message = error instanceof Error ? error.message : String(error);
  return client.busMessage.update({
    where: { id },
    data: { status: "error", processedAt: new Date(), error: message.slice(0, 512), availableAt: new Date() },
  });
}
