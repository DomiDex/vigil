import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { DashboardContext } from "../types.ts";

const pruneSchema = z.object({
  olderThanDays: z.number().int().min(1).max(365),
});

function getDbSize(path: string): number {
  try {
    if (!existsSync(path)) return 0;
    return Bun.file(path).size;
  } catch {
    return 0;
  }
}

export function getHealthJSON(ctx: DashboardContext) {
  const daemon = ctx.daemon as any;
  const mem = process.memoryUsage();
  const session = daemon.session;
  const uptime = session?.startedAt ? Math.round((Date.now() - session.startedAt) / 1000) : 0;

  // Database sizes
  const dataDir = join(homedir(), ".vigil", "data");
  const databases: Record<string, number> = {};
  const dbFiles = ["vigil.db", "metrics.db"];
  for (const f of dbFiles) {
    databases[f] = getDbSize(join(dataDir, f));
  }

  // Error counts from metrics
  const metricsSummary = daemon.metrics?.getSummary() ?? {};
  let totalErrors = 0;
  for (const [key, val] of Object.entries(metricsSummary)) {
    if (key.startsWith("errors.")) {
      totalErrors += (val as any).count ?? 0;
    }
  }

  // Uptime timeline — single segment from session start to now
  const uptimeTimeline: Array<{ start: number; end: number; state: string }> = [];
  if (session?.startedAt) {
    const state = daemon.tickEngine?.isSleeping ? "sleeping" : "running";
    uptimeTimeline.push({
      start: session.startedAt,
      end: Date.now(),
      state,
    });
  }

  return {
    process: {
      runtime: `Bun ${Bun.version}`,
      pid: process.pid,
      uptime,
      heap: mem.heapUsed,
      rss: mem.rss,
      external: mem.external ?? 0,
    },
    databases,
    errors: {
      total: totalErrors,
      details: metricsSummary,
    },
    uptimeTimeline,
  };
}

export function handleVacuum(ctx: DashboardContext) {
  const daemon = ctx.daemon as any;
  const db = daemon.eventLog?.db ?? daemon.memory?.eventLog?.db;
  if (!db) return { success: false, error: "No database available", freedBytes: 0 };

  const pageSizeBefore = (db.query("PRAGMA page_size").get() as any).page_size;
  const pageCountBefore = (db.query("PRAGMA page_count").get() as any).page_count;

  db.exec("VACUUM");

  const pageCountAfter = (db.query("PRAGMA page_count").get() as any).page_count;
  const freedBytes = (pageCountBefore - pageCountAfter) * pageSizeBefore;

  return { success: true, freedBytes: Math.max(0, freedBytes) };
}

export function handlePrune(ctx: DashboardContext, body: unknown) {
  const parsed = pruneSchema.safeParse(body);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input", deletedCount: 0 };
  }

  const daemon = ctx.daemon as any;
  const db = daemon.eventLog?.db ?? daemon.memory?.eventLog?.db;
  if (!db) return { success: false, error: "No database available", deletedCount: 0 };

  const threshold = Date.now() - parsed.data.olderThanDays * 86_400_000;
  const result = db.run("DELETE FROM events WHERE timestamp < ?", [threshold]);

  return { success: true, deletedCount: result.changes };
}
