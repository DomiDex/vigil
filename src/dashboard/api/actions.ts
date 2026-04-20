import type { DashboardContext } from "../types.ts";

// ── Helpers ──

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m} ${ampm}`;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

// ── GET /api/actions ──

export function getActionsJSON(ctx: DashboardContext, opts?: { status?: string }) {
  const executor = ctx.daemon.actionExecutor;
  const recent = executor.getRecent(50);
  const pending = executor.getPending();

  const filtered = opts?.status ? recent.filter((a) => a.status === opts.status) : recent;

  // Compute stats
  const stats = { approved: 0, rejected: 0, executed: 0, failed: 0, pending: 0 };
  const byTier = { safe: 0, moderate: 0, dangerous: 0 };
  const bySource = { llm: 0, specialist: 0, manual: 0 };
  for (const a of recent) {
    stats[a.status as keyof typeof stats] = (stats[a.status as keyof typeof stats] || 0) + 1;
    byTier[a.tier] = (byTier[a.tier] || 0) + 1;
    const src = (a.source ?? "llm") as keyof typeof bySource;
    if (src in bySource) bySource[src] += 1;
  }

  return {
    actions: filtered.map((a) => ({
      ...a,
      timeFormatted: formatTime(a.createdAt),
      timeRelative: formatRelative(a.createdAt),
    })),
    pending: pending.map((a) => ({
      ...a,
      timeFormatted: formatTime(a.createdAt),
      timeRelative: formatRelative(a.createdAt),
    })),
    stats,
    byTier,
    bySource,
    gateConfig: executor.getGateConfig(),
    isOptedIn: executor.isOptedIn,
  };
}

// ── GET /api/actions/pending ──

export function getActionsPendingJSON(ctx: DashboardContext) {
  const pending = ctx.daemon.actionExecutor.getPending();
  return {
    pending: pending.map((a) => ({
      ...a,
      timeFormatted: formatTime(a.createdAt),
      timeRelative: formatRelative(a.createdAt),
    })),
  };
}

// ── GET /api/actions/:id/preview ──

export function getActionPreviewJSON(ctx: DashboardContext, id: string) {
  const executor = ctx.daemon.actionExecutor;
  const action = executor.getById(id);
  if (!action) return null;

  return {
    id: action.id,
    command: action.command,
    args: action.args,
    description: action.reason,
    dryRun: null,
    estimatedEffect: `Executes: ${action.command} ${action.args.join(" ")}`,
  };
}

// ── POST /api/actions/:id/approve ──

export async function handleApprove(ctx: DashboardContext, id: string): Promise<{ ok: boolean }> {
  const executor = ctx.daemon.actionExecutor;
  const action = executor.getById(id);
  if (!action) return { ok: false };

  const repoPath = ctx.daemon.repoPaths.find((p) => p.endsWith(`/${action.repo}`)) || ctx.daemon.repoPaths[0];
  if (repoPath) {
    await executor.approve(id, repoPath);
  }

  return { ok: true };
}

// ── POST /api/actions/:id/reject ──

export function handleReject(ctx: DashboardContext, id: string): { ok: boolean } {
  ctx.daemon.actionExecutor.reject(id);
  return { ok: true };
}
