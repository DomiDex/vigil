import type { ActionRequest, ActionStatus, ActionTier } from "../../action/executor.ts";
import type { DashboardContext } from "../server.ts";

// ── Helpers ──

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

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

const TIER_BADGE: Record<ActionTier, string> = {
  safe: "bg-success/15 text-success",
  moderate: "bg-warning/15 text-warning",
  dangerous: "bg-error/15 text-error",
};

const TIER_BORDER: Record<ActionTier, string> = {
  safe: "border-success/40",
  moderate: "border-warning/40",
  dangerous: "border-error/40",
};

const STATUS_ICONS: Record<ActionStatus, string> = {
  pending: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  approved: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
  rejected: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  executed: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="16 10 11 15 8 12"/></svg>`,
  failed: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
};

const GATE_LABELS: Record<string, string> = {
  "1_config_enabled": "Gate 1: Config enabled",
  "2_session_optin": "Gate 2: Session opted in",
  "3_repo_allowed": "Gate 3: Repo in allowlist",
  "4_action_allowed": "Gate 4: Action type allowed",
  "5_confidence": "Gate 5: Confidence threshold",
  "6_confirmation": "Gate 6: User approval",
  command_validation: "Command validation",
};

// ── GET /api/actions ──

export function getActionsJSON(ctx: DashboardContext, opts?: { status?: string }) {
  const executor = ctx.daemon.actionExecutor;
  const recent = executor.getRecent(50);
  const pending = executor.getPending();

  const filtered = opts?.status ? recent.filter((a) => a.status === opts.status) : recent;

  // Compute stats
  const stats = { approved: 0, rejected: 0, executed: 0, failed: 0, pending: 0 };
  const byTier = { safe: 0, moderate: 0, dangerous: 0 };
  for (const a of recent) {
    stats[a.status as keyof typeof stats] = (stats[a.status as keyof typeof stats] || 0) + 1;
    byTier[a.tier] = (byTier[a.tier] || 0) + 1;
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

// ── Gate checklist HTML ──

function renderGateChecklist(action: ActionRequest): string {
  if (!action.gateResults) return "";

  const gates = Object.entries(action.gateResults);
  const items = gates
    .map(([key, passed]) => {
      const label = GATE_LABELS[key] || key;
      const icon = passed
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--vigil-success)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`
        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--vigil-error)" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      return `<li class="flex items-center gap-2 text-sm ${passed ? "text-success" : "text-error"}">${icon} ${escapeHtml(label)}</li>`;
    })
    .join("");

  // Add Gate 6 (confirmation) for pending actions
  if (action.status === "pending") {
    const icon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--vigil-warning)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    return `<ul class="list-none p-0 my-3 flex flex-col gap-1.5">${items}<li class="flex items-center gap-2 text-sm text-warning">${icon} ${escapeHtml(GATE_LABELS["6_confirmation"])}</li></ul>`;
  }

  return `<ul class="list-none p-0 my-3 flex flex-col gap-1.5">${items}</ul>`;
}

// ── Pending card HTML ──

function renderPendingCard(action: ActionRequest): string {
  return `
  <div class="bg-surface rounded-xl border-2 ${TIER_BORDER[action.tier]} p-6 mb-4 transition-all duration-150 hover:shadow-[0_0_12px_rgba(255,129,2,0.06)]" id="action-${action.id}">
    <div class="flex items-center gap-3 mb-3">
      <span class="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${TIER_BADGE[action.tier]}">${action.tier}</span>
      <code class="font-mono text-sm text-vigil bg-vigil/5 px-2 py-0.5 rounded">${escapeHtml(action.command)}</code>
      <span class="ml-auto text-sm text-text-muted">${escapeHtml(action.repo)}</span>
    </div>
    <div class="text-sm text-text mt-1">
      <span class="text-text font-medium text-sm">Reason:</span> ${escapeHtml(action.reason)}
    </div>
    <div class="text-sm text-text-muted mt-1">
      <span class="text-text font-medium text-sm">Confidence:</span> ${(action.confidence * 100).toFixed(0)}%
    </div>
    ${renderGateChecklist(action)}
    <div class="flex gap-2 mt-4 justify-end">
      <button class="inline-flex items-center gap-1.5 px-6 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors bg-success/15 text-success border border-success/30 hover:bg-success/25"
              hx-post="/api/actions/${action.id}/approve"
              hx-target="#actions-panel"
              hx-swap="innerHTML">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        Approve
      </button>
      <button class="inline-flex items-center gap-1.5 px-6 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors bg-error/10 text-error border border-error/30 hover:bg-error/20"
              hx-post="/api/actions/${action.id}/reject"
              hx-target="#actions-panel"
              hx-swap="innerHTML">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        Reject
      </button>
    </div>
  </div>`;
}

// ── GET /api/actions/fragment ──

export function getActionsFragment(ctx: DashboardContext, opts?: { status?: string }): string {
  const data = getActionsJSON(ctx, opts);

  // Filter bar
  const activeFilter = opts?.status || "";
  function filterClass(status: string): string {
    const base = "act-filter inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm cursor-pointer transition-all duration-150";
    return status === activeFilter
      ? `${base} active bg-vigil/10 text-vigil border border-vigil shadow-[0_0_8px_rgba(255,129,2,0.1)]`
      : `${base} bg-surface text-text-muted border border-border hover:text-text hover:border-vigil/30`;
  }

  const filterBar = `
  <div class="flex gap-2 flex-wrap mb-4">
    <button class="${filterClass("")}"
            hx-get="/api/actions/fragment"
            hx-target="#actions-panel"
            hx-swap="innerHTML">All</button>
    <button class="${filterClass("pending")}"
            hx-get="/api/actions/fragment?status=pending"
            hx-target="#actions-panel"
            hx-swap="innerHTML">Pending <span class="bg-white/8 px-1.5 py-0.5 rounded-full text-xs font-mono">${data.stats.pending}</span></button>
    <button class="${filterClass("executed")}"
            hx-get="/api/actions/fragment?status=executed"
            hx-target="#actions-panel"
            hx-swap="innerHTML">Executed <span class="bg-white/8 px-1.5 py-0.5 rounded-full text-xs font-mono">${data.stats.executed}</span></button>
    <button class="${filterClass("rejected")}"
            hx-get="/api/actions/fragment?status=rejected"
            hx-target="#actions-panel"
            hx-swap="innerHTML">Rejected <span class="bg-white/8 px-1.5 py-0.5 rounded-full text-xs font-mono">${data.stats.rejected}</span></button>
    <button class="${filterClass("failed")}"
            hx-get="/api/actions/fragment?status=failed"
            hx-target="#actions-panel"
            hx-swap="innerHTML">Failed <span class="bg-white/8 px-1.5 py-0.5 rounded-full text-xs font-mono">${data.stats.failed}</span></button>
  </div>`;

  // Pending approval section
  const pendingSection =
    data.pending.length > 0
      ? `
  <div class="bg-surface rounded-lg border border-border p-5 mb-4">
    <h3 class="flex items-center gap-2 text-sm font-semibold text-text mb-4">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--vigil-warning)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      Pending Approval
      <span class="bg-vigil text-black text-[0.7rem] px-2 py-0.5 rounded-full font-bold shadow-[0_0_8px_rgba(255,129,2,0.1)]">${data.pending.length}</span>
    </h3>
    ${data.pending.map(renderPendingCard).join("")}
  </div>`
      : "";

  // History table
  const STATUS_COLOR: Record<string, string> = {
    pending: "text-warning",
    approved: "text-success",
    executed: "text-success",
    rejected: "text-text-muted",
    failed: "text-error",
  };

  const historyRows =
    data.actions.length > 0
      ? data.actions
          .map((a) => {
            const resultText =
              a.status === "executed"
                ? escapeHtml((a.result || "").slice(0, 60) || "ok")
                : a.status === "failed"
                  ? escapeHtml((a.error || "").slice(0, 60))
                  : a.status === "rejected"
                    ? escapeHtml(a.error || "user")
                    : "";

            return `
      <tr class="hover:bg-vigil/5 transition-colors">
        <td class="text-text-muted text-sm font-mono px-3 py-2 border-b border-border">${escapeHtml(a.timeFormatted)}</td>
        <td class="px-3 py-2 border-b border-border"><code class="font-mono text-sm text-text bg-surface-dark px-1.5 py-0.5 rounded">${escapeHtml(a.command)}</code></td>
        <td class="px-3 py-2 border-b border-border text-sm">${escapeHtml(a.repo)}</td>
        <td class="px-3 py-2 border-b border-border"><span class="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${TIER_BADGE[a.tier]}">${a.tier}</span></td>
        <td class="px-3 py-2 border-b border-border">
          <span class="flex items-center gap-1.5 ${STATUS_COLOR[a.status] || "text-text-muted"}">
            ${STATUS_ICONS[a.status] || ""}
            <span class="text-sm">${a.status}</span>
          </span>
        </td>
        <td class="text-text-muted text-sm max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2 border-b border-border">${resultText}</td>
      </tr>`;
          })
          .join("")
      : `<tr><td colspan="6" class="text-sm text-text-muted text-center py-6">No actions recorded.</td></tr>`;

  // Stats section
  const totalActions = data.stats.approved + data.stats.rejected + data.stats.executed + data.stats.failed + data.stats.pending;
  const statsSection = `
  <div class="bg-surface rounded-lg border border-border p-5">
    <h3 class="flex items-center gap-2 text-sm font-semibold text-text mb-4">Stats</h3>
    <div class="flex gap-8 flex-wrap">
      <div class="flex flex-col gap-1">
        <span class="text-xs text-text-muted uppercase tracking-wider">Executed</span>
        <span class="text-lg font-semibold font-mono text-success">${data.stats.executed}</span>
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs text-text-muted uppercase tracking-wider">Rejected</span>
        <span class="text-lg font-semibold font-mono text-error">${data.stats.rejected}</span>
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs text-text-muted uppercase tracking-wider">Failed</span>
        <span class="text-lg font-semibold font-mono text-warning">${data.stats.failed}</span>
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs text-text-muted uppercase tracking-wider">Pending</span>
        <span class="text-lg font-semibold font-mono text-text">${data.stats.pending}</span>
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs text-text-muted uppercase tracking-wider">Total</span>
        <span class="text-lg font-semibold font-mono text-text">${totalActions}</span>
      </div>
    </div>
    <div class="flex gap-8 flex-wrap mt-4">
      <span class="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider bg-success/15 text-success">safe: ${data.byTier.safe}</span>
      <span class="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider bg-warning/15 text-warning">moderate: ${data.byTier.moderate}</span>
      <span class="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider bg-error/15 text-error">dangerous: ${data.byTier.dangerous}</span>
    </div>
  </div>`;

  return `
<div class="flex flex-col gap-4">
  ${filterBar}
  ${pendingSection}

  <div class="bg-surface rounded-lg border border-border p-5 mb-4">
    <h3 class="flex items-center gap-2 text-sm font-semibold text-text mb-4">Action History</h3>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr>
            <th class="text-left px-3 py-2 text-xs text-text-muted uppercase tracking-wider border-b border-border bg-surface-dark">Time</th>
            <th class="text-left px-3 py-2 text-xs text-text-muted uppercase tracking-wider border-b border-border bg-surface-dark">Action</th>
            <th class="text-left px-3 py-2 text-xs text-text-muted uppercase tracking-wider border-b border-border bg-surface-dark">Repo</th>
            <th class="text-left px-3 py-2 text-xs text-text-muted uppercase tracking-wider border-b border-border bg-surface-dark">Tier</th>
            <th class="text-left px-3 py-2 text-xs text-text-muted uppercase tracking-wider border-b border-border bg-surface-dark">Status</th>
            <th class="text-left px-3 py-2 text-xs text-text-muted uppercase tracking-wider border-b border-border bg-surface-dark">Result</th>
          </tr>
        </thead>
        <tbody>${historyRows}</tbody>
      </table>
    </div>
  </div>

  ${statsSection}
</div>`;
}

// ── POST /api/actions/:id/approve ──

export async function handleApprove(ctx: DashboardContext, id: string): Promise<string> {
  const executor = ctx.daemon.actionExecutor;
  const action = executor.getById(id);
  if (!action) return getActionsFragment(ctx);

  // Find repo path for execution
  const repoPath = ctx.daemon.repoPaths.find((p) => p.endsWith(`/${action.repo}`)) || ctx.daemon.repoPaths[0];
  if (repoPath) {
    await executor.approve(id, repoPath);
  }

  return getActionsFragment(ctx);
}

// ── POST /api/actions/:id/reject ──

export function handleReject(ctx: DashboardContext, id: string): string {
  ctx.daemon.actionExecutor.reject(id);
  return getActionsFragment(ctx);
}
