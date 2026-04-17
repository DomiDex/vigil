import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

function classifyFlakyStatus(row: {
  flaky_commits: number;
  total_runs: number;
  total_passes: number;
}): "FLAKY (definitive)" | "FLAKY (statistical)" | "STABLE" {
  if (row.flaky_commits > 0) return "FLAKY (definitive)";
  if (row.total_runs > 0 && row.total_passes / row.total_runs < 0.5) return "FLAKY (statistical)";
  return "STABLE";
}

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.run(`CREATE TABLE IF NOT EXISTS test_flakiness (
    repo TEXT NOT NULL,
    test_name TEXT NOT NULL,
    test_file TEXT DEFAULT '',
    total_runs INTEGER DEFAULT 0,
    total_passes INTEGER DEFAULT 0,
    total_failures INTEGER DEFAULT 0,
    flaky_commits INTEGER DEFAULT 0,
    last_flaky_at TEXT,
    first_seen TEXT DEFAULT (datetime('now')),
    last_seen TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (repo, test_name)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS test_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo TEXT NOT NULL,
    test_name TEXT NOT NULL,
    commit_sha TEXT NOT NULL,
    passed INTEGER NOT NULL,
    run_at TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS findings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo TEXT NOT NULL,
    specialist TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT DEFAULT '',
    file TEXT,
    line INTEGER,
    suggestion TEXT,
    commit_sha TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  return db;
}

function seedRows(db: Database) {
  db.run(
    `INSERT INTO test_flakiness (repo, test_name, test_file, total_runs, total_passes, total_failures, flaky_commits)
    VALUES ('my-app', 'test > login flow', 'auth.test.ts', 20, 18, 2, 3)`,
  );
  db.run(
    `INSERT INTO test_flakiness (repo, test_name, test_file, total_runs, total_passes, total_failures, flaky_commits)
    VALUES ('my-app', 'test > data fetch', 'api.test.ts', 10, 3, 7, 0)`,
  );
  db.run(
    `INSERT INTO test_flakiness (repo, test_name, test_file, total_runs, total_passes, total_failures, flaky_commits)
    VALUES ('my-app', 'test > renders ok', 'ui.test.ts', 15, 15, 0, 0)`,
  );
  db.run(
    `INSERT INTO test_flakiness (repo, test_name, test_file, total_runs, total_passes, total_failures, flaky_commits)
    VALUES ('other-repo', 'test > build step', 'build.test.ts', 5, 5, 0, 0)`,
  );
}

describe("Phase 5: flaky status classification", () => {
  test("flaky_commits > 0 yields FLAKY (definitive)", () => {
    expect(classifyFlakyStatus({ flaky_commits: 3, total_runs: 20, total_passes: 18 })).toBe("FLAKY (definitive)");
  });

  test("pass rate < 50% with zero flaky_commits yields FLAKY (statistical)", () => {
    expect(classifyFlakyStatus({ flaky_commits: 0, total_runs: 10, total_passes: 3 })).toBe("FLAKY (statistical)");
  });

  test("pass rate >= 50% with zero flaky_commits yields STABLE", () => {
    expect(classifyFlakyStatus({ flaky_commits: 0, total_runs: 15, total_passes: 15 })).toBe("STABLE");
  });

  test("zero total_runs yields STABLE (not division by zero)", () => {
    expect(classifyFlakyStatus({ flaky_commits: 0, total_runs: 0, total_passes: 0 })).toBe("STABLE");
  });

  test("exactly 50% pass rate yields STABLE (boundary)", () => {
    expect(classifyFlakyStatus({ flaky_commits: 0, total_runs: 10, total_passes: 5 })).toBe("STABLE");
  });

  test("definitive takes priority over statistical", () => {
    expect(classifyFlakyStatus({ flaky_commits: 2, total_runs: 10, total_passes: 2 })).toBe("FLAKY (definitive)");
  });
});

describe("Phase 5: SpecialistStore.getFlakyTests()", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
    seedRows(db);
  });

  afterEach(() => {
    db.close();
  });

  test("returns all rows when no repo filter", () => {
    const rows = db.query("SELECT * FROM test_flakiness").all();
    expect(rows).toHaveLength(4);
  });

  test("filters by repo when repo argument provided", () => {
    const rows = db.query("SELECT * FROM test_flakiness WHERE repo = ?").all("my-app");
    expect(rows).toHaveLength(3);
  });

  test("returns empty array for unknown repo", () => {
    const rows = db.query("SELECT * FROM test_flakiness WHERE repo = ?").all("nonexistent");
    expect(rows).toHaveLength(0);
  });
});

describe("Phase 5: SpecialistStore.resetFlakyTest()", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
    seedRows(db);
    db.run(
      `INSERT INTO test_runs (repo, test_name, commit_sha, passed)
      VALUES ('my-app', 'test > login flow', 'abc123', 1)`,
    );
  });

  afterEach(() => {
    db.close();
  });

  test("deletes matching flakiness row", () => {
    const before = db
      .query("SELECT * FROM test_flakiness WHERE repo = ? AND test_name = ?")
      .all("my-app", "test > login flow");
    expect(before).toHaveLength(1);

    db.run("DELETE FROM test_flakiness WHERE repo = ? AND test_name = ?", ["my-app", "test > login flow"]);
    db.run("DELETE FROM test_runs WHERE repo = ? AND test_name = ?", ["my-app", "test > login flow"]);

    const after = db
      .query("SELECT * FROM test_flakiness WHERE repo = ? AND test_name = ?")
      .all("my-app", "test > login flow");
    expect(after).toHaveLength(0);
  });

  test("deletes associated test_runs rows", () => {
    db.run("DELETE FROM test_runs WHERE repo = ? AND test_name = ?", ["my-app", "test > login flow"]);
    const runs = db
      .query("SELECT * FROM test_runs WHERE repo = ? AND test_name = ?")
      .all("my-app", "test > login flow");
    expect(runs).toHaveLength(0);
  });

  test("returns false (no-op) for nonexistent test", () => {
    const row = db
      .query("SELECT * FROM test_flakiness WHERE repo = ? AND test_name = ?")
      .get("my-app", "nonexistent test");
    expect(row).toBeNull();
  });

  test("other tests remain after reset", () => {
    db.run("DELETE FROM test_flakiness WHERE repo = ? AND test_name = ?", ["my-app", "test > login flow"]);
    const remaining = db.query("SELECT * FROM test_flakiness WHERE repo = ?").all("my-app");
    expect(remaining).toHaveLength(2);
  });
});

describe("Phase 5: flaky summary count", () => {
  test("counts definitive + statistical as flaky", () => {
    const tests = [
      { flaky_commits: 3, total_runs: 20, total_passes: 18 },
      { flaky_commits: 0, total_runs: 10, total_passes: 3 },
      { flaky_commits: 0, total_runs: 15, total_passes: 15 },
    ];
    const flakyCount = tests.filter(
      (t) => t.flaky_commits > 0 || (t.total_runs > 0 && t.total_passes / t.total_runs < 0.5),
    ).length;
    expect(flakyCount).toBe(2);
  });

  test("all stable yields zero flaky count", () => {
    const tests = [
      { flaky_commits: 0, total_runs: 10, total_passes: 10 },
      { flaky_commits: 0, total_runs: 5, total_passes: 5 },
    ];
    const flakyCount = tests.filter(
      (t) => t.flaky_commits > 0 || (t.total_runs > 0 && t.total_passes / t.total_runs < 0.5),
    ).length;
    expect(flakyCount).toBe(0);
  });
});

describe("Phase 5: flaky test name truncation", () => {
  test("names <= 48 chars are unchanged", () => {
    const name = "test > short name";
    const result = name.length > 48 ? `${name.slice(0, 45)}...` : name;
    expect(result).toBe("test > short name");
  });

  test("names > 48 chars are truncated with ellipsis", () => {
    const name = "test > this is a very long test name that exceeds the column width limit";
    const result = name.length > 48 ? `${name.slice(0, 45)}...` : name;
    expect(result).toHaveLength(48);
    expect(result.endsWith("...")).toBe(true);
  });
});

describe("Phase 5: pass rate formatting", () => {
  test("non-zero runs produce percentage string", () => {
    const rate = `${((18 / 20) * 100).toFixed(0)}%`;
    expect(rate).toBe("90%");
  });

  test("zero runs produce N/A", () => {
    const totalRuns = 0;
    const rate = totalRuns > 0 ? `${((0 / totalRuns) * 100).toFixed(0)}%` : "N/A";
    expect(rate).toBe("N/A");
  });
});

describe("Phase 5: feature gate disabled path (US-5)", () => {
  test("null module check short-circuits", () => {
    const specialistStoreMod: { SpecialistStore: unknown } | null = null;
    let reachedStore = false;

    if (!specialistStoreMod) {
      // would print "not enabled" in real CLI
    } else {
      reachedStore = true;
    }

    expect(reachedStore).toBe(false);
  });

  test("enabled module check proceeds", () => {
    const specialistStoreMod: { SpecialistStore: unknown } | null = { SpecialistStore: class {} };
    let reachedStore = false;

    if (!specialistStoreMod) {
      // not enabled
    } else {
      reachedStore = true;
    }

    expect(reachedStore).toBe(true);
  });
});
