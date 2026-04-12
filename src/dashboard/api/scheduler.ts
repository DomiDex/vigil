import type { DashboardContext } from "../server.ts";

// ── Helpers ──

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

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

function formatDate(ts: number): string {
  const d = new Date(ts);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${months[d.getMonth()]} ${d.getDate()}, ${h12}:${m} ${ampm}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
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

// ── GET /api/scheduler/fragment ──

export function getSchedulerFragment(ctx: DashboardContext): string {
  const data = getSchedulerJSON(ctx);

  // Build repo options
  const repos = ctx.daemon.repoPaths.map((p) => p.split("/").pop() || p);
  const repoOptions = repos.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");

  // Schedule table rows
  const tableRows =
    data.entries.length > 0
      ? data.entries
          .map(
            (e) => `
      <tr class="hover:bg-surface-light transition-colors">
        <td class="font-medium text-text px-3 py-2 border-b border-border">${escapeHtml(e.name)}</td>
        <td class="px-3 py-2 border-b border-border"><code class="font-mono text-vigil text-sm bg-vigil/5 px-2 py-0.5 rounded">${escapeHtml(e.cron)}</code></td>
        <td class="px-3 py-2 border-b border-border text-sm">${e.repo ? escapeHtml(e.repo) : '<span class="text-text-muted">--</span>'}</td>
        <td class="px-3 py-2 border-b border-border"><span class="sched-countdown text-info text-sm font-mono" data-ms="${e.msToNext ?? 0}">${escapeHtml(e.nextRunRelative)}</span></td>
        <td class="px-3 py-2 border-b border-border">
          <div class="flex gap-1.5">
            <button class="inline-flex items-center gap-1 px-2.5 py-1.5 border border-border rounded-lg bg-transparent text-xs text-text-muted cursor-pointer transition-all duration-150 hover:border-success hover:text-success"
                    hx-post="/api/scheduler/${e.id}/trigger"
                    hx-target="#scheduler-panel"
                    hx-swap="innerHTML">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Run
            </button>
            <button class="inline-flex items-center gap-1 px-2.5 py-1.5 border border-border rounded-lg bg-transparent text-xs text-text-muted cursor-pointer transition-all duration-150 hover:border-error hover:text-error"
                    hx-delete="/api/scheduler/${e.id}"
                    hx-target="#scheduler-panel"
                    hx-swap="innerHTML"
                    hx-confirm="Delete schedule '${escapeHtml(e.name)}'?">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </td>
      </tr>`,
          )
          .join("")
      : `<tr><td colspan="5" class="text-sm text-text-muted text-center py-6">No schedules configured yet.</td></tr>`;

  // Run history rows
  const TH = "text-left px-3 py-2 text-xs text-text-muted uppercase tracking-wider border-b border-border bg-surface-dark";
  const historyRows =
    data.history.length > 0
      ? data.history
          .slice(0, 20)
          .map(
            (r) => `
      <tr class="hover:bg-surface-light transition-colors">
        <td class="px-3 py-2 border-b border-border text-sm">${formatDate(r.startedAt)}</td>
        <td class="px-3 py-2 border-b border-border text-sm">${escapeHtml(r.scheduleName)}</td>
        <td class="px-3 py-2 border-b border-border text-sm ${r.status === "ok" ? "text-success" : "text-error"}">
          ${r.status === "ok" ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ok' : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> fail'}
        </td>
        <td class="px-3 py-2 border-b border-border text-sm text-text-muted">${formatDuration(r.duration)}</td>
        <td class="px-3 py-2 border-b border-border text-sm text-text-muted">${r.error ? escapeHtml(r.error) : ""}</td>
      </tr>`,
          )
          .join("")
      : `<tr><td colspan="5" class="text-sm text-text-muted text-center py-6">No runs recorded yet.</td></tr>`;

  const INPUT = "w-full bg-surface-dark border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-vigil";

  return `
<div class="flex flex-col gap-4">
  <!-- Schedule Table -->
  <div class="bg-surface rounded-lg border border-border p-5">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-semibold text-text uppercase tracking-wider">Schedules</h3>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr>
            <th class="${TH}">Name</th>
            <th class="${TH}">Cron</th>
            <th class="${TH}">Repo</th>
            <th class="${TH}">Next Run</th>
            <th class="${TH}">Actions</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  </div>

  <!-- Add Schedule Form -->
  <div class="bg-surface rounded-lg border border-border p-6">
    <h3 class="text-sm font-semibold text-text uppercase tracking-wider mb-4">Add Schedule</h3>
    <form class="flex flex-col gap-4"
          hx-post="/api/scheduler"
          hx-target="#scheduler-panel"
          hx-swap="innerHTML">
      <div class="flex gap-4 flex-wrap">
        <div class="flex-1 min-w-[200px]">
          <label for="sched-name" class="block text-xs text-text-muted uppercase tracking-wider mb-1">Name</label>
          <input type="text" id="sched-name" name="name" placeholder="e.g., Nightly dream" required class="${INPUT}">
        </div>
        <div class="flex-1 min-w-[200px]">
          <label for="sched-action" class="block text-xs text-text-muted uppercase tracking-wider mb-1">Action</label>
          <select id="sched-action" name="action" class="${INPUT}" required>
            <option value="dream">Dream (memory consolidation)</option>
            <option value="check">Check (run a tick)</option>
          </select>
        </div>
      </div>
      <div class="flex gap-4 flex-wrap">
        <div class="flex-1 min-w-[200px]">
          <label for="sched-repo" class="block text-xs text-text-muted uppercase tracking-wider mb-1">Repo</label>
          <select id="sched-repo" name="repo" class="${INPUT}">
            <option value="">All repos</option>
            ${repoOptions}
          </select>
        </div>
        <div class="flex-1 min-w-[200px]">
          <label class="block text-xs text-text-muted uppercase tracking-wider mb-1">Repeat</label>
          <select id="sched-mode" class="${INPUT}">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly (pick days)</option>
            <option value="interval">Every N hours</option>
          </select>
        </div>
      </div>
      <div class="flex gap-4 flex-wrap">
        <div class="flex-1 min-w-[200px]" id="sched-days-field" style="display:none">
          <label class="block text-xs text-text-muted uppercase tracking-wider mb-1">Days</label>
          <div class="flex gap-1.5 flex-wrap">
            <button type="button" class="sched-day bg-surface-dark border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-muted cursor-pointer transition-all duration-150 min-w-[2.5rem] text-center hover:border-vigil/30" data-day="1">Mon</button>
            <button type="button" class="sched-day bg-surface-dark border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-muted cursor-pointer transition-all duration-150 min-w-[2.5rem] text-center hover:border-vigil/30" data-day="2">Tue</button>
            <button type="button" class="sched-day bg-surface-dark border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-muted cursor-pointer transition-all duration-150 min-w-[2.5rem] text-center hover:border-vigil/30" data-day="3">Wed</button>
            <button type="button" class="sched-day bg-surface-dark border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-muted cursor-pointer transition-all duration-150 min-w-[2.5rem] text-center hover:border-vigil/30" data-day="4">Thu</button>
            <button type="button" class="sched-day bg-surface-dark border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-muted cursor-pointer transition-all duration-150 min-w-[2.5rem] text-center hover:border-vigil/30" data-day="5">Fri</button>
            <button type="button" class="sched-day bg-surface-dark border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-muted cursor-pointer transition-all duration-150 min-w-[2.5rem] text-center hover:border-vigil/30" data-day="6">Sat</button>
            <button type="button" class="sched-day bg-surface-dark border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-muted cursor-pointer transition-all duration-150 min-w-[2.5rem] text-center hover:border-vigil/30" data-day="0">Sun</button>
          </div>
        </div>
        <div class="flex-1 min-w-[200px]" id="sched-time-field">
          <label for="sched-time" class="block text-xs text-text-muted uppercase tracking-wider mb-1">Time</label>
          <input type="time" id="sched-time" value="02:00" class="${INPUT} font-mono [color-scheme:dark]">
        </div>
        <div class="flex-1 min-w-[200px]" id="sched-interval-field" style="display:none">
          <label for="sched-interval-val" class="block text-xs text-text-muted uppercase tracking-wider mb-1">Interval</label>
          <select id="sched-interval-val" class="${INPUT}">
            <option value="30m">Every 30 minutes</option>
            <option value="1h">Every hour</option>
            <option value="2h">Every 2 hours</option>
            <option value="4h">Every 4 hours</option>
            <option value="6h" selected>Every 6 hours</option>
            <option value="12h">Every 12 hours</option>
          </select>
        </div>
      </div>
      <div class="flex gap-4 flex-wrap">
        <div class="flex-1">
          <span class="text-sm text-vigil-light font-mono p-1.5" id="sched-cron-preview">Runs daily at 2:00 AM</span>
          <input type="hidden" id="sched-cron" name="cron" value="0 2 * * *">
        </div>
      </div>
      <div class="flex justify-end">
        <button type="submit" class="inline-flex items-center gap-1.5 bg-vigil hover:bg-vigil-hover text-black font-medium rounded-lg px-4 py-2 text-sm transition-colors cursor-pointer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Create Schedule
        </button>
      </div>
    </form>
  </div>

  <!-- Run History -->
  <div class="bg-surface rounded-lg border border-border p-5">
    <h3 class="text-sm font-semibold text-text uppercase tracking-wider mb-3">Run History</h3>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr>
            <th class="${TH}">Time</th>
            <th class="${TH}">Schedule</th>
            <th class="${TH}">Status</th>
            <th class="${TH}">Duration</th>
            <th class="${TH}">Error</th>
          </tr>
        </thead>
        <tbody>${historyRows}</tbody>
      </table>
    </div>
  </div>
</div>`;
}

// ── POST /api/scheduler ──

export async function handleSchedulerCreate(ctx: DashboardContext, formData: FormData): Promise<string> {
  const name = formData.get("name")?.toString() || "";
  const cron = formData.get("cron")?.toString() || "";
  const repo = formData.get("repo")?.toString() || undefined;
  const action = formData.get("action")?.toString() || "";

  if (!name || !cron || !action) {
    return getSchedulerFragment(ctx);
  }

  // Validate cron expression by trying to create a Cron instance
  try {
    const { Cron } = await import("croner");
    const test = new Cron(cron);
    test.stop();
  } catch {
    // Invalid cron, return fragment as-is
    return getSchedulerFragment(ctx);
  }

  ctx.daemon.scheduler.add({ name, cron, action, repo });
  return getSchedulerFragment(ctx);
}

// ── DELETE /api/scheduler/:id ──

export function handleSchedulerDelete(ctx: DashboardContext, id: string): string {
  ctx.daemon.scheduler.remove(id);
  return getSchedulerFragment(ctx);
}

// ── POST /api/scheduler/:id/trigger ──

export async function handleSchedulerTrigger(ctx: DashboardContext, id: string): Promise<string> {
  await ctx.daemon.scheduler.trigger(id);
  return getSchedulerFragment(ctx);
}
