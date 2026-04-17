import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TEST_DRIFT_AGENT, findTestFile } from "../../specialists/agents/test-drift.ts";
import type { SpecialistContext, Finding } from "../../specialists/types.ts";

function createMockContext(overrides: Partial<SpecialistContext> = {}): SpecialistContext {
  return {
    repoName: "vigil",
    repoPath: "/tmp/mock-repo",
    branch: "main",
    diff: "--- a/src/core/config.ts\n+++ b/src/core/config.ts\n@@ -1 +1,2 @@\n+export const x = 1;",
    changedFiles: ["src/core/config.ts", "src/core/daemon.ts"],
    recentCommits: ["abc1234 feat: add feature"],
    recentFindings: [],
    ...overrides,
  };
}

describe("findTestFile", () => {
  let tempRepo: string;

  beforeEach(() => {
    tempRepo = mkdtempSync(join(tmpdir(), "vigil-findtest-"));
  });

  afterEach(() => {
    rmSync(tempRepo, { recursive: true, force: true });
  });

  it("pattern 1: src/foo/bar.ts -> tests/foo/bar.test.ts", () => {
    mkdirSync(join(tempRepo, "tests", "core"), { recursive: true });
    writeFileSync(join(tempRepo, "tests", "core", "config.test.ts"), "");
    const result = findTestFile("src/core/config.ts", tempRepo);
    expect(result).toBe("tests/core/config.test.ts");
  });

  it("pattern 2: src/foo/bar.ts -> src/foo/bar.test.ts", () => {
    mkdirSync(join(tempRepo, "src", "memory"), { recursive: true });
    writeFileSync(join(tempRepo, "src", "memory", "store.test.ts"), "");
    const result = findTestFile("src/memory/store.ts", tempRepo);
    expect(result).toBe("src/memory/store.test.ts");
  });

  it("pattern 3: src/foo/bar.ts -> src/foo/__tests__/bar.ts", () => {
    mkdirSync(join(tempRepo, "src", "git", "__tests__"), { recursive: true });
    writeFileSync(join(tempRepo, "src", "git", "__tests__", "watcher.ts"), "");
    const result = findTestFile("src/git/watcher.ts", tempRepo);
    expect(result).toBe(join("src/git/__tests__", "watcher.ts"));
  });

  it("returns null when no test file exists", () => {
    const result = findTestFile("src/core/daemon.ts", tempRepo);
    expect(result).toBeNull();
  });

  it("returns first matching pattern (pattern 1 preferred over 2)", () => {
    mkdirSync(join(tempRepo, "tests", "core"), { recursive: true });
    writeFileSync(join(tempRepo, "tests", "core", "config.test.ts"), "");
    mkdirSync(join(tempRepo, "src", "core"), { recursive: true });
    writeFileSync(join(tempRepo, "src", "core", "config.test.ts"), "");
    const result = findTestFile("src/core/config.ts", tempRepo);
    expect(result).toBe("tests/core/config.test.ts");
  });

  it("handles top-level src files", () => {
    mkdirSync(join(tempRepo, "src"), { recursive: true });
    writeFileSync(join(tempRepo, "src", "index.test.ts"), "");
    const result = findTestFile("src/index.ts", tempRepo);
    expect(result).toBe("src/index.test.ts");
  });
});

describe("TEST_DRIFT_AGENT", () => {
  describe("config fields", () => {
    it("has name 'test-drift'", () => {
      expect(TEST_DRIFT_AGENT.name).toBe("test-drift");
    });

    it("has class 'analytical'", () => {
      expect(TEST_DRIFT_AGENT.class).toBe("analytical");
    });

    it("triggers on new_commit and file_change", () => {
      expect(TEST_DRIFT_AGENT.triggerEvents).toEqual(["new_commit", "file_change"]);
    });

    it("has no watchPatterns (triggers on any file)", () => {
      expect(TEST_DRIFT_AGENT.watchPatterns).toBeUndefined();
    });

    it("has a buildPrompt method", () => {
      expect(TEST_DRIFT_AGENT.buildPrompt).toBeDefined();
      expect(typeof TEST_DRIFT_AGENT.buildPrompt).toBe("function");
    });
  });

  describe("buildPrompt", () => {
    it("includes the diff from context", () => {
      const ctx = createMockContext({ diff: "TEST_DRIFT_DIFF_MARKER" });
      const prompt = TEST_DRIFT_AGENT.buildPrompt!(ctx);
      expect(prompt).toContain("TEST_DRIFT_DIFF_MARKER");
    });

    it("includes dedup section", () => {
      const findings: Finding[] = [
        { id: "f-1", specialist: "test-drift", severity: "warning", title: "Stale test for config.ts", detail: "..." },
      ];
      const ctx = createMockContext({ recentFindings: findings });
      const prompt = TEST_DRIFT_AGENT.buildPrompt!(ctx);
      expect(prompt).toContain("Previous findings");
      expect(prompt).toContain("Stale test for config.ts");
    });

    it("includes JSON response format instruction", () => {
      const ctx = createMockContext();
      const prompt = TEST_DRIFT_AGENT.buildPrompt!(ctx);
      expect(prompt).toContain('"findings"');
      expect(prompt).toContain('"confidence"');
    });

    it("filters out test/spec/__tests__ files from source mapping", () => {
      const ctx = createMockContext({
        changedFiles: [
          "src/core/config.ts",
          "src/core/config.test.ts",
          "src/core/config.spec.ts",
          "src/__tests__/unit/config.ts",
        ],
      });
      const prompt = TEST_DRIFT_AGENT.buildPrompt!(ctx);
      expect(prompt).toContain("src/core/config.ts");
      expect(prompt).toMatch(/src\/core\/config\.ts\s*->/);
    });

    it("shows (NOT updated) for source files whose tests did not change", () => {
      let tempRepo: string;
      tempRepo = mkdtempSync(join(tmpdir(), "vigil-prompt-"));
      mkdirSync(join(tempRepo, "src", "core"), { recursive: true });
      writeFileSync(join(tempRepo, "src", "core", "config.test.ts"), "");

      const ctx = createMockContext({
        repoPath: tempRepo,
        changedFiles: ["src/core/config.ts"],
      });
      const prompt = TEST_DRIFT_AGENT.buildPrompt!(ctx);
      expect(prompt).toContain("(NOT updated)");

      rmSync(tempRepo, { recursive: true, force: true });
    });

    it("shows (UPDATED) when test file is in changedFiles", () => {
      let tempRepo: string;
      tempRepo = mkdtempSync(join(tmpdir(), "vigil-prompt-"));
      mkdirSync(join(tempRepo, "src", "core"), { recursive: true });
      writeFileSync(join(tempRepo, "src", "core", "config.test.ts"), "");

      const ctx = createMockContext({
        repoPath: tempRepo,
        changedFiles: ["src/core/config.ts", "src/core/config.test.ts"],
      });
      const prompt = TEST_DRIFT_AGENT.buildPrompt!(ctx);
      expect(prompt).toContain("(UPDATED)");

      rmSync(tempRepo, { recursive: true, force: true });
    });
  });
});
