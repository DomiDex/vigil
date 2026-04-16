import type { DashboardContext } from "../types.ts";

function formatUptime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function shortModel(model: string): string {
  return model.replace("claude-", "").replace("-20251001", "");
}

export function getOverviewJSON(ctx: DashboardContext) {
  const { daemon } = ctx;
  const tick = daemon.tickEngine as any;
  const session = daemon.session as any;
  const config = daemon.config;

  const now = Date.now();
  const startedAt = session?.startedAt ?? now;
  const uptimeMs = now - startedAt;
  const tickCount = tick.currentTick;
  const adaptiveInterval = Math.round(tick.sleep.getNextInterval());
  const lastTickAt = tick.lastTickAt ?? now;
  const nextTickIn = Math.max(0, Math.round(config.tickInterval - (now - lastTickAt) / 1000));

  const repos = daemon.repoPaths.map((p: string) => {
    const name = p.split("/").pop() || p;
    return { name, path: p, state: tick.isSleeping ? "sleeping" : "active" };
  });

  let state: "awake" | "sleeping" | "dreaming" = "awake";
  if (tick.isSleeping) state = "sleeping";
  if (tick.paused) state = "dreaming";

  return {
    repos,
    repoCount: repos.length,
    sessionId: session?.id?.slice(0, 8) ?? "unknown",
    uptime: formatUptime(uptimeMs),
    uptimeSeconds: Math.floor(uptimeMs / 1000),
    state,
    tickCount,
    lastTickAt: new Date(lastTickAt).toISOString(),
    nextTickIn,
    tickInterval: config.tickInterval,
    adaptiveInterval,
    tickModel: config.tickModel,
    escalationModel: config.escalationModel,
  };
}
