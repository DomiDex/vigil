import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../../core/config.ts";
import type { DashboardContext } from "../types.ts";

// ── Helpers ──

interface DreamResult {
  repo: string;
  result: {
    summary?: string;
    insights?: string[];
    patterns?: string[];
    confidence?: number;
  };
  sourceIds: string[];
  completedAt: number;
}

function loadDreamResults(): DreamResult[] {
  const dataDir = getDataDir();
  if (!existsSync(dataDir)) return [];

  const files = readdirSync(dataDir).filter((f) => f.startsWith("dream-result-") && f.endsWith(".json"));
  const results: DreamResult[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(dataDir, file), "utf-8");
      results.push(JSON.parse(content));
    } catch {
      // Skip malformed files
    }
  }

  return results.sort((a, b) => b.completedAt - a.completedAt);
}

function isDreamRunning(): { running: boolean; repo?: string; pid?: number } {
  const lockPath = join(getDataDir(), "dream.lock");
  if (!existsSync(lockPath)) return { running: false };

  try {
    const lock = JSON.parse(readFileSync(lockPath, "utf-8"));
    return { running: true, repo: lock.repo, pid: lock.pid };
  } catch {
    return { running: false };
  }
}

// ── GET /api/dreams ──

export function getDreamsJSON(_ctx: DashboardContext) {
  const dreams = loadDreamResults();
  const lockStatus = isDreamRunning();

  return {
    dreams: dreams.map((d) => ({
      timestamp: new Date(d.completedAt).toISOString(),
      repo: d.repo,
      observationsConsolidated: d.sourceIds.length,
      summary: d.result.summary ?? "",
      patterns: d.result.patterns ?? [],
      insights: d.result.insights ?? [],
      confidence: d.result.confidence ?? 0,
    })),
    status: lockStatus,
  };
}

// ── POST /api/dreams/trigger ──

export async function handleDreamTrigger(
  ctx: DashboardContext,
  repo?: string,
): Promise<{ ok: boolean; status: string }> {
  const lockStatus = isDreamRunning();
  if (lockStatus.running) {
    return { ok: false, status: "already_running" };
  }

  const targetRepo = repo || (ctx.daemon.repoPaths[0]?.split("/").pop() ?? "");
  if (!targetRepo) {
    return { ok: false, status: "no_repo" };
  }

  // Spawn dream worker as subprocess
  try {
    const workerPath = join(import.meta.dir, "../../memory/dream-worker.ts");
    Bun.spawn(["bun", "run", workerPath, targetRepo], {
      stdout: "ignore",
      stderr: "ignore",
    });
  } catch {
    return { ok: false, status: "spawn_failed" };
  }

  // Small delay to let the lock file be created
  await new Promise((r) => setTimeout(r, 200));
  return { ok: true, status: "triggered" };
}

// ── GET /api/dreams/patterns/:repo ──

export function getDreamPatternsJSON(ctx: DashboardContext, repo: string) {
  const profile = ctx.daemon.vectorStore.getRepoProfile(repo);
  return {
    repo,
    patterns: profile?.patterns ?? [],
    lastUpdated: profile ? new Date(profile.lastUpdated).toISOString() : null,
  };
}
