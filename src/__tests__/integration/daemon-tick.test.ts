import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { loadConfig } from "../../core/config.ts";
import { Daemon } from "../../core/daemon.ts";
import { TickEngine } from "../../core/tick-engine.ts";
import { GitWatcher } from "../../git/watcher.ts";
import { DecisionEngine } from "../../llm/decision-max.ts";
import { EventLog, VectorStore } from "../../memory/store.ts";
import { withTempHome } from "../helpers/temp-config.ts";

let daemon: Daemon;
let mockEngine: DecisionEngine;
let mockWatcher: GitWatcher;
let mockEventLog: EventLog;
let mockVectorStore: VectorStore;
let mockTickEngine: TickEngine;
let tempHome: ReturnType<typeof withTempHome>;

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
});

afterEach(() => {
  mockVectorStore.close();
  daemon.actionExecutor.close();
  tempHome.cleanup();
});

describe("daemon tick integration", () => {
  test("tick calls buildContext for each repo", async () => {
    const buildCtxSpy = spyOn(mockWatcher, "buildContext").mockResolvedValue("context");
    spyOn(mockEngine, "decide").mockResolvedValue({ decision: "SILENT", reasoning: "all quiet", confidence: 0.5 });

    await daemon.handleTick(1, false);

    expect(buildCtxSpy).toHaveBeenCalledTimes(2);
  });

  test("SILENT decision logs on first ticks", async () => {
    spyOn(mockWatcher, "buildContext").mockResolvedValue("context");
    spyOn(mockEngine, "decide").mockResolvedValue({ decision: "SILENT", reasoning: "all quiet", confidence: 0.5 });
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    await daemon.handleTick(1, false);

    // Tick 1 is <= 3, so SILENT should be logged
    expect(logSpy.mock.calls.length).toBeGreaterThan(0);
    const output = logSpy.mock.calls.map((c) => String(c[0])).join(" ");
    expect(output).toContain("tick 1");
    logSpy.mockRestore();
  });

  test("OBSERVE stores memory in vectorStore", async () => {
    spyOn(mockWatcher, "buildContext").mockResolvedValue("context");
    spyOn(mockEngine, "decide").mockResolvedValue({
      decision: "OBSERVE",
      reasoning: "interesting pattern",
      content: "Developer has uncommitted changes for 2 hours",
      confidence: 0.6,
    });
    spyOn(console, "log").mockImplementation(() => {});

    daemon.repoPaths = ["/fake/repo1"];
    await daemon.handleTick(1, false);

    const memories = mockVectorStore.getByRepo("repo1", 10);
    expect(memories.length).toBe(1);
    expect(memories[0].content).toContain("uncommitted changes");
    expect(memories[0].type).toBe("decision");
  });

  test("NOTIFY sends notification", async () => {
    spyOn(mockWatcher, "buildContext").mockResolvedValue("context");
    spyOn(mockEngine, "decide").mockResolvedValue({
      decision: "NOTIFY",
      reasoning: "important finding",
      content: "Branch drift detected",
      confidence: 0.8,
    });
    spyOn(console, "log").mockImplementation(() => {});
    const notifySpy = spyOn(daemon.notifier, "send").mockImplementation(async () => {});

    daemon.repoPaths = ["/fake/repo1"];
    await daemon.handleTick(1, false);

    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(String(notifySpy.mock.calls[0][1])).toContain("Branch drift detected");
  });

  test("ACT sends warning notification", async () => {
    spyOn(mockWatcher, "buildContext").mockResolvedValue("context");
    spyOn(mockEngine, "decide").mockResolvedValue({
      decision: "ACT",
      reasoning: "needs action",
      action: "Run tests immediately",
      confidence: 0.9,
    });
    spyOn(console, "log").mockImplementation(() => {});
    const notifySpy = spyOn(daemon.notifier, "send").mockImplementation(async () => {});

    daemon.repoPaths = ["/fake/repo1"];
    await daemon.handleTick(1, false);

    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy.mock.calls[0][2]).toBe("warning");
  });

  test("git event triggers reportActivity", () => {
    const activitySpy = spyOn(mockTickEngine, "reportActivity");

    mockWatcher.onEvent(() => {
      mockTickEngine.reportActivity();
    });

    (mockWatcher as any).emit({
      type: "file_change",
      repo: "repo1",
      timestamp: Date.now(),
      detail: "File changed: test.ts",
    });

    expect(activitySpy).toHaveBeenCalledTimes(1);
  });

  test("observationsSinceLastDream increments on OBSERVE", async () => {
    spyOn(mockWatcher, "buildContext").mockResolvedValue("context");
    spyOn(mockEngine, "decide").mockResolvedValue({
      decision: "OBSERVE",
      reasoning: "noticed something",
      content: "test observation",
      confidence: 0.5,
    });
    spyOn(console, "log").mockImplementation(() => {});

    daemon.repoPaths = ["/fake/repo1"];
    const before = daemon.observationsSinceLastDream;
    await daemon.handleTick(1, false);

    expect(daemon.observationsSinceLastDream).toBe(before + 1);
  });

  test("observationsSinceLastDream increments on NOTIFY", async () => {
    spyOn(mockWatcher, "buildContext").mockResolvedValue("context");
    spyOn(mockEngine, "decide").mockResolvedValue({
      decision: "NOTIFY",
      reasoning: "alert",
      content: "heads up",
      confidence: 0.7,
    });
    spyOn(console, "log").mockImplementation(() => {});
    spyOn(daemon.notifier, "send").mockImplementation(async () => {});

    daemon.repoPaths = ["/fake/repo1"];
    await daemon.handleTick(1, false);

    expect(daemon.observationsSinceLastDream).toBeGreaterThan(0);
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

  test("cross-repo context injected when watching multiple repos", async () => {
    spyOn(mockWatcher, "buildContext").mockResolvedValue("base context");
    const decideSpy = spyOn(mockEngine, "decide").mockResolvedValue({
      decision: "SILENT",
      reasoning: "quiet",
      confidence: 0.5,
    });

    spyOn(daemon.crossRepoAnalyzer, "getRelatedRepoContext").mockReturnValue(
      "### Related Repositories\n- repo2 (dependency): repo1 depends on repo2",
    );

    await daemon.handleTick(1, false);

    // decide() should have been called with context containing related repo info
    expect(decideSpy).toHaveBeenCalled();
    const contextArg = String(decideSpy.mock.calls[0][0]);
    expect(contextArg).toContain("Related Repositories");
  });
});

describe("daemon maybeConsolidate", () => {
  test("skips consolidation when not enough time has passed", async () => {
    daemon.lastConsolidation = Date.now();
    daemon.config.dreamAfter = 9999;
    const consolidateSpy = spyOn(mockEngine, "consolidate");

    await daemon.maybeConsolidate();

    expect(consolidateSpy).not.toHaveBeenCalled();
  });

  test("skips consolidation when no observations since last dream", async () => {
    daemon.lastConsolidation = 0;
    daemon.config.dreamAfter = 0;
    daemon.observationsSinceLastDream = 0;
    const consolidateSpy = spyOn(mockEngine, "consolidate");

    await daemon.maybeConsolidate();

    expect(consolidateSpy).not.toHaveBeenCalled();
  });

  test("triggers consolidation when threshold met and observations exist", async () => {
    daemon.lastConsolidation = 0;
    daemon.config.dreamAfter = 0;
    daemon.observationsSinceLastDream = 5;
    daemon.repoPaths = ["/fake/repo1"];

    spyOn(mockVectorStore, "getByRepo").mockReturnValue([
      { id: "m1", timestamp: Date.now(), repo: "repo1", type: "decision", content: "obs 1", metadata: {}, confidence: 0.5 },
    ]);
    const consolidateSpy = spyOn(mockEngine, "consolidate").mockResolvedValue({
      summary: "Active development",
      patterns: ["frequent commits"],
      insights: ["good flow"],
      confidence: 0.8,
    });
    spyOn(mockVectorStore, "storeConsolidated").mockImplementation(() => {});
    spyOn(mockVectorStore, "saveRepoProfile").mockImplementation(() => {});
    spyOn(mockVectorStore, "prune").mockReturnValue(0);
    spyOn(console, "log").mockImplementation(() => {});

    await daemon.maybeConsolidate();

    expect(consolidateSpy).toHaveBeenCalledTimes(1);
  });
});

describe("daemon sleeping tick", () => {
  test("sleeping tick skips LLM calls", async () => {
    const buildCtxSpy = spyOn(mockWatcher, "buildContext").mockResolvedValue("context");
    const decideSpy = spyOn(mockEngine, "decide").mockResolvedValue({
      decision: "SILENT",
      reasoning: "all quiet",
      confidence: 0.5,
    });

    await daemon.handleTick(1, true); // isSleeping = true

    expect(buildCtxSpy).not.toHaveBeenCalled();
    expect(decideSpy).not.toHaveBeenCalled();
  });
});
