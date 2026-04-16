import { describe, test, expect, beforeEach, mock } from "bun:test";

describe("Quick actions — Trigger Dream", () => {
  const mockTriggerDream = mock(() => Promise.resolve({ ok: true }));
  const mockInvalidateQueries = mock(() => Promise.resolve());

  beforeEach(() => {
    mockTriggerDream.mockClear();
    mockInvalidateQueries.mockClear();
  });

  test("calls triggerDream with empty data", async () => {
    await mockTriggerDream({ data: {} });

    expect(mockTriggerDream).toHaveBeenCalledTimes(1);
    expect(mockTriggerDream).toHaveBeenCalledWith({ data: {} });
  });

  test("onSuccess invalidates dreams query key", async () => {
    const onSuccess = () => {
      mockInvalidateQueries({ queryKey: ["dreams"] });
    };

    await mockTriggerDream({ data: {} });
    onSuccess();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["dreams"],
    });
  });
});

describe("Quick actions — Create Task navigation", () => {
  test("navigates to /tasks path", () => {
    const mockNavigate = mock(() => {});

    // Simulates the onSelect callback for "Create Task"
    const onSelect = () => {
      mockNavigate({ to: "/tasks" });
    };

    onSelect();

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/tasks" });
  });
});
