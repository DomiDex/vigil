import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

function writeDreamResult(dataDir: string, repo: string, memCount: number) {
  const resultPath = join(dataDir, `dream-result-${repo}.json`);
  writeFileSync(
    resultPath,
    JSON.stringify({
      repo,
      result: fakeConsolidationResult(),
      sourceIds: Array.from({ length: memCount }, (_, i) => `mem-${i}`),
      completedAt: Date.now(),
    }),
  );
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
  // Force dreamAfter to 0 so consolidation triggers
  daemon.config.dreamAfter = 0;
  // Set lastConsolidation far in the past
  daemon.lastConsolidation = 0;
});

afterEach(() => {
  mockVectorStore.close();
  daemon.actionExecutor.close();
  tempHome.cleanup();
});

describe("daemon dream integration", () => {
  test("maybeConsolidate spawns dream worker when memories exist", async () => {
    spyOn(mockVectorStore, "getByRepo").mockReturnValue(fakeMemories(5, "repo1"));
    const spawnSpy = spyOn(Bun, "spawn").mockReturnValue({
      pid: 1234,
      exited: Promise.resolve(0),
    } as any);

    await daemon.maybeConsolidate();

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const args = spawnSpy.mock.calls[0][0] as string[];
    expect(args).toContain("src/memory/dream-worker.ts");
    expect(args).toContain("repo1");
    spawnSpy.mockRestore();
  });

  test("maybeConsolidate skips repo with 0 memories", async () => {
    spyOn(mockVectorStore, "getByRepo").mockReturnValue([]);
    const spawnSpy = spyOn(Bun, "spawn").mockReturnValue({
      pid: 1234,
      exited: Promise.resolve(0),
    } as any);

    await daemon.maybeConsolidate();

    expect(spawnSpy).not.toHaveBeenCalled();
    spawnSpy.mockRestore();
  });

  test("maybeConsolidate skips repo with fewer than 5 memories", async () => {
    spyOn(mockVectorStore, "getByRepo").mockReturnValue(fakeMemories(4, "repo1"));
    const spawnSpy = spyOn(Bun, "spawn").mockReturnValue({
      pid: 1234,
      exited: Promise.resolve(0),
    } as any);

    await daemon.maybeConsolidate();

    expect(spawnSpy).not.toHaveBeenCalled();
    spawnSpy.mockRestore();
  });

  test("maybeConsolidate resets lastConsolidation", async () => {
    spyOn(mockVectorStore, "getByRepo").mockReturnValue(fakeMemories(5, "repo1"));
    const spawnSpy = spyOn(Bun, "spawn").mockReturnValue({
      pid: 1234,
      exited: Promise.resolve(0),
    } as any);

    const before = Date.now();
    await daemon.maybeConsolidate();

    expect(daemon.lastConsolidation).toBeGreaterThanOrEqual(before);
    spawnSpy.mockRestore();
  });

  test("maybeConsolidate checks dreamAfter threshold", async () => {
    daemon.config.dreamAfter = 9999;
    daemon.lastConsolidation = Date.now();
    const spawnSpy = spyOn(Bun, "spawn").mockReturnValue({
      pid: 1234,
      exited: Promise.resolve(0),
    } as any);

    await daemon.maybeConsolidate();

    expect(spawnSpy).not.toHaveBeenCalled();
    spawnSpy.mockRestore();
  });

  test("collectDreamResults reads result files and stores", () => {
    const dataDir = join(tempHome.tmpDir, ".vigil", "data");
    mkdirSync(dataDir, { recursive: true });
    writeDreamResult(dataDir, "repo1", 3);

    const storeConsolSpy = spyOn(mockVectorStore, "storeConsolidated").mockImplementation(() => {});
    const saveProfileSpy = spyOn(mockVectorStore, "saveRepoProfile").mockImplementation(() => {});

    const found = daemon.collectDreamResults();

    expect(found).toBe(true);
    expect(storeConsolSpy).toHaveBeenCalledTimes(1);
    const args = storeConsolSpy.mock.calls[0];
    expect(args[1]).toBe("repo1");
    expect(args[2]).toBe("Repo shows active development with feature branching");
    expect(args[3]).toEqual(["mem-0", "mem-1", "mem-2"]);

    expect(saveProfileSpy).toHaveBeenCalledTimes(1);
    const profile = saveProfileSpy.mock.calls[0][0];
    expect(profile.repo).toBe("repo1");
    expect(profile.summary).toBe("Repo shows active development with feature branching");
    expect(profile.patterns).toEqual(["frequent-commits", "branch-per-feature"]);
  });

  test("collectDreamResults returns false when no results", () => {
    const found = daemon.collectDreamResults();
    expect(found).toBe(false);
  });

  test("collectDreamResults removes result file after processing", () => {
    const dataDir = join(tempHome.tmpDir, ".vigil", "data");
    mkdirSync(dataDir, { recursive: true });
    writeDreamResult(dataDir, "repo1", 3);

    spyOn(mockVectorStore, "storeConsolidated").mockImplementation(() => {});
    spyOn(mockVectorStore, "saveRepoProfile").mockImplementation(() => {});

    daemon.collectDreamResults();

    const { existsSync } = require("node:fs");
    expect(existsSync(join(dataDir, "dream-result-repo1.json"))).toBe(false);
  });

  test("multiple repos spawned sequentially", async () => {
    daemon.repoPaths = ["/fake/repo1", "/fake/repo2"];
    spyOn(mockVectorStore, "getByRepo").mockImplementation((repo: string) => {
      return fakeMemories(5, repo);
    });
    const spawnSpy = spyOn(Bun, "spawn").mockReturnValue({
      pid: 1234,
      exited: Promise.resolve(0),
    } as any);

    await daemon.maybeConsolidate();

    expect(spawnSpy).toHaveBeenCalledTimes(2);
    spawnSpy.mockRestore();
  });
});
