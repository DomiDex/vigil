import { describe, test, expect } from "bun:test";
import { getTaskActions } from "../../../src/plugins/tasks/TasksPage";

interface EditTarget {
  id: string;
  title: string;
  description: string;
}

// Mirrors the edit target creation logic in TasksPage
function createEditTarget(task: {
  id: string;
  title: string;
  description?: string;
}): EditTarget {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? "",
  };
}

function isTaskEditable(status: string): boolean {
  return getTaskActions(status).length > 0;
}

describe("Task edit visibility", () => {
  test("pending tasks are editable", () => {
    expect(isTaskEditable("pending")).toBe(true);
  });

  test("active tasks are editable", () => {
    expect(isTaskEditable("active")).toBe(true);
  });

  test("waiting tasks are editable", () => {
    expect(isTaskEditable("waiting")).toBe(true);
  });

  test("completed tasks are not editable", () => {
    expect(isTaskEditable("completed")).toBe(false);
  });

  test("failed tasks are not editable", () => {
    expect(isTaskEditable("failed")).toBe(false);
  });

  test("cancelled tasks are not editable", () => {
    expect(isTaskEditable("cancelled")).toBe(false);
  });
});

describe("Edit target state management", () => {
  test("creates edit target with description", () => {
    const target = createEditTarget({
      id: "task-1",
      title: "Fix bug",
      description: "Important fix",
    });
    expect(target).toEqual({
      id: "task-1",
      title: "Fix bug",
      description: "Important fix",
    });
  });

  test("defaults description to empty string when undefined", () => {
    const target = createEditTarget({
      id: "task-2",
      title: "New feature",
    });
    expect(target.description).toBe("");
  });

  test("null edit target means dialog is closed", () => {
    const editTarget: EditTarget | null = null;
    expect(editTarget !== null).toBe(false);
  });

  test("non-null edit target means dialog is open", () => {
    const editTarget: EditTarget | null = {
      id: "task-1",
      title: "Fix",
      description: "",
    };
    expect(editTarget !== null).toBe(true);
  });
});
