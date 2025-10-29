import { Prisma, type PrismaClient, type OutboxMessage } from "@prisma/client";
import { prisma } from "./prisma.js";

export type { OutboxMessage };

type PrismaExecutor = Pick<PrismaClient, "outboxMessage">;

function getClient(executor?: PrismaExecutor): PrismaExecutor {
  return executor ?? prisma;
}

export async function enqueue(
  topic: string,
  payload: Prisma.InputJsonValue,
  executor?: PrismaExecutor,
): Promise<OutboxMessage> {
  const client = getClient(executor);
  return client.outboxMessage.create({
    data: { topic, payload, status: "pending" },
  });
}

type ClaimedOutboxMessage = Pick<OutboxMessage, "id" | "topic" | "payload" | "createdAt">;

export async function claimPendingBatch(
  limit = 100,
  executor?: PrismaClient,
): Promise<ClaimedOutboxMessage[]> {
  const client = executor ?? prisma;
  const claimed = await client.$queryRaw<ClaimedOutboxMessage[]>(Prisma.sql`
    WITH picked AS (
      SELECT id
      FROM "OutboxMessage"
      WHERE status = 'pending'
      ORDER BY "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE "OutboxMessage" AS o
    SET status = 'processing', "updatedAt" = NOW()
    FROM picked
    WHERE o.id = picked.id
    RETURNING o.id, o.topic, o.payload, o."createdAt";
  `);
  return claimed;
}

export async function markProcessed(
  id: string,
  executor?: PrismaExecutor,
): Promise<OutboxMessage> {
  const client = getClient(executor);
  return client.outboxMessage.update({
    where: { id },
    data: { status: "processed", processedAt: new Date(), error: null },
  });
}

export async function markError(
  id: string,
  error: unknown,
  executor?: PrismaExecutor,
): Promise<OutboxMessage> {
  const client = getClient(executor);
  const message = error instanceof Error ? error.message : String(error);
  return client.outboxMessage.update({
    where: { id },
    data: { status: "error", processedAt: new Date(), error: message.slice(0, 512) },
  });
}
