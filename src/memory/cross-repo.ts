import { Database } from "bun:sqlite";
import { join } from "node:path";
import { getDataDir } from "../core/config.ts";
import type { MemoryEntry } from "./store.ts";

// ── Types ──

export type RelationType = "dependency" | "shared_pattern" | "related_concern" | "monorepo_sibling";

export interface RepoRelation {
  id: string;
  repoA: string;
  repoB: string;
  relationType: RelationType;
  description: string;
  confidence: number;
  createdAt: number;
  updatedAt: number;
}

export interface CrossRepoInsight {
  repos: string[];
  insight: string;
  confidence: number;
}

// ── CrossRepoAnalyzer ──

export class CrossRepoAnalyzer {
  private db: Database;

  constructor(dbPath?: string) {
    this.db = new Database(dbPath ?? join(getDataDir(), "vigil.db"));
    this.init();
  }

  private init(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS repo_relations (
        id TEXT PRIMARY KEY,
        repo_a TEXT NOT NULL,
        repo_b TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        description TEXT NOT NULL,
        confidence REAL DEFAULT 0.5,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(repo_a, repo_b, relation_type)
      )
    `);
  }

  /** Declare a relationship between two repos. Upserts if relation already exists. */
  declareRelation(
    repoA: string,
    repoB: string,
    relationType: RelationType,
    description: string,
    confidence = 0.5,
  ): RepoRelation {
    const id = crypto.randomUUID();
    const now = Date.now();

    this.db.run(
      `INSERT INTO repo_relations (id, repo_a, repo_b, relation_type, description, confidence, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(repo_a, repo_b, relation_type) DO UPDATE SET
         description = excluded.description,
         confidence = excluded.confidence,
         updated_at = excluded.updated_at`,
      [id, repoA, repoB, relationType, description, confidence, now, now],
    );

    return (
      this.getRelation(repoA, repoB, relationType) ?? {
        id,
        repoA,
        repoB,
        relationType,
        description,
        confidence,
        createdAt: now,
        updatedAt: now,
      }
    );
  }

  /** Get all repos related to a given repo. */
  getRelatedRepos(repo: string): RepoRelation[] {
    const rows = this.db
      .query(`SELECT * FROM repo_relations WHERE repo_a = ? OR repo_b = ? ORDER BY confidence DESC`)
      .all(repo, repo) as any[];

    return rows.map(this.rowToRelation);
  }

  /** Get a specific relation. */
  getRelation(repoA: string, repoB: string, relationType: string): RepoRelation | null {
    const row = this.db
      .query(`SELECT * FROM repo_relations WHERE repo_a = ? AND repo_b = ? AND relation_type = ?`)
      .get(repoA, repoB, relationType) as any;

    return row ? this.rowToRelation(row) : null;
  }

  /** Get all relations. */
  getAllRelations(): RepoRelation[] {
    const rows = this.db
      .query(`SELECT * FROM repo_relations ORDER BY confidence DESC`)
      .all() as any[];

    return rows.map(this.rowToRelation);
  }

  /** Remove a relation. */
  removeRelation(id: string): void {
    this.db.run(`DELETE FROM repo_relations WHERE id = ?`, [id]);
  }

  /** Query memories across multiple repos. Returns entries from all specified repos. */
  getCrossRepoMemories(repos: string[], limit = 20): MemoryEntry[] {
    if (repos.length === 0) return [];

    const placeholders = repos.map(() => "?").join(",");
    const rows = this.db
      .query(
        `SELECT * FROM memories WHERE repo IN (${placeholders}) ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(...repos, limit) as any[];

    return rows.map((row: any) => ({
      id: row.id,
      timestamp: row.created_at,
      repo: row.repo,
      type: row.type,
      content: row.content,
      metadata: JSON.parse(row.metadata || "{}"),
      confidence: row.confidence,
    }));
  }

  /** Get recent activity summary for related repos (for context injection). */
  getRelatedRepoContext(repo: string): string {
    const relations = this.getRelatedRepos(repo);
    if (relations.length === 0) return "";

    const lines: string[] = ["### Related Repositories"];
    for (const rel of relations) {
      const otherRepo = rel.repoA === repo ? rel.repoB : rel.repoA;
      const lastMemory = this.db
        .query(
          `SELECT content, updated_at FROM memories WHERE repo = ? ORDER BY updated_at DESC LIMIT 1`,
        )
        .get(otherRepo) as { content: string; updated_at: number } | null;

      const ago = lastMemory ? formatTimeAgo(Date.now() - lastMemory.updated_at) : "no activity";
      const lastNote = lastMemory ? lastMemory.content.slice(0, 100) : "no observations";

      lines.push(
        `- ${otherRepo} (${rel.relationType}): "${rel.description}" — ${ago}: ${lastNote}`,
      );
    }

    return lines.join("\n");
  }

  close(): void {
    this.db.close();
  }

  private rowToRelation(row: any): RepoRelation {
    return {
      id: row.id,
      repoA: row.repo_a,
      repoB: row.repo_b,
      relationType: row.relation_type,
      description: row.description,
      confidence: row.confidence,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

function formatTimeAgo(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
