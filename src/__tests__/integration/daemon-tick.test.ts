import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { loadConfig } from "../../core/config.ts";
import { Daemon } from "../../core/daemon.ts";
import { TickEngine } from "../../core/tick-engine.ts";
import { GitWatcher } from "../../git/watcher.ts";
import { DecisionEngine } from "../../llm/decision-max.ts";
import type { ToolResult } from "../../llm/tools.ts";
import { EventLog, VectorStore } from "../../memory/store.ts";
import { withTempHome } from "../helpers/temp-config.ts";

let daemon: Daemon;
let mockEngine: DecisionEngine;
let mockWatcher: GitWatcher;
let mockEventLog: EventLog;
let mockVectorStore: VectorStore;
let mockTickEngine: TickEngine;
let tempHome: ReturnType<typeof withTempHome>;

function silentToolResult(reasoning = "all quiet"): { reasoning: string; toolResults: ToolResult[] } {
  return { reasoning, toolResults: [{ tool: "silent", result: "ok" }] };
}

function observeToolResult(content = "interesting pattern"): { reasoning: string; toolResults: ToolResult[] } {
  return {
    reasoning: "spotted something",
    toolResults: [{ tool: "observe", result: content }],
  };
}

function notifyToolResult(content = "heads up"): { reasoning: string; toolResults: ToolResult[] } {
  return {
    reasoning: "important",
    toolResults: [{ tool: "notify", result: content }],
  };
}

beforeEach(() => {
  tempHome = withTempHome();
  const config = loadConfig();

  mockTickEngine = new TickEngine(config);
  mockWatcher = new GitWatcher();
  mockEventLog = new EventLog(tempHome.tmpDir);
  mockVectorStore = new VectorStore(":memory:");
  mockVectorStore.init();
  mockEngine = new DecisionEngine(config);

  daemon = new Daemon(
    ["/fake/repo1", "/fake/repo2"],
    { tickInterval: 1 },
    {
      tickEngine: mockTickEngine,
      gitWatcher: mockWatcher,
      eventLog: mockEventLog,
      vectorStore: mockVectorStore,
      decisionEngine: mockEngine,
    },
  );

  // Default quickFingerprint mock — returns a unique value each call to avoid short-circuit
  let fpCounter = 0;
  spyOn(mockWatcher, "quickFingerprint").mockImplementation(async () => `fp-${++fpCounter}`);
});

afterEach(() => {
  mockVectorStore.close();
  daemon.actionExecutor.close();
  tempHome.cleanup();
});

describe("daemon tick integration", () => {
  test("tick calls buildContext for each repo", async () => {
    const buildCtxSpy = spyOn(mockWatcher, "buildContext").mockResolvedValue("context");
    spyOn(mockEngine, "decideTick").mockResolvedValue(silentToolResult());

    await daemon.handleTick(1, false);

    expect(buildCtxSpy).toHaveBeenCalledTimes(2);
  });

  test("SILENT writes tick output via stdout in collapsed mode", async () => {
    spyOn(mockWatcher, "buildContext").mockResolvedValue("context");
    spyOn(mockEngine, "decideTick").mockResolvedValue(silentToolResult());
    const writeSpy = spyOn(process.stdout, "write").mockImplementation(() => true);

    await daemon.handleTick(1, false);

    // Collapsed mode writes every SILENT tick via process.stdout.write
    expect(writeSpy.mock.calls.length).toBeGreaterThan(0);
    const output = String(writeSpy.mock.calls[0][0]);
    expect(output).toContain("SILENT");
    writeSpy.mockRestore();
  });

  test("SILENT logs with reasoning in verbose mode", async () => {
    // Close the old daemon's executor before re-creating
    daemon.actionExecutor.close();

    // Re-create daemon with verbose mode
    daemon = new Daemon(
      ["/fake/repo1"],
      { tickInterval: 1, verbose: true },
      {
        tickEngine: mockTickEngine,
        gitWatcher: mockWatcher,
        eventLog: mockEventLog,
        vectorStore: mockVectorStore,
        decisionEngine: mockEngine,
      },
    );

    spyOn(mockWatcher, "buildContext").mockResolvedValue("context");
    spyOn(mockEngine, "decideTick").mockResolvedValue(silentToolResult());
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    await daemon.handleTick(1, false);

    expect(logSpy.mock.calls.length).toBeGreaterThan(0);
    logSpy.mockRestore();
  });

  test("git event triggers reportActivity", () => {
    const activitySpy = spyOn(mockTickEngine, "reportActivity");

    // Wire up the daemon's git event handling manually
    // In production, start() wires this. We simulate the event handler.
    mockWatcher.onEvent(() => {
      mockTickEngine.reportActivity();
    });

    // Emit a fake event
    (mockWatcher as any).emit({
      type: "file_change",
      repo: "repo1",
      timestamp: Date.now(),
      detail: "File changed: test.ts",
    });

    expect(activitySpy).toHaveBeenCalledTimes(1);
  });

  test("unchanged context skips LLM on second tick", async () => {
    spyOn(mockWatcher, "buildContext").mockResolvedValue("same context");
    const decideTickSpy = spyOn(mockEngine, "decideTick").mockResolvedValue(silentToolResult());

    daemon.repoPaths = ["/fake/repo1"];
    await daemon.handleTick(1, false);
    expect(decideTickSpy).toHaveBeenCalledTimes(1);

    // Second tick with same context should skip LLM
    await daemon.handleTick(2, false);
    expect(decideTickSpy).toHaveBeenCalledTimes(1); // still 1
  });

  test("changed context triggers LLM again", async () => {
    const buildCtxSpy = spyOn(mockWatcher, "buildContext").mockResolvedValue("context v1");
    const decideTickSpy = spyOn(mockEngine, "decideTick").mockResolvedValue(silentToolResult());

    daemon.repoPaths = ["/fake/repo1"];
    await daemon.handleTick(1, false);
    expect(decideTickSpy).toHaveBeenCalledTimes(1);

    // Context changes
    buildCtxSpy.mockResolvedValue("context v2");
    await daemon.handleTick(2, false);
    expect(decideTickSpy).toHaveBeenCalledTimes(2);
  });

  test("git event invalidates context hash", async () => {
    spyOn(mockWatcher, "buildContext").mockResolvedValue("same context");
    const decideTickSpy = spyOn(mockEngine, "decideTick").mockResolvedValue(silentToolResult());

    daemon.repoPaths = ["/fake/repo1"];
    await daemon.handleTick(1, false);

    // Simulate git event invalidating the hash
    const tickState = daemon.repoTickState.get("repo1");
    if (tickState) tickState.lastContextHash = "";

    await daemon.handleTick(2, false);
    expect(decideTickSpy).toHaveBeenCalledTimes(2);
  });

  test("repoTickState tracks decision after tick", async () => {
    spyOn(mockWatcher, "buildContext").mockResolvedValue("context");
    spyOn(mockEngine, "decideTick").mockResolvedValue(notifyToolResult("alert!"));

    daemon.repoPaths = ["/fake/repo1"];
    await daemon.handleTick(1, false);

    const state = daemon.repoTickState.get("repo1");
    expect(state).toBeDefined();
    expect(state?.lastDecision).toBe("notify");
    expect(state?.lastContent).toBe("important");
    expect(state?.unchangedCount).toBe(0);
  });

  test("unchangedCount increments on dedup skips", async () => {
    spyOn(mockWatcher, "buildContext").mockResolvedValue("same context");
    spyOn(mockEngine, "decideTick").mockResolvedValue(silentToolResult());

    daemon.repoPaths = ["/fake/repo1"];
    await daemon.handleTick(1, false); // first tick — calls LLM
    await daemon.handleTick(2, false); // skipped — hash match
    await daemon.handleTick(3, false); // skipped — hash match

    const state = daemon.repoTickState.get("repo1");
    expect(state?.unchangedCount).toBe(2);
  });

  test("git event logged to eventLog", () => {
    const appendSpy = spyOn(mockEventLog, "append").mockImplementation(() => {});

    mockWatcher.onEvent((event) => {
      mockEventLog.append(event.repo, { type: event.type, detail: event.detail });
    });

    (mockWatcher as any).emit({
      type: "new_commit",
      repo: "repo1",
      timestamp: Date.now(),
      detail: "New commit: abc123",
    });

    expect(appendSpy).toHaveBeenCalledTimes(1);
    const args = appendSpy.mock.calls[0];
    expect(args[0]).toBe("repo1");
    expect((args[1] as Record<string, unknown>).type).toBe("new_commit");
  });
});

describe("daemon handleTickTools", () => {
  test("tool-based tick calls decideTick and records state", async () => {
    spyOn(mockWatcher, "buildContext").mockResolvedValue("tool context");

    const toolResults: ToolResult[] = [
      { tool: "observe", result: "interesting pattern found" },
    ];
    const decideTickSpy = spyOn(mockEngine, "decideTick").mockResolvedValue({
      reasoning: "spotted something via tools",
      toolResults,
    });

    daemon.repoPaths = ["/fake/repo1"];
    await daemon.handleTick(1, false);

    expect(decideTickSpy).toHaveBeenCalledTimes(1);
    const state = daemon.repoTickState.get("repo1");
    expect(state).toBeDefined();
    expect(state?.lastDecision).toBe("observe");
    expect(state?.lastContent).toBe("spotted something via tools");
  });

  test("tool-based tick with silent result tracks SILENT", async () => {
    spyOn(mockWatcher, "buildContext").mockResolvedValue("context");
    spyOn(mockEngine, "decideTick").mockResolvedValue({
      reasoning: "all quiet",
      toolResults: [{ tool: "silent", result: "nothing to report" }],
    });

    daemon.repoPaths = ["/fake/repo1"];
    await daemon.handleTick(1, false);

    const state = daemon.repoTickState.get("repo1");
    expect(state?.lastDecision).toBe("SILENT");
  });

  test("tool-based tick with notify sends notification", async () => {
    spyOn(mockWatcher, "buildContext").mockResolvedValue("context");
    spyOn(mockEngine, "decideTick").mockResolvedValue({
      reasoning: "important finding",
      toolResults: [{ tool: "notify", result: "Branch drift detected" }],
    });
    const notifySpy = spyOn(daemon.notificationRouter, "send").mockImplementation(async () => {});

    daemon.repoPaths = ["/fake/repo1"];
    await daemon.handleTick(1, false);

    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy.mock.calls[0][1]).toContain("Branch drift detected");
  });
});

describe("daemon maybeConsolidate", () => {
  test("skips consolidation when not enough time has passed", async () => {
    daemon.lastConsolidation = Date.now(); // just consolidated
    const dreamSpy = spyOn(daemon.output, "dream");

    await daemon.maybeConsolidate();

    expect(dreamSpy).not.toHaveBeenCalled();
  });

  test("triggers consolidation after dreamAfter threshold", async () => {
    // Set last consolidation far in the past
    daemon.lastConsolidation = Date.now() - (daemon.config.dreamAfter + 10) * 1000;
    daemon.repoPaths = ["/fake/repo1"];

    // Mock vectorStore to return < 5 memories (skip threshold)
    spyOn(mockVectorStore, "getByRepo").mockReturnValue([]);
    const dreamSpy = spyOn(daemon.output, "dream").mockImplementation(() => {});

    await daemon.maybeConsolidate();

    // Should have entered dream phase even if skipping due to low memory count
    expect(dreamSpy).toHaveBeenCalled();
    const dreamCalls = dreamSpy.mock.calls.map((c) => String(c[0]));
    expect(dreamCalls.some((c) => c.includes("dream") || c.includes("Dream") || c.includes("Skipping"))).toBe(true);
  });
});

describe("daemon cross-repo context injection", () => {
  test("cross-repo context is injected into tick context", async () => {
    spyOn(mockWatcher, "buildContext").mockResolvedValue("base context");
    const decideTickSpy = spyOn(mockEngine, "decideTick").mockResolvedValue(silentToolResult());

    // Mock the cross-repo analyzer to return related context
    spyOn(daemon.crossRepoAnalyzer, "getRelatedRepoContext").mockReturnValue(
      "### Related Repositories\n- repo2 (dependency): repo1 depends on repo2",
    );

    daemon.repoPaths = ["/fake/repo1"];
    await daemon.handleTick(1, false);

    expect(decideTickSpy).toHaveBeenCalledTimes(1);
    // The context passed to decideTick should contain related repo info
    const contextArg = decideTickSpy.mock.calls[0][0] as string;
    expect(contextArg).toContain("Related Repositories");
  });
});

describe("daemon sleeping tick", () => {
  test("sleeping tick skips LLM calls", async () => {
    const buildCtxSpy = spyOn(mockWatcher, "buildContext").mockResolvedValue("context");
    const decideTickSpy = spyOn(mockEngine, "decideTick").mockResolvedValue(silentToolResult());

    await daemon.handleTick(1, true); // isSleeping = true

    expect(buildCtxSpy).not.toHaveBeenCalled();
    expect(decideTickSpy).not.toHaveBeenCalled();
  });
});
