import { describe, expect, test } from "bun:test";
import type {
  Finding,
  FindingSeverity,
  SpecialistContext,
  SpecialistName,
  SpecialistResult,
} from "../../specialists/types.ts";

describe("specialist types", () => {
  test("SpecialistName accepts valid values", () => {
    const names: SpecialistName[] = ["code-review", "security", "test-drift", "flaky-test"];
    expect(names).toHaveLength(4);
  });

  test("FindingSeverity accepts valid values", () => {
    const severities: FindingSeverity[] = ["info", "warning", "critical"];
    expect(severities).toHaveLength(3);
  });

  test("Finding interface has required fields", () => {
    const finding: Finding = {
      id: "f1",
      specialist: "security",
      severity: "critical",
      title: "Test",
      detail: "Detail",
    };
    expect(finding.id).toBe("f1");
    expect(finding.file).toBeUndefined();
    expect(finding.line).toBeUndefined();
  });

  test("SpecialistResult has required fields", () => {
    const result: SpecialistResult = {
      specialist: "code-review",
      findings: [],
      confidence: 0.95,
    };
    expect(result.specialist).toBe("code-review");
    expect(result.skippedReason).toBeUndefined();
  });

  test("SpecialistContext has required fields", () => {
    const ctx: SpecialistContext = {
      repoName: "vigil",
      repoPath: "/home/user/vigil",
      branch: "main",
      diff: "--- a/file.ts\n+++ b/file.ts",
      changedFiles: ["file.ts"],
      recentCommits: ["abc123"],
      recentFindings: [],
    };
    expect(ctx.testRunResult).toBeUndefined();
  });
});
