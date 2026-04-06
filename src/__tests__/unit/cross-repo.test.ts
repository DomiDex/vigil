import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CrossRepoAnalyzer } from "../../memory/cross-repo.ts";

let tmpDir: string;
let dbPath: string;
let analyzer: CrossRepoAnalyzer;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "vigil-xrepo-test-"));
  mkdirSync(tmpDir, { recursive: true });
  dbPath = join(tmpDir, "test.db");

  // Create memories table (normally done by VectorStore.init)
  const db = new Database(dbPath);
  db.run(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      repo TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      confidence REAL DEFAULT 0.5,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  // Seed some test memories
  const now = Date.now();
  db.run(`INSERT INTO memories VALUES (?, ?, 'insight', ?, '{}', 0.8, ?, ?)`, [
    "m1",
    "frontend",
    "React component uses shared auth hook",
    now,
    now,
  ]);
  db.run(`INSERT INTO memories VALUES (?, ?, 'insight', ?, '{}', 0.8, ?, ?)`, [
    "m2",
    "backend",
    "Auth middleware validates JWT tokens",
    now,
    now,
  ]);
  db.run(`INSERT INTO memories VALUES (?, ?, 'insight', ?, '{}', 0.8, ?, ?)`, [
    "m3",
    "frontend",
    "Dashboard uses charts library v3",
    now,
    now,
  ]);
  db.run(`INSERT INTO memories VALUES (?, ?, 'insight', ?, '{}', 0.8, ?, ?)`, [
    "m4",
    "backend",
    "API rate limiter configured at 100 req/min",
    now,
    now,
  ]);
  db.close();

  analyzer = new CrossRepoAnalyzer(dbPath);
});

afterEach(() => {
  analyzer.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Relation CRUD ──

describe("relation CRUD", () => {
  test("declares a new relation", () => {
    const rel = analyzer.declareRelation("frontend", "backend", "dependency", "Frontend consumes backend API", 0.9);
    expect(rel.repoA).toBe("frontend");
    expect(rel.repoB).toBe("backend");
    expect(rel.relationType).toBe("dependency");
    expect(rel.confidence).toBe(0.9);
  });

  test("upserts on duplicate relation", () => {
    analyzer.declareRelation("a", "b", "dependency", "first description", 0.5);
    analyzer.declareRelation("a", "b", "dependency", "updated description", 0.9);

    const rels = analyzer.getAllRelations();
    expect(rels).toHaveLength(1);
    expect(rels[0].description).toBe("updated description");
    expect(rels[0].confidence).toBe(0.9);
  });

  test("allows different relation types for same pair", () => {
    analyzer.declareRelation("a", "b", "dependency", "dep", 0.8);
    analyzer.declareRelation("a", "b", "shared_pattern", "pattern", 0.6);

    const rels = analyzer.getAllRelations();
    expect(rels).toHaveLength(2);
  });

  test("getRelatedRepos finds both directions", () => {
    analyzer.declareRelation("frontend", "backend", "dependency", "API consumer");

    const fromFrontend = analyzer.getRelatedRepos("frontend");
    expect(fromFrontend).toHaveLength(1);
    expect(fromFrontend[0].repoB).toBe("backend");

    const fromBackend = analyzer.getRelatedRepos("backend");
    expect(fromBackend).toHaveLength(1);
    expect(fromBackend[0].repoA).toBe("frontend");
  });

  test("removeRelation deletes", () => {
    const rel = analyzer.declareRelation("a", "b", "dependency", "test");
    analyzer.removeRelation(rel.id);
    expect(analyzer.getAllRelations()).toHaveLength(0);
  });
});

// ── Cross-repo Queries ──

describe("cross-repo queries", () => {
  test("getCrossRepoMemories returns memories from multiple repos", () => {
    const memories = analyzer.getCrossRepoMemories(["frontend", "backend"]);
    expect(memories.length).toBe(4);
    const repos = new Set(memories.map((m) => m.repo));
    expect(repos.has("frontend")).toBe(true);
    expect(repos.has("backend")).toBe(true);
  });

  test("getCrossRepoMemories respects limit", () => {
    const memories = analyzer.getCrossRepoMemories(["frontend", "backend"], 2);
    expect(memories).toHaveLength(2);
  });

  test("getCrossRepoMemories returns empty for unknown repo", () => {
    const memories = analyzer.getCrossRepoMemories(["nonexistent"]);
    expect(memories).toHaveLength(0);
  });
});

// ── Context Injection ──

describe("context injection", () => {
  test("getRelatedRepoContext returns empty when no relations", () => {
    const ctx = analyzer.getRelatedRepoContext("frontend");
    expect(ctx).toBe("");
  });

  test("getRelatedRepoContext includes related repo info", () => {
    analyzer.declareRelation("frontend", "backend", "dependency", "API consumer");

    const ctx = analyzer.getRelatedRepoContext("frontend");
    expect(ctx).toContain("Related Repositories");
    expect(ctx).toContain("backend");
    expect(ctx).toContain("dependency");
    expect(ctx).toContain("API consumer");
  });

  test("getRelatedRepoContext shows last activity", () => {
    analyzer.declareRelation("frontend", "backend", "dependency", "test");

    const ctx = analyzer.getRelatedRepoContext("frontend");
    // Backend has memories, so should show recent activity
    expect(ctx).toContain("backend");
    expect(ctx).toMatch(/\d+[mhd] ago/);
  });
});
