import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { VigilConfig } from "../../core/config.ts";
import { DecisionEngine, resetCircuitBreaker } from "../../llm/decision-max.ts";
import type { MemoryEntry, RepoProfile } from "../../memory/store.ts";
import { mockBunSpawn, mockBunSpawnThrow, restoreBunSpawn } from "../helpers/mock-claude.ts";

const testConfig: VigilConfig = {
  tickInterval: 30,
  blockingBudget: 15,
  sleepAfter: 900,
  sleepTickInterval: 300,
  dreamAfter: 300,
  tickModel: "claude-haiku-4-5-20251001",
  escalationModel: "claude-sonnet-4-6",
  maxEventWindow: 100,
  notifyBackends: ["file"],
  webhookUrl: "",
  desktopNotify: true,
  allowModerateActions: false,
};

const sampleMemories: MemoryEntry[] = [
  {
    id: "m1",
    timestamp: Date.now(),
    repo: "frontend",
    type: "decision",
    content: "Updated shared auth component",
    metadata: {},
    confidence: 0.8,
  },
  {
    id: "m2",
    timestamp: Date.now() - 1000,
    repo: "backend",
    type: "decision",
    content: "Auth middleware refactored",
    metadata: {},
    confidence: 0.7,
  },
];

const sampleProfiles: RepoProfile[] = [
  {
    repo: "frontend",
    summary: "React frontend with auth integration",
    patterns: ["daily commits", "shared auth hooks"],
    lastUpdated: Date.now(),
  },
  {
    repo: "backend",
    summary: "Express API with auth middleware",
    patterns: ["weekly releases", "auth endpoints"],
    lastUpdated: Date.now(),
  },
];

describe("DecisionEngine.analyzeCrossRepo", () => {
  let engine: DecisionEngine;

  beforeEach(() => {
    resetCircuitBreaker();
    engine = new DecisionEngine(testConfig);
  });

  afterEach(() => {
    restoreBunSpawn();
  });

  it("returns valid cross-repo analysis", async () => {
    const response = JSON.stringify({
      patterns: ["Auth changes correlate across frontend and backend"],
      risks: ["Shared auth dependency could break both repos"],
      insights: ["Consider a shared auth library"],
    });
    mockBunSpawn(response);

    const result = await engine.analyzeCrossRepo(sampleMemories, sampleProfiles);

    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0]).toContain("Auth");
    expect(result.risks).toHaveLength(1);
    expect(result.insights).toHaveLength(1);
  });

  it("uses escalation model for cross-repo analysis", async () => {
    const response = JSON.stringify({
      patterns: [],
      risks: [],
      insights: [],
    });
    const mock = mockBunSpawn(response);

    await engine.analyzeCrossRepo(sampleMemories, sampleProfiles);

    const args = mock.getCalls()[0].args;
    expect(args).toContain("claude-sonnet-4-6");
  });

  it("handles LLM failure gracefully", async () => {
    mockBunSpawnThrow(new Error("LLM down"));

    const result = await engine.analyzeCrossRepo(sampleMemories, sampleProfiles);

    expect(result.patterns).toEqual([]);
    expect(result.risks).toEqual([]);
    expect(result.insights).toEqual([]);
  });

  it("handles malformed LLM response", async () => {
    mockBunSpawn("This is not JSON at all");

    const result = await engine.analyzeCrossRepo(sampleMemories, sampleProfiles);

    expect(result.patterns).toEqual([]);
    expect(result.risks).toEqual([]);
    expect(result.insights).toEqual([]);
  });

  it("handles empty memories and profiles", async () => {
    const response = JSON.stringify({
      patterns: [],
      risks: [],
      insights: ["No cross-repo activity detected"],
    });
    mockBunSpawn(response);

    const result = await engine.analyzeCrossRepo([], []);

    expect(result.insights).toHaveLength(1);
  });

  it("includes repo profiles and memories in prompt", async () => {
    const response = JSON.stringify({
      patterns: [],
      risks: [],
      insights: [],
    });
    const mock = mockBunSpawn(response);

    await engine.analyzeCrossRepo(sampleMemories, sampleProfiles);

    const stdin = mock.getCalls()[0].stdin;
    expect(stdin).toContain("frontend");
    expect(stdin).toContain("backend");
    expect(stdin).toContain("React frontend");
    expect(stdin).toContain("Updated shared auth component");
  });
});
