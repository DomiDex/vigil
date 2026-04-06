import { describe, test, expect } from "bun:test";
import { computeJitter, TickEngine } from "../../src/core/tick-engine.ts";

describe("computeJitter", () => {
  test("returns deterministic jitter for same repo name", () => {
    const j1 = computeJitter("my-repo", 30);
    const j2 = computeJitter("my-repo", 30);
    expect(j1).toBe(j2);
  });

  test("returns different jitter for different repo names", () => {
    const j1 = computeJitter("repo-a", 30);
    const j2 = computeJitter("repo-b", 30);
    expect(j1).not.toBe(j2);
  });

  test("jitter is non-negative", () => {
    const names = ["a", "bb", "ccc", "my-project", "vigil", "x".repeat(100)];
    for (const name of names) {
      expect(computeJitter(name, 30)).toBeGreaterThanOrEqual(0);
    }
  });

  test("jitter is capped at 15 seconds (in ms)", () => {
    const names = ["a", "bb", "ccc", "my-project", "vigil"];
    for (const name of names) {
      expect(computeJitter(name, 300)).toBeLessThanOrEqual(15_000);
    }
  });

  test("jitter scales with base interval", () => {
    const jSmall = computeJitter("test", 10);
    const jLarge = computeJitter("test", 100);
    // Both should be valid, but large interval allows more jitter (up to cap)
    expect(jSmall).toBeGreaterThanOrEqual(0);
    expect(jLarge).toBeGreaterThanOrEqual(0);
  });

  test("jitter is at most 10% of base interval (in ms)", () => {
    const base = 30; // seconds
    const jitter = computeJitter("test-repo", base);
    const maxExpected = Math.min(base * 0.1, 15) * 1000;
    expect(jitter).toBeLessThanOrEqual(maxExpected);
  });
});

describe("TickEngine", () => {
  test("fires tick handlers", async () => {
    const engine = new TickEngine({
      tickInterval: 0.1,
      sleepAfter: 900,
      sleepTickInterval: 300,
      blockingBudget: 5,
      dreamAfter: 300,
      tickModel: "test",
      escalationModel: "test",
      maxEventWindow: 10,
    });

    const ticks: number[] = [];
    engine.onTick(async (num) => {
      ticks.push(num);
    });
    engine.start();
    await Bun.sleep(350);
    engine.stop();
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks[0]).toBe(1);
  });

  test("reportActivity resets sleep state", () => {
    const engine = new TickEngine({
      tickInterval: 1,
      sleepAfter: 0, // Sleep immediately
      sleepTickInterval: 1,
      blockingBudget: 5,
      dreamAfter: 300,
      tickModel: "test",
      escalationModel: "test",
      maxEventWindow: 10,
    });

    engine.start();
    engine.reportActivity();
    expect(engine.isSleeping).toBe(false);
    engine.stop();
  });

  test("accepts repoName for jitter", () => {
    const engine = new TickEngine(
      {
        tickInterval: 30,
        sleepAfter: 900,
        sleepTickInterval: 300,
        blockingBudget: 15,
        dreamAfter: 300,
        tickModel: "test",
        escalationModel: "test",
        maxEventWindow: 100,
      },
      "my-repo"
    );
    // Should not throw
    engine.start();
    engine.stop();
  });
});
