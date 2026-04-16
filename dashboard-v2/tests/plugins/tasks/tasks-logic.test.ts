import { describe, test, expect } from "bun:test";
import {
  getTaskActions,
  sortTasksWithChildren,
} from "../../../src/plugins/tasks/TasksPage";

describe("getTaskActions", () => {
  test("pending tasks can be activated or cancelled", () => {
    expect(getTaskActions("pending")).toEqual(["activate", "cancel"]);
  });

  test("active tasks can be completed or failed", () => {
    expect(getTaskActions("active")).toEqual(["complete", "fail"]);
  });

  test("waiting tasks can be activated or cancelled", () => {
    expect(getTaskActions("waiting")).toEqual(["activate", "cancel"]);
  });

  test("completed tasks have no actions", () => {
    expect(getTaskActions("completed")).toEqual([]);
  });

  test("failed tasks have no actions", () => {
    expect(getTaskActions("failed")).toEqual([]);
  });

  test("cancelled tasks have no actions", () => {
    expect(getTaskActions("cancelled")).toEqual([]);
  });
});

describe("sortTasksWithChildren", () => {
  test("parents come before their children", () => {
    const tasks = [
      { id: "child-1", parentId: "parent-1", title: "Child" },
      { id: "parent-1", parentId: null, title: "Parent" },
    ];
    const sorted = sortTasksWithChildren(tasks);
    expect(sorted[0].id).toBe("parent-1");
    expect(sorted[1].id).toBe("child-1");
  });

  test("orphan children are appended at the end", () => {
    const tasks = [
      { id: "orphan-1", parentId: "missing-parent", title: "Orphan" },
      { id: "parent-1", parentId: null, title: "Parent" },
    ];
    const sorted = sortTasksWithChildren(tasks);
    expect(sorted[0].id).toBe("parent-1");
    expect(sorted[1].id).toBe("orphan-1");
  });

  test("empty array returns empty", () => {
    expect(sortTasksWithChildren([])).toEqual([]);
  });

  test("multiple children grouped under correct parent", () => {
    const tasks = [
      { id: "c2", parentId: "p1", title: "Child 2" },
      { id: "p1", parentId: null, title: "Parent 1" },
      { id: "c1", parentId: "p1", title: "Child 1" },
      { id: "p2", parentId: null, title: "Parent 2" },
    ];
    const sorted = sortTasksWithChildren(tasks);
    expect(sorted.map((t) => t.id)).toEqual(["p1", "c2", "c1", "p2"]);
  });
});
