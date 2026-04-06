import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { VigilConfig } from "../../core/config.ts";
import { type AskContext, AskEngine } from "../../llm/ask-engine.ts";
import { IndexTier } from "../../memory/index-tier.ts";
import { EventLog, VectorStore } from "../../memory/store.ts";
import { TopicTier } from "../../memory/topic-tier.ts";
import { mockBunSpawn, restoreBunSpawn } from "../helpers/mock-claude.ts";

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

describe("AskEngine", () => {
  let engine: AskEngine;
  let store: VectorStore;
  let askCtx: AskContext;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await import("node:os").then((os) => os.tmpdir());
    const testDir = `${tmpDir}/vigil-ask-test-${Date.now()}`;
    await import("node:fs").then((fs) => fs.mkdirSync(testDir, { recursive: true }));

    engine = new AskEngine(testConfig);
    store = new VectorStore(":memory:");
    store.init();

    askCtx = {
      repo: "test-repo",
      repoPath: testDir,
      vectorStore: store,
      topicTier: new TopicTier(`${testDir}/topics`),
      indexTier: new IndexTier(`${testDir}/index`),
      eventLog: new EventLog(`${testDir}/logs`),
    };
  });

  afterEach(() => {
    restoreBunSpawn();
    store.close();
  });

  it("returns direct answer when LLM calls answer tool immediately", async () => {
    const mock = mockBunSpawn(
      JSON.stringify({
        tool_calls: [
          {
            tool: "answer",
            args: { text: "This is a TypeScript project using Bun.", sources: ["index tier"] },
          },
        ],
        reasoning: "Checked memory index",
      }),
    );

    const result = await engine.investigate("What is this repo?", "context here", askCtx);

    expect(result.answer).toBe("This is a TypeScript project using Bun.");
    expect(result.rounds).toBe(1);
    expect(result.sources).toContain("index tier");
    mock.restore();
  });

  it("handles multi-round investigation", async () => {
    let callCount = 0;
    const originalSpawn = Bun.spawn;

    // Round 1: LLM searches memory
    // Round 2: LLM answers based on results
    (Bun as any).spawn = (_args: any[], _opts?: any) => {
      callCount++;
      const stdinChunks: string[] = [];
      let response: string;

      if (callCount === 1) {
        response = JSON.stringify({
          tool_calls: [{ tool: "search_memory", args: { query: "testing" } }],
          reasoning: "Searching for testing info",
        });
      } else {
        response = JSON.stringify({
          tool_calls: [
            {
              tool: "answer",
              args: { text: "The repo uses Bun test runner.", sources: ["memory search"] },
            },
          ],
          reasoning: "Found testing info",
        });
      }

      const blob = new Blob([response]);
      return {
        stdin: {
          write(data: string) {
            stdinChunks.push(data);
          },
          end() {},
        },
        stdout: blob.stream(),
        stderr: new Blob([""]).stream(),
        exited: Promise.resolve(0),
        pid: 999,
        kill() {},
      };
    };

    const result = await engine.investigate("How are tests run?", "context", askCtx);

    expect(result.answer).toBe("The repo uses Bun test runner.");
    expect(result.rounds).toBe(2);
    expect(callCount).toBe(2);

    (Bun as any).spawn = originalSpawn;
  });

  it("caps at max rounds and forces final answer", async () => {
    let callCount = 0;
    const originalSpawn = Bun.spawn;

    (Bun as any).spawn = (_args: any[], _opts?: any) => {
      callCount++;
      const stdinChunks: string[] = [];
      let response: string;

      if (callCount <= 5) {
        // Keep searching without answering
        response = JSON.stringify({
          tool_calls: [{ tool: "search_memory", args: { query: `search ${callCount}` } }],
          reasoning: "Still looking...",
        });
      } else {
        // Final forced answer
        response = JSON.stringify({
          tool_calls: [
            { tool: "answer", args: { text: "Forced answer after max rounds.", sources: [] } },
          ],
        });
      }

      const blob = new Blob([response]);
      return {
        stdin: {
          write(data: string) {
            stdinChunks.push(data);
          },
          end() {},
        },
        stdout: blob.stream(),
        stderr: new Blob([""]).stream(),
        exited: Promise.resolve(0),
        pid: 999,
        kill() {},
      };
    };

    const result = await engine.investigate("Complex question", "context", askCtx);

    expect(result.answer).toBe("Forced answer after max rounds.");
    // 5 rounds + 1 forced = 6 total calls
    expect(callCount).toBe(6);

    (Bun as any).spawn = originalSpawn;
  });

  it("handles plain text LLM response as direct answer", async () => {
    const mock = mockBunSpawn("Just a plain text answer with no JSON.");
    const result = await engine.investigate("Simple question", "context", askCtx);

    expect(result.answer).toBe("Just a plain text answer with no JSON.");
    expect(result.rounds).toBe(1);
    mock.restore();
  });

  it("injects memory context into initial prompt", async () => {
    // Store some memories first
    store.store({
      id: "mem1",
      timestamp: Date.now(),
      repo: "test-repo",
      type: "decision",
      content: "Active development on authentication module",
      metadata: {},
      confidence: 0.8,
    });

    const mock = mockBunSpawn(
      JSON.stringify({
        tool_calls: [{ tool: "answer", args: { text: "Auth module is active.", sources: [] } }],
      }),
    );

    await engine.investigate("What's active?", "context", askCtx);

    // Verify the prompt sent to LLM includes memory
    const calls = mock.getCalls();
    expect(calls.length).toBe(1);
    expect(calls[0].stdin).toContain("Active development on authentication module");
    mock.restore();
  });

  it("run_git rejects non-safe subcommands", async () => {
    let capturedStdin = "";
    const originalSpawn = Bun.spawn;

    (Bun as any).spawn = (_args: any[], _opts?: any) => {
      const stdinChunks: string[] = [];

      // First call: LLM tries to run git push
      // Second call: LLM answers
      const response =
        capturedStdin === ""
          ? JSON.stringify({
              tool_calls: [{ tool: "run_git", args: { command: "git push origin main" } }],
              reasoning: "Trying to push",
            })
          : JSON.stringify({
              tool_calls: [{ tool: "answer", args: { text: "Push was blocked.", sources: [] } }],
            });

      const blob = new Blob([response]);
      return {
        stdin: {
          write(data: string) {
            stdinChunks.push(data);
          },
          end() {
            capturedStdin = stdinChunks.join("");
          },
        },
        stdout: blob.stream(),
        stderr: new Blob([""]).stream(),
        exited: Promise.resolve(0),
        pid: 999,
        kill() {},
      };
    };

    const result = await engine.investigate("Push changes", "context", askCtx);
    // The error about push not being allowed should have been fed back
    expect(result.answer).toBe("Push was blocked.");

    (Bun as any).spawn = originalSpawn;
  });
});
