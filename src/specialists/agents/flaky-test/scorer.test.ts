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

  test("respects custom threshold", () => {
    const stats: FlakinessStats = {
      test_name: "test > marginal",
      test_file: "marginal.test.ts",
      total_runs: 10,
      total_passes: 8,
      total_failures: 2,
      flaky_commits: 0,
      last_flaky_at: null,
    };
    // With default 0.5 threshold: passRate 0.8 > (1 - 0.5) = 0.5 -- not flaky
    expect(computeFlakiness(stats, defaultConfig)).toBeNull();

    // With stricter threshold 0.9: passRate 0.8 > (1 - 0.9) = 0.1 -- still not flaky
    expect(computeFlakiness(stats, { minRunsToJudge: 3, flakyThreshold: 0.9 })).toBeNull();
  });
});
