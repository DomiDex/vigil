import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type GitEvent, TaskManager } from "../../core/task-manager.ts";

let tmpDir: string;
let tm: TaskManager;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "vigil-task-test-"));
  mkdirSync(tmpDir, { recursive: true });
  tm = new TaskManager(join(tmpDir, "test.db"));
});

afterEach(() => {
  tm.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Create ──

describe("create", () => {
  test("creates a pending task", () => {
    const task = tm.create({ repo: "myrepo", title: "Review PR #42" });
    expect(task.id).toBeTruthy();
    expect(task.repo).toBe("myrepo");
    expect(task.title).toBe("Review PR #42");
    expect(task.status).toBe("pending");
    expect(task.waitCondition).toBeNull();
  });

  test("creates a waiting task with condition", () => {
    const task = tm.create({
      repo: "myrepo",
      title: "Check after merge",
      waitCondition: { type: "event", eventType: "new_commit" },
    });
    expect(task.status).toBe("waiting");
    expect(task.waitCondition).toEqual({ type: "event", eventType: "new_commit" });
  });

  test("creates subtask with parent", () => {
    const parent = tm.create({ repo: "myrepo", title: "Parent task" });
    const child = tm.create({
      repo: "myrepo",
      title: "Subtask 1",
      parentId: parent.id,
    });
    expect(child.parentId).toBe(parent.id);

    const subtasks = tm.getSubtasks(parent.id);
    expect(subtasks).toHaveLength(1);
    expect(subtasks[0].title).toBe("Subtask 1");
  });
});

// ── State Transitions ──

describe("state transitions", () => {
  test("pending → active", () => {
    const task = tm.create({ repo: "r", title: "t" });
    const activated = tm.activate(task.id);
    expect(activated?.status).toBe("active");
  });

  test("active → completed", () => {
    const task = tm.create({ repo: "r", title: "t" });
    tm.activate(task.id);
    const completed = tm.complete(task.id, "Done successfully");
    expect(completed?.status).toBe("completed");
    expect(completed?.result).toBe("Done successfully");
  });

  test("active → failed", () => {
    const task = tm.create({ repo: "r", title: "t" });
    tm.activate(task.id);
    const failed = tm.fail(task.id, "Something went wrong");
    expect(failed?.status).toBe("failed");
    expect(failed?.result).toBe("Something went wrong");
  });

  test("pending → cancelled", () => {
    const task = tm.create({ repo: "r", title: "t" });
    const cancelled = tm.cancel(task.id);
    expect(cancelled?.status).toBe("cancelled");
  });

  test("completed tasks cannot be cancelled", () => {
    const task = tm.create({ repo: "r", title: "t" });
    tm.complete(task.id, "done");
    tm.cancel(task.id);
    const t = tm.getById(task.id);
    expect(t?.status).toBe("completed");
  });
});

// ── Wait Conditions ──

describe("wait conditions", () => {
  test("event-based wait activates on matching event", () => {
    const task = tm.create({
      repo: "myrepo",
      title: "Watch for commits",
      waitCondition: { type: "event", eventType: "new_commit" },
    });
    expect(task.status).toBe("waiting");

    const events: GitEvent[] = [{ type: "new_commit", detail: "abc123" }];
    const activated = tm.checkWaitConditions(events);
    expect(activated).toHaveLength(1);
    expect(activated[0].id).toBe(task.id);
    expect(activated[0].status).toBe("active");
  });

  test("event-based wait with filter", () => {
    const _task = tm.create({
      repo: "myrepo",
      title: "Watch for config changes",
      waitCondition: { type: "event", eventType: "file_change", filter: "config" },
    });

    // Non-matching event
    const noMatch = tm.checkWaitConditions([{ type: "file_change", detail: "src/index.ts" }]);
    expect(noMatch).toHaveLength(0);

    // Matching event
    const match = tm.checkWaitConditions([{ type: "file_change", detail: "config.json updated" }]);
    expect(match).toHaveLength(1);
  });

  test("task dependency activates when parent completes", () => {
    const first = tm.create({ repo: "r", title: "Step 1" });
    const second = tm.create({
      repo: "r",
      title: "Step 2",
      waitCondition: { type: "task", taskId: first.id },
    });
    expect(second.status).toBe("waiting");

    // Complete the first task — should auto-activate the second
    tm.complete(first.id, "done");
    const refreshed = tm.getById(second.id);
    expect(refreshed?.status).toBe("active");
  });

  test("no activation on empty events", () => {
    tm.create({
      repo: "r",
      title: "Waiting",
      waitCondition: { type: "event", eventType: "new_commit" },
    });
    const activated = tm.checkWaitConditions([]);
    expect(activated).toHaveLength(0);
  });
});

// ── Querying ──

describe("querying", () => {
  test("getActive returns pending and active tasks", () => {
    tm.create({ repo: "r", title: "Pending" });
    const t2 = tm.create({ repo: "r", title: "Active" });
    tm.activate(t2.id);
    const t3 = tm.create({ repo: "r", title: "Completed" });
    tm.complete(t3.id, "done");

    const active = tm.getActive("r");
    expect(active).toHaveLength(2);
    expect(active.map((t) => t.title).sort()).toEqual(["Active", "Pending"]);
  });

  test("getActive filters by repo", () => {
    tm.create({ repo: "a", title: "Task A" });
    tm.create({ repo: "b", title: "Task B" });

    expect(tm.getActive("a")).toHaveLength(1);
    expect(tm.getActive("b")).toHaveLength(1);
    expect(tm.getActive()).toHaveLength(2);
  });

  test("list filters by status", () => {
    const t1 = tm.create({ repo: "r", title: "Done" });
    tm.complete(t1.id, "ok");
    tm.create({ repo: "r", title: "Open" });

    const completed = tm.list({ status: "completed" });
    expect(completed).toHaveLength(1);
    expect(completed[0].title).toBe("Done");
  });

  test("list respects limit", () => {
    for (let i = 0; i < 5; i++) {
      tm.create({ repo: "r", title: `Task ${i}` });
    }
    const limited = tm.list({ limit: 3 });
    expect(limited).toHaveLength(3);
  });
});

// ── Persistence ──

describe("persistence", () => {
  test("tasks survive re-instantiation", () => {
    const dbPath = join(tmpDir, "persist.db");
    const tm1 = new TaskManager(dbPath);
    const task = tm1.create({ repo: "r", title: "Persistent" });
    tm1.close();

    const tm2 = new TaskManager(dbPath);
    const restored = tm2.getById(task.id);
    expect(restored).not.toBeNull();
    expect(restored?.title).toBe("Persistent");
    expect(restored?.status).toBe("pending");
    tm2.close();
  });
});
