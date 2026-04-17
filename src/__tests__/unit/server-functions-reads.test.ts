import { afterEach, beforeEach, describe, expect, it } from "bun:test";

// Server functions use fetch("http://localhost:7480/api/...") in non-browser env.
// We intercept only those calls, letting real fetch (used by other test files) pass through.

describe("server functions -- reads", () => {
  const origFetch = globalThis.fetch;
  let calls: [string, RequestInit | undefined][];

  beforeEach(() => {
    calls = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("http://localhost:7480/")) {
        calls.push([url, init]);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return origFetch(input, init);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  describe("getOverview", () => {
    it("fetches from /api/overview", async () => {
      const { getOverview } = await import("../../../dashboard-v2/src/server/functions.ts");
      await getOverview();
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toContain("/api/overview");
    });
  });

  describe("getRepos", () => {
    it("fetches from /api/repos", async () => {
      const { getRepos } = await import("../../../dashboard-v2/src/server/functions.ts");
      await getRepos();
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toContain("/api/repos");
    });
  });

  describe("getRepoDetail", () => {
    it("fetches from /api/repos/:name with encoded name", async () => {
      const { getRepoDetail } = await import("../../../dashboard-v2/src/server/functions.ts");
      await getRepoDetail({ data: { name: "vigil" } });
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toContain("/api/repos/vigil");
    });
  });

  describe("getTimeline", () => {
    it("fetches from /api/timeline with query params", async () => {
      const { getTimeline } = await import("../../../dashboard-v2/src/server/functions.ts");
      await getTimeline({ data: { status: "OBSERVE", repo: "vigil", page: 2 } });
      expect(calls).toHaveLength(1);
      const url = calls[0][0];
      expect(url).toContain("/api/timeline");
      expect(url).toContain("status=OBSERVE");
      expect(url).toContain("repo=vigil");
      expect(url).toContain("page=2");
    });
  });

  describe("getDreams", () => {
    it("fetches from /api/dreams", async () => {
      const { getDreams } = await import("../../../dashboard-v2/src/server/functions.ts");
      await getDreams();
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toContain("/api/dreams");
    });
  });

  describe("getDreamPatterns", () => {
    it("fetches from /api/dreams/patterns/:repo", async () => {
      const { getDreamPatterns } = await import("../../../dashboard-v2/src/server/functions.ts");
      await getDreamPatterns({ data: { repo: "vigil" } });
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toContain("/api/dreams/patterns/vigil");
    });
  });

  describe("getTasks", () => {
    it("fetches from /api/tasks with optional filters", async () => {
      const { getTasks } = await import("../../../dashboard-v2/src/server/functions.ts");
      await getTasks({ data: { status: "active", repo: "vigil" } });
      expect(calls).toHaveLength(1);
      const url = calls[0][0];
      expect(url).toContain("/api/tasks");
      expect(url).toContain("status=active");
      expect(url).toContain("repo=vigil");
    });
  });

  describe("getActions", () => {
    it("fetches from /api/actions", async () => {
      const { getActions } = await import("../../../dashboard-v2/src/server/functions.ts");
      await getActions({ data: {} });
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toContain("/api/actions");
    });
  });

  describe("getMemory", () => {
    it("fetches from /api/memory", async () => {
      const { getMemory } = await import("../../../dashboard-v2/src/server/functions.ts");
      await getMemory();
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toContain("/api/memory");
    });
  });

  describe("searchMemory", () => {
    it("fetches from /api/memory/search with query params", async () => {
      const { searchMemory } = await import("../../../dashboard-v2/src/server/functions.ts");
      await searchMemory({ data: { query: "test", repo: "vigil" } });
      expect(calls).toHaveLength(1);
      const url = calls[0][0];
      expect(url).toContain("/api/memory/search");
      expect(url).toContain("memq=test");
      expect(url).toContain("memrepo=vigil");
    });
  });

  describe("getMetrics", () => {
    it("fetches from /api/metrics", async () => {
      const { getMetrics } = await import("../../../dashboard-v2/src/server/functions.ts");
      await getMetrics();
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toContain("/api/metrics");
    });
  });

  describe("getScheduler", () => {
    it("fetches from /api/scheduler", async () => {
      const { getScheduler } = await import("../../../dashboard-v2/src/server/functions.ts");
      await getScheduler();
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toContain("/api/scheduler");
    });
  });
});
