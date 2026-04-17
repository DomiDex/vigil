import { describe, it, expect } from "bun:test";
import { SECURITY_AGENT } from "../../specialists/agents/security.ts";
import type { SpecialistContext, Finding } from "../../specialists/types.ts";

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

describe("SECURITY_AGENT", () => {
  describe("config fields", () => {
    it("has name 'security'", () => {
      expect(SECURITY_AGENT.name).toBe("security");
    });

    it("has class 'analytical'", () => {
      expect(SECURITY_AGENT.class).toBe("analytical");
    });

    it("triggers on new_commit and file_change", () => {
      expect(SECURITY_AGENT.triggerEvents).toEqual(["new_commit", "file_change"]);
    });

    it("watches broad file patterns including config and env files", () => {
      expect(SECURITY_AGENT.watchPatterns).toEqual([
        "**/*.ts",
        "**/*.json",
        "**/*.env*",
        "**/*.yaml",
        "**/*.yml",
      ]);
    });

    it("has a buildPrompt method", () => {
      expect(SECURITY_AGENT.buildPrompt).toBeDefined();
      expect(typeof SECURITY_AGENT.buildPrompt).toBe("function");
    });
  });

  describe("buildPrompt", () => {
    it("includes the diff from context", () => {
      const ctx = createMockContext({ diff: "SECURITY_DIFF_MARKER" });
      const prompt = SECURITY_AGENT.buildPrompt!(ctx);
      expect(prompt).toContain("SECURITY_DIFF_MARKER");
    });

    it("includes dedup section with recent finding titles", () => {
      const findings: Finding[] = [
        {
          id: "f-2",
          specialist: "security",
          severity: "critical",
          title: "Hardcoded API key in constants.ts",
          detail: "API_KEY = 'sk-...' found on line 7",
        },
      ];
      const ctx = createMockContext({ recentFindings: findings });
      const prompt = SECURITY_AGENT.buildPrompt!(ctx);
      expect(prompt).toContain("Previous findings");
      expect(prompt).toContain("Hardcoded API key in constants.ts");
    });

    it("includes '(none)' when no recent findings", () => {
      const ctx = createMockContext({ recentFindings: [] });
      const prompt = SECURITY_AGENT.buildPrompt!(ctx);
      expect(prompt).toContain("(none)");
    });

    it("mentions Hardcoded secrets in the prompt", () => {
      const ctx = createMockContext();
      const prompt = SECURITY_AGENT.buildPrompt!(ctx);
      expect(prompt).toContain("Hardcoded secrets");
    });

    it("includes JSON response format instruction", () => {
      const ctx = createMockContext();
      const prompt = SECURITY_AGENT.buildPrompt!(ctx);
      expect(prompt).toContain('"findings"');
      expect(prompt).toContain('"severity"');
      expect(prompt).toContain('"confidence"');
    });

    it("includes repo name and branch", () => {
      const ctx = createMockContext({ repoName: "my-project", branch: "feature/sec" });
      const prompt = SECURITY_AGENT.buildPrompt!(ctx);
      expect(prompt).toContain("my-project");
      expect(prompt).toContain("feature/sec");
    });

    it("includes changed files list", () => {
      const ctx = createMockContext({ changedFiles: ["src/a.ts", ".env.local"] });
      const prompt = SECURITY_AGENT.buildPrompt!(ctx);
      expect(prompt).toContain("src/a.ts");
      expect(prompt).toContain(".env.local");
    });

    it("returns a non-empty string", () => {
      const ctx = createMockContext();
      const prompt = SECURITY_AGENT.buildPrompt!(ctx);
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(100);
    });
  });
});
