import { Database } from "bun:sqlite";
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getLogsDir } from "../core/config.ts";

// ── Types ──

export interface MemoryEntry {
  id: string;
  timestamp: number;
  repo: string;
  type: "git_event" | "decision" | "action" | "insight" | "consolidated" | "user_reply";
  content: string;
  metadata: Record<string, unknown>;
  confidence: number;
}

export interface RepoProfile {
  repo: string;
  summary: string;
  patterns: string[];
  lastUpdated: number;
}

// ── EventLog (JSONL) ──

export class EventLog {
  private logsDir: string;

  constructor(logsDir?: string) {
    this.logsDir = logsDir ?? getLogsDir();
  }

  append(repo: string, event: Record<string, unknown>): void {
    const date = new Date().toISOString().split("T")[0];
    const filename = `${date}-${repo}.jsonl`;
    const filepath = join(this.logsDir, filename);
    const line = `${JSON.stringify({ ...event, timestamp: Date.now() })}\n`;
    appendFileSync(filepath, line);
  }

  query(options: {
    repo?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Record<string, unknown>[] {
    const results: Record<string, unknown>[] = [];
    const files = readdirSync(this.logsDir)
      .filter((f) => f.endsWith(".jsonl"))
      .sort()
      .reverse();

    for (const file of files) {
      // Filter by exact repo name in filename (format: YYYY-MM-DD-{repo}.jsonl)
      if (options.repo) {
        const fileRepo = file.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.jsonl$/, "");
        if (fileRepo !== options.repo) continue;
      }

      // Filter by date range
      const fileDate = file.split("-").slice(0, 3).join("-");
      if (options.startDate && fileDate < options.startDate) continue;
      if (options.endDate && fileDate > options.endDate) continue;

      const filepath = join(this.logsDir, file);
      const lines = readFileSync(filepath, "utf-8").trim().split("\n").filter(Boolean);

      for (const line of lines.reverse()) {
        try {
          const entry = JSON.parse(line);
          if (options.type && entry.type !== options.type) continue;
          results.push(entry);
          if (options.limit && results.length >= options.limit) return results;
        } catch {
          // Skip malformed lines
        }
      }
    }

    return results;
  }
}

// ── VectorStore (SQLite + FTS5) ──

export class VectorStore {
  private db: Database;

  constructor(dbPath?: string) {
    this.db = new Database(dbPath ?? join(getDataDir(), "vigil.db"));
  }

  init(): void {
    this.db.run(`
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

    this.db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        content, repo, type,
        content='memories',
        content_rowid='rowid'
      )
    `);

    // Triggers to keep FTS in sync
    this.db.run(`
      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content, repo, type)
        VALUES (new.rowid, new.content, new.repo, new.type);
      END
    `);

    this.db.run(`
      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, repo, type)
        VALUES ('delete', old.rowid, old.content, old.repo, old.type);
      END
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS repo_profiles (
        repo TEXT PRIMARY KEY,
        summary TEXT DEFAULT '',
        patterns TEXT DEFAULT '[]',
        last_updated INTEGER NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS consolidated (
        id TEXT PRIMARY KEY,
        repo TEXT NOT NULL,
        content TEXT NOT NULL,
        source_ids TEXT DEFAULT '[]',
        created_at INTEGER NOT NULL
      )
    `);
  }

  store(entry: MemoryEntry): void {
    this.db.run(
      `INSERT OR REPLACE INTO memories (id, repo, type, content, metadata, confidence, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.repo,
        entry.type,
        entry.content,
        JSON.stringify(entry.metadata),
        entry.confidence,
        entry.timestamp,
        Date.now(),
      ],
    );
  }

  search(query: string, limit = 10): MemoryEntry[] {
    const rows = this.db
      .query(
        `SELECT m.* FROM memories m
         JOIN memories_fts fts ON m.rowid = fts.rowid
         WHERE memories_fts MATCH ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(query, limit) as any[];

    return rows.map(this.rowToEntry);
  }

  getByRepo(repo: string, limit = 20): MemoryEntry[] {
    const rows = this.db
      .query(`SELECT * FROM memories WHERE repo = ? ORDER BY updated_at DESC LIMIT ?`)
      .all(repo, limit) as any[];

    return rows.map(this.rowToEntry);
  }

  getRepoProfile(repo: string): RepoProfile | null {
    const row = this.db.query(`SELECT * FROM repo_profiles WHERE repo = ?`).get(repo) as any;

    if (!row) return null;
    return {
      repo: row.repo,
      summary: row.summary,
      patterns: JSON.parse(row.patterns),
      lastUpdated: row.last_updated,
    };
  }

  saveRepoProfile(profile: RepoProfile): void {
    this.db.run(
      `INSERT OR REPLACE INTO repo_profiles (repo, summary, patterns, last_updated)
       VALUES (?, ?, ?, ?)`,
      [profile.repo, profile.summary, JSON.stringify(profile.patterns), Date.now()],
    );
  }

  storeConsolidated(id: string, repo: string, content: string, sourceIds: string[]): void {
    this.db.run(
      `INSERT OR REPLACE INTO consolidated (id, repo, content, source_ids, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, repo, content, JSON.stringify(sourceIds), Date.now()],
    );
  }

  /**
   * Prune old, low-confidence memories.
   * Inspired by Kairos auto-expiry (cronTasks.ts: recurringMaxAgeMs).
   *
   * Rules:
   * - git_event memories older than maxAgeDays → delete
   * - decision memories with confidence < 0.3 older than 3 days → delete
   * - consolidated memories are NEVER pruned (Kairos permanent: true)
   * - Keep at least minPerRepo memories per repo
   */
  prune(options?: { maxAgeDays?: number; minPerRepo?: number }): number {
    const maxAge = (options?.maxAgeDays ?? 7) * 86_400_000;
    const minPerRepo = options?.minPerRepo ?? 50;
    const cutoff = Date.now() - maxAge;
    const lowConfCutoff = Date.now() - 3 * 86_400_000;

    const counts = this.db.query("SELECT repo, COUNT(*) as count FROM memories GROUP BY repo").all() as {
      repo: string;
      count: number;
    }[];

    let pruned = 0;

    for (const { repo, count } of counts) {
      if (count <= minPerRepo) continue;

      const excess = count - minPerRepo;

      // Select IDs to prune, then delete them
      // (Two-step to avoid FTS5 triggers inflating change count)
      const toDelete = this.db
        .query(
          `SELECT id FROM memories
           WHERE repo = ?
             AND type != 'consolidated'
             AND (
               (type = 'git_event' AND created_at < ?)
               OR (type = 'decision' AND confidence < 0.3 AND created_at < ?)
             )
           ORDER BY created_at ASC
           LIMIT ?`,
        )
        .all(repo, cutoff, lowConfCutoff, excess) as { id: string }[];

      if (toDelete.length === 0) continue;

      const placeholders = toDelete.map(() => "?").join(",");
      this.db.run(
        `DELETE FROM memories WHERE id IN (${placeholders})`,
        toDelete.map((r) => r.id),
      );

      pruned += toDelete.length;
    }

    if (pruned > 100) {
      this.db.run("VACUUM");
    }

    return pruned;
  }

  /**
   * Get recent memories across ALL repos, for cross-repo analysis.
   * Used during dream consolidation to detect inter-repo patterns.
   */
  getCrossRepoMemories(limit = 50): MemoryEntry[] {
    const rows = this.db.query(`SELECT * FROM memories ORDER BY created_at DESC LIMIT ?`).all(limit) as any[];

    return rows.map(this.rowToEntry);
  }

  /**
   * Get all repo profiles for cross-repo comparison.
   */
  getAllRepoProfiles(): RepoProfile[] {
    const rows = this.db.query(`SELECT * FROM repo_profiles`).all() as any[];

    return rows.map((r: any) => ({
      repo: r.repo,
      summary: r.summary,
      patterns: JSON.parse(r.patterns || "[]"),
      lastUpdated: r.last_updated,
    }));
  }

  /**
   * Delete a memory entry by its id.
   * Returns true if the entry was found and deleted, false otherwise.
   */
  delete(id: string): boolean {
    const existing = this.db.query("SELECT id FROM memories WHERE id = ?").get(id);
    if (!existing) return false;
    this.db.run("DELETE FROM memories WHERE id = ?", [id]);
    return true;
  }

  /**
   * Update relevance of a memory entry.
   * If relevant is true, boost confidence by 0.1 (capped at 1.0).
   * If relevant is false, delete the entry (outdated content is noise).
   */
  updateRelevance(id: string, relevant: boolean): boolean {
    if (relevant) {
      const existing = this.db.query("SELECT id FROM memories WHERE id = ?").get(id);
      if (!existing) return false;
      this.db.run(
        "UPDATE memories SET confidence = MIN(confidence + 0.1, 1.0), updated_at = ? WHERE id = ?",
        [Date.now(), id],
      );
      return true;
    }
    return this.delete(id);
  }

  close(): void {
    this.db.close();
  }

  private rowToEntry(row: any): MemoryEntry {
    return {
      id: row.id,
      timestamp: row.created_at,
      repo: row.repo,
      type: row.type,
      content: row.content,
      metadata: JSON.parse(row.metadata || "{}"),
      confidence: row.confidence,
    };
  }
}
