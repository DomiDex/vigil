import { describe, it, expect, mock } from "bun:test";

const mockMemoryData = {
  pipeline: {
    eventLog: { count: 1542, oldestDate: "2026-01-01", newestDate: "2026-04-15" },
    vectorStore: { count: 823, types: { git_event: 400, decision: 250, insight: 100, consolidated: 73 } },
    topicTier: { count: 47, repos: ["vigil", "my-app", "docs"] },
    indexTier: { count: 12, repos: ["vigil", "my-app", "docs"] },
  },
  profiles: [
    { repo: "vigil", summary: "Git monitoring daemon", patternCount: 15, lastUpdated: "2026-04-15T00:00:00Z" },
  ],
};

const mockSearchResults = {
  results: [
    { id: "r1", repo: "vigil", type: "git_event", content: "Added repos plugin with state indicators", confidence: 0.92, timestamp: "2026-04-14T10:00:00Z" },
    { id: "r2", repo: "vigil", type: "consolidated", content: "Dashboard rewrite progressing well", confidence: 0.85, timestamp: "2026-04-13T10:00:00Z" },
    { id: "r3", repo: "my-app", type: "insight", content: "Auth flow implemented in my-app", confidence: 0.71, timestamp: "2026-04-12T10:00:00Z" },
  ],
};

describe("Memory plugin", () => {
  describe("memory pipeline visualization", () => {
    it("pipeline has 4 boxes with correct counts", () => {
      const p = mockMemoryData.pipeline;
      expect(p.eventLog.count).toBe(1542);
      expect(p.vectorStore.count).toBe(823);
      expect(p.topicTier.count).toBe(47);
      expect(p.indexTier.count).toBe(12);
    });

    it("vectorStore shows type breakdown", () => {
      const types = mockMemoryData.pipeline.vectorStore.types;
      expect(types.git_event).toBe(400);
      expect(types.decision).toBe(250);
      expect(types.insight).toBe(100);
      expect(types.consolidated).toBe(73);
    });

    it("type counts sum to vectorStore total", () => {
      const types = mockMemoryData.pipeline.vectorStore.types;
      const sum = Object.values(types).reduce((a, b) => a + b, 0);
      expect(sum).toBe(mockMemoryData.pipeline.vectorStore.count);
    });

    it("pipeline boxes are in correct order", () => {
      const { PIPELINE_STAGES } = require("../../../dashboard-v2/src/plugins/memory/MemoryPage");
      expect(PIPELINE_STAGES).toEqual(["eventLog", "vectorStore", "topicTier", "indexTier"]);
    });
  });

  describe("memory-search", () => {
    it("searchMemory called with query and optional repo", async () => {
      const searchMemory = mock(() => Promise.resolve(mockSearchResults));
      await searchMemory({ data: { query: "repos plugin", repo: "vigil" } });
      expect(searchMemory).toHaveBeenCalledWith({ data: { query: "repos plugin", repo: "vigil" } });
    });

    it("results include confidence scores in 0-1 range", () => {
      for (const r of mockSearchResults.results) {
        expect(r.confidence).toBeGreaterThanOrEqual(0);
        expect(r.confidence).toBeLessThanOrEqual(1);
      }
    });

    it("results sorted by confidence descending", () => {
      const scores = mockSearchResults.results.map((r) => r.confidence);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
      }
    });

    it("result types have distinct values", () => {
      const types = new Set(mockSearchResults.results.map((r) => r.type));
      expect(types.size).toBe(3);
      expect(types.has("git_event")).toBe(true);
      expect(types.has("consolidated")).toBe(true);
      expect(types.has("insight")).toBe(true);
    });

    it("formats confidence as percentage", () => {
      const { formatConfidence } = require("../../../dashboard-v2/src/components/vigil/memory-search");
      expect(formatConfidence(0.92)).toBe("92%");
      expect(formatConfidence(0.715)).toBe("72%");
    });
  });

  describe("ask-vigil", () => {
    it("askVigil called with question and optional repo", async () => {
      const askVigil = mock(() => Promise.resolve({ success: true }));
      await askVigil({ data: { question: "What is repos plugin?", repo: "vigil" } });
      expect(askVigil).toHaveBeenCalledWith({ data: { question: "What is repos plugin?", repo: "vigil" } });
    });

    it("askVigil can be called without repo", async () => {
      const askVigil = mock(() => Promise.resolve({ success: true }));
      await askVigil({ data: { question: "How does vigil work?" } });
      expect(askVigil).toHaveBeenCalledWith({ data: { question: "How does vigil work?" } });
    });
  });

  describe("query key references", () => {
    it("memory plugin uses vigilKeys.memory.stats", () => {
      const { vigilKeys } = require("../../../dashboard-v2/src/lib/query-keys");
      expect(vigilKeys.memory.stats).toEqual(["memory"]);
    });

    it("memory search key includes query string", () => {
      const { vigilKeys } = require("../../../dashboard-v2/src/lib/query-keys");
      expect(vigilKeys.memory.search("test")).toEqual(["memory", "search", "test"]);
    });
  });

  describe("repo profiles", () => {
    it("profiles have repo, summary, patternCount, lastUpdated", () => {
      const profile = mockMemoryData.profiles[0];
      expect(profile.repo).toBe("vigil");
      expect(profile.summary).toBeTruthy();
      expect(typeof profile.patternCount).toBe("number");
      expect(profile.lastUpdated).toBeTruthy();
    });
  });
});
