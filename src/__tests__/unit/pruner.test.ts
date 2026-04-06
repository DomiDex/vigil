import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MemoryEntry } from "../../memory/store.ts";
import { VectorStore } from "../../memory/store.ts";

let tmpDir: string;
let store: VectorStore;
let dbPath: string;

function makeEntry(overrides?: Partial<MemoryEntry>): MemoryEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    repo: "test-repo",
    type: "git_event",
    content: "test content",
    metadata: {},
    confidence: 0.5,
    ...overrides,
  };
}

const DAY = 86_400_000;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "vigil-prune-test-"));
  dbPath = join(tmpDir, "vigil.db");
  store = new VectorStore(dbPath);
  store.init();
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("VectorStore.prune()", () => {
  test("returns 0 when no memories exist", () => {
    expect(store.prune()).toBe(0);
  });

  test("does not prune when repo has fewer than minPerRepo entries", () => {
    const nowSpy = spyOn(Date, "now");

    // Insert 10 old git_event entries
    for (let i = 0; i < 10; i++) {
      nowSpy.mockReturnValue(Date.now() - 10 * DAY);
      store.store(makeEntry({ type: "git_event" }));
    }

    nowSpy.mockRestore();

    // Default minPerRepo is 50, so 10 entries should not be pruned
    const pruned = store.prune();
    expect(pruned).toBe(0);
    expect(store.getByRepo("test-repo")).toHaveLength(10);
  });

  test("prunes old git_event entries beyond minPerRepo", () => {
    const now = Date.now();
    const nowSpy = spyOn(Date, "now");

    // Insert 60 entries: 30 old git_events + 30 recent decisions
    for (let i = 0; i < 30; i++) {
      nowSpy.mockReturnValue(now - 10 * DAY); // 10 days old
      store.store(makeEntry({ type: "git_event", content: `old event ${i}` }));
    }
    for (let i = 0; i < 30; i++) {
      nowSpy.mockReturnValue(now); // current
      store.store(makeEntry({ type: "decision", content: `recent decision ${i}`, confidence: 0.8 }));
    }

    nowSpy.mockRestore();

    const pruned = store.prune({ minPerRepo: 50 });

    // Should prune some of the old git_events (60 - 50 = 10 excess, limited to matching old events)
    expect(pruned).toBeGreaterThan(0);
    expect(pruned).toBeLessThanOrEqual(10);

    const remaining = store.getByRepo("test-repo", 100);
    expect(remaining.length).toBeLessThanOrEqual(60);
  });

  test("never prunes consolidated memories", () => {
    const now = Date.now();
    const nowSpy = spyOn(Date, "now");

    // Insert 60 entries: 55 consolidated (old) + 5 git_events (old)
    for (let i = 0; i < 55; i++) {
      nowSpy.mockReturnValue(now - 10 * DAY);
      store.store(makeEntry({ type: "consolidated", content: `consolidated ${i}` }));
    }
    for (let i = 0; i < 5; i++) {
      nowSpy.mockReturnValue(now - 10 * DAY);
      store.store(makeEntry({ type: "git_event", content: `old event ${i}` }));
    }

    nowSpy.mockRestore();

    const pruned = store.prune({ minPerRepo: 50 });

    // Only the 5 git_events should be eligible for pruning (up to excess of 10)
    expect(pruned).toBeLessThanOrEqual(5);

    // All consolidated memories should survive
    const db = new Database(dbPath);
    const consolidatedCount = db.query("SELECT COUNT(*) as c FROM memories WHERE type = 'consolidated'").get() as any;
    db.close();

    expect(consolidatedCount.c).toBe(55);
  });

  test("prunes low-confidence decisions older than 3 days", () => {
    const now = Date.now();
    const nowSpy = spyOn(Date, "now");

    // Insert 60 entries: 30 low-confidence decisions (4 days old) + 30 recent
    for (let i = 0; i < 30; i++) {
      nowSpy.mockReturnValue(now - 4 * DAY);
      store.store(makeEntry({ type: "decision", content: `low conf ${i}`, confidence: 0.2 }));
    }
    for (let i = 0; i < 30; i++) {
      nowSpy.mockReturnValue(now);
      store.store(makeEntry({ type: "decision", content: `recent ${i}`, confidence: 0.8 }));
    }

    nowSpy.mockRestore();

    const pruned = store.prune({ minPerRepo: 50 });
    expect(pruned).toBeGreaterThan(0);
    expect(pruned).toBeLessThanOrEqual(10); // excess = 60 - 50 = 10
  });

  test("does not prune decisions with confidence >= 0.3", () => {
    const now = Date.now();
    const nowSpy = spyOn(Date, "now");

    // Insert 60 high-confidence decisions (all old)
    for (let i = 0; i < 60; i++) {
      nowSpy.mockReturnValue(now - 10 * DAY);
      store.store(makeEntry({ type: "decision", content: `high conf ${i}`, confidence: 0.5 }));
    }

    nowSpy.mockRestore();

    // These should NOT be pruned because confidence >= 0.3
    const pruned = store.prune({ minPerRepo: 50 });
    expect(pruned).toBe(0);
  });

  test("respects custom maxAgeDays", () => {
    const now = Date.now();
    const nowSpy = spyOn(Date, "now");

    // Insert 60 git_events that are 2 days old
    for (let i = 0; i < 60; i++) {
      nowSpy.mockReturnValue(now - 2 * DAY);
      store.store(makeEntry({ type: "git_event", content: `event ${i}` }));
    }

    nowSpy.mockRestore();

    // With maxAgeDays=7, 2-day-old events should NOT be pruned
    const pruned7 = store.prune({ maxAgeDays: 7, minPerRepo: 50 });
    expect(pruned7).toBe(0);

    // With maxAgeDays=1, 2-day-old events SHOULD be pruned
    const pruned1 = store.prune({ maxAgeDays: 1, minPerRepo: 50 });
    expect(pruned1).toBeGreaterThan(0);
  });

  test("respects custom minPerRepo", () => {
    const now = Date.now();
    const nowSpy = spyOn(Date, "now");

    // Insert 20 old git_events
    for (let i = 0; i < 20; i++) {
      nowSpy.mockReturnValue(now - 10 * DAY);
      store.store(makeEntry({ type: "git_event" }));
    }

    nowSpy.mockRestore();

    // With minPerRepo=15, should prune up to 5
    const pruned = store.prune({ minPerRepo: 15 });
    expect(pruned).toBeGreaterThan(0);
    expect(pruned).toBeLessThanOrEqual(5);

    const remaining = store.getByRepo("test-repo", 100);
    expect(remaining.length).toBeGreaterThanOrEqual(15);
  });

  test("handles multiple repos independently", () => {
    const now = Date.now();
    const nowSpy = spyOn(Date, "now");

    // Repo A: 60 old git_events (should prune some)
    for (let i = 0; i < 60; i++) {
      nowSpy.mockReturnValue(now - 10 * DAY);
      store.store(makeEntry({ repo: "repo-a", type: "git_event" }));
    }

    // Repo B: 30 old git_events (under minPerRepo, should NOT prune)
    for (let i = 0; i < 30; i++) {
      nowSpy.mockReturnValue(now - 10 * DAY);
      store.store(makeEntry({ repo: "repo-b", type: "git_event" }));
    }

    nowSpy.mockRestore();

    const pruned = store.prune({ minPerRepo: 50 });

    // Only repo-a should have been pruned
    expect(pruned).toBeGreaterThan(0);
    expect(store.getByRepo("repo-b", 100)).toHaveLength(30);
  });
});
