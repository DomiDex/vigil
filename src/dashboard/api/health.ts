import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { DashboardContext } from "../types.ts";

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
