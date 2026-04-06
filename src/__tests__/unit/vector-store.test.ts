import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MemoryEntry, RepoProfile } from "../../memory/store.ts";
import { VectorStore } from "../../memory/store.ts";

let tmpDir: string;
let store: VectorStore;

function makeEntry(overrides?: Partial<MemoryEntry>): MemoryEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    repo: "test-repo",
    type: "decision",
    content: "test content",
    metadata: {},
    confidence: 0.5,
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "vigil-store-test-"));
  store = new VectorStore(join(tmpDir, "vigil.db"));
  store.init();
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("VectorStore", () => {
  describe("init()", () => {
    test("creates all 4 tables", () => {
      const db = new Database(join(tmpDir, "vigil.db"));
      const tables = db
        .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all()
        .map((r: any) => r.name);
      db.close();

      expect(tables).toContain("memories");
      expect(tables).toContain("memories_fts");
      expect(tables).toContain("repo_profiles");
      expect(tables).toContain("consolidated");
    });

    test("is idempotent", () => {
      // Calling init() again should not throw
      expect(() => store.init()).not.toThrow();
    });
  });

  describe("store() and getByRepo()", () => {
    test("inserts a memory entry", () => {
      const entry = makeEntry();
      store.store(entry);

      const db = new Database(join(tmpDir, "vigil.db"));
      const row = db.query("SELECT * FROM memories WHERE id = ?").get(entry.id) as any;
      db.close();

      expect(row).not.toBeNull();
      expect(row.content).toBe("test content");
    });

    test("upserts on same id", () => {
      const entry = makeEntry({ content: "original" });
      store.store(entry);
      store.store({ ...entry, content: "updated" });

      const db = new Database(join(tmpDir, "vigil.db"));
      const count = db.query("SELECT COUNT(*) as c FROM memories WHERE id = ?").get(entry.id) as any;
      const row = db.query("SELECT * FROM memories WHERE id = ?").get(entry.id) as any;
      db.close();

      expect(count.c).toBe(1);
      expect(row.content).toBe("updated");
    });

    test("getByRepo returns entries for repo", () => {
      store.store(makeEntry({ repo: "repo-a" }));
      store.store(makeEntry({ repo: "repo-a" }));
      store.store(makeEntry({ repo: "repo-a" }));
      store.store(makeEntry({ repo: "repo-b" }));
      store.store(makeEntry({ repo: "repo-b" }));

      const results = store.getByRepo("repo-a");
      expect(results).toHaveLength(3);
      for (const r of results) {
        expect(r.repo).toBe("repo-a");
      }
    });

    test("getByRepo orders by updated_at DESC", () => {
      const nowSpy = spyOn(Date, "now");

      nowSpy.mockReturnValue(1000);
      store.store(makeEntry({ repo: "repo-a", content: "first" }));
      nowSpy.mockReturnValue(2000);
      store.store(makeEntry({ repo: "repo-a", content: "second" }));
      nowSpy.mockReturnValue(3000);
      store.store(makeEntry({ repo: "repo-a", content: "third" }));

      nowSpy.mockRestore();

      const results = store.getByRepo("repo-a");
      // Most recently stored should be first (highest updated_at)
      expect(results[0].content).toBe("third");
    });

    test("getByRepo respects limit", () => {
      for (let i = 0; i < 10; i++) {
        store.store(makeEntry({ repo: "repo-a" }));
      }

      const results = store.getByRepo("repo-a", 5);
      expect(results).toHaveLength(5);
    });
  });

  describe("search() — FTS5", () => {
    test("finds entry by content keyword", () => {
      store.store(makeEntry({ content: "merge conflict detected in main branch" }));
      store.store(makeEntry({ content: "routine check passed" }));

      const results = store.search("merge conflict");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].content).toContain("merge conflict");
    });

    test("finds entry by repo name", () => {
      store.store(makeEntry({ repo: "alpha", content: "event one" }));
      store.store(makeEntry({ repo: "beta", content: "event two" }));

      const results = store.search("alpha");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].repo).toBe("alpha");
    });

    test("ranks by relevance", () => {
      store.store(makeEntry({ content: "deploy deploy deploy deploy deploy" }));
      store.store(makeEntry({ content: "single deploy mention" }));

      const results = store.search("deploy");
      expect(results.length).toBeGreaterThanOrEqual(2);
      // Higher keyword density should rank first (lower rank value = better match)
      expect(results[0].content).toContain("deploy deploy");
    });

    test("returns empty for no match", () => {
      store.store(makeEntry({ content: "hello world" }));

      const results = store.search("nonexistent");
      expect(results).toHaveLength(0);
    });

    test("FTS trigger fires on insert", () => {
      const entry = makeEntry({ content: "trigger test content" });
      store.store(entry);

      const db = new Database(join(tmpDir, "vigil.db"));
      const ftsRow = db.query("SELECT * FROM memories_fts WHERE memories_fts MATCH 'trigger test'").get() as any;
      db.close();

      expect(ftsRow).not.toBeNull();
    });

    test("FTS trigger fires on delete", () => {
      const entry = makeEntry({ content: "deletable content" });
      store.store(entry);

      // Delete the entry
      const db = new Database(join(tmpDir, "vigil.db"));
      db.run("DELETE FROM memories WHERE id = ?", [entry.id]);

      // FTS should no longer find it
      const ftsRow = db.query("SELECT * FROM memories_fts WHERE memories_fts MATCH 'deletable'").get();
      db.close();

      expect(ftsRow).toBeNull();
    });
  });

  describe("repo profiles", () => {
    test("getRepoProfile returns null for missing", () => {
      const result = store.getRepoProfile("nonexistent");
      expect(result).toBeNull();
    });

    test("saveRepoProfile + getRepoProfile round-trips", () => {
      const profile: RepoProfile = {
        repo: "my-repo",
        summary: "A test repository",
        patterns: ["daily-deploy", "hotfix-fridays"],
        lastUpdated: Date.now(),
      };

      store.saveRepoProfile(profile);
      const retrieved = store.getRepoProfile("my-repo");

      expect(retrieved).not.toBeNull();
      expect(retrieved?.repo).toBe("my-repo");
      expect(retrieved?.summary).toBe("A test repository");
      expect(retrieved?.patterns).toEqual(["daily-deploy", "hotfix-fridays"]);
    });

    test("saveRepoProfile upserts on same repo", () => {
      const profile1: RepoProfile = {
        repo: "my-repo",
        summary: "Version 1",
        patterns: [],
        lastUpdated: Date.now(),
      };
      const profile2: RepoProfile = {
        repo: "my-repo",
        summary: "Version 2",
        patterns: ["new-pattern"],
        lastUpdated: Date.now(),
      };

      store.saveRepoProfile(profile1);
      store.saveRepoProfile(profile2);

      const db = new Database(join(tmpDir, "vigil.db"));
      const count = db.query("SELECT COUNT(*) as c FROM repo_profiles WHERE repo = 'my-repo'").get() as any;
      db.close();

      expect(count.c).toBe(1);

      const retrieved = store.getRepoProfile("my-repo");
      expect(retrieved?.summary).toBe("Version 2");
    });

    test("patterns stored as JSON array", () => {
      const profile: RepoProfile = {
        repo: "my-repo",
        summary: "test",
        patterns: ["pattern-a", "pattern-b"],
        lastUpdated: Date.now(),
      };

      store.saveRepoProfile(profile);
      const retrieved = store.getRepoProfile("my-repo");

      expect(retrieved?.patterns).toEqual(["pattern-a", "pattern-b"]);
      expect(Array.isArray(retrieved?.patterns)).toBe(true);
    });
  });

  describe("consolidated", () => {
    test("storeConsolidated stores entry", () => {
      store.storeConsolidated("c-1", "my-repo", "consolidated insight", ["s1", "s2"]);

      const db = new Database(join(tmpDir, "vigil.db"));
      const row = db.query("SELECT * FROM consolidated WHERE id = 'c-1'").get() as any;
      db.close();

      expect(row).not.toBeNull();
      expect(row.content).toBe("consolidated insight");
      expect(row.repo).toBe("my-repo");
    });

    test("storeConsolidated preserves sourceIds", () => {
      const sourceIds = ["id-1", "id-2", "id-3", "id-4", "id-5"];
      store.storeConsolidated("c-2", "repo", "content", sourceIds);

      const db = new Database(join(tmpDir, "vigil.db"));
      const row = db.query("SELECT * FROM consolidated WHERE id = 'c-2'").get() as any;
      db.close();

      expect(JSON.parse(row.source_ids)).toEqual(sourceIds);
    });
  });

  describe("rowToEntry()", () => {
    test("handles null metadata", () => {
      // Insert directly with null metadata
      const db = new Database(join(tmpDir, "vigil.db"));
      db.run(
        `INSERT INTO memories (id, repo, type, content, metadata, confidence, created_at, updated_at)
         VALUES ('null-meta', 'repo', 'decision', 'test', NULL, 0.5, 1000, 1000)`,
      );
      db.close();

      const results = store.getByRepo("repo");
      expect(results).toHaveLength(1);
      expect(results[0].metadata).toEqual({});
    });
  });
});
