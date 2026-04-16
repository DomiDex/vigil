import { describe, test, expect } from "bun:test";
import { formatCountdown } from "../../../src/plugins/scheduler/SchedulerPage";

describe("formatCountdown", () => {
  test("null returns N/A", () => {
    expect(formatCountdown(null)).toBe("N/A");
  });

  test("zero or negative returns Now", () => {
    expect(formatCountdown(0)).toBe("Now");
    expect(formatCountdown(-100)).toBe("Now");
  });

  test("minutes and seconds", () => {
    expect(formatCountdown(90000)).toBe("1m 30s");
  });

  test("hours and minutes", () => {
    expect(formatCountdown(3660000)).toBe("1h 1m");
  });

  test("exactly one hour", () => {
    expect(formatCountdown(3600000)).toBe("1h 0m");
  });
});
