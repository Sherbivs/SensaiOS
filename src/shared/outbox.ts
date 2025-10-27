import type { Prisma, PrismaClient, OutboxMessage } from "@prisma/client";
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

export async function getPending(
  limit = 100,
  executor?: PrismaExecutor,
): Promise<OutboxMessage[]> {
  const client = getClient(executor);
  return client.outboxMessage.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

export async function markDone(
  id: string,
  executor?: PrismaExecutor,
): Promise<OutboxMessage> {
  const client = getClient(executor);
  return client.outboxMessage.update({
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
  return client.outboxMessage.update({
    where: { id },
    data: { status: "error", processedAt: new Date(), error: message.slice(0, 512) },
  });
}
