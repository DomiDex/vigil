import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { startDashboard } from "../../dashboard/server.ts";
import { MessageRouter } from "../../messaging/index.ts";

let server: ReturnType<typeof Bun.serve>;
let port: number;
let baseUrl: string;

/** Minimal mock daemon with memory-related fields */
function createMockDaemon() {
  const messageRouter = new MessageRouter();

  const memories = [
    {
      id: "mem-1",
      repo: "vigil",
      type: "decision",
      content: "Decision Engine Hardening landed at b2e5501",
      metadata: "{}",
      confidence: 0.92,
      created_at: Date.now() - 3600_000,
      updated_at: Date.now() - 3600_000,
    },
    {
      id: "mem-2",
      repo: "vigil",
      type: "insight",
      content: "Decision distribution targets: SILENT 80%, OBSERVE 15%",
      metadata: "{}",
      confidence: 0.78,
      created_at: Date.now() - 7200_000,
      updated_at: Date.now() - 7200_000,
    },
    {
      id: "mem-3",
      repo: "vigil",
      type: "consolidated",
      content: "DecisionEngine strips ANTHROPIC_API_KEY from env",
      metadata: "{}",
      confidence: 0.61,
      created_at: Date.now() - 10800_000,
      updated_at: Date.now() - 10800_000,
    },
    {
      id: "mem-4",
      repo: "other",
      type: "git_event",
      content: "New commit on feature branch",
      metadata: "{}",
      confidence: 0.5,
      created_at: Date.now() - 1800_000,
      updated_at: Date.now() - 1800_000,
    },
  ];

  return {
    config: {
      tickInterval: 30,
      sleepTickInterval: 300,
      tickModel: "claude-haiku-4-5-20251001",
      escalationModel: "claude-sonnet-4-6",
      sleepAfter: 900,
    },
    repoPaths: ["/home/user/projects/vigil", "/home/user/projects/other"],
    messageRouter,
    vectorStore: {
      search(query: string, limit = 10) {
        return memories
          .filter((m) => m.content.toLowerCase().includes(query.toLowerCase()))
          .slice(0, limit)
          .map((m) => ({
            id: m.id,
            repo: m.repo,
            type: m.type,
            content: m.content,
            metadata: JSON.parse(m.metadata),
            confidence: m.confidence,
            timestamp: m.created_at,
          }));
      },
      getByRepo(repo: string, limit = 20) {
        return memories
          .filter((m) => m.repo === repo)
          .slice(0, limit)
          .map((m) => ({
            id: m.id,
            repo: m.repo,
            type: m.type,
            content: m.content,
            metadata: JSON.parse(m.metadata),
            confidence: m.confidence,
            timestamp: m.created_at,
          }));
      },
      getRepoProfile(repo: string) {
        if (repo === "vigil") {
          return {
            repo: "vigil",
            summary: "Git monitoring daemon with tiered memory",
            patterns: ["LLM via claude -p", "Tiered memory pipeline"],
            lastUpdated: Date.now(),
          };
        }
        return null;
      },
      getAllRepoProfiles() {
        return [
          {
            repo: "vigil",
            summary: "Git monitoring daemon with tiered memory",
            patterns: ["LLM via claude -p", "Tiered memory pipeline"],
            lastUpdated: Date.now(),
          },
        ];
      },
      getConsolidatedHistory(_options?: { repo?: string; limit?: number }) {
        return [];
      },
      // Expose mock db for pipeline stats
      db: {
        query(sql: string) {
          if (sql.includes("GROUP BY type")) {
            return {
              all: () => [
                { type: "decision", cnt: 1 },
                { type: "insight", cnt: 1 },
                { type: "consolidated", cnt: 1 },
                { type: "git_event", cnt: 1 },
              ],
            };
          }
          if (sql.includes("COUNT(*)")) {
            return { get: () => ({ cnt: memories.length }) };
          }
          return { all: () => [], get: () => null };
        },
      },
    },
    eventLog: {
      query(_options: any) {
        return [];
      },
    },
    metrics: {
      getSummary() {
        return {
          "decisions.silent": { count: 80, avg: 0, max: 0 },
          "decisions.observe": { count: 14, avg: 0, max: 0 },
          "ticks.total": { count: 142, avg: 1, max: 1 },
        };
      },
      getTimeSeries() {
        return [];
      },
      getRawMetrics() {
        return [];
      },
      getMetricNames() {
        return [];
      },
    },
    userReply: {
      pendingReplies: [] as any[],
      drain() {
        const r = [...this.pendingReplies];
        this.pendingReplies = [];
        return r;
      },
    },
    gitWatcher: {
      getRepoState(path: string) {
        const name = path.split("/").pop();
        return {
          path,
          name,
          lastCommitHash: "b19bbac1234567890",
          currentBranch: "main",
          uncommittedSince: null,
          lastReflogHash: "abc123",
          knownCommitSHAs: new Set(["b19bbac"]),
        };
      },
    },
    tickEngine: {
      currentTick: 42,
      isSleeping: false,
      paused: false,
      lastTickAt: Date.now() - 12_000,
      handlers: [],
      sleep: { getNextInterval: () => 24 },
      onTick(handler: any) {
        this.handlers.push(handler);
      },
    },
    session: {
      id: "e37c73e5-1234-5678-9abc-def012345678",
      startedAt: Date.now() - 15_120_000,
      tickCount: 42,
    },
  } as any;
}

beforeEach(() => {
  port = 40000 + Math.floor(Math.random() * 10000);
  baseUrl = `http://localhost:${port}`;
});

afterEach(() => {
  if (server) server.stop(true);
});

// ── Phase 5: Memory & Dreams ──────────────────────

describe("GET /api/memory", () => {
  test("returns pipeline stats and profiles", async () => {
    const daemon = createMockDaemon();
    server = await startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/memory`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const data = await res.json();

    // Pipeline section
    expect(data.pipeline).toBeTruthy();
    expect(data.pipeline.eventLog).toBeTruthy();
    expect(typeof data.pipeline.eventLog.count).toBe("number");
    expect(data.pipeline.vectorStore).toBeTruthy();
    expect(data.pipeline.vectorStore.count).toBe(4);
    expect(data.pipeline.vectorStore.types).toBeTruthy();
    expect(data.pipeline.vectorStore.types.decision).toBe(1);
    expect(data.pipeline.vectorStore.types.insight).toBe(1);
    expect(data.pipeline.topicTier).toBeTruthy();
    expect(typeof data.pipeline.topicTier.count).toBe("number");
    expect(data.pipeline.indexTier).toBeTruthy();
    expect(typeof data.pipeline.indexTier.count).toBe("number");

    // Profiles
    expect(data.profiles).toBeArray();
    expect(data.profiles).toHaveLength(1);
    expect(data.profiles[0].repo).toBe("vigil");
    expect(data.profiles[0].summary).toContain("Git monitoring");
    expect(data.profiles[0].patternCount).toBe(2);
  });
});

describe("GET /api/memory/search", () => {
  test("returns ranked results for matching query", async () => {
    const daemon = createMockDaemon();
    server = await startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/memory/search?memq=Decision`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.results).toBeArray();
    expect(data.results.length).toBeGreaterThan(0);
    for (const r of data.results) {
      expect(r.content.toLowerCase()).toContain("decision");
      expect(r.id).toBeTruthy();
      expect(r.repo).toBeTruthy();
      expect(r.type).toBeTruthy();
      expect(typeof r.confidence).toBe("number");
    }
  });

  test("filters by repo when specified", async () => {
    const daemon = createMockDaemon();
    server = await startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/memory/search?memq=Decision&memrepo=vigil`);
    const data = await res.json();

    for (const r of data.results) {
      expect(r.repo).toBe("vigil");
    }
  });

  test("returns empty results for no query", async () => {
    const daemon = createMockDaemon();
    server = await startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/memory/search?memq=`);
    const data = await res.json();
    expect(data.results).toHaveLength(0);
  });

  test("returns empty results for non-matching query", async () => {
    const daemon = createMockDaemon();
    server = await startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/memory/search?memq=xyznonexistent`);
    const data = await res.json();
    expect(data.results).toHaveLength(0);
  });
});

describe("GET /api/dreams", () => {
  test("returns dreams array and status", async () => {
    const daemon = createMockDaemon();
    server = await startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/dreams`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.dreams).toBeArray();
    expect(data.status).toBeTruthy();
    expect(typeof data.status.running).toBe("boolean");
  });
});

describe("GET /api/dreams/patterns/:repo", () => {
  test("returns patterns for known repo", async () => {
    const daemon = createMockDaemon();
    server = await startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/dreams/patterns/vigil`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.repo).toBe("vigil");
    expect(data.patterns).toBeArray();
    expect(data.patterns).toContain("LLM via claude -p");
    expect(data.patterns).toContain("Tiered memory pipeline");
  });

  test("returns empty patterns for unknown repo", async () => {
    const daemon = createMockDaemon();
    server = await startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/dreams/patterns/nonexistent`);
    const data = await res.json();

    expect(data.repo).toBe("nonexistent");
    expect(data.patterns).toHaveLength(0);
  });
});

describe("POST /api/memory/ask", () => {
  test("returns error JSON for empty question", async () => {
    const daemon = createMockDaemon();
    server = await startDashboard(daemon, port);

    const form = new FormData();
    form.set("askq", "");

    const res = await fetch(`${baseUrl}/api/memory/ask`, {
      method: "POST",
      body: form,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const data = await res.json();
    expect(data.error).toContain("Please enter a question");
  });

  test("returns error JSON for unknown repo", async () => {
    const daemon = createMockDaemon();
    daemon.repoPaths = [];
    server = await startDashboard(daemon, port);

    const form = new FormData();
    form.set("askq", "What patterns exist?");
    form.set("askrepo", "nonexistent");

    const res = await fetch(`${baseUrl}/api/memory/ask`, {
      method: "POST",
      body: form,
    });
    expect(res.headers.get("content-type")).toContain("application/json");
    const data = await res.json();
    expect(data.error).toContain("not found");
  });
});
