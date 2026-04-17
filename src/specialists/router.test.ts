import { describe, expect, test } from "bun:test";
import { SpecialistRouter } from "./router.ts";
import type { VigilConfig } from "../core/config.ts";
import type { SpecialistConfig } from "./types.ts";

const mockConfig = {
  specialists: {
    enabled: true,
    agents: ["code-review", "security"],
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

const mockSpecialists: SpecialistConfig[] = [
  {
    name: "code-review",
    class: "analytical",
    description: "Code reviewer",
    triggerEvents: ["new_commit"],
    watchPatterns: ["src/**/*.ts", "!src/**/*.test.ts"],
    buildPrompt: () => "",
  },
  {
    name: "security",
    class: "analytical",
    description: "Security scanner",
    triggerEvents: ["new_commit", "file_change"],
    watchPatterns: ["**/*.ts", "**/*.json"],
    buildPrompt: () => "",
  },
  {
    name: "test-drift",
    class: "analytical",
    description: "Test drift",
    triggerEvents: ["new_commit"],
    buildPrompt: () => "",
  },
];

describe("SpecialistRouter", () => {
  test("matches specialists by event type and file patterns", () => {
    const router = new SpecialistRouter(mockConfig, mockSpecialists);
    const matched = router.match("new_commit", ["src/core/daemon.ts"]);
    expect(matched.map((s) => s.name)).toContain("code-review");
    expect(matched.map((s) => s.name)).toContain("security");
  });

  test("excludes test files for code-review (negation pattern)", () => {
    const router = new SpecialistRouter(mockConfig, mockSpecialists);
    const matched = router.match("new_commit", ["src/core/daemon.test.ts"]);
    expect(matched.map((s) => s.name)).not.toContain("code-review");
  });

  test("returns empty when disabled", () => {
    const disabled = {
      ...mockConfig,
      specialists: { ...mockConfig.specialists, enabled: false },
    } as any;
    const router = new SpecialistRouter(disabled, mockSpecialists);
    expect(router.match("new_commit", ["src/foo.ts"])).toEqual([]);
  });

  test("cooldown prevents re-run", () => {
    const router = new SpecialistRouter(mockConfig, mockSpecialists);
    expect(router.isOnCooldown("security", "vigil")).toBe(false);
    router.recordRun("security", "vigil");
    expect(router.isOnCooldown("security", "vigil")).toBe(true);
  });

  test("excludes specialists not in agents list", () => {
    const router = new SpecialistRouter(mockConfig, mockSpecialists);
    const matched = router.match("new_commit", ["src/foo.ts"]);
    expect(matched.map((s) => s.name)).not.toContain("test-drift");
  });
});
