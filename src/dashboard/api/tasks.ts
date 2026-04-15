import type { TaskStatus } from "../../core/task-manager.ts";
import type { DashboardContext } from "../types.ts";

// ── Helpers ──

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatRelativeDate(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

const STATUS_ICONS: Record<string, string> = {
  pending: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`,
  active: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  waiting: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  completed: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
  failed: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  cancelled: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
};

const STATUS_LABELS: Record<string, string> = {
  pending: "To Do",
  active: "In Progress",
  waiting: "Waiting",
  completed: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

// ── GET /api/tasks ──

export function getTasksJSON(ctx: DashboardContext, opts?: { status?: string; repo?: string }) {
  const tm = ctx.daemon.taskManager;
  const tasks = tm.list({
    status: opts?.status as TaskStatus | undefined,
    repo: opts?.repo || undefined,
    limit: 100,
  });

  const allTasks = tm.list({ limit: 1000 });
  const counts: Record<string, number> = {
    pending: 0,
    active: 0,
    waiting: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const t of allTasks) {
    counts[t.status] = (counts[t.status] || 0) + 1;
  }

  const total = allTasks.length;
  const completionRate = total > 0 ? Math.round((counts.completed / total) * 100) : 0;

  return {
    tasks: tasks.map((t) => ({
      ...t,
      waitCondition: t.waitCondition,
      updatedRelative: formatRelativeDate(t.updatedAt),
    })),
    counts,
    completionRate,
  };
}

// ── Task Card Builder ──

const STATUS_COLOR: Record<string, string> = {
  pending: "text-text-muted",
  active: "text-vigil",
  waiting: "text-purple",
  completed: "text-success",
  failed: "text-error",
  cancelled: "text-text-muted/50",
};

const CARD_BORDER: Record<string, string> = {
  active: "border-l-3 border-l-vigil",
  waiting: "border-l-3 border-l-warning",
};

const BTN =
  "inline-flex items-center gap-1 px-2.5 py-1.5 border border-border rounded-lg bg-transparent text-xs text-text-muted cursor-pointer transition-all duration-150 whitespace-nowrap hover:bg-white/3 hover:text-text";
const BTN_PRIMARY = `${BTN} bg-vigil border-vigil text-white font-medium hover:bg-vigil-hover`;
const BTN_DONE = `${BTN} border-success/30 text-success hover:bg-success/10`;
const BTN_DANGER = `${BTN} border-transparent text-text-muted opacity-60 hover:opacity-100 hover:text-error`;

function renderTaskCard(t: any, repos: string[]): string {
  const isTerminal = t.status === "completed" || t.status === "failed" || t.status === "cancelled";
  const repoOptions = repos
    .map((r) => `<option value="${escapeHtml(r)}"${r === t.repo ? " selected" : ""}>${escapeHtml(r)}</option>`)
    .join("");

  let primaryAction = "";
  let secondaryActions = "";

  if (t.status === "pending") {
    primaryAction = `
      <button class="task-card-btn ${BTN_PRIMARY}"
              hx-post="/api/tasks/${t.id}/activate"
              hx-target="#tasks-panel" hx-swap="innerHTML"
              title="Start working on this">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Start
      </button>`;
    secondaryActions = `
      <button class="task-card-btn ${BTN_DONE}"
              hx-post="/api/tasks/${t.id}/complete"
              hx-target="#tasks-panel" hx-swap="innerHTML"
              title="Mark as done">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        Done
      </button>`;
  } else if (t.status === "active") {
    primaryAction = `
      <button class="task-card-btn ${BTN_DONE}"
              hx-post="/api/tasks/${t.id}/complete"
              hx-target="#tasks-panel" hx-swap="innerHTML"
              title="Mark as done">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        Done
      </button>`;
    secondaryActions = `
      <button class="task-card-btn ${BTN_DANGER}"
              hx-post="/api/tasks/${t.id}/fail"
              hx-target="#tasks-panel" hx-swap="innerHTML"
              title="Mark as failed">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        Failed
      </button>`;
  } else if (t.status === "waiting") {
    primaryAction = `
      <button class="task-card-btn ${BTN_PRIMARY}"
              hx-post="/api/tasks/${t.id}/activate"
              hx-target="#tasks-panel" hx-swap="innerHTML"
              title="Start now (skip wait)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Start Now
      </button>`;
  }

  const editDeleteBtns = !isTerminal
    ? `
      <button class="task-card-btn ${BTN}" onclick="toggleTaskEdit(this)" title="Edit">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="task-card-btn ${BTN_DANGER}"
              hx-delete="/api/tasks/${t.id}"
              hx-target="#tasks-panel" hx-swap="innerHTML"
              hx-confirm="Delete this task?"
              title="Delete">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>`
    : `
      <button class="task-card-btn ${BTN_DANGER}"
              hx-delete="/api/tasks/${t.id}"
              hx-target="#tasks-panel" hx-swap="innerHTML"
              hx-confirm="Remove this task?"
              title="Remove">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>`;

  const waitBadge = t.waitCondition
    ? `<span class="inline-block text-[0.7rem] text-warning bg-warning/10 px-1.5 py-0.5 rounded mt-1">Waiting for: ${escapeHtml(t.waitCondition.type)}${t.waitCondition.eventType ? ` (${escapeHtml(t.waitCondition.eventType)})` : ""}</span>`
    : "";

  const editForm = !isTerminal
    ? `
    <form class="task-edit-form flex flex-col gap-2 pt-3 mt-3 border-t border-border" style="display:none"
          hx-put="/api/tasks/${t.id}"
          hx-target="#tasks-panel" hx-swap="innerHTML">
      <input type="text" name="title" value="${escapeHtml(t.title)}" class="task-edit-title bg-surface-dark border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-vigil" placeholder="Task title" required>
      <input type="text" name="description" value="${escapeHtml(t.description || "")}" class="bg-surface-dark border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-vigil" placeholder="Description (optional)">
      <div class="flex gap-2">
        <select name="repo" class="bg-surface-dark border border-border rounded-lg px-3 py-2 text-sm text-text">${repoOptions}</select>
        <div class="flex gap-2 justify-end">
          <button type="submit" class="task-card-btn ${BTN_DONE}">Save</button>
          <button type="button" class="task-card-btn ${BTN}" onclick="toggleTaskEdit(this)">Cancel</button>
        </div>
      </div>
    </form>`
    : "";

  const cardBorder = CARD_BORDER[t.status] || "";

  return `
  <div class="task-card bg-surface rounded-lg border border-border p-4 transition-all duration-150 hover:border-white/6 ${cardBorder}${isTerminal ? " opacity-55 hover:opacity-75" : ""}">
    <div class="task-card-view flex items-start gap-3">
      <div class="flex">
        <span class="flex ${STATUS_COLOR[t.status] || "text-text-muted"}" title="${STATUS_LABELS[t.status] || t.status}">
          ${STATUS_ICONS[t.status] || ""}
        </span>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-text">${escapeHtml(t.title)}</span>
          <span class="text-xs text-text-muted mt-0.5">${escapeHtml(t.repo)} &middot; ${escapeHtml(t.updatedRelative)}</span>
        </div>
        ${t.description ? `<p class="text-sm text-text-muted mt-0.5">${escapeHtml(t.description)}</p>` : ""}
        ${waitBadge}
        ${t.result && isTerminal ? `<p class="text-xs text-text-muted mt-1">${escapeHtml(t.result)}</p>` : ""}
      </div>
      <div class="flex gap-1.5 shrink-0">
        ${primaryAction}
        ${secondaryActions}
        ${editDeleteBtns}
      </div>
    </div>
    ${editForm}
  </div>`;
}

// ── GET /api/tasks/fragment ──

export function getTasksFragment(ctx: DashboardContext, opts?: { status?: string; repo?: string }): string {
  const data = getTasksJSON(ctx, opts);
  const repos = ctx.daemon.repoPaths.map((p) => p.split("/").pop() || p);
  const repoOptions = repos.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");

  // Filter tabs
  const activeFilter = opts?.status || "";
  function filterClass(status: string): string {
    const base =
      "task-filter inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm cursor-pointer transition-all duration-150";
    return status === activeFilter
      ? `${base} active bg-vigil border-vigil text-black shadow-[0_0_8px_rgba(255,129,2,0.1)]`
      : `${base} bg-transparent text-text-muted border-border hover:border-vigil/30`;
  }
  const allCount = Object.values(data.counts).reduce((a, b) => a + b, 0);

  const filterBar = `
  <div class="flex gap-2 mb-4 flex-wrap">
    <button class="${filterClass("")}"
            hx-get="/api/tasks/fragment"
            hx-target="#tasks-panel" hx-swap="innerHTML">All <span class="bg-surface-dark text-text-muted rounded-full px-1.5 text-xs font-mono">${allCount}</span></button>
    <button class="${filterClass("pending")}"
            hx-get="/api/tasks/fragment?status=pending"
            hx-target="#tasks-panel" hx-swap="innerHTML">To Do <span class="bg-surface-dark text-text-muted rounded-full px-1.5 text-xs font-mono">${data.counts.pending}</span></button>
    <button class="${filterClass("active")}"
            hx-get="/api/tasks/fragment?status=active"
            hx-target="#tasks-panel" hx-swap="innerHTML">In Progress <span class="bg-surface-dark text-text-muted rounded-full px-1.5 text-xs font-mono">${data.counts.active}</span></button>
    <button class="${filterClass("waiting")}"
            hx-get="/api/tasks/fragment?status=waiting"
            hx-target="#tasks-panel" hx-swap="innerHTML">Waiting <span class="bg-surface-dark text-text-muted rounded-full px-1.5 text-xs font-mono">${data.counts.waiting}</span></button>
    <button class="${filterClass("completed")}"
            hx-get="/api/tasks/fragment?status=completed"
            hx-target="#tasks-panel" hx-swap="innerHTML">Done <span class="bg-surface-dark text-text-muted rounded-full px-1.5 text-xs font-mono">${data.counts.completed}</span></button>
  </div>`;

  // Task cards
  const taskCards =
    data.tasks.length > 0
      ? data.tasks.map((t) => renderTaskCard(t, repos)).join("")
      : `<div class="flex flex-col items-center gap-2 py-12 text-text-muted text-center">
           <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
             <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
           </svg>
           <p>No tasks yet</p>
           <span>Create one below to start tracking work</span>
         </div>`;

  // Progress bar
  const barWidth = Math.max(data.completionRate, 0);
  const progressBar =
    allCount > 0
      ? `<div class="flex flex-col gap-1.5 mb-4">
        <div class="flex justify-between items-center">
          <span class="text-xs text-text-muted">${data.counts.completed} of ${allCount} complete</span>
          <span class="text-xs text-text-muted font-mono">${data.completionRate}%</span>
        </div>
        <div class="h-1 bg-surface-dark rounded-full overflow-hidden">
          <div class="h-full bg-success rounded-full transition-all duration-400" style="width: ${barWidth}%"></div>
        </div>
      </div>`
      : "";

  // Create form
  const createForm = `
  <div class="bg-surface rounded-lg border border-border p-4 mb-4">
    <form class="flex flex-col gap-2"
          hx-post="/api/tasks"
          hx-target="#tasks-panel" hx-swap="innerHTML">
      <div class="flex gap-2 items-center">
        <input type="text" name="title" class="flex-1 bg-surface-dark border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-vigil" placeholder="What needs to be done?" required>
        <select name="repo" class="bg-surface-dark border border-border rounded-lg px-3 py-2 text-sm text-text min-w-[120px] cursor-pointer" required>
          <option value="" disabled selected>Repo</option>
          ${repoOptions}
        </select>
        <button type="submit" class="flex items-center justify-center w-10 h-10 bg-vigil rounded-lg text-white cursor-pointer shrink-0 transition-colors hover:bg-vigil-hover hover:shadow-[0_0_8px_rgba(255,129,2,0.1)]" title="Add task">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
      <div class="flex gap-2">
        <input type="text" name="description" class="flex-1 bg-surface-dark border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-vigil" placeholder="Add a description (optional)">
      </div>
    </form>
  </div>`;

  return `
<div class="flex flex-col gap-4">
  ${createForm}
  ${progressBar}
  ${filterBar}
  <div class="flex flex-col gap-2">
    ${taskCards}
  </div>
</div>`;
}

// ── POST /api/tasks ──

export function handleTaskCreate(ctx: DashboardContext, formData: FormData): string {
  const title = formData.get("title")?.toString() || "";
  const repo = formData.get("repo")?.toString() || "";
  const description = formData.get("description")?.toString() || "";

  if (!title || !repo) {
    return getTasksFragment(ctx);
  }

  ctx.daemon.taskManager.create({ repo, title, description });
  return getTasksFragment(ctx);
}

// ── PUT /api/tasks/:id ──

export function handleTaskUpdate(ctx: DashboardContext, id: string, formData: FormData): string {
  const title = formData.get("title")?.toString();
  const description = formData.get("description")?.toString();
  const repo = formData.get("repo")?.toString();

  ctx.daemon.taskManager.update(id, {
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(repo !== undefined ? { repo } : {}),
  });
  return getTasksFragment(ctx);
}

// ── POST /api/tasks/:id/activate ──

export function handleTaskActivate(ctx: DashboardContext, id: string): string {
  ctx.daemon.taskManager.activate(id);
  return getTasksFragment(ctx);
}

// ── POST /api/tasks/:id/complete ──

export function handleTaskComplete(ctx: DashboardContext, id: string): string {
  ctx.daemon.taskManager.complete(id, "Completed via dashboard");
  return getTasksFragment(ctx);
}

// ── POST /api/tasks/:id/fail ──

export function handleTaskFail(ctx: DashboardContext, id: string): string {
  ctx.daemon.taskManager.fail(id, "Failed via dashboard");
  return getTasksFragment(ctx);
}

// ── DELETE /api/tasks/:id ──

export function handleTaskCancel(ctx: DashboardContext, id: string): string {
  ctx.daemon.taskManager.cancel(id);
  return getTasksFragment(ctx);
}
