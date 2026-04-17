import { describe, expect, it } from "bun:test";
import { CODE_REVIEW_AGENT } from "../../specialists/agents/code-review.ts";
import type { Finding, SpecialistContext } from "../../specialists/types.ts";

function createMockContext(overrides: Partial<SpecialistContext> = {}): SpecialistContext {
  return {
    repoName: "vigil",
    repoPath: "/tmp/mock-repo",
    branch: "main",
    diff: "--- a/src/core/config.ts\n+++ b/src/core/config.ts\n@@ -1,3 +1,4 @@\n+const x = 1;",
    changedFiles: ["src/core/config.ts"],
    recentCommits: ["abc1234 fix: update config defaults"],
    recentFindings: [],
    ...overrides,
  };
}

describe("CODE_REVIEW_AGENT", () => {
  describe("config fields", () => {
    it("has name 'code-review'", () => {
      expect(CODE_REVIEW_AGENT.name).toBe("code-review");
    });

    it("has class 'analytical'", () => {
      expect(CODE_REVIEW_AGENT.class).toBe("analytical");
    });

    it("triggers only on new_commit", () => {
      expect(CODE_REVIEW_AGENT.triggerEvents).toEqual(["new_commit"]);
    });

    it("watches src/**/*.ts excluding test and spec files", () => {
      expect(CODE_REVIEW_AGENT.watchPatterns).toEqual(["src/**/*.ts", "!src/**/*.test.ts", "!src/**/*.spec.ts"]);
    });

    it("has a buildPrompt method", () => {
      expect(CODE_REVIEW_AGENT.buildPrompt).toBeDefined();
      expect(typeof CODE_REVIEW_AGENT.buildPrompt).toBe("function");
    });
  });

  describe("buildPrompt", () => {
    it("includes the diff from context", () => {
      const ctx = createMockContext({ diff: "UNIQUE_DIFF_MARKER" });
      const prompt = CODE_REVIEW_AGENT.buildPrompt!(ctx);
      expect(prompt).toContain("UNIQUE_DIFF_MARKER");
    });

    it("includes dedup section with recent finding titles", () => {
      const findings: Finding[] = [
        {
          id: "f-1",
          specialist: "code-review",
          severity: "warning",
          title: "Null check missing in parser",
          detail: "...",
        },
      ];
      const ctx = createMockContext({ recentFindings: findings });
      const prompt = CODE_REVIEW_AGENT.buildPrompt!(ctx);
      expect(prompt).toContain("Previous findings");
      expect(prompt).toContain("Null check missing in parser");
    });

    it("includes '(none)' when no recent findings", () => {
      const ctx = createMockContext({ recentFindings: [] });
      const prompt = CODE_REVIEW_AGENT.buildPrompt!(ctx);
      expect(prompt).toContain("(none)");
    });

    it("includes JSON response format instruction", () => {
      const ctx = createMockContext();
      const prompt = CODE_REVIEW_AGENT.buildPrompt!(ctx);
      expect(prompt).toContain('"findings"');
      expect(prompt).toContain('"severity"');
      expect(prompt).toContain('"confidence"');
    });

    it("includes repo name and branch", () => {
      const ctx = createMockContext({ repoName: "my-project", branch: "feature/xyz" });
      const prompt = CODE_REVIEW_AGENT.buildPrompt!(ctx);
      expect(prompt).toContain("my-project");
      expect(prompt).toContain("feature/xyz");
    });

    it("includes changed files list", () => {
      const ctx = createMockContext({ changedFiles: ["src/a.ts", "src/b.ts"] });
      const prompt = CODE_REVIEW_AGENT.buildPrompt!(ctx);
      expect(prompt).toContain("src/a.ts");
      expect(prompt).toContain("src/b.ts");
    });

    it("returns a non-empty string", () => {
      const ctx = createMockContext();
      const prompt = CODE_REVIEW_AGENT.buildPrompt!(ctx);
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(100);
    });
  });
});
