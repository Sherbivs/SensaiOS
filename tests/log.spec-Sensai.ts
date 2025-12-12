import { describe, it, expect } from "vitest";

import { evaluateDailyQuestStreak, projectDailyQuestCompletion } from "../src/models/index.ts";
import { log } from "../src/shared/log.js";

describe("log._format", () => {
  it("formats info with message and metadata", () => {
    const rec = log._format("info", "hello", undefined, { foo: 1 });
    expect(rec.level).toBe("info");
    expect(rec.msg).toBe("hello");
    expect(rec.t).toBeDefined(); // timestamp
    expect((rec as any).foo).toBe(1);
  });

  it("formats error with err object", () => {
    const err = new Error("boom");
    const rec = log._format("error", "oops", err);
    expect(rec.level).toBe("error");
    expect(rec.msg).toBe("oops");
    expect((rec as any).err).toBeDefined();
    // Error is stringified, so includes "Error: " prefix
    expect((rec as any).err.message).toBe("Error: boom");
  });
});

describe("daily quest streak projection", () => {
  it("increments streak when the quest is completed on consecutive days", () => {
    const yesterday = new Date("2025-10-25T07:00:00Z");
    const today = new Date("2025-10-26T09:15:00Z");
    const projection = projectDailyQuestCompletion({
      previousStreak: 2,
      lastCompleted: yesterday,
      completedAt: today,
    });

    expect(projection.newStreak).toBe(3);
    expect(projection.reset).toBe(false);
    expect(projection.repeated).toBe(false);

    const status = evaluateDailyQuestStreak({
      streak: projection.newStreak,
      lastCompleted: today,
      now: today,
    });

    expect(status.status).toBe("locked");
    expect(status.message).toContain("3-day streak");
  });

  it("resets streak after skipping more than a day", () => {
    const lastCompletion = new Date("2025-10-20T10:00:00Z");
    const completion = new Date("2025-10-23T08:00:00Z");
    const projection = projectDailyQuestCompletion({
      previousStreak: 4,
      lastCompleted: lastCompletion,
      completedAt: completion,
    });

    expect(projection.newStreak).toBe(1);
    expect(projection.reset).toBe(true);

    const resetStatus = evaluateDailyQuestStreak({
      streak: 0,
      lastCompleted: lastCompletion,
      lastReset: completion,
      now: new Date("2025-10-24T09:00:00Z"),
    });

    expect(resetStatus.status).toBe("reset");
    expect(resetStatus.message).toContain("streak reset");
  });
});
