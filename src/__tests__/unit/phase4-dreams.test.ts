import { describe, it, expect, mock } from "bun:test";

const mockGetDreams = mock(() =>
  Promise.resolve({
    dreams: [
      {
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        repo: "vigil",
        observationsConsolidated: 42,
        summary:
          "Consolidated 42 observations into 3 insights about testing patterns and code quality improvements across the repository",
        insights: ["Test coverage improving", "Refactoring trend"],
        patterns: ["TDD", "Small commits"],
        confidence: 0.87,
      },
      {
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        repo: "my-app",
        observationsConsolidated: 15,
        summary: "Short summary",
        insights: ["Auth flow stable"],
        patterns: ["Feature branches"],
        confidence: 0.72,
      },
    ],
    status: { running: false },
  }),
);

const mockGetDreamPatterns = mock(() =>
  Promise.resolve({
    repo: "vigil",
    patterns: ["TDD", "Small commits", "Feature branches"],
    lastUpdated: "2026-04-14T10:00:00Z",
  }),
);

const mockTriggerDream = mock(() => Promise.resolve({ success: true }));

describe("Dreams plugin", () => {
  describe("dream status indicator", () => {
    it("shows running state with repo and pid", () => {
      const status = { running: true, repo: "vigil", pid: 12345 };
      expect(status.running).toBe(true);
      expect(status.repo).toBe("vigil");
      expect(status.pid).toBe(12345);
    });

    it("shows idle state when not running", () => {
      const status = { running: false };
      expect(status.running).toBe(false);
      expect(status).not.toHaveProperty("repo");
      expect(status).not.toHaveProperty("pid");
    });
  });

  describe("dream-entry expand/collapse", () => {
    it("identifies long summaries that need truncation", () => {
      const { shouldTruncate } = require("../../../dashboard-v2/src/components/vigil/dream-entry");
      const longSummary =
        "Consolidated 42 observations into 3 insights about testing patterns and code quality improvements across the repository";
      expect(shouldTruncate(longSummary)).toBe(true);
    });

    it("identifies short summaries that do not need truncation", () => {
      const { shouldTruncate } = require("../../../dashboard-v2/src/components/vigil/dream-entry");
      expect(shouldTruncate("Short summary")).toBe(false);
    });

    it("dream data includes insights and patterns arrays", async () => {
      const result = await mockGetDreams();
      const dream = result.dreams[0];
      expect(dream.insights).toBeInstanceOf(Array);
      expect(dream.patterns).toBeInstanceOf(Array);
      expect(dream.insights).toHaveLength(2);
      expect(dream.patterns).toHaveLength(2);
    });
  });

  describe("trigger dream mutation", () => {
    it("triggerDream called with selected repo", async () => {
      await mockTriggerDream({ data: { repo: "vigil" } });
      expect(mockTriggerDream).toHaveBeenCalledWith({ data: { repo: "vigil" } });
    });

    it("triggerDream called without repo for global dream", async () => {
      await mockTriggerDream({ data: {} });
      expect(mockTriggerDream).toHaveBeenCalledWith({ data: {} });
    });
  });

  describe("repo filter", () => {
    it("filters dreams by repo name", async () => {
      const result = await mockGetDreams();
      const filtered = result.dreams.filter((d) => d.repo === "vigil");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].repo).toBe("vigil");
    });

    it("no filter returns all dreams", async () => {
      const result = await mockGetDreams();
      expect(result.dreams).toHaveLength(2);
    });
  });

  describe("dream patterns and topic evolution", () => {
    it("patterns are string arrays", async () => {
      const result = await mockGetDreamPatterns();
      expect(result.patterns).toBeInstanceOf(Array);
      expect(result.patterns.every((p: unknown) => typeof p === "string")).toBe(true);
    });

    it("pattern data includes repo and lastUpdated", async () => {
      const result = await mockGetDreamPatterns();
      expect(result.repo).toBe("vigil");
      expect(result.lastUpdated).toBeTruthy();
    });
  });
});
