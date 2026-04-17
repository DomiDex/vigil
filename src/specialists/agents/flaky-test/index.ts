import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import type { VigilConfig } from "../../../core/config.ts";
import type { FlakinessRow, SpecialistStore } from "../../store.ts";
import type {
  Finding,
  SpecialistConfig,
  SpecialistContext,
  SpecialistResult,
  TestRunResult,
} from "../../types.ts";
import { getParser, parseJUnitXML, type ParsedTestResult } from "./parser.ts";
import { computeFlakiness } from "./scorer.ts";

type TestRunResultWithJunit = TestRunResult & { junitXml?: string };

/** Factory: creates the flaky-test deterministic specialist */
export function createFlakyTestAgent(store: SpecialistStore, config: VigilConfig): SpecialistConfig {
  return {
    name: "flaky-test",
    class: "deterministic",
    description: "Flaky test detector — statistical + same-commit variance analysis",
    triggerEvents: ["new_commit"],

    async execute(context: SpecialistContext): Promise<SpecialistResult> {
      const flakyConfig = config.specialists.flakyTest;

      // Mode 1: Active — run tests on new_commit if enabled
      if (flakyConfig.runOnCommit && !context.testRunResult) {
        context.testRunResult = await runTests(context.repoPath, flakyConfig.testCommand, 60_000);
      }

      // Mode 2: Passive — use existing test results
      if (!context.testRunResult) {
        return {
          specialist: "flaky-test",
          findings: [],
          confidence: 1,
          skippedReason: "No test results available",
        };
      }

      // Parse test output — prefer JUnit XML, fall back to console
      const testResult = context.testRunResult as TestRunResultWithJunit;
      let results: ParsedTestResult[];
      if (testResult.junitXml) {
        results = parseJUnitXML(testResult.junitXml);
      } else {
        const parser = getParser(testResult.stdout);
        results = parser(testResult.stdout);
      }

      if (results.length === 0) {
        return {
          specialist: "flaky-test",
          findings: [],
          confidence: 0.5,
          skippedReason: "Could not parse test output",
        };
      }

      const commitHash = await getCommitHash(context.repoPath);

      // Record each test result in the store
      for (const result of results) {
        store.storeTestRun({
          id: randomUUID(),
          repo: context.repoName,
          commitHash,
          branch: context.branch,
          testName: result.name,
          testFile: result.file,
          passed: result.passed,
        });
        store.updateFlakiness(context.repoName, result.name, result.file, result.passed, commitHash);
      }

      // Check all tracked flaky tests for this repo
      const findings: Finding[] = [];
      const flakyTests = store.getFlakyTests(context.repoName);
      for (const test of flakyTests) {
        const report = computeFlakiness(rowToStats(test), flakyConfig);
        if (!report) continue;

        findings.push({
          id: randomUUID(),
          specialist: "flaky-test",
          severity: report.isFlakyDefinitive ? "critical" : "warning",
          title: `Flaky test: ${report.testName}`,
          detail: `Pass rate: ${(report.passRate * 100).toFixed(0)}% (${test.total_passes}/${test.total_runs}). ${
            report.isFlakyDefinitive ? "Same-commit variance detected." : "Statistical flakiness."
          }`,
          file: report.testFile,
          suggestion: report.suggestion,
        });
      }

      store.pruneTestHistory(flakyConfig.maxTestHistory);

      return { specialist: "flaky-test", findings, confidence: 0.9 };
    },
  };
}

function rowToStats(row: FlakinessRow) {
  return {
    test_name: row.test_name,
    test_file: row.test_file,
    total_runs: row.total_runs,
    total_passes: row.total_passes,
    total_failures: row.total_failures,
    flaky_commits: row.flaky_commits,
  };
}

/** Run tests with JUnit reporter for structured output */
async function runTests(
  repoPath: string,
  testCommand: string,
  timeout: number,
): Promise<TestRunResultWithJunit> {
  const junitPath = `/tmp/vigil-test-${randomUUID()}.xml`;
  const parts = testCommand.split(" ");
  const fullArgs = [...parts, "--reporter=junit", `--reporter-outfile=${junitPath}`];

  const start = Date.now();
  const proc = Bun.spawn(fullArgs, {
    cwd: repoPath,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });

  const timer = setTimeout(() => proc.kill(), timeout);
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  clearTimeout(timer);
  const exitCode = await proc.exited;

  let junitXml: string | undefined;
  try {
    const file = Bun.file(junitPath);
    if (await file.exists()) {
      junitXml = await file.text();
    }
  } catch {
    // JUnit file not created — fall back to console parsing
  }

  try {
    unlinkSync(junitPath);
  } catch {
    // Ignore cleanup errors
  }

  return {
    exitCode,
    stdout,
    stderr,
    durationMs: Date.now() - start,
    timestamp: Date.now(),
    junitXml,
  };
}

/** Get current HEAD commit hash (truncated to 12 chars) */
async function getCommitHash(repoPath: string): Promise<string> {
  try {
    const proc = Bun.spawn(["git", "rev-parse", "HEAD"], {
      cwd: repoPath,
      stdout: "pipe",
      stderr: "pipe",
    });
    const hash = await new Response(proc.stdout).text();
    await proc.exited;
    return hash.trim().slice(0, 12) || "unknown";
  } catch {
    return "unknown";
  }
}
