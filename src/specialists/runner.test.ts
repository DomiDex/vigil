import { describe, expect, test } from "bun:test";
import { SpecialistRunner } from "./runner.ts";
import type { VigilConfig } from "../core/config.ts";
import type { SpecialistConfig, SpecialistContext } from "./types.ts";

const mockConfig = {
  tickModel: "claude-haiku-4-5-20251001",
  specialists: {
    enabled: true,
    agents: ["test"],
    maxParallel: 2,
    cooldownSeconds: 300,
    severityThreshold: "info",
    flakyTest: {
      testCommand: "bun test",
      runOnCommit: true,
      minRunsToJudge: 3,
      flakyThreshold: 0.5,
      maxTestHistory: 100,
    },
    autoAction: {
      enabled: false,
      minSeverity: "critical",
      minConfidence: 0.8,
      tierCap: "safe",
    },
  },
} as unknown as VigilConfig;

const mockContext: SpecialistContext = {
  repoName: "vigil",
  repoPath: "/tmp/vigil",
  branch: "main",
  diff: "diff --git a/foo.ts",
  changedFiles: ["foo.ts"],
  recentCommits: ["abc123"],
  recentFindings: [],
};

describe("SpecialistRunner", () => {
  test("runs deterministic specialist via execute()", async () => {
    const runner = new SpecialistRunner(mockConfig);
    const specialist: SpecialistConfig = {
      name: "flaky-test",
      class: "deterministic",
      description: "Flaky detector",
      triggerEvents: ["new_commit"],
      execute: async () => ({
        specialist: "flaky-test",
        findings: [
          {
            id: "f1",
            specialist: "flaky-test",
            severity: "critical",
            title: "Flaky",
            detail: "Test is flaky",
          },
        ],
        confidence: 0.9,
      }),
    };
    const result = await runner.run(specialist, mockContext);
    expect(result.findings.length).toBe(1);
    expect(result.findings[0].title).toBe("Flaky");
  });

  test("handles specialist timeout gracefully", async () => {
    const runner = new SpecialistRunner(mockConfig);
    const slowSpecialist: SpecialistConfig = {
      name: "code-review",
      class: "deterministic",
      description: "Slow",
      triggerEvents: ["new_commit"],
      execute: async () => {
        await new Promise((r) => setTimeout(r, 15_000));
        return { specialist: "code-review", findings: [], confidence: 0 };
      },
    };
    const result = await runner.run(slowSpecialist, mockContext);
    expect(result.skippedReason).toContain("timeout");
  }, 20_000);

  test("runAll respects maxParallel", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const runner = new SpecialistRunner({
      ...mockConfig,
      specialists: { ...mockConfig.specialists, maxParallel: 1 },
    } as any);

    const makeSpec = (name: string): SpecialistConfig => ({
      name: name as any,
      class: "deterministic",
      description: name,
      triggerEvents: ["new_commit"],
      execute: async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 50));
        concurrent--;
        return { specialist: name as any, findings: [], confidence: 1 };
      },
    });

    await runner.runAll(
      [makeSpec("a"), makeSpec("b"), makeSpec("c")],
      mockContext,
    );
    expect(maxConcurrent).toBe(1);
  });
});
