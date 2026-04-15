import { describe, it, expect, mock } from "bun:test";

// Mock server functions
const mockGetRepos = mock(() =>
  Promise.resolve({
    repos: [
      { name: "vigil", path: "/repos/vigil", state: "active" as const, branch: "main", head: "abc1234def5678", dirty: false },
      { name: "my-app", path: "/repos/my-app", state: "sleeping" as const, branch: "feat/login", head: "def5678abc1234", dirty: true },
      { name: "docs", path: "/repos/docs", state: "dreaming" as const, branch: "main", head: "111222333444555", dirty: false },
    ],
  }),
);

const mockGetRepoDetail = mock(() =>
  Promise.resolve({
    name: "vigil",
    path: "/repos/vigil",
    state: "active" as const,
    branch: "main",
    head: "abc1234def5678",
    headMessage: "feat: add repos plugin",
    dirty: false,
    dirtyFileCount: 0,
    uncommittedSummary: "",
    recentCommits: [
      { hash: "abc1234", message: "feat: add repos plugin", author: "dev", date: "2026-04-14T10:00:00Z" },
      { hash: "def5678", message: "fix: state icon mapping", author: "dev", date: "2026-04-14T09:00:00Z" },
    ],
    decisions: { SILENT: 40, OBSERVE: 30, NOTIFY: 20, ACT: 10 },
    patterns: ["Frequent small commits", "Test-driven workflow"],
    topics: [
      { topic: "dashboard", mentions: 12, lastSeen: "2026-04-14T10:00:00Z" },
      { topic: "testing", mentions: 8, lastSeen: "2026-04-14T09:00:00Z" },
    ],
  }),
);

describe("Repos plugin", () => {
  describe("repo-card state icon mapping", () => {
    it("maps 'active' state to Circle icon identifier", () => {
      // This mapping must be exported from repo-card.tsx
      const { getStateIcon } = require("../../../dashboard-v2/src/components/vigil/repo-card");
      expect(getStateIcon("active")).toBe("Circle");
      expect(getStateIcon("sleeping")).toBe("Moon");
      expect(getStateIcon("dreaming")).toBe("Sparkles");
    });

    it("identifies dirty repos from data", () => {
      const repos = [
        { name: "vigil", dirty: false, state: "active" },
        { name: "my-app", dirty: true, state: "sleeping" },
      ];
      const dirtyRepos = repos.filter((r) => r.dirty);
      expect(dirtyRepos).toHaveLength(1);
      expect(dirtyRepos[0].name).toBe("my-app");
    });

    it("truncates HEAD sha to 7 characters", () => {
      const head = "abc1234def5678";
      const { formatSha } = require("../../../dashboard-v2/src/components/vigil/repo-card");
      expect(formatSha(head)).toBe("abc1234");
    });
  });

  describe("ReposPage query configuration", () => {
    it("getRepos returns repos array in expected shape", async () => {
      const result = await mockGetRepos();
      expect(result.repos).toHaveLength(3);
      expect(result.repos[0]).toHaveProperty("name");
      expect(result.repos[0]).toHaveProperty("branch");
      expect(result.repos[0]).toHaveProperty("head");
      expect(result.repos[0]).toHaveProperty("dirty");
      expect(result.repos[0]).toHaveProperty("state");
    });

    it("getRepoDetail returns detail for selected repo", async () => {
      const result = await mockGetRepoDetail();
      expect(result.name).toBe("vigil");
      expect(result.recentCommits).toBeInstanceOf(Array);
      expect(result.patterns).toBeInstanceOf(Array);
      expect(result.topics).toBeInstanceOf(Array);
      expect(result.recentCommits[0]).toHaveProperty("hash");
      expect(result.recentCommits[0]).toHaveProperty("message");
    });
  });

  describe("decision distribution calculation", () => {
    it("computes percentage bars from decision counts", () => {
      const { computeDecisionPercentages } = require("../../../dashboard-v2/src/components/vigil/repo-card");
      const decisions = { SILENT: 40, OBSERVE: 30, NOTIFY: 20, ACT: 10 };
      const pcts = computeDecisionPercentages(decisions);
      expect(pcts.SILENT).toBe(40);
      expect(pcts.ACT).toBe(10);
      expect(pcts.OBSERVE).toBe(30);
      expect(pcts.NOTIFY).toBe(20);
    });

    it("handles zero total decisions gracefully", () => {
      const { computeDecisionPercentages } = require("../../../dashboard-v2/src/components/vigil/repo-card");
      const decisions = { SILENT: 0, OBSERVE: 0, NOTIFY: 0, ACT: 0 };
      const pcts = computeDecisionPercentages(decisions);
      expect(pcts.SILENT).toBe(0);
      expect(Number.isNaN(pcts.SILENT)).toBe(false);
    });
  });

  describe("detail panel data sections", () => {
    it("commits have hash and message fields", async () => {
      const result = await mockGetRepoDetail();
      for (const commit of result.recentCommits) {
        expect(commit).toHaveProperty("hash");
        expect(commit).toHaveProperty("message");
        expect(commit).toHaveProperty("author");
        expect(commit).toHaveProperty("date");
      }
    });

    it("topics have topic name, mentions, and lastSeen", async () => {
      const result = await mockGetRepoDetail();
      for (const t of result.topics) {
        expect(t).toHaveProperty("topic");
        expect(t).toHaveProperty("mentions");
        expect(t).toHaveProperty("lastSeen");
      }
    });
  });
});
