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

// ── State visuals ────────────────────────────────

interface StateStyle {
  dot: string;
  bg: string;
  text: string;
  label: string;
}

function stateStyle(state: string): StateStyle {
  switch (state) {
    case "awake":
      return {
        dot: `<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#39E795"/></svg>`,
        bg: "bg-success/10",
        text: "text-success",
        label: "Awake",
      };
    case "sleeping":
      return {
        dot: `<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#a855f7"/></svg>`,
        bg: "bg-purple/10",
        text: "text-purple",
        label: "Sleeping",
      };
    case "dreaming":
      return {
        dot: `<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#60a5fa"/></svg>`,
        bg: "bg-info/10",
        text: "text-info",
        label: "Dreaming",
      };
    default:
      return {
        dot: `<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#6b7280"/></svg>`,
        bg: "bg-surface-light",
        text: "text-text-muted",
        label: "Unknown",
      };
  }
}

// ── Icons ────────────────────────────────────────

const ICON = {
  logo: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
    <line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
  </svg>`,
  repos: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>`,
  tick: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  clock: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  model: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`,
  session: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`,
  uptime: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
};

// ── Fragment ─────────────────────────────────────

export function getOverviewFragment(ctx: DashboardContext): string {
  const data = getOverviewJSON(ctx);
  const ss = stateStyle(data.state);

  return `<div class="flex items-center gap-5 flex-wrap">
  <!-- Logo -->
  <span class="flex items-center gap-2 font-bold text-lg tracking-[0.15em] text-vigil whitespace-nowrap" style="text-shadow:0 0 12px rgba(255,129,2,0.3)">
    <span class="text-vigil" style="filter:drop-shadow(0 0 4px rgba(255,129,2,0.4))">${ICON.logo}</span>
    VIGIL
  </span>

  <!-- Stat Cards -->
  <div class="flex gap-2 flex-wrap flex-1">
    <!-- State -->
    <div class="flex items-center gap-2 ${ss.bg} border border-border rounded-lg px-3 py-1.5 text-xs font-medium ${ss.text}">
      ${ss.dot} ${ss.label}
    </div>

    <!-- Repos -->
    <div class="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text">
      <span class="text-text-muted">${ICON.repos}</span>
      Repos: <span class="font-semibold text-text">${data.repoCount}</span>
    </div>

    <!-- Tick -->
    <div class="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text">
      <span class="text-vigil">${ICON.tick}</span>
      Tick <span class="font-mono font-semibold text-vigil">#${data.tickCount}</span>
      <span class="text-text-muted">~${data.adaptiveInterval}s</span>
    </div>

    <!-- Countdown -->
    <div class="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text" id="countdown" data-next="${data.nextTickIn}">
      <span class="text-text-muted">${ICON.clock}</span>
      Next: <span class="font-mono font-semibold">${data.nextTickIn}s</span>
    </div>

    <!-- Model -->
    <div class="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text">
      <span class="text-vigil">${ICON.model}</span>
      <span class="font-mono">${shortModel(data.tickModel)}</span>
    </div>
  </div>

  <!-- Session Meta -->
  <div class="flex items-center gap-4 text-xs text-text-muted">
    <span class="flex items-center gap-1.5">${ICON.session} ${data.sessionId}</span>
    <span class="flex items-center gap-1.5">${ICON.uptime} ${data.uptime}</span>
  </div>
</div>`;
}
