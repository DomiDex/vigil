#!/usr/bin/env bun
/**
 * Dream worker — runs as a forked subprocess to consolidate memories
 * without blocking the main daemon tick loop.
 *
 * Usage: bun run src/memory/dream-worker.ts <repoName>
 *
 * Reads from SQLite in read-only mode (WAL allows concurrent readers),
 * calls the LLM to consolidate, writes results to a temp JSON file
 * for the main daemon to pick up.
 */
import { Database } from "bun:sqlite";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, loadConfig } from "../core/config.ts";
import { DecisionEngine } from "../llm/decision-max.ts";

const repoName = process.argv[2];
if (!repoName) {
  console.error("Usage: dream-worker.ts <repoName>");
  process.exit(1);
}

const lockPath = join(getDataDir(), "dream.lock");

// Prevent concurrent dreams
if (existsSync(lockPath)) {
  process.exit(2);
}

writeFileSync(lockPath, JSON.stringify({ pid: process.pid, repo: repoName, started: Date.now() }));

try {
  const config = loadConfig();
  const engine = new DecisionEngine(config);

  // Open DB read-only (WAL mode allows concurrent readers)
  const dbPath = join(getDataDir(), "vigil.db");
  if (!existsSync(dbPath)) {
    process.exit(0);
  }

  const db = new Database(dbPath, { readonly: true });

  const rows = db
    .query("SELECT * FROM memories WHERE repo = ? ORDER BY updated_at DESC LIMIT 50")
    .all(repoName) as any[];

  if (rows.length === 0) {
    db.close();
    process.exit(0);
  }

  const observations = rows.map((r: any) => r.content as string);
  const profileRow = db.query("SELECT * FROM repo_profiles WHERE repo = ?").get(repoName) as any;

  const profileStr = profileRow
    ? `${profileRow.summary}\nPatterns: ${JSON.parse(profileRow.patterns).join(", ")}`
    : "";

  db.close();

  const result = await engine.consolidate(observations, profileStr);

  // Write results to temp file for main daemon to pick up
  const resultPath = join(getDataDir(), `dream-result-${repoName}.json`);
  writeFileSync(
    resultPath,
    JSON.stringify({
      repo: repoName,
      result,
      sourceIds: rows.map((r: any) => r.id),
      completedAt: Date.now(),
    }),
  );
} finally {
  if (existsSync(lockPath)) {
    unlinkSync(lockPath);
  }
}
