import { describe, expect, test } from "bun:test";
import { computeFlakiness, type FlakinessConfig, type FlakinessStats } from "./scorer.ts";

const defaultConfig: FlakinessConfig = {
  minRunsToJudge: 3,
  flakyThreshold: 0.5,
};

describe("computeFlakiness", () => {
  test("returns null when insufficient data", () => {
    const stats: FlakinessStats = {
      test_name: "test > foo",
      test_file: "foo.test.ts",
      total_runs: 2,
      total_passes: 1,
      total_failures: 1,
      flaky_commits: 0,
      last_flaky_at: null,
    };
    expect(computeFlakiness(stats, defaultConfig)).toBeNull();
  });

  test("returns null for stable test (100% pass rate)", () => {
    const stats: FlakinessStats = {
      test_name: "test > stable",
      test_file: "stable.test.ts",
      total_runs: 10,
      total_passes: 10,
      total_failures: 0,
      flaky_commits: 0,
      last_flaky_at: null,
    };
    expect(computeFlakiness(stats, defaultConfig)).toBeNull();
  });

  test("returns null for consistently failing test (0% pass rate)", () => {
    const stats: FlakinessStats = {
      test_name: "test > broken",
      test_file: "broken.test.ts",
      total_runs: 5,
      total_passes: 0,
      total_failures: 5,
      flaky_commits: 0,
      last_flaky_at: null,
    };
    // passRate = 0, not > 0, so isFlakyStatistical is false
    // flaky_commits = 0 so isFlakyDefinitive is false
    expect(computeFlakiness(stats, defaultConfig)).toBeNull();
  });

  test("detects definitive flaky (same-commit variance)", () => {
    const stats: FlakinessStats = {
      test_name: "test > flaky",
      test_file: "flaky.test.ts",
      total_runs: 5,
      total_passes: 3,
      total_failures: 2,
      flaky_commits: 1,
      last_flaky_at: Date.now(),
    };
    const report = computeFlakiness(stats, defaultConfig);
    expect(report).not.toBeNull();
    expect(report!.isFlakyDefinitive).toBe(true);
    expect(report!.passRate).toBeCloseTo(0.6, 1);
    expect(report!.suggestion).toContain("same commit");
  });

  test("detects statistical flaky (below threshold)", () => {
    const stats: FlakinessStats = {
      test_name: "test > intermittent",
      test_file: "intermittent.test.ts",
      total_runs: 10,
      total_passes: 4,
      total_failures: 6,
      flaky_commits: 0,
      last_flaky_at: null,
    };
    const report = computeFlakiness(stats, defaultConfig);
    expect(report).not.toBeNull();
    expect(report!.isFlakyDefinitive).toBe(false);
    expect(report!.isFlakyStatistical).toBe(true);
    expect(report!.passRate).toBeCloseTo(0.4, 1);
  });

  test("respects custom threshold — both sides of the boundary", () => {
    const base: Omit<FlakinessStats, "total_passes" | "total_failures"> = {
      test_name: "test > marginal",
      test_file: "marginal.test.ts",
      total_runs: 10,
      flaky_commits: 0,
      last_flaky_at: null,
    };

    // passRate 0.8 with threshold 0.5 → 0.8 > (1 - 0.5) → not flaky
    expect(computeFlakiness({ ...base, total_passes: 8, total_failures: 2 }, defaultConfig)).toBeNull();

    // passRate 0.2 with threshold 0.5 → 0.2 < (1 - 0.5) → flaky
    const flaky = computeFlakiness({ ...base, total_passes: 2, total_failures: 8 }, defaultConfig);
    expect(flaky).not.toBeNull();
    expect(flaky!.isFlakyStatistical).toBe(true);

    // passRate 0.4 with strict threshold 0.3 → 0.4 > (1 - 0.3) = 0.7 is false, 0.4 < 0.7 true → flaky
    // (Tightening the threshold flips marginal cases into flaky territory.)
    const strict = computeFlakiness(
      { ...base, total_passes: 4, total_failures: 6 },
      {
        minRunsToJudge: 3,
        flakyThreshold: 0.3,
      },
    );
    expect(strict).not.toBeNull();
    expect(strict!.isFlakyStatistical).toBe(true);
  });
});
