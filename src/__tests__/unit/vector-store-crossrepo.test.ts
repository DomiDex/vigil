import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VectorStore } from "../../memory/store.ts";

let tmpDir: string;
let store: VectorStore;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "vigil-vs-xrepo-"));
  store = new VectorStore(join(tmpDir, "test.db"));
  store.init();

  // Seed test data
  const now = Date.now();
  store.store({
    id: "m1",
    timestamp: now,
    repo: "frontend",
    type: "decision",
    content: "React build uses shared auth hook",
    metadata: {},
    confidence: 0.8,
  });
  store.store({
    id: "m2",
    timestamp: now - 1000,
    repo: "backend",
    type: "decision",
    content: "API rate limiter configured",
    metadata: {},
    confidence: 0.7,
  });
  store.store({
    id: "m3",
    timestamp: now - 2000,
    repo: "frontend",
    type: "insight",
    content: "Dashboard charts updated",
    metadata: {},
    confidence: 0.9,
  });
  store.store({
    id: "m4",
    timestamp: now - 3000,
    repo: "infra",
    type: "decision",
    content: "Docker compose updated",
    metadata: {},
    confidence: 0.6,
  });

  // Seed repo profiles
  store.saveRepoProfile({
    repo: "frontend",
    summary: "React frontend with dashboard",
    patterns: ["daily commits", "frequent CSS changes"],
    lastUpdated: now,
  });
  store.saveRepoProfile({
    repo: "backend",
    summary: "Express API server",
    patterns: ["weekly releases"],
    lastUpdated: now,
  });
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("VectorStore.getCrossRepoMemories", () => {
  test("returns memories from all repos ordered by created_at DESC", () => {
    const memories = store.getCrossRepoMemories(50);
    expect(memories.length).toBe(4);
    // Most recent first
    expect(memories[0].id).toBe("m1");
    expect(memories[1].id).toBe("m2");
  });

  test("respects limit", () => {
    const memories = store.getCrossRepoMemories(2);
    expect(memories).toHaveLength(2);
  });

  test("returns empty when no memories", () => {
    const emptyStore = new VectorStore(join(tmpDir, "empty.db"));
    emptyStore.init();
    const memories = emptyStore.getCrossRepoMemories();
    expect(memories).toHaveLength(0);
    emptyStore.close();
  });

  test("includes memories from all repos", () => {
    const memories = store.getCrossRepoMemories(50);
    const repos = new Set(memories.map((m) => m.repo));
    expect(repos.has("frontend")).toBe(true);
    expect(repos.has("backend")).toBe(true);
    expect(repos.has("infra")).toBe(true);
  });
});

describe("VectorStore.getAllRepoProfiles", () => {
  test("returns all profiles", () => {
    const profiles = store.getAllRepoProfiles();
    expect(profiles).toHaveLength(2);
    const repos = profiles.map((p) => p.repo).sort();
    expect(repos).toEqual(["backend", "frontend"]);
  });

  test("parses patterns correctly", () => {
    const profiles = store.getAllRepoProfiles();
    const frontend = profiles.find((p) => p.repo === "frontend");
    expect(frontend?.patterns).toEqual(["daily commits", "frequent CSS changes"]);
  });

  test("returns empty when no profiles", () => {
    const emptyStore = new VectorStore(join(tmpDir, "empty2.db"));
    emptyStore.init();
    const profiles = emptyStore.getAllRepoProfiles();
    expect(profiles).toHaveLength(0);
    emptyStore.close();
  });

  test("includes summary and lastUpdated", () => {
    const profiles = store.getAllRepoProfiles();
    const backend = profiles.find((p) => p.repo === "backend");
    expect(backend?.summary).toBe("Express API server");
    expect(backend?.lastUpdated).toBeGreaterThan(0);
  });
});
