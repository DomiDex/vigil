import { MessageRouter } from "../../messaging/index.ts";

/** Minimal mock daemon with only the fields the dashboard accesses */
export function createMockDaemon() {
  const messageRouter = new MessageRouter();

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
      search(_query: string, _limit = 10) {
        return [];
      },
      getByRepo(_repo: string, _limit = 20) {
        return [];
      },
      getRepoProfile(repo: string) {
        if (repo === "vigil") {
          return {
            repo: "vigil",
            summary: "Git monitoring daemon",
            patterns: ["All LLM calls route through claude -p CLI", "Tiered memory pipeline"],
            lastUpdated: Date.now(),
          };
        }
        return null;
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
          "decisions.notify": { count: 5, avg: 0, max: 0 },
          "decisions.act": { count: 1, avg: 0, max: 0 },
          "llm.decision_ms": { count: 27, avg: 1340, max: 3200 },
          "ticks.total": { count: 142, avg: 1, max: 1 },
          "ticks.sleeping": { count: 30, avg: 1, max: 1 },
          "ticks.proactive": { count: 12, avg: 1, max: 1 },
        };
      },
      getTimeSeries(_name: string, _since?: number, _bucket?: number) {
        return [
          { time: "2026-04-10T14:00:00.000Z", value: 5, count: 5 },
          { time: "2026-04-10T14:30:00.000Z", value: 8, count: 8 },
          { time: "2026-04-10T15:00:00.000Z", value: 3, count: 3 },
        ];
      },
      getRawMetrics(_name: string, _since?: number, _limit?: number) {
        return [
          { value: 1200, labels: '{"repo":"vigil"}', recorded_at: Date.now() - 60000 },
          { value: 980, labels: '{"repo":"vigil"}', recorded_at: Date.now() - 30000 },
          { value: 2100, labels: '{"repo":"vigil"}', recorded_at: Date.now() },
        ];
      },
      getMetricNames() {
        return ["decisions.silent", "decisions.observe", "ticks.total", "llm.decision_ms"];
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
          uncommittedSince: name === "vigil" ? Date.now() - 600_000 : null,
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
      sleep: {
        getNextInterval: () => 24,
      },
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
