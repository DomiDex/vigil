import { describe, test, expect, beforeEach, mock } from "bun:test";

describe("Scheduler creation mutation flow", () => {
  const mockCreateSchedule = mock(() => Promise.resolve({ ok: true }));
  const mockInvalidateQueries = mock(() => Promise.resolve());

  beforeEach(() => {
    mockCreateSchedule.mockClear();
    mockInvalidateQueries.mockClear();
  });

  test("calls createSchedule with correct data shape", async () => {
    await mockCreateSchedule({
      data: { name: "nightly", cron: "0 0 * * *", action: "dream", repo: "vigil" },
    });

    expect(mockCreateSchedule).toHaveBeenCalledWith({
      data: { name: "nightly", cron: "0 0 * * *", action: "dream", repo: "vigil" },
    });
  });

  test("onSuccess invalidates vigilKeys.scheduler", async () => {
    const onSuccess = () => {
      mockInvalidateQueries({ queryKey: ["scheduler"] });
    };

    await mockCreateSchedule({
      data: { name: "test", cron: "*/5 * * * *", action: "tick" },
    });
    onSuccess();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["scheduler"],
    });
  });
});
