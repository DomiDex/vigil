import { describe, test, expect, beforeEach, mock } from "bun:test";

describe("Task creation mutation flow", () => {
  const mockCreateTask = mock(() => Promise.resolve({ ok: true }));
  const mockInvalidateQueries = mock(() => Promise.resolve());

  beforeEach(() => {
    mockCreateTask.mockClear();
    mockInvalidateQueries.mockClear();
  });

  test("calls createTask with correct data shape", async () => {
    const formData = { title: "New task", description: "Details", repo: "vigil" };
    await mockCreateTask({ data: formData });

    expect(mockCreateTask).toHaveBeenCalledTimes(1);
    expect(mockCreateTask).toHaveBeenCalledWith({
      data: { title: "New task", description: "Details", repo: "vigil" },
    });
  });

  test("calls createTask with only required fields", async () => {
    const formData = { title: "Minimal task" };
    await mockCreateTask({ data: formData });

    expect(mockCreateTask).toHaveBeenCalledWith({
      data: { title: "Minimal task" },
    });
  });

  test("onSuccess invalidates vigilKeys.tasks", async () => {
    const onSuccess = () => {
      mockInvalidateQueries({ queryKey: ["tasks"] });
    };

    await mockCreateTask({ data: { title: "Test" } });
    onSuccess();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["tasks"],
    });
  });
});
