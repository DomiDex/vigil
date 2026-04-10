import type { DashboardContext } from "../server.ts";

function formatUptime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
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
  // dreaming is set during consolidation — approximate via lastConsolidation
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

function stateIcon(state: string): string {
  switch (state) {
    case "awake":
      return `<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="#22c55e"/></svg>`;
    case "sleeping":
      return `<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="#8b8fc7"/></svg>`;
    case "dreaming":
      return `<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="#a855f7"/></svg>`;
    default:
      return `<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="#6b7280"/></svg>`;
  }
}

export function getOverviewFragment(ctx: DashboardContext): string {
  const data = getOverviewJSON(ctx);
  const stateLabel = data.state.charAt(0).toUpperCase() + data.state.slice(1);

  return `<div class="top-bar">
  <span class="logo">
    <svg class="logo-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="3"/>
      <line x1="12" y1="2" x2="12" y2="5"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="5" y2="12"/>
      <line x1="19" y1="12" x2="22" y2="12"/>
    </svg>
    VIGIL
  </span>
  <div class="stat-cards">
    <div class="card state ${data.state}">${stateIcon(data.state)} ${stateLabel}</div>
    <div class="card repos">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
      Repos: ${data.repoCount}
    </div>
    <div class="card tick">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      Tick #${data.tickCount} <small>~${data.adaptiveInterval}s adapt</small>
    </div>
    <div class="card countdown" id="countdown" data-next="${data.nextTickIn}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      Next: ${data.nextTickIn}s
    </div>
    <div class="card model">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
      ${shortModel(data.tickModel)}
    </div>
  </div>
  <div class="meta">
    <span>Session: ${data.sessionId}</span>
    <span>Uptime: ${data.uptime}</span>
  </div>
</div>`;
}
