import type { DashboardContext } from "../types.ts";

// ── Helpers ──

function formatRelativeTime(ms: number): string {
  if (ms <= 0) return "now";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `in ${days}d ${hours % 24}h`;
  if (hours > 0) return `in ${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `in ${minutes}m`;
  return `in ${seconds}s`;
}

// ── GET /api/scheduler ──

export function getSchedulerJSON(ctx: DashboardContext) {
  const scheduler = ctx.daemon.scheduler;
  const entries = scheduler.list().map((entry) => {
    const msToNext = scheduler.getMsToNext(entry.id);
    const nextRun = scheduler.getNextRun(entry.id);
    return {
      ...entry,
      nextRun: nextRun?.toISOString() ?? null,
      msToNext: msToNext ?? null,
      nextRunRelative: msToNext !== null ? formatRelativeTime(msToNext) : "stopped",
    };
  });

  const history = scheduler.getRunHistory(50);

  return { entries, history };
}

// ── POST /api/scheduler ──

export async function handleSchedulerCreate(
  ctx: DashboardContext,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const name = formData.get("name")?.toString() || "";
  const cron = formData.get("cron")?.toString() || "";
  const repo = formData.get("repo")?.toString() || undefined;
  const action = formData.get("action")?.toString() || "";

  if (!name || !cron || !action) {
    return { ok: false, error: "Missing required fields" };
  }

  // Validate cron expression
  try {
    const { Cron } = await import("croner");
    const test = new Cron(cron);
    test.stop();
  } catch {
    return { ok: false, error: "Invalid cron expression" };
  }

  ctx.daemon.scheduler.add({ name, cron, action, repo });
  return { ok: true };
}

// ── DELETE /api/scheduler/:id ──

export function handleSchedulerDelete(ctx: DashboardContext, id: string): { ok: boolean } {
  ctx.daemon.scheduler.remove(id);
  return { ok: true };
}

// ── POST /api/scheduler/:id/trigger ──

export async function handleSchedulerTrigger(ctx: DashboardContext, id: string): Promise<{ ok: boolean }> {
  await ctx.daemon.scheduler.trigger(id);
  return { ok: true };
}
