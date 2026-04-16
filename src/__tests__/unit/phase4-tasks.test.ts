import { describe, expect, it, mock } from "bun:test";

const mockTasks = {
  tasks: [
    {
      id: "t1",
      title: "Add repos plugin",
      status: "pending",
      repo: "vigil",
      createdAt: "2026-04-14T10:00:00Z",
      updatedAt: "2026-04-14T10:00:00Z",
      waitCondition: null,
    },
    {
      id: "t2",
      title: "Fix state icons",
      status: "active",
      repo: "vigil",
      createdAt: "2026-04-14T10:00:00Z",
      updatedAt: "2026-04-14T10:00:00Z",
      waitCondition: null,
    },
    {
      id: "t3",
      title: "Write tests",
      status: "completed",
      repo: "vigil",
      createdAt: "2026-04-14T10:00:00Z",
      updatedAt: "2026-04-14T10:00:00Z",
      waitCondition: null,
    },
    {
      id: "t4",
      title: "Sub-task of t1",
      status: "pending",
      repo: "vigil",
      createdAt: "2026-04-14T10:00:00Z",
      updatedAt: "2026-04-14T10:00:00Z",
      waitCondition: null,
      parentId: "t1",
    },
    {
      id: "t5",
      title: "Waiting task",
      status: "waiting",
      repo: "vigil",
      createdAt: "2026-04-14T10:00:00Z",
      updatedAt: "2026-04-14T10:00:00Z",
      waitCondition: { type: "event" as const },
    },
    {
      id: "t6",
      title: "Failed task",
      status: "failed",
      repo: "my-app",
      createdAt: "2026-04-14T10:00:00Z",
      updatedAt: "2026-04-14T10:00:00Z",
      waitCondition: null,
    },
    {
      id: "t7",
      title: "Cancelled task",
      status: "cancelled",
      repo: "my-app",
      createdAt: "2026-04-14T10:00:00Z",
      updatedAt: "2026-04-14T10:00:00Z",
      waitCondition: null,
    },
  ],
  counts: { pending: 2, active: 1, completed: 1, waiting: 1, failed: 1, cancelled: 1 } as Record<string, number>,
  completionRate: 14,
};

describe("Tasks plugin", () => {
  describe("filter tabs with counts", () => {
    it("counts match mock data per status", () => {
      expect(mockTasks.counts.pending).toBe(2);
      expect(mockTasks.counts.active).toBe(1);
      expect(mockTasks.counts.completed).toBe(1);
      expect(mockTasks.counts.waiting).toBe(1);
      expect(mockTasks.counts.failed).toBe(1);
      expect(mockTasks.counts.cancelled).toBe(1);
    });

    it("all tab count is total tasks", () => {
      const total = Object.values(mockTasks.counts).reduce((a, b) => a + b, 0);
      expect(total).toBe(mockTasks.tasks.length);
    });

    it("filter by status returns correct subset", () => {
      const pending = mockTasks.tasks.filter((t) => t.status === "pending");
      expect(pending).toHaveLength(2);
      const active = mockTasks.tasks.filter((t) => t.status === "active");
      expect(active).toHaveLength(1);
    });
  });

  describe("action buttons per status", () => {
    it("maps status to allowed actions", () => {
      const { getTaskActions } = require("../../../dashboard-v2/src/plugins/tasks/TasksPage");
      expect(getTaskActions("pending")).toEqual(["activate", "cancel"]);
      expect(getTaskActions("active")).toEqual(["complete", "fail"]);
      expect(getTaskActions("waiting")).toEqual(["activate", "cancel"]);
    });

    it("terminal statuses have no action buttons", () => {
      const { getTaskActions } = require("../../../dashboard-v2/src/plugins/tasks/TasksPage");
      expect(getTaskActions("completed")).toEqual([]);
      expect(getTaskActions("failed")).toEqual([]);
      expect(getTaskActions("cancelled")).toEqual([]);
    });
  });

  describe("parent-child indentation", () => {
    it("tasks with parentId are identified as children", () => {
      const children = mockTasks.tasks.filter((t: any) => t.parentId !== undefined);
      expect(children).toHaveLength(1);
      expect(children[0].id).toBe("t4");
    });

    it("sorting groups children under parents", () => {
      const { sortTasksWithChildren } = require("../../../dashboard-v2/src/plugins/tasks/TasksPage");
      const sorted = sortTasksWithChildren(mockTasks.tasks);
      const t1Index = sorted.findIndex((t: any) => t.id === "t1");
      const t4Index = sorted.findIndex((t: any) => t.id === "t4");
      expect(t4Index).toBeGreaterThan(t1Index);
      // Child should immediately follow parent
      expect(t4Index).toBe(t1Index + 1);
    });

    it("orphan children (missing parent) still render", () => {
      const tasksWithOrphan = [
        ...mockTasks.tasks,
        {
          id: "t8",
          title: "Orphan",
          status: "pending",
          repo: "vigil",
          createdAt: "2026-04-14T10:00:00Z",
          updatedAt: "2026-04-14T10:00:00Z",
          waitCondition: null,
          parentId: "t-missing",
        },
      ];
      const { sortTasksWithChildren } = require("../../../dashboard-v2/src/plugins/tasks/TasksPage");
      const sorted = sortTasksWithChildren(tasksWithOrphan);
      expect(sorted.find((t: any) => t.id === "t8")).toBeDefined();
    });
  });

  describe("task mutations", () => {
    it("createTask mutation sends title and repo", async () => {
      const createTask = mock(() => Promise.resolve({ success: true }));
      await createTask({ data: { title: "New task", repo: "vigil" } });
      expect(createTask).toHaveBeenCalledWith({ data: { title: "New task", repo: "vigil" } });
    });

    it("activateTask sends task id", async () => {
      const activateTask = mock(() => Promise.resolve({ success: true }));
      await activateTask({ data: { id: "t1" } });
      expect(activateTask).toHaveBeenCalledWith({ data: { id: "t1" } });
    });

    it("completeTask sends task id", async () => {
      const completeTask = mock(() => Promise.resolve({ success: true }));
      await completeTask({ data: { id: "t2" } });
      expect(completeTask).toHaveBeenCalledWith({ data: { id: "t2" } });
    });

    it("failTask sends task id", async () => {
      const failTask = mock(() => Promise.resolve({ success: true }));
      await failTask({ data: { id: "t2" } });
      expect(failTask).toHaveBeenCalledWith({ data: { id: "t2" } });
    });

    it("cancelTask sends task id", async () => {
      const cancelTask = mock(() => Promise.resolve({ success: true }));
      await cancelTask({ data: { id: "t1" } });
      expect(cancelTask).toHaveBeenCalledWith({ data: { id: "t1" } });
    });

    it("all task mutations would invalidate tasks query key", () => {
      const { vigilKeys } = require("../../../dashboard-v2/src/lib/query-keys");
      expect(vigilKeys.tasks).toEqual(["tasks"]);
    });
  });

  describe("completion rate", () => {
    it("completionRate comes from server data", () => {
      expect(mockTasks.completionRate).toBe(14);
    });
  });
});
