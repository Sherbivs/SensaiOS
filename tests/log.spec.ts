import { describe, it, expect } from "vitest";
import { log } from "../src/shared/log.js";

describe("log._format", () => {
  it("formats info with message and env", () => {
    const rec = log._format("info", "hello", undefined, { foo: 1 });
    expect(rec.level).toBe("info");
    expect(rec.msg).toBe("hello");
    expect(rec.env === "development" || rec.env === "test" || rec.env === "production").toBe(true);
    expect((rec as any).foo).toBe(1);
  });

  it("formats error with err object", () => {
    const err = new Error("boom");
    const rec = log._format("error", "oops", err);
    expect(rec.level).toBe("error");
    expect(rec.msg).toBe("oops");
    expect((rec as any).err).toBeDefined();
    expect((rec as any).err.message).toBe("boom");
  });
});
