import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import type { VigilConfig } from "../core/config.ts";
import { SpecialistRouter } from "./router.ts";
import { SpecialistRunner } from "./runner.ts";
import { SpecialistStore } from "./store.ts";
import type { SpecialistConfig, SpecialistContext } from "./types.ts";

const mockConfig = {
  tickModel: "claude-haiku-4-5-20251001",
  specialists: {
    enabled: true,
    agents: ["code-review", "crash-test"],
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
  diff: "diff --git a/foo.ts b/foo.ts\n+const x = 1;",
  changedFiles: ["src/core/daemon.ts"],
  recentCommits: ["abc123"],
  recentFindings: [],
};

describe("Specialist integration", () => {
  test("specialist crash does not propagate", async () => {
    const runner = new SpecialistRunner(mockConfig);
    const crashingSpec: SpecialistConfig = {
      name: "crash-test" as SpecialistConfig["name"],
      class: "deterministic",
      description: "Crashes on purpose",
      triggerEvents: ["new_commit"],
      execute: async () => {
        throw new Error("boom");
      },
    };

    const result = await runner.run(crashingSpec, mockContext);
    expect(result.skippedReason).toContain("boom");
    expect(result.findings).toEqual([]);
  });

  test("findings storage roundtrip after specialist run", () => {
    const store = new SpecialistStore(new Database(":memory:"));

    store.storeFinding({
      id: "f1",
      specialist: "security",
      severity: "critical",
      title: "Hardcoded API key",
      detail: "API key found in source code",
      file: "config.ts",
      line: 42,
      repo: "vigil",
      confidence: 0.9,
    });

    const { findings, total } = store.getFindings({ specialist: "security" });
    expect(total).toBe(1);
    expect(findings[0].severity).toBe("critical");
    expect(findings[0].title).toBe("Hardcoded API key");
  });

  test("router + runner end-to-end with deterministic specialist", async () => {
    const deterministicSpec: SpecialistConfig = {
      name: "code-review",
      class: "deterministic",
      description: "Test deterministic",
      triggerEvents: ["new_commit"],
      watchPatterns: ["src/**/*.ts"],
      execute: async () => ({
        specialist: "code-review",
        findings: [
          {
            id: "f1",
            specialist: "code-review",
            severity: "warning" as const,
            title: "Unused variable",
            detail: "Variable x is declared but never used",
            file: "src/core/daemon.ts",
          },
        ],
        confidence: 0.8,
      }),
    };

    const router = new SpecialistRouter(mockConfig, [deterministicSpec]);
    const runner = new SpecialistRunner(mockConfig);

    const matched = router.match("new_commit", ["src/core/daemon.ts"]);
    expect(matched.length).toBe(1);

    const results = await runner.runAll(matched, mockContext);
    expect(results.length).toBe(1);
    expect(results[0].findings.length).toBe(1);
    expect(results[0].findings[0].title).toBe("Unused variable");

    const store = new SpecialistStore(new Database(":memory:"));
    store.storeFinding({
      ...results[0].findings[0],
      repo: "vigil",
      confidence: results[0].confidence,
    });
    const { total } = store.getFindings();
    expect(total).toBe(1);
  });

  test("cooldown prevents immediate re-run", () => {
    const spec: SpecialistConfig = {
      name: "code-review",
      class: "analytical",
      description: "Test",
      triggerEvents: ["new_commit"],
      watchPatterns: ["src/**/*.ts"],
      buildPrompt: () => "test",
    };

    const router = new SpecialistRouter(mockConfig, [spec]);
    expect(router.isOnCooldown("code-review", "vigil")).toBe(false);

    router.recordRun("code-review", "vigil");
    expect(router.isOnCooldown("code-review", "vigil")).toBe(true);

    const matched = router
      .match("new_commit", ["src/core/daemon.ts"])
      .filter((s) => !router.isOnCooldown(s.name, "vigil"));
    expect(matched.length).toBe(0);
  });
});
