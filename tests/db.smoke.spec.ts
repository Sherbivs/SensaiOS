import { describe, expect, it } from "vitest";

describe("db setup", () => {
  it("has DATABASE_URL in env (smoke)", () => {
    expect(process.env.DATABASE_URL).toBeDefined();
  });
});
