import { Database } from "bun:sqlite";
import { join } from "node:path";
import { getDataDir } from "../core/config.ts";

interface StoreFindingInput {
  id: string;
  specialist: string;
  severity: string;
  title: string;
  detail: string;
  file?: string;
  line?: number;
  suggestion?: string;
  repo: string;
  confidence: number;
  commitHash?: string;
  sourceActionId?: string;
}

interface GetFindingsOptions {
  specialist?: string;
  severity?: string;
  repo?: string;
  dismissed?: boolean;
  limit?: number;
  offset?: number;
}

interface UpsertConfigInput {
  name: string;
  class: string;
  description: string;
  triggerEvents: string[];
  watchPatterns?: string[];
  isBuiltin: boolean;
}

interface StoreTestRunInput {
  id: string;
  repo: string;
  commitHash: string;
  branch: string;
  testName: string;
  testFile: string;
  passed: boolean;
}

export class SpecialistStore {
  private db: Database;

  constructor(db?: Database) {
    this.db = db ?? new Database(join(getDataDir(), "specialists.db"));
    this.db.exec("PRAGMA journal_mode=WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS specialist_findings (
        id TEXT PRIMARY KEY,
        specialist TEXT NOT NULL,
        severity TEXT NOT NULL CHECK(severity IN ('info', 'warning', 'critical')),
        title TEXT NOT NULL,
        detail TEXT NOT NULL,
        file TEXT,
        line INTEGER,
        suggestion TEXT,
        repo TEXT NOT NULL,
        confidence REAL NOT NULL,
        commit_hash TEXT,
        dismissed INTEGER DEFAULT 0,
        dismissed_at INTEGER,
        ignore_pattern TEXT,
        source_action_id TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_findings_repo ON specialist_findings(repo, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_findings_specialist ON specialist_findings(specialist, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_findings_severity ON specialist_findings(severity);

      CREATE TABLE IF NOT EXISTS specialist_configs (
        name TEXT PRIMARY KEY,
        class TEXT NOT NULL CHECK(class IN ('deterministic', 'analytical')),
        description TEXT NOT NULL,
        trigger_events TEXT NOT NULL DEFAULT '[]',
        watch_patterns TEXT DEFAULT '[]',
        enabled INTEGER DEFAULT 1,
        is_builtin INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS test_runs (
        id TEXT PRIMARY KEY,
        repo TEXT NOT NULL,
        commit_hash TEXT NOT NULL,
        branch TEXT NOT NULL,
        test_name TEXT NOT NULL,
        test_file TEXT NOT NULL,
        passed INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_test_runs_repo_test ON test_runs(repo, test_name, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_test_runs_repo_commit ON test_runs(repo, commit_hash);

      CREATE TABLE IF NOT EXISTS test_flakiness (
        repo TEXT NOT NULL,
        test_name TEXT NOT NULL,
        test_file TEXT NOT NULL,
        total_runs INTEGER DEFAULT 0,
        total_passes INTEGER DEFAULT 0,
        total_failures INTEGER DEFAULT 0,
        flaky_commits INTEGER DEFAULT 0,
        last_seen_commit TEXT,
        last_seen_passed INTEGER,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (repo, test_name)
      );
    `);
  }

  storeFinding(input: StoreFindingInput): void {
    this.db.run(
      `INSERT OR REPLACE INTO specialist_findings
       (id, specialist, severity, title, detail, file, line, suggestion, repo, confidence, commit_hash, source_action_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.specialist,
        input.severity,
        input.title,
        input.detail,
        input.file ?? null,
        input.line ?? null,
        input.suggestion ?? null,
        input.repo,
        input.confidence,
        input.commitHash ?? null,
        input.sourceActionId ?? null,
        Date.now(),
      ]
    );
  }

  getFindings(opts?: GetFindingsOptions): { findings: Record<string, unknown>[]; total: number } {
    const conditions: string[] = [];
    const params: (string | number | null)[] = [];

    if (!opts?.dismissed) {
      conditions.push("dismissed = 0");
    }
    if (opts?.specialist) {
      conditions.push("specialist = ?");
      params.push(opts.specialist);
    }
    if (opts?.severity) {
      conditions.push("severity = ?");
      params.push(opts.severity);
    }
    if (opts?.repo) {
      conditions.push("repo = ?");
      params.push(opts.repo);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    const countRow = this.db.query(`SELECT COUNT(*) as count FROM specialist_findings ${where}`).get(...params) as { count: number };
    const findings = this.db.query(`SELECT * FROM specialist_findings ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

    return { findings: findings as Record<string, unknown>[], total: countRow.count };
  }

  getFindingById(id: string): Record<string, unknown> | null {
    return this.db.query("SELECT * FROM specialist_findings WHERE id = ?").get(id) as Record<string, unknown> | null;
  }

  getRecentFindings(repo: string, specialist: string, limit = 10): Record<string, unknown>[] {
    return this.db.query(
      "SELECT * FROM specialist_findings WHERE repo = ? AND specialist = ? AND dismissed = 0 ORDER BY created_at DESC LIMIT ?"
    ).all(repo, specialist, limit) as Record<string, unknown>[];
  }

  dismissFinding(id: string, ignorePattern?: string): void {
    this.db.run(
      "UPDATE specialist_findings SET dismissed = 1, dismissed_at = ?, ignore_pattern = ? WHERE id = ?",
      [Date.now(), ignorePattern ?? null, id]
    );
  }

  getIgnorePatterns(specialist: string): string[] {
    const rows = this.db.query(
      "SELECT DISTINCT ignore_pattern FROM specialist_findings WHERE specialist = ? AND ignore_pattern IS NOT NULL"
    ).all(specialist) as { ignore_pattern: string }[];
    return rows.map((r) => r.ignore_pattern);
  }

  getSpecialistConfigs(): Record<string, unknown>[] {
    return this.db.query("SELECT * FROM specialist_configs ORDER BY name").all() as Record<string, unknown>[];
  }

  getSpecialistConfig(name: string): Record<string, unknown> | null {
    return this.db.query("SELECT * FROM specialist_configs WHERE name = ?").get(name) as Record<string, unknown> | null;
  }

  upsertSpecialistConfig(input: UpsertConfigInput): void {
    const now = Date.now();
    this.db.run(
      `INSERT INTO specialist_configs (name, class, description, trigger_events, watch_patterns, is_builtin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         class = excluded.class,
         description = excluded.description,
         trigger_events = excluded.trigger_events,
         watch_patterns = excluded.watch_patterns,
         updated_at = excluded.updated_at`,
      [
        input.name,
        input.class,
        input.description,
        JSON.stringify(input.triggerEvents),
        JSON.stringify(input.watchPatterns ?? []),
        input.isBuiltin ? 1 : 0,
        now,
        now,
      ]
    );
  }

  deleteSpecialistConfig(name: string): void {
    this.db.run("DELETE FROM specialist_configs WHERE name = ? AND is_builtin = 0", [name]);
  }

  toggleSpecialist(name: string, enabled: boolean): void {
    this.db.run("UPDATE specialist_configs SET enabled = ?, updated_at = ? WHERE name = ?", [enabled ? 1 : 0, Date.now(), name]);
  }

  getSpecialistStats(name: string): Record<string, unknown> {
    const total = this.db.query("SELECT COUNT(*) as count FROM specialist_findings WHERE specialist = ?").get(name) as { count: number };
    const bySeverity = this.db.query(
      "SELECT severity, COUNT(*) as count FROM specialist_findings WHERE specialist = ? GROUP BY severity"
    ).all(name) as { severity: string; count: number }[];
    const avgConf = this.db.query(
      "SELECT AVG(confidence) as avg FROM specialist_findings WHERE specialist = ?"
    ).get(name) as { avg: number | null };
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const lastWeek = this.db.query(
      "SELECT COUNT(*) as count FROM specialist_findings WHERE specialist = ? AND created_at > ?"
    ).get(name, weekAgo) as { count: number };

    return {
      total: total.count,
      bySeverity,
      avgConfidence: avgConf.avg ?? 0,
      lastWeek: lastWeek.count,
    };
  }

  storeTestRun(input: StoreTestRunInput): void {
    this.db.run(
      `INSERT INTO test_runs (id, repo, commit_hash, branch, test_name, test_file, passed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.id, input.repo, input.commitHash, input.branch, input.testName, input.testFile, input.passed ? 1 : 0, Date.now()]
    );
  }

  updateFlakiness(repo: string, testName: string, testFile: string, passed: boolean, commitHash: string): void {
    const existing = this.db.query(
      "SELECT * FROM test_flakiness WHERE repo = ? AND test_name = ?"
    ).get(repo, testName) as Record<string, unknown> | null;

    if (!existing) {
      this.db.run(
        `INSERT INTO test_flakiness (repo, test_name, test_file, total_runs, total_passes, total_failures, flaky_commits, last_seen_commit, last_seen_passed, updated_at)
         VALUES (?, ?, ?, 1, ?, ?, 0, ?, ?, ?)`,
        [repo, testName, testFile, passed ? 1 : 0, passed ? 0 : 1, commitHash, passed ? 1 : 0, Date.now()]
      );
      return;
    }

    // Same-commit variance detection: if same commit but different result, it's flaky
    const sameCommit = existing.last_seen_commit === commitHash;
    const differentResult = sameCommit && (existing.last_seen_passed === 1) !== passed;
    const flakyIncrement = differentResult ? 1 : 0;

    this.db.run(
      `UPDATE test_flakiness SET
         total_runs = total_runs + 1,
         total_passes = total_passes + ?,
         total_failures = total_failures + ?,
         flaky_commits = flaky_commits + ?,
         last_seen_commit = ?,
         last_seen_passed = ?,
         updated_at = ?
       WHERE repo = ? AND test_name = ?`,
      [
        passed ? 1 : 0,
        passed ? 0 : 1,
        flakyIncrement,
        commitHash,
        passed ? 1 : 0,
        Date.now(),
        repo,
        testName,
      ]
    );
  }

  getFlakyTests(repo?: string): Record<string, unknown>[] {
    if (repo) {
      return this.db.query(
        "SELECT * FROM test_flakiness WHERE repo = ? AND flaky_commits > 0 ORDER BY flaky_commits DESC"
      ).all(repo) as Record<string, unknown>[];
    }
    return this.db.query(
      "SELECT * FROM test_flakiness WHERE flaky_commits > 0 ORDER BY flaky_commits DESC"
    ).all() as Record<string, unknown>[];
  }

  resetFlakyTest(repo: string, testName: string): void {
    this.db.run("DELETE FROM test_flakiness WHERE repo = ? AND test_name = ?", [repo, testName]);
  }

  pruneTestHistory(maxPerTest: number): void {
    const tests = this.db.query("SELECT DISTINCT repo, test_name FROM test_runs").all() as { repo: string; test_name: string }[];
    for (const t of tests) {
      this.db.run(
        `DELETE FROM test_runs WHERE id IN (
           SELECT id FROM test_runs WHERE repo = ? AND test_name = ? ORDER BY created_at DESC LIMIT -1 OFFSET ?
         )`,
        [t.repo, t.test_name, maxPerTest]
      );
    }
  }

  close(): void {
    this.db.close();
  }
}
