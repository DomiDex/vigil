import { describe, test, expect } from "bun:test";
import { z } from "zod";

const metricsQuerySchema = z.object({
  from: z.coerce.number().optional(),
  to: z.coerce.number().optional(),
});

describe("Phase 8: Metrics query param validation", () => {
  test("accepts numeric from and to", () => {
    const result = metricsQuerySchema.safeParse({
      from: 1713225600000,
      to: 1713312000000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.from).toBe(1713225600000);
      expect(result.data.to).toBe(1713312000000);
    }
  });

  test("coerces string timestamps to numbers", () => {
    const result = metricsQuerySchema.safeParse({
      from: "1713225600000",
      to: "1713312000000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.from).toBe("number");
      expect(typeof result.data.to).toBe("number");
    }
  });

  test("accepts empty object (backward compatible — no params)", () => {
    const result = metricsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.from).toBeUndefined();
      expect(result.data.to).toBeUndefined();
    }
  });

  test("accepts from without to", () => {
    const result = metricsQuerySchema.safeParse({ from: 1713225600000 });
    expect(result.success).toBe(true);
  });

  test("accepts to without from", () => {
    const result = metricsQuerySchema.safeParse({ to: 1713312000000 });
    expect(result.success).toBe(true);
  });

  test("rejects non-numeric string for from", () => {
    const result = metricsQuerySchema.safeParse({ from: "not-a-number" });
    expect(result.success).toBe(false);
  });
});

describe("Phase 8: Metrics filtering logic", () => {
  test("from/to filters events within range", () => {
    const events = [
      { timestamp: 1000, type: "decision", decision: "SILENT" },
      { timestamp: 2000, type: "decision", decision: "OBSERVE" },
      { timestamp: 3000, type: "decision", decision: "NOTIFY" },
      { timestamp: 4000, type: "decision", decision: "ACT" },
    ];

    const from = 2000;
    const to = 3000;
    const filtered = events.filter(e => e.timestamp >= from && e.timestamp <= to);

    expect(filtered.length).toBe(2);
    expect(filtered[0].decision).toBe("OBSERVE");
    expect(filtered[1].decision).toBe("NOTIFY");
  });

  test("omitting from/to returns all events", () => {
    const events = [
      { timestamp: 1000, decision: "SILENT" },
      { timestamp: 2000, decision: "OBSERVE" },
    ];

    const from = undefined;
    const to = undefined;
    const filtered = events.filter(e =>
      (from === undefined || e.timestamp >= from) &&
      (to === undefined || e.timestamp <= to)
    );

    expect(filtered.length).toBe(2);
  });
});
