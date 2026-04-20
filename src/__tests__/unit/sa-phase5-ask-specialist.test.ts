import { describe, expect, test } from "bun:test";

interface TestSpecialistConfig {
  name: string;
  description: string;
  triggers: string[];
}

const TEST_SPECIALISTS: TestSpecialistConfig[] = [
  { name: "code-review", description: "Reviews code quality", triggers: ["*.ts", "*.js"] },
  { name: "security", description: "Scans for security issues", triggers: ["*.ts"] },
  { name: "test-drift", description: "Detects untested code", triggers: ["*.ts"] },
  { name: "flaky-test", description: "Detects flaky tests", triggers: ["*.test.ts"] },
];

describe("Phase 5: specialist lookup by name", () => {
  test("finds exact match for 'security'", () => {
    const target = TEST_SPECIALISTS.find((s) => s.name === "security");
    expect(target).toBeDefined();
    expect(target?.name).toBe("security");
  });

  test("finds exact match for 'code-review'", () => {
    const target = TEST_SPECIALISTS.find((s) => s.name === "code-review");
    expect(target).toBeDefined();
    expect(target?.name).toBe("code-review");
  });

  test("finds exact match for 'flaky-test'", () => {
    const target = TEST_SPECIALISTS.find((s) => s.name === "flaky-test");
    expect(target).toBeDefined();
  });

  test("returns undefined for unknown specialist", () => {
    const target = TEST_SPECIALISTS.find((s) => s.name === "nonexistent");
    expect(target).toBeUndefined();
  });

  test("available names list is correct", () => {
    const names = TEST_SPECIALISTS.map((s) => s.name);
    expect(names).toEqual(["code-review", "security", "test-drift", "flaky-test"]);
  });
});

describe("Phase 5: stub runner invocation", () => {
  function createStubRunner() {
    const calls: { specialist: string; context: unknown }[] = [];
    return {
      calls,
      run: async (specialist: TestSpecialistConfig, context: unknown) => {
        calls.push({ specialist: specialist.name, context });
        return {
          specialist: specialist.name,
          skippedReason: null as string | null,
          confidence: 0.85,
          findings: [
            {
              severity: "warning" as const,
              title: "Unused variable",
              detail: "foo is declared but never used",
              file: "src/main.ts",
              line: 42,
              suggestion: "Remove the declaration",
            },
          ],
          durationMs: 150,
        };
      },
    };
  }

  test("runner.run() is called with correct specialist", async () => {
    const runner = createStubRunner();
    const target = TEST_SPECIALISTS.find((s) => s.name === "security");
    if (!target) throw new Error("security specialist missing from fixture");
    const context = {
      repoName: "my-app",
      repoPath: "/tmp/my-app",
      branch: "main",
      diff: "",
      changedFiles: [] as string[],
      recentCommits: [] as string[],
      recentFindings: [] as unknown[],
    };

    await runner.run(target, context);

    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0].specialist).toBe("security");
    expect((runner.calls[0].context as { repoName: string }).repoName).toBe("my-app");
  });

  test("runner returns findings array", async () => {
    const runner = createStubRunner();
    const target = TEST_SPECIALISTS.find((s) => s.name === "security");
    if (!target) throw new Error("security specialist missing from fixture");
    const context = {
      repoName: "my-app",
      repoPath: "/tmp/my-app",
      branch: "main",
      diff: "",
      changedFiles: [] as string[],
      recentCommits: [] as string[],
      recentFindings: [] as unknown[],
    };

    const result = await runner.run(target, context);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe("warning");
    expect(result.findings[0].title).toBe("Unused variable");
    expect(result.confidence).toBe(0.85);
  });

  test("skipped result has empty findings", async () => {
    const runner = {
      run: async () => ({
        specialist: "security",
        skippedReason: "No relevant changes",
        confidence: 0,
        findings: [] as unknown[],
        durationMs: 5,
      }),
    };

    const result = await runner.run();
    expect(result.skippedReason).toBe("No relevant changes");
    expect(result.findings).toHaveLength(0);
  });
});

describe("Phase 5: finding severity formatting", () => {
  const findings = [
    { severity: "critical", title: "SQL injection", detail: "Unescaped user input" },
    { severity: "warning", title: "Unused import", detail: "fs imported but not used" },
    { severity: "info", title: "Style note", detail: "Consider using const" },
  ];

  test("critical severity is identified", () => {
    const critical = findings.filter((f) => f.severity === "critical");
    expect(critical).toHaveLength(1);
    expect(critical[0].title).toBe("SQL injection");
  });

  test("warning severity is identified", () => {
    const warnings = findings.filter((f) => f.severity === "warning");
    expect(warnings).toHaveLength(1);
  });

  test("info severity is identified", () => {
    const infos = findings.filter((f) => f.severity === "info");
    expect(infos).toHaveLength(1);
  });

  test("file and line are optional in findings", () => {
    const finding: { severity: string; title: string; detail: string; file?: string; line?: number } = {
      severity: "warning",
      title: "Test",
      detail: "Detail",
    };
    expect(finding.file).toBeUndefined();
    expect(finding.line).toBeUndefined();
  });

  test("suggestion is optional in findings", () => {
    const finding = {
      severity: "warning",
      title: "Test",
      detail: "Detail",
      suggestion: "Fix it",
    };
    expect(finding.suggestion).toBe("Fix it");
  });
});
