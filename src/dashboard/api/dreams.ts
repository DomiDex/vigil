import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../../core/config.ts";
import type { DashboardContext } from "../types.ts";

// A dream that has been "running" longer than this is treated as stale
// (dreams complete in seconds; anything past an hour means the worker crashed
// without cleaning up its lock).
const DREAM_MAX_AGE_MS = 60 * 60 * 1000;

function isPidAlive(pid: number): boolean {
  try {
    // POSIX: signal 0 performs error checking without sending a signal.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isDreamRunning(): { running: boolean; repo?: string; pid?: number } {
  const lockPath = join(getDataDir(), "dream.lock");
  if (!existsSync(lockPath)) return { running: false };

  let lock: { pid?: number; repo?: string; started?: number };
  try {
    lock = JSON.parse(readFileSync(lockPath, "utf-8"));
  } catch {
    // Malformed lock — treat as stale and remove it.
    try { unlinkSync(lockPath); } catch { /* concurrent cleanup is fine */ }
    return { running: false };
  }

  const pidAlive = typeof lock.pid === "number" && isPidAlive(lock.pid);
  const fresh = typeof lock.started === "number" && Date.now() - lock.started < DREAM_MAX_AGE_MS;

  if (pidAlive && fresh) {
    return { running: true, repo: lock.repo, pid: lock.pid };
  }

  // Stale: process is gone or the lock is too old. Clean up so the next
  // trigger can start a fresh dream.
  try { unlinkSync(lockPath); } catch { /* concurrent cleanup is fine */ }
  return { running: false };
}

// ── GET /api/dreams ──

export function getDreamsJSON(ctx: DashboardContext) {
  const dreams = ctx.daemon.vectorStore.getConsolidatedHistory({ limit: 100 });
  const lockStatus = isDreamRunning();

  return {
    dreams: dreams.map((d) => ({
      timestamp: new Date(d.createdAt).toISOString(),
      repo: d.repo,
      observationsConsolidated: d.sourceIds.length,
      summary: d.content,
      patterns: d.patterns,
      insights: d.insights,
      confidence: d.confidence,
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
