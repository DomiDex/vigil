/**
 * Memory pruning — manages data retention with TTL policies,
 * confidence-based eviction, and archiving to prevent unbounded growth.
 */

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../core/config.ts";

export interface PrunePolicy {
  /** Max age in days for memories (default: 30) */
  maxAgeDays: number;
  /** Minimum confidence to keep (memories below this AND older than minAgeDays get pruned) */
  minConfidence: number;
  /** Don't prune memories younger than this many days regardless of confidence */
  minAgeDays: number;
  /** Max total memories per repo (oldest low-confidence pruned first) */
  maxPerRepo: number;
  /** Archive pruned memories to JSONL instead of hard delete */
  archive: boolean;
}

export const DEFAULT_PRUNE_POLICY: PrunePolicy = {
  maxAgeDays: 30,
  minConfidence: 0.3,
  minAgeDays: 3,
  maxPerRepo: 500,
  archive: true,
};

export interface PruneResult {
  byAge: number;
  byConfidence: number;
  byCount: number;
  total: number;
  archived: number;
}

export interface PruneStats {
  totalMemories: number;
  perRepo: { repo: string; count: number; oldestDays: number; avgConfidence: number }[];
  dbSizeBytes: number;
}

interface MemoryRow {
  id: string;
  repo: string;
  type: string;
  content: string;
  metadata: string;
  confidence: number;
  created_at: number;
  updated_at: number;
}

export class MemoryPruner {
  private archivedCount = 0;

  constructor(
    private db: any,
    private policy: PrunePolicy = DEFAULT_PRUNE_POLICY,
  ) {}

  /**
   * Run all pruning passes. Returns total pruned count.
   */
  prune(): PruneResult {
    this.archivedCount = 0;

    const byAge = this.pruneByAge();
    const byConfidence = this.pruneByConfidence();
    const byCount = this.pruneByCount();

    return {
      byAge,
      byConfidence,
      byCount,
      total: byAge + byConfidence + byCount,
      archived: this.archivedCount,
    };
  }

  /** Remove memories older than maxAgeDays */
  private pruneByAge(): number {
    const cutoff = Date.now() - this.policy.maxAgeDays * 24 * 60 * 60 * 1000;

    const rows = this.db.query(`SELECT * FROM memories WHERE created_at < ?`).all(cutoff) as MemoryRow[];

    for (const row of rows) {
      if (this.policy.archive) {
        this.archiveMemory({
          id: row.id,
          repo: row.repo,
          content: row.content,
          timestamp: row.created_at,
          confidence: row.confidence,
        });
      }
      this.deleteMemory(row.id);
    }

    return rows.length;
  }

  /** Remove low-confidence memories older than minAgeDays */
  private pruneByConfidence(): number {
    const cutoff = Date.now() - this.policy.minAgeDays * 24 * 60 * 60 * 1000;

    const rows = this.db
      .query(`SELECT * FROM memories WHERE confidence < ? AND created_at < ?`)
      .all(this.policy.minConfidence, cutoff) as MemoryRow[];

    for (const row of rows) {
      if (this.policy.archive) {
        this.archiveMemory({
          id: row.id,
          repo: row.repo,
          content: row.content,
          timestamp: row.created_at,
          confidence: row.confidence,
        });
      }
      this.deleteMemory(row.id);
    }

    return rows.length;
  }

  /** Enforce per-repo max count, evicting oldest low-confidence first */
  private pruneByCount(): number {
    const repos = this.db
      .query(`SELECT repo, COUNT(*) as cnt FROM memories GROUP BY repo HAVING cnt > ?`)
      .all(this.policy.maxPerRepo) as { repo: string; cnt: number }[];

    let pruned = 0;

    for (const { repo, cnt } of repos) {
      const excess = cnt - this.policy.maxPerRepo;

      // Evict oldest low-confidence memories first
      const rows = this.db
        .query(
          `SELECT * FROM memories WHERE repo = ?
           ORDER BY confidence ASC, created_at ASC
           LIMIT ?`,
        )
        .all(repo, excess) as MemoryRow[];

      for (const row of rows) {
        if (this.policy.archive) {
          this.archiveMemory({
            id: row.id,
            repo: row.repo,
            content: row.content,
            timestamp: row.created_at,
            confidence: row.confidence,
          });
        }
        this.deleteMemory(row.id);
        pruned++;
      }
    }

    return pruned;
  }

  /** Delete a memory from both tables */
  private deleteMemory(id: string): void {
    this.db.run(`DELETE FROM memories WHERE id = ?`, [id]);
  }

  /** Archive a memory to ~/.vigil/data/archive/{repo}.jsonl before deletion */
  private archiveMemory(memory: {
    id: string;
    repo: string;
    content: string;
    timestamp: number;
    confidence: number;
  }): void {
    const archiveDir = join(getDataDir(), "archive");
    if (!existsSync(archiveDir)) {
      mkdirSync(archiveDir, { recursive: true });
    }

    const filePath = join(archiveDir, `${memory.repo}.jsonl`);
    const line = JSON.stringify({
      id: memory.id,
      repo: memory.repo,
      content: memory.content,
      timestamp: memory.timestamp,
      confidence: memory.confidence,
      archivedAt: Date.now(),
    });
    appendFileSync(filePath, `${line}\n`);
    this.archivedCount++;
  }

  /** Get stats about current memory usage */
  stats(): PruneStats {
    const totalRow = this.db.query(`SELECT COUNT(*) as cnt FROM memories`).get() as {
      cnt: number;
    };

    const repoRows = this.db
      .query(
        `SELECT repo, COUNT(*) as cnt, MIN(created_at) as oldest, AVG(confidence) as avg_conf
         FROM memories GROUP BY repo`,
      )
      .all() as { repo: string; cnt: number; oldest: number; avg_conf: number }[];

    const now = Date.now();
    const perRepo = repoRows.map((row) => ({
      repo: row.repo,
      count: row.cnt,
      oldestDays: Math.floor((now - row.oldest) / (24 * 60 * 60 * 1000)),
      avgConfidence: Math.round(row.avg_conf * 1000) / 1000,
    }));

    const pageCount = (this.db.query(`PRAGMA page_count`).get() as { page_count: number }).page_count;
    const pageSize = (this.db.query(`PRAGMA page_size`).get() as { page_size: number }).page_size;

    return {
      totalMemories: totalRow.cnt,
      perRepo,
      dbSizeBytes: pageCount * pageSize,
    };
  }
}
