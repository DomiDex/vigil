export interface FlakinessReport {
  testName: string;
  testFile: string;
  passRate: number;
  totalRuns: number;
  flakyCommits: number;
  isFlakyDefinitive: boolean;
  isFlakyStatistical: boolean;
  suggestion: string;
}

export interface FlakinessStats {
  test_name: string;
  test_file: string;
  total_runs: number;
  total_passes: number;
  total_failures: number;
  flaky_commits: number;
  last_flaky_at?: number | null;
}

export interface FlakinessConfig {
  minRunsToJudge: number;
  flakyThreshold: number;
}

/** Compute flakiness report. Returns null if insufficient data or test is stable. */
export function computeFlakiness(stats: FlakinessStats, config: FlakinessConfig): FlakinessReport | null {
  if (stats.total_runs < config.minRunsToJudge) {
    return null;
  }

  const passRate = stats.total_passes / stats.total_runs;
  const isFlakyDefinitive = stats.flaky_commits > 0;
  const isFlakyStatistical = passRate > 0 && passRate < 1 && passRate < 1 - config.flakyThreshold;

  if (!isFlakyDefinitive && !isFlakyStatistical) {
    return null;
  }

  const suggestion = isFlakyDefinitive
    ? `Test "${stats.test_name}" produced different results on the same commit. Check for timing dependencies, shared state, or non-deterministic behavior.`
    : `Test "${stats.test_name}" has a ${(passRate * 100).toFixed(0)}% pass rate across ${stats.total_runs} runs. Consider investigating intermittent failures.`;

  return {
    testName: stats.test_name,
    testFile: stats.test_file,
    passRate,
    totalRuns: stats.total_runs,
    flakyCommits: stats.flaky_commits,
    isFlakyDefinitive,
    isFlakyStatistical,
    suggestion,
  };
}
