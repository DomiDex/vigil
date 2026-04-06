import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../core/config.ts";

export interface RepoIndex {
  repo: string;
  summary: string;
  topTopics: string[];
  lastActivity: string;
  observationCount: number;
  confidence: number;
}

export class IndexTier {
  private indexDir: string;

  constructor(indexDir?: string) {
    this.indexDir = indexDir ?? join(getDataDir(), "index");
    mkdirSync(this.indexDir, { recursive: true });
  }

  getIndex(repo: string): RepoIndex | null {
    const path = join(this.indexDir, `${repo}.json`);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8"));
  }

  updateIndex(index: RepoIndex): void {
    writeFileSync(join(this.indexDir, `${index.repo}.json`), JSON.stringify(index, null, 2));
  }

  /** Format for injection into LLM prompt (~200 tokens max) */
  formatForPrompt(repo: string): string {
    const idx = this.getIndex(repo);
    if (!idx) return "(no index)";
    return [
      `Repo: ${idx.repo} | ${idx.summary}`,
      `Topics: ${idx.topTopics.join(", ") || "(none)"}`,
      `Observations: ${idx.observationCount} | Confidence: ${idx.confidence}`,
      `Last activity: ${idx.lastActivity}`,
    ].join("\n");
  }
}
