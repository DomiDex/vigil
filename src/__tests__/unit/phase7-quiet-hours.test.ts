import { describe, test, expect } from "bun:test";
import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const quietHoursSchema = z.object({
  start: z.string().regex(timeRegex, "Invalid time format (HH:MM)"),
  end: z.string().regex(timeRegex, "Invalid time format (HH:MM)"),
});

describe("Phase 7: Quiet hours HH:MM validation", () => {
  test("accepts valid 24-hour times", () => {
    const result = quietHoursSchema.safeParse({ start: "22:00", end: "07:00" });
    expect(result.success).toBe(true);
  });

  test("accepts midnight boundaries", () => {
    const result = quietHoursSchema.safeParse({ start: "00:00", end: "23:59" });
    expect(result.success).toBe(true);
  });

  test("rejects single-digit hour (9:30 instead of 09:30)", () => {
    const result = quietHoursSchema.safeParse({ start: "9:30", end: "07:00" });
    expect(result.success).toBe(false);
  });

  test("rejects time without colon", () => {
    const result = quietHoursSchema.safeParse({ start: "2200", end: "0700" });
    expect(result.success).toBe(false);
  });

  test("rejects missing start", () => {
    const result = quietHoursSchema.safeParse({ end: "07:00" });
    expect(result.success).toBe(false);
  });

  test("rejects missing end", () => {
    const result = quietHoursSchema.safeParse({ start: "22:00" });
    expect(result.success).toBe(false);
  });

  test("rejects empty strings", () => {
    const result = quietHoursSchema.safeParse({ start: "", end: "" });
    expect(result.success).toBe(false);
  });

  test("rejects time with seconds (HH:MM:SS)", () => {
    const result = quietHoursSchema.safeParse({ start: "22:00:00", end: "07:00:00" });
    expect(result.success).toBe(false);
  });

  test("rejects invalid hour 25:00", () => {
    const result = quietHoursSchema.safeParse({ start: "25:00", end: "07:00" });
    expect(result.success).toBe(false);
  });

  test("rejects invalid minute 22:60", () => {
    const result = quietHoursSchema.safeParse({ start: "22:60", end: "07:00" });
    expect(result.success).toBe(false);
  });
});
