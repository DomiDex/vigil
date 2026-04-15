import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskManager } from "../../core/task-manager.ts";
import { getTasksFragment, getTasksJSON, handleTaskCreate, handleTaskUpdate } from "../../dashboard/api/tasks.ts";
import type { DashboardContext } from "../../dashboard/server.ts";

function makeMockCtx(taskManager: TaskManager): DashboardContext {
  return {
    daemon: {
      taskManager,
      repoPaths: ["/home/user/repos/vigil", "/home/user/repos/my-app"],
    } as any,
    sse: {} as any,
  };
}

describe("Task Dashboard API", () => {
  let tmpDir: string;
  let tm: TaskManager;
  let ctx: DashboardContext;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "vigil-task-dash-test-"));
    tm = new TaskManager(join(tmpDir, "tasks.db"));
    ctx = makeMockCtx(tm);
  });

  afterEach(() => {
    tm.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("getTasksJSON", () => {
    it("returns empty state correctly", () => {
      const result = getTasksJSON(ctx);
      expect(result.tasks).toHaveLength(0);
      expect(result.counts.pending).toBe(0);
      expect(result.counts.active).toBe(0);
      expect(result.completionRate).toBe(0);
    });

    it("returns tasks with counts", () => {
      tm.create({ repo: "vigil", title: "Task 1" });
      tm.create({ repo: "vigil", title: "Task 2" });
      const t3 = tm.create({ repo: "vigil", title: "Task 3" });
      tm.activate(t3.id);
      tm.complete(t3.id, "done");

      const result = getTasksJSON(ctx);
      expect(result.tasks).toHaveLength(3);
      expect(result.counts.pending).toBe(2);
      expect(result.counts.completed).toBe(1);
      expect(result.completionRate).toBe(33); // 1/3
    });

    it("filters by status", () => {
      tm.create({ repo: "vigil", title: "Pending" });
      const t2 = tm.create({ repo: "vigil", title: "Active" });
      tm.activate(t2.id);

      const pending = getTasksJSON(ctx, { status: "pending" });
      expect(pending.tasks).toHaveLength(1);
      expect(pending.tasks[0].title).toBe("Pending");

      const active = getTasksJSON(ctx, { status: "active" });
      expect(active.tasks).toHaveLength(1);
      expect(active.tasks[0].title).toBe("Active");
    });

    it("filters by repo", () => {
      tm.create({ repo: "vigil", title: "Vigil task" });
      tm.create({ repo: "my-app", title: "App task" });

      const result = getTasksJSON(ctx, { repo: "vigil" });
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].repo).toBe("vigil");
    });

    it("calculates completion rate correctly", () => {
      for (let i = 0; i < 3; i++) {
        const t = tm.create({ repo: "vigil", title: `Done ${i}` });
        tm.activate(t.id);
        tm.complete(t.id, "ok");
      }
      tm.create({ repo: "vigil", title: "Pending" });
      const t = tm.create({ repo: "vigil", title: "Active" });
      tm.activate(t.id);

      const result = getTasksJSON(ctx);
      expect(result.completionRate).toBe(60);
    });
  });

  describe("getTasksFragment", () => {
    it("returns HTML with empty state message", () => {
      const html = getTasksFragment(ctx);
      expect(html).toContain("No tasks yet");
      expect(html).toContain('hx-post="/api/tasks"');
      expect(html).toContain("What needs to be done");
    });

    it("renders task cards", () => {
      tm.create({ repo: "vigil", title: "Wire webhook processor" });
      const html = getTasksFragment(ctx);
      expect(html).toContain("Wire webhook processor");
      expect(html).toContain("vigil");
      expect(html).toContain("task-card");
      expect(html).toContain("Start"); // primary action for pending
    });

    it("renders wait condition badge", () => {
      tm.create({
        repo: "vigil",
        title: "Wait for commit",
        waitCondition: { type: "event", eventType: "new_commit" },
      });
      const html = getTasksFragment(ctx);
      expect(html).toContain("Waiting for:");
      expect(html).toContain("event");
      expect(html).toContain("new_commit");
    });

    it("shows correct action buttons for active tasks", () => {
      const t = tm.create({ repo: "vigil", title: "Active task" });
      tm.activate(t.id);
      const html = getTasksFragment(ctx);
      expect(html).toContain('title="Mark as done"'); // Done button
      expect(html).toContain('title="Mark as failed"'); // Failed button
      expect(html).not.toContain("Start\n"); // No start button for active
    });

    it("shows no action buttons for completed tasks", () => {
      const t = tm.create({ repo: "vigil", title: "Done task" });
      tm.activate(t.id);
      tm.complete(t.id, "ok");
      const html = getTasksFragment(ctx);
      expect(html).not.toContain(`/api/tasks/${t.id}/activate`);
      expect(html).not.toContain(`/api/tasks/${t.id}/complete`);
    });

    it("renders progress bar with completion rate", () => {
      const t = tm.create({ repo: "vigil", title: "Done" });
      tm.activate(t.id);
      tm.complete(t.id, "ok");
      tm.create({ repo: "vigil", title: "Pending" });

      const html = getTasksFragment(ctx);
      expect(html).toContain("bg-success rounded-full");
      expect(html).toContain("50%");
    });

    it("includes repo options in create form", () => {
      const html = getTasksFragment(ctx);
      expect(html).toContain("vigil");
      expect(html).toContain("my-app");
    });

    it("includes inline edit form for non-terminal tasks", () => {
      tm.create({ repo: "vigil", title: "Editable" });
      const html = getTasksFragment(ctx);
      expect(html).toContain("task-edit-form");
      expect(html).toContain("hx-put");
    });
  });

  describe("handleTaskCreate", () => {
    it("creates a task from form data", () => {
      const form = new FormData();
      form.set("title", "New dashboard feature");
      form.set("repo", "vigil");
      form.set("description", "Add charts to dashboard");

      handleTaskCreate(ctx, form);

      const tasks = tm.list();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe("New dashboard feature");
      expect(tasks[0].repo).toBe("vigil");
      expect(tasks[0].description).toBe("Add charts to dashboard");
      expect(tasks[0].status).toBe("pending");
    });

    it("creates a simple task without wait condition", () => {
      const form = new FormData();
      form.set("title", "Simple task");
      form.set("repo", "vigil");

      handleTaskCreate(ctx, form);

      const tasks = tm.list();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe("pending");
      expect(tasks[0].waitCondition).toBeNull();
    });

    it("ignores empty title", () => {
      const form = new FormData();
      form.set("title", "");
      form.set("repo", "vigil");

      handleTaskCreate(ctx, form);

      expect(tm.list()).toHaveLength(0);
    });

    it("returns updated fragment after creation", () => {
      const form = new FormData();
      form.set("title", "Check result");
      form.set("repo", "vigil");

      const html = handleTaskCreate(ctx, form);
      expect(html).toContain("Check result");
      expect(html).toContain('hx-post="/api/tasks"');
    });
  });

  describe("handleTaskUpdate", () => {
    it("updates task title", () => {
      const task = tm.create({ repo: "vigil", title: "Original" });
      const form = new FormData();
      form.set("title", "Updated title");

      handleTaskUpdate(ctx, task.id, form);

      const updated = tm.getById(task.id);
      expect(updated?.title).toBe("Updated title");
    });

    it("updates task description and repo", () => {
      const task = tm.create({ repo: "vigil", title: "Test" });
      const form = new FormData();
      form.set("title", "Test");
      form.set("description", "New desc");
      form.set("repo", "my-app");

      handleTaskUpdate(ctx, task.id, form);

      const updated = tm.getById(task.id);
      expect(updated?.description).toBe("New desc");
      expect(updated?.repo).toBe("my-app");
    });

    it("returns updated fragment", () => {
      const task = tm.create({ repo: "vigil", title: "Before" });
      const form = new FormData();
      form.set("title", "After");

      const html = handleTaskUpdate(ctx, task.id, form);
      expect(html).toContain("After");
    });
  });

  describe("status transitions via API", () => {
    it("follows valid transition path: pending -> active -> completed", () => {
      const task = tm.create({ repo: "vigil", title: "Flow test" });
      expect(task.status).toBe("pending");

      const activated = tm.activate(task.id);
      expect(activated?.status).toBe("active");

      const completed = tm.complete(task.id, "done");
      expect(completed?.status).toBe("completed");
      expect(completed?.result).toBe("done");
    });

    it("follows valid transition path: pending -> active -> failed", () => {
      const task = tm.create({ repo: "vigil", title: "Fail test" });
      tm.activate(task.id);
      const failed = tm.fail(task.id, "timeout");
      expect(failed?.status).toBe("failed");
      expect(failed?.result).toBe("timeout");
    });

    it("cancel removes pending task", () => {
      const task = tm.create({ repo: "vigil", title: "Cancel test" });
      const cancelled = tm.cancel(task.id);
      expect(cancelled?.status).toBe("cancelled");
    });

    it("cannot cancel a completed task", () => {
      const task = tm.create({ repo: "vigil", title: "No cancel" });
      tm.activate(task.id);
      tm.complete(task.id, "done");
      tm.cancel(task.id);
      const result = tm.getById(task.id);
      expect(result?.status).toBe("completed");
    });
  });

  describe("wait conditions display", () => {
    it("event wait shows type and eventType", () => {
      tm.create({
        repo: "vigil",
        title: "Event wait",
        waitCondition: { type: "event", eventType: "branch_switch" },
      });
      const html = getTasksFragment(ctx);
      expect(html).toContain("event");
      expect(html).toContain("branch_switch");
    });

    it("task dependency wait shows type", () => {
      const parent = tm.create({ repo: "vigil", title: "Parent" });
      tm.create({
        repo: "vigil",
        title: "Child",
        waitCondition: { type: "task", taskId: parent.id },
      });
      const html = getTasksFragment(ctx);
      expect(html).toContain("Waiting for:");
      expect(html).toContain("Waiting for: task");
    });
  });
});
