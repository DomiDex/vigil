import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../core/config.ts";

export interface Topic {
  name: string;
  summary: string;
  observations: string[];
  lastUpdated: number;
}

export class TopicTier {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? join(getDataDir(), "topics");
  }

  private repoDir(repo: string): string {
    const dir = join(this.baseDir, repo);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  getTopic(repo: string, name: string): Topic | null {
    const path = join(this.repoDir(repo), `${this.slugify(name)}.json`);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8"));
  }

  saveTopic(repo: string, topic: Topic): void {
    const path = join(this.repoDir(repo), `${this.slugify(topic.name)}.json`);
    writeFileSync(path, JSON.stringify(topic, null, 2));
  }

  listTopics(repo: string): string[] {
    const dir = join(this.baseDir, repo);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));
  }

  /**
   * Incrementally update a topic with a new observation.
   * Creates the topic if it doesn't exist. Updates summary heuristically
   * without an LLM call — the dream phase will refine it later.
   *
   * @returns true if topic was updated, false if observation was duplicate
   */
  addObservation(repo: string, topicName: string, observation: string, confidence: number = 0.5): boolean {
    const MAX_OBSERVATIONS = 50;
    const MIN_CONFIDENCE = 0.4;

    if (confidence < MIN_CONFIDENCE) return false;

    let topic = this.getTopic(repo, topicName);

    if (!topic) {
      topic = {
        name: topicName,
        summary: observation.slice(0, 200),
        observations: [observation],
        lastUpdated: Date.now(),
      };
      this.saveTopic(repo, topic);
      return true;
    }

    // Skip duplicate/near-duplicate observations
    const isDuplicate = topic.observations.some(
      (obs) => obs === observation || this.similarity(obs, observation) > 0.8,
    );
    if (isDuplicate) return false;

    topic.observations.push(observation);

    // Evict oldest observations if over limit
    if (topic.observations.length > MAX_OBSERVATIONS) {
      topic.observations = topic.observations.slice(-MAX_OBSERVATIONS);
    }

    // Heuristic summary update — append key info, dream phase will consolidate
    if (topic.observations.length <= 3) {
      topic.summary = topic.observations.join(". ").slice(0, 300);
    }

    topic.lastUpdated = Date.now();
    this.saveTopic(repo, topic);
    return true;
  }

  /** Simple word-overlap similarity (0-1). Fast, no LLM needed. */
  private similarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    let overlap = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) overlap++;
    }
    const union = new Set([...wordsA, ...wordsB]).size;
    return union === 0 ? 0 : overlap / union;
  }

  /** Format a topic for injection into LLM prompt */
  formatForPrompt(repo: string, name: string): string {
    const topic = this.getTopic(repo, name);
    if (!topic) return `(topic "${name}" not found)`;
    return [
      `## Topic: ${topic.name}`,
      topic.summary,
      `Observations: ${topic.observations.length}`,
      `Last updated: ${new Date(topic.lastUpdated).toISOString()}`,
    ].join("\n");
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }
}
