import { describe, expect, it } from "vitest";
import { boot } from "../src/index";

describe("tooling", () => {
  it("boots without throwing", () => {
    expect(() => boot()).not.toThrow();
  });
});
