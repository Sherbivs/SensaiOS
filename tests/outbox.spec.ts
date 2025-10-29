import { describe, it, expect, vi } from "vitest";
import {
  enqueue,
  claimPendingBatch,
  markProcessed,
  markError,
} from "../src/shared/outbox.js";

type MockClient = {
  busMessage: {
    upsert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  $queryRaw: ReturnType<typeof vi.fn>;
};

function createMockClient(): MockClient {
  return {
    busMessage: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
    $queryRaw: vi.fn(),
  };
}

describe("outbox", () => {
  it("enqueues messages as pending", async () => {
    const client = createMockClient();
    const payload = { hello: "world" } as const;
    client.busMessage.upsert.mockResolvedValue({
      id: "123",
      topic: "backup",
      payload,
      status: "pending",
      idempotencyKey: "backup:{\"hello\":\"world\"}",
      createdAt: new Date(),
      processedAt: null,
      error: null,
    });

    const result = await enqueue("backup", payload, client as any);
    expect(client.busMessage.upsert).toHaveBeenCalledWith({
      where: {
        topic_idempotencyKey: {
          topic: "backup",
          idempotencyKey: "backup:{\"hello\":\"world\"}",
        },
      },
      update: {},
      create: {
        topic: "backup",
        payload,
        status: "pending",
        idempotencyKey: "backup:{\"hello\":\"world\"}",
        priority: "normal",
        kind: "event",
      },
    });
    expect(result.status).toBe("pending");
  });

  it("claims pending messages with skip locked semantics", async () => {
    const client = createMockClient();
    const first = { id: "1", topic: "backup", payload: {}, createdAt: new Date("2025-01-01T00:00:00Z") } as any;
    const second = { id: "2", topic: "backup", payload: {}, createdAt: new Date("2025-01-02T00:00:00Z") } as any;
    client.$queryRaw.mockResolvedValue([first, second]);

    const results = await claimPendingBatch(25, client as any);
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    expect(results).toEqual([first, second]);
  });

  it("marks messages processed and error", async () => {
    const client = createMockClient();
    const now = new Date();
    client.busMessage.update.mockResolvedValue({
      id: "1",
      topic: "backup",
      payload: {},
      status: "done",
      createdAt: now,
      processedAt: now,
      error: null,
    });

    await markProcessed("1", client as any);
    expect(client.busMessage.update).toHaveBeenCalledWith({
      where: { id: "1" },
      data: { status: "done", processedAt: expect.any(Date), error: null },
    });

    client.busMessage.update.mockResolvedValue({
      id: "2",
      topic: "backup",
      payload: {},
      status: "error",
      createdAt: now,
      processedAt: now,
      error: "boom",
    });

    await markError("2", new Error("boom"), client as any);
    expect(client.busMessage.update).toHaveBeenCalledWith({
      where: { id: "2" },
      data: {
        status: "error",
        processedAt: expect.any(Date),
        error: "boom",
        availableAt: expect.any(Date),
      },
    });
  });
});
