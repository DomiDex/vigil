import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { loadConfig } from "../../core/config.ts";
import { Daemon } from "../../core/daemon.ts";
import { TickEngine } from "../../core/tick-engine.ts";
import { GitWatcher } from "../../git/watcher.ts";
import { DecisionEngine } from "../../llm/decision-max.ts";
import { EventLog, type MemoryEntry, VectorStore } from "../../memory/store.ts";
import { withTempHome } from "../helpers/temp-config.ts";

let daemon: Daemon;
let mockEngine: DecisionEngine;
let mockWatcher: GitWatcher;
let mockEventLog: EventLog;
let mockVectorStore: VectorStore;
let mockTickEngine: TickEngine;
let tempHome: ReturnType<typeof withTempHome>;

function fakeMemories(count: number, repo: string): MemoryEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `mem-${i}`,
    timestamp: Date.now() - i * 1000,
    repo,
    type: "decision" as const,
    content: `observation ${i}`,
    metadata: {},
    confidence: 0.5,
  }));
}

function fakeConsolidationResult() {
  return {
    summary: "Repo shows active development with feature branching",
    patterns: ["frequent-commits", "branch-per-feature"],
    insights: ["Team follows trunk-based development"],
    confidence: 0.8,
  };
}

beforeEach(() => {
  tempHome = withTempHome();
  const config = loadConfig();
  config.dreamAfter = 0; // trigger immediately

  mockTickEngine = new TickEngine(config);
  mockWatcher = new GitWatcher();
  mockEventLog = new EventLog(tempHome.tmpDir);
  mockVectorStore = new VectorStore(":memory:");
  mockVectorStore.init();
  mockEngine = new DecisionEngine(config);

  daemon = new Daemon(
    ["/fake/repo1"],
    { tickInterval: 1 },
    {
      tickEngine: mockTickEngine,
      gitWatcher: mockWatcher,
      eventLog: mockEventLog,
      vectorStore: mockVectorStore,
      decisionEngine: mockEngine,
    },
  );
  daemon.config.dreamAfter = 0;
  daemon.lastConsolidation = 0;
});

afterEach(() => {
  mockVectorStore.close();
  daemon.actionExecutor.close();
  tempHome.cleanup();
});

describe("daemon dream integration", () => {
  test("maybeConsolidate calls consolidate when memories exist", async () => {
    daemon.observationsSinceLastDream = 5;
    spyOn(mockVectorStore, "getByRepo").mockReturnValue(fakeMemories(5, "repo1"));
    const consolidateSpy = spyOn(mockEngine, "consolidate").mockResolvedValue(fakeConsolidationResult());
    spyOn(mockVectorStore, "storeConsolidated").mockImplementation(() => {});
    spyOn(mockVectorStore, "saveRepoProfile").mockImplementation(() => {});
    spyOn(mockVectorStore, "prune").mockReturnValue(0);
    spyOn(console, "log").mockImplementation(() => {});

    await daemon.maybeConsolidate();

    expect(consolidateSpy).toHaveBeenCalledTimes(1);
    const observations = consolidateSpy.mock.calls[0][0] as string[];
    expect(observations.length).toBe(5);
  });

  test("maybeConsolidate skips repo with 0 memories", async () => {
    daemon.observationsSinceLastDream = 5;
    spyOn(mockVectorStore, "getByRepo").mockReturnValue([]);
    const consolidateSpy = spyOn(mockEngine, "consolidate");
    spyOn(mockVectorStore, "prune").mockReturnValue(0);
    spyOn(console, "log").mockImplementation(() => {});

    await daemon.maybeConsolidate();

    expect(consolidateSpy).not.toHaveBeenCalled();
  });

  test("maybeConsolidate stores consolidated result and profile", async () => {
    daemon.observationsSinceLastDream = 5;
    spyOn(mockVectorStore, "getByRepo").mockReturnValue(fakeMemories(5, "repo1"));
    spyOn(mockEngine, "consolidate").mockResolvedValue(fakeConsolidationResult());
    const storeConsolSpy = spyOn(mockVectorStore, "storeConsolidated").mockImplementation(() => {});
    const saveProfileSpy = spyOn(mockVectorStore, "saveRepoProfile").mockImplementation(() => {});
    spyOn(mockVectorStore, "prune").mockReturnValue(0);
    spyOn(console, "log").mockImplementation(() => {});

    await daemon.maybeConsolidate();

    expect(storeConsolSpy).toHaveBeenCalledTimes(1);
    const storeArgs = storeConsolSpy.mock.calls[0];
    expect(storeArgs[1]).toBe("repo1");
    expect(storeArgs[2]).toBe("Repo shows active development with feature branching");

    expect(saveProfileSpy).toHaveBeenCalledTimes(1);
    const profile = saveProfileSpy.mock.calls[0][0];
    expect(profile.repo).toBe("repo1");
    expect(profile.summary).toBe("Repo shows active development with feature branching");
    expect(profile.patterns).toEqual(["frequent-commits", "branch-per-feature"]);
  });

  test("maybeConsolidate resets lastConsolidation", async () => {
    daemon.observationsSinceLastDream = 5;
    spyOn(mockVectorStore, "getByRepo").mockReturnValue(fakeMemories(5, "repo1"));
    spyOn(mockEngine, "consolidate").mockResolvedValue(fakeConsolidationResult());
    spyOn(mockVectorStore, "storeConsolidated").mockImplementation(() => {});
    spyOn(mockVectorStore, "saveRepoProfile").mockImplementation(() => {});
    spyOn(mockVectorStore, "prune").mockReturnValue(0);
    spyOn(console, "log").mockImplementation(() => {});

    const before = Date.now();
    await daemon.maybeConsolidate();

    expect(daemon.lastConsolidation).toBeGreaterThanOrEqual(before);
  });

  test("maybeConsolidate resets observationsSinceLastDream", async () => {
    daemon.observationsSinceLastDream = 10;
    spyOn(mockVectorStore, "getByRepo").mockReturnValue(fakeMemories(5, "repo1"));
    spyOn(mockEngine, "consolidate").mockResolvedValue(fakeConsolidationResult());
    spyOn(mockVectorStore, "storeConsolidated").mockImplementation(() => {});
    spyOn(mockVectorStore, "saveRepoProfile").mockImplementation(() => {});
    spyOn(mockVectorStore, "prune").mockReturnValue(0);
    spyOn(console, "log").mockImplementation(() => {});

    await daemon.maybeConsolidate();

    expect(daemon.observationsSinceLastDream).toBe(0);
  });

  test("maybeConsolidate checks dreamAfter threshold", async () => {
    daemon.config.dreamAfter = 9999;
    daemon.lastConsolidation = Date.now();
    const consolidateSpy = spyOn(mockEngine, "consolidate");

    await daemon.maybeConsolidate();

    expect(consolidateSpy).not.toHaveBeenCalled();
  });

  test("maybeConsolidate prunes stale memories", async () => {
    daemon.observationsSinceLastDream = 5;
    spyOn(mockVectorStore, "getByRepo").mockReturnValue(fakeMemories(5, "repo1"));
    spyOn(mockEngine, "consolidate").mockResolvedValue(fakeConsolidationResult());
    spyOn(mockVectorStore, "storeConsolidated").mockImplementation(() => {});
    spyOn(mockVectorStore, "saveRepoProfile").mockImplementation(() => {});
    const pruneSpy = spyOn(mockVectorStore, "prune").mockReturnValue(3);
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    await daemon.maybeConsolidate();

    expect(pruneSpy).toHaveBeenCalledTimes(1);
    const logOutput = logSpy.mock.calls.map((c) => String(c[0])).join(" ");
    expect(logOutput).toContain("Pruned 3");
    logSpy.mockRestore();
  });

  test("maybeConsolidate pauses and resumes tick engine", async () => {
    daemon.observationsSinceLastDream = 5;
    spyOn(mockVectorStore, "getByRepo").mockReturnValue(fakeMemories(5, "repo1"));
    spyOn(mockEngine, "consolidate").mockResolvedValue(fakeConsolidationResult());
    spyOn(mockVectorStore, "storeConsolidated").mockImplementation(() => {});
    spyOn(mockVectorStore, "saveRepoProfile").mockImplementation(() => {});
    spyOn(mockVectorStore, "prune").mockReturnValue(0);
    spyOn(console, "log").mockImplementation(() => {});

    const pauseSpy = spyOn(mockTickEngine, "pause");
    const resumeSpy = spyOn(mockTickEngine, "resume");

    await daemon.maybeConsolidate();

    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(resumeSpy).toHaveBeenCalledTimes(1);
  });

  test("multiple repos consolidated sequentially", async () => {
    daemon.repoPaths = ["/fake/repo1", "/fake/repo2"];
    daemon.observationsSinceLastDream = 5;
    spyOn(mockVectorStore, "getByRepo").mockImplementation((repo: string) => {
      return fakeMemories(5, repo);
    });
    const consolidateSpy = spyOn(mockEngine, "consolidate").mockResolvedValue(fakeConsolidationResult());
    spyOn(mockVectorStore, "storeConsolidated").mockImplementation(() => {});
    spyOn(mockVectorStore, "saveRepoProfile").mockImplementation(() => {});
    spyOn(mockVectorStore, "prune").mockReturnValue(0);
    spyOn(console, "log").mockImplementation(() => {});

    await daemon.maybeConsolidate();

    expect(consolidateSpy).toHaveBeenCalledTimes(2);
  });
});
