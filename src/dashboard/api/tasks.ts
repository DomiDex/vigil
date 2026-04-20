import type { TaskStatus } from "../../core/task-manager.ts";
import type { DashboardContext } from "../types.ts";

// ── Helpers ──

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

// ── POST /api/tasks ──

export function handleTaskCreate(
  ctx: DashboardContext,
  formData: FormData,
): { ok: boolean; id?: string; error?: string } {
  const title = formData.get("title")?.toString() || "";
  const repo = formData.get("repo")?.toString() || "";
  const description = formData.get("description")?.toString() || "";

  if (!title) return { ok: false, error: "Title is required" };
  if (!repo) return { ok: false, error: "Repository is required" };

  const task = ctx.daemon.taskManager.create({ repo, title, description });
  return { ok: true, id: task?.id };
}

// ── PUT /api/tasks/:id ──

export function handleTaskUpdate(ctx: DashboardContext, id: string, formData: FormData): { ok: boolean } {
  const title = formData.get("title")?.toString();
  const description = formData.get("description")?.toString();
  const repo = formData.get("repo")?.toString();

  ctx.daemon.taskManager.update(id, {
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(repo !== undefined ? { repo } : {}),
  });
  return { ok: true };
}

// ── POST /api/tasks/:id/activate ──

export function handleTaskActivate(ctx: DashboardContext, id: string): { ok: boolean } {
  ctx.daemon.taskManager.activate(id);
  return { ok: true };
}

// ── POST /api/tasks/:id/complete ──

export function handleTaskComplete(ctx: DashboardContext, id: string): { ok: boolean } {
  ctx.daemon.taskManager.complete(id, "Completed via dashboard");
  return { ok: true };
}

// ── POST /api/tasks/:id/fail ──

export function handleTaskFail(ctx: DashboardContext, id: string): { ok: boolean } {
  ctx.daemon.taskManager.fail(id, "Failed via dashboard");
  return { ok: true };
}

// ── DELETE /api/tasks/:id ──

export function handleTaskCancel(ctx: DashboardContext, id: string): { ok: boolean } {
  ctx.daemon.taskManager.cancel(id);
  return { ok: true };
}
