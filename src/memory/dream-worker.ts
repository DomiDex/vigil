#!/usr/bin/env bun
/**
 * Dream worker — runs as a forked subprocess to consolidate memories
 * without blocking the main daemon tick loop.
 *
 * Usage: bun run src/memory/dream-worker.ts <repoName>
 *
 * Writes results directly to the `consolidated` table (and repo profile)
 * so the dashboard's /api/dreams history reflects every run.
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, loadConfig } from "../core/config.ts";
import { DecisionEngine } from "../llm/decision-max.ts";
import { VectorStore } from "./store.ts";

const repoName = process.argv[2];
if (!repoName) {
  console.error("Usage: dream-worker.ts <repoName>");
  process.exit(1);
}

const lockPath = join(getDataDir(), "dream.lock");
const DREAM_MAX_AGE_MS = 60 * 60 * 1000;

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Prevent concurrent dreams, but treat locks from dead/stale workers as removable
// so a crashed previous run can't jam the pipeline forever.
if (existsSync(lockPath)) {
  let existing: { pid?: number; started?: number } = {};
  try {
    existing = JSON.parse(readFileSync(lockPath, "utf-8"));
  } catch {
    // Malformed lock — fall through and overwrite.
  }
  const pidAlive = typeof existing.pid === "number" && isPidAlive(existing.pid);
  const fresh = typeof existing.started === "number" && Date.now() - existing.started < DREAM_MAX_AGE_MS;
  if (pidAlive && fresh) {
    process.exit(2);
  }
  try { unlinkSync(lockPath); } catch { /* concurrent cleanup is fine */ }
}

writeFileSync(lockPath, JSON.stringify({ pid: process.pid, repo: repoName, started: Date.now() }));

try {
  const config = loadConfig();
  const engine = new DecisionEngine(config);

  const dbPath = join(getDataDir(), "vigil.db");
  if (!existsSync(dbPath)) {
    process.exit(0);
  }

  const store = new VectorStore(dbPath);
  store.init();

  const memories = store.getByRepo(repoName, 50);
  if (memories.length === 0) {
    store.close();
    process.exit(0);
  }

  const observations = memories.map((m) => m.content);
  const profile = store.getRepoProfile(repoName);
  const profileStr = profile ? `${profile.summary}\nPatterns: ${profile.patterns.join(", ")}` : "";

  const result = await engine.consolidate(observations, profileStr);

  store.storeConsolidated(
    crypto.randomUUID(),
    repoName,
    result.summary,
    memories.map((m) => m.id),
    {
      patterns: result.patterns,
      insights: result.insights,
      confidence: result.confidence,
    },
  );
  store.saveRepoProfile({
    repo: repoName,
    summary: result.summary,
    patterns: result.patterns,
    lastUpdated: Date.now(),
  });

  store.close();
} finally {
  if (existsSync(lockPath)) {
    unlinkSync(lockPath);
  }
}
