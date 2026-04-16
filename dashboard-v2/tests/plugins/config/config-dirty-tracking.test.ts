import { describe, test, expect, beforeEach } from "bun:test";

/**
 * Tests for config dirty tracking logic (extracted as pure functions).
 *
 * The ConfigPage uses:
 *   isDirty = JSON.stringify(config) !== JSON.stringify(originalRef.current)
 *
 * We test this comparison logic directly.
 */

interface ConfigData {
  tickInterval: number;
  sleepAfter: number;
  sleepTickInterval: number;
  dreamAfter: number;
  blockingBudget: number;
  maxEventWindow: number;
  confidenceThreshold: number;
  tickModel: string;
  escalationModel: string;
  actionGates: {
    enabled: boolean;
    autoApprove: boolean;
  };
  allowedRepos: string[];
  allowedActions: string[];
}

function isDirty(current: ConfigData, original: ConfigData): boolean {
  return JSON.stringify(current) !== JSON.stringify(original);
}

function discard(original: ConfigData): ConfigData {
  return JSON.parse(JSON.stringify(original));
}

describe("Config dirty tracking", () => {
  let baseConfig: ConfigData;

  beforeEach(() => {
    baseConfig = {
      tickInterval: 30,
      sleepAfter: 300,
      sleepTickInterval: 120,
      dreamAfter: 600,
      blockingBudget: 5000,
      maxEventWindow: 100,
      confidenceThreshold: 0.7,
      tickModel: "haiku",
      escalationModel: "sonnet",
      actionGates: { enabled: true, autoApprove: false },
      allowedRepos: ["/home/user/project"],
      allowedActions: ["commit", "push"],
    };
  });

  test("identical config is not dirty", () => {
    const copy = JSON.parse(JSON.stringify(baseConfig));
    expect(isDirty(copy, baseConfig)).toBe(false);
  });

  test("changing a numeric field marks dirty", () => {
    const modified = { ...baseConfig, tickInterval: 60 };
    expect(isDirty(modified, baseConfig)).toBe(true);
  });

  test("changing a string field marks dirty", () => {
    const modified = { ...baseConfig, tickModel: "opus" };
    expect(isDirty(modified, baseConfig)).toBe(true);
  });

  test("changing a boolean field marks dirty", () => {
    const modified = {
      ...baseConfig,
      actionGates: { ...baseConfig.actionGates, autoApprove: true },
    };
    expect(isDirty(modified, baseConfig)).toBe(true);
  });

  test("changing nested actionGates.enabled marks dirty", () => {
    const modified = {
      ...baseConfig,
      actionGates: { ...baseConfig.actionGates, enabled: false },
    };
    expect(isDirty(modified, baseConfig)).toBe(true);
  });

  test("changing array field marks dirty", () => {
    const modified = {
      ...baseConfig,
      allowedRepos: [...baseConfig.allowedRepos, "/new/repo"],
    };
    expect(isDirty(modified, baseConfig)).toBe(true);
  });

  test("reordering array marks dirty (JSON.stringify is order-sensitive)", () => {
    const modified = {
      ...baseConfig,
      allowedActions: ["push", "commit"],
    };
    expect(isDirty(modified, baseConfig)).toBe(true);
  });

  test("discard returns a deep clone of original", () => {
    const discarded = discard(baseConfig);
    expect(isDirty(discarded, baseConfig)).toBe(false);
    // Verify it is a deep clone, not a reference
    discarded.actionGates.enabled = false;
    expect(baseConfig.actionGates.enabled).toBe(true);
  });

  test("discard after modifications resets to original", () => {
    const modified = { ...baseConfig, tickInterval: 999, tickModel: "opus" };
    expect(isDirty(modified, baseConfig)).toBe(true);
    const discarded = discard(baseConfig);
    expect(isDirty(discarded, baseConfig)).toBe(false);
  });

  test("empty arrays are not dirty vs empty arrays", () => {
    const config1 = { ...baseConfig, allowedRepos: [] as string[] };
    const config2 = { ...baseConfig, allowedRepos: [] as string[] };
    expect(isDirty(config1, config2)).toBe(false);
  });

  test("confidenceThreshold float precision", () => {
    const modified = { ...baseConfig, confidenceThreshold: 0.8 };
    expect(isDirty(modified, baseConfig)).toBe(true);
    const same = { ...baseConfig, confidenceThreshold: 0.7 };
    expect(isDirty(same, baseConfig)).toBe(false);
  });
});

describe("Config comma-separated array parsing", () => {
  function parseCommaSeparated(input: string): string[] {
    return input
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function joinCommaSeparated(arr: string[]): string {
    return arr.join(", ");
  }

  test("parses comma-separated string into array", () => {
    expect(parseCommaSeparated("commit, push, tag")).toEqual([
      "commit",
      "push",
      "tag",
    ]);
  });

  test("handles extra whitespace", () => {
    expect(parseCommaSeparated("  commit ,  push  , tag  ")).toEqual([
      "commit",
      "push",
      "tag",
    ]);
  });

  test("handles empty string", () => {
    expect(parseCommaSeparated("")).toEqual([]);
  });

  test("handles single value", () => {
    expect(parseCommaSeparated("commit")).toEqual(["commit"]);
  });

  test("round-trips array through join and parse", () => {
    const original = ["commit", "push", "tag"];
    const joined = joinCommaSeparated(original);
    const parsed = parseCommaSeparated(joined);
    expect(parsed).toEqual(original);
  });
});
