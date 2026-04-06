import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { computeMagnitude, computeTF, SemanticIndex, tokenize } from "../../memory/semantic.ts";

// ── Tokenization ──

describe("tokenize", () => {
  test("lowercases and splits on non-alpha", () => {
    expect(tokenize("Hello World")).toEqual(["hello", "world"]);
  });

  test("removes stopwords", () => {
    const result = tokenize("the quick brown fox is a very fast animal");
    expect(result).not.toContain("the");
    expect(result).not.toContain("is");
    expect(result).not.toContain("a");
    expect(result).not.toContain("very");
    expect(result).toContain("quick");
    expect(result).toContain("brown");
    expect(result).toContain("fox");
    expect(result).toContain("fast");
    expect(result).toContain("animal");
  });

  test("filters short tokens", () => {
    const result = tokenize("I am a big fan of AI");
    expect(result).not.toContain("i");
    expect(result).toContain("big");
    expect(result).toContain("fan");
    expect(result).toContain("ai");
  });

  test("handles code-like content", () => {
    const result = tokenize("function handleLogin(userId: string)");
    expect(result).toContain("function");
    expect(result).toContain("handlelogin");
    expect(result).toContain("userid");
    expect(result).toContain("string");
  });
});

// ── TF computation ──

describe("computeTF", () => {
  test("computes normalized term frequency", () => {
    const tf = computeTF(["hello", "world", "hello"]);
    expect(tf.get("hello")).toBeCloseTo(2 / 3);
    expect(tf.get("world")).toBeCloseTo(1 / 3);
  });
});

// ── Magnitude ──

describe("computeMagnitude", () => {
  test("computes vector magnitude", () => {
    const tf = new Map([
      ["a", 3],
      ["b", 4],
    ]);
    expect(computeMagnitude(tf)).toBeCloseTo(5); // sqrt(9+16)
  });
});

// ── SemanticIndex ──

describe("SemanticIndex", () => {
  let db: Database;
  let index: SemanticIndex;

  beforeEach(() => {
    db = new Database(":memory:");
    db.run(`
      CREATE TABLE memories (
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
    index = new SemanticIndex(db);
    index.init();
  });

  afterEach(() => {
    db.close();
  });

  function insertMemory(id: string, content: string, repo = "test") {
    db.run(
      `INSERT INTO memories (id, repo, type, content, created_at, updated_at) VALUES (?, ?, 'decision', ?, ?, ?)`,
      [id, repo, content, Date.now(), Date.now()],
    );
    index.index(id, content);
  }

  test("indexes and searches by exact terms", () => {
    insertMemory("m1", "JWT token handler for user authentication");
    insertMemory("m2", "Database migration script for PostgreSQL");
    insertMemory("m3", "Unit test coverage report for the API module");

    const results = index.search("authentication login", 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].memoryId).toBe("m1");
  });

  test("finds semantically related content", () => {
    insertMemory("m1", "Login flow uses JWT tokens for session management");
    insertMemory("m2", "Database indexes need optimization for query performance");
    insertMemory("m3", "User authentication middleware validates bearer tokens");

    const results = index.search("login authentication", 5);
    // Both m1 and m3 should appear since they share relevant terms
    const ids = results.map((r) => r.memoryId);
    expect(ids).toContain("m1");
    expect(ids).toContain("m3");
    // m2 should not appear (unrelated topic)
    expect(ids).not.toContain("m2");
  });

  test("returns empty for no matches", () => {
    insertMemory("m1", "React component rendering lifecycle");
    const results = index.search("kubernetes deployment pipeline", 5);
    expect(results).toEqual([]);
  });

  test("respects limit parameter", () => {
    for (let i = 0; i < 10; i++) {
      insertMemory(`m${i}`, `observation about code quality metric ${i}`);
    }
    const results = index.search("code quality", 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  test("indexUnindexed catches up missing memories", () => {
    // Insert directly into memories without indexing
    db.run(
      `INSERT INTO memories (id, repo, type, content, created_at, updated_at) VALUES (?, ?, 'decision', ?, ?, ?)`,
      ["orphan1", "test", "Orphaned memory about testing", Date.now(), Date.now()],
    );
    db.run(
      `INSERT INTO memories (id, repo, type, content, created_at, updated_at) VALUES (?, ?, 'decision', ?, ?, ?)`,
      ["orphan2", "test", "Another orphaned memory about deployment", Date.now(), Date.now()],
    );

    const count = index.indexUnindexed();
    expect(count).toBe(2);

    // Now they should be searchable
    const results = index.search("testing", 5);
    const ids = results.map((r) => r.memoryId);
    expect(ids).toContain("orphan1");
  });

  test("scores are between 0 and 1", () => {
    insertMemory("m1", "React component testing with jest");
    insertMemory("m2", "Testing patterns for UI components");

    const results = index.search("component testing", 5);
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });
});
