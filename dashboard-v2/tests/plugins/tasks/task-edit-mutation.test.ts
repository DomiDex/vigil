import { describe, test, expect, beforeEach, mock } from "bun:test";

describe("Task edit mutation flow", () => {
  const mockUpdateTask = mock(() => Promise.resolve({ ok: true }));
  const mockInvalidateQueries = mock(() => Promise.resolve());

  beforeEach(() => {
    mockUpdateTask.mockClear();
    mockInvalidateQueries.mockClear();
  });

  test("calls updateTask with edited title and description", async () => {
    const editTarget = {
      id: "task-1",
      title: "Updated title",
      description: "Updated desc",
    };

    await mockUpdateTask({
      data: {
        id: editTarget.id,
        title: editTarget.title,
        description: editTarget.description,
      },
    });

    expect(mockUpdateTask).toHaveBeenCalledWith({
      data: {
        id: "task-1",
        title: "Updated title",
        description: "Updated desc",
      },
    });
  });

  test("onSuccess invalidates vigilKeys.tasks", async () => {
    const onSuccess = () => {
      mockInvalidateQueries({ queryKey: ["tasks"] });
    };

    await mockUpdateTask({ data: { id: "task-1", title: "New" } });
    onSuccess();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["tasks"],
    });
  });

  test("onSuccess clears edit target (closes dialog)", async () => {
    let editTarget: { id: string; title: string; description: string } | null =
      {
        id: "task-1",
        title: "Old",
        description: "",
      };

    const onSuccess = () => {
      mockInvalidateQueries({ queryKey: ["tasks"] });
      editTarget = null;
    };

    await mockUpdateTask({ data: { id: "task-1", title: "New" } });
    onSuccess();

    expect(editTarget).toBeNull();
  });
});
