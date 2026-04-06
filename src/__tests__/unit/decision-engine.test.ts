import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { VigilConfig } from "../../core/config.ts";
import { DecisionEngine } from "../../llm/decision-max.ts";
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
  allowModerateActions: false,
};

describe("DecisionEngine", () => {
  let engine: DecisionEngine;
  let _mockHandle: ReturnType<typeof mockBunSpawn> | ReturnType<typeof mockBunSpawnThrow>;

  beforeEach(() => {
    engine = new DecisionEngine(testConfig);
  });

  afterEach(() => {
    restoreBunSpawn();
  });

  describe("consolidate()", () => {
    it("returns valid consolidation result", async () => {
      const response = JSON.stringify({
        summary: "Repo is stable",
        patterns: ["regular commits"],
        insights: ["active development"],
        confidence: 0.8,
      });
      _mockHandle = mockBunSpawn(response);
      const result = await engine.consolidate(["obs1", "obs2"], "existing profile");
      expect(result.summary).toBe("Repo is stable");
      expect(result.patterns).toEqual(["regular commits"]);
      expect(result.insights).toEqual(["active development"]);
      expect(result.confidence).toBe(0.8);
    });

    it("handles empty observations array", async () => {
      const response = JSON.stringify({
        summary: "No observations",
        patterns: [],
        insights: [],
        confidence: 0.1,
      });
      const mock = mockBunSpawn(response);
      _mockHandle = mock;
      const result = await engine.consolidate([], "");
      expect(result.summary).toBe("No observations");
      // LLM was still called
      expect(mock.getCalls().length).toBe(1);
    });

    it("falls back on LLM failure", async () => {
      _mockHandle = mockBunSpawnThrow(new Error("LLM down"));
      const result = await engine.consolidate(["obs1"], "");
      expect(result.summary).toBe("Consolidation failed");
      expect(result.confidence).toBe(0);
    });

    it("uses escalationModel, not tickModel", async () => {
      const response = JSON.stringify({
        summary: "test",
        patterns: [],
        insights: [],
        confidence: 0.5,
      });
      const mock = mockBunSpawn(response);
      _mockHandle = mock;
      await engine.consolidate(["obs"], "");
      const args = mock.getCalls()[0].args;
      expect(args).toContain("claude-sonnet-4-6");
    });
  });

  describe("ask()", () => {
    it("returns raw LLM answer", async () => {
      _mockHandle = mockBunSpawn("The branch is 3 commits ahead");
      const result = await engine.ask("how far ahead?", "context");
      expect(result).toBe("The branch is 3 commits ahead");
    });

    it("propagates LLM error", async () => {
      _mockHandle = mockBunSpawnThrow(new Error("LLM failed"));
      await expect(engine.ask("question", "context")).rejects.toThrow();
    });

    it("uses escalationModel", async () => {
      const mock = mockBunSpawn("answer");
      _mockHandle = mock;
      await engine.ask("question", "context");
      const args = mock.getCalls()[0].args;
      expect(args).toContain("claude-sonnet-4-6");
    });
  });
});
