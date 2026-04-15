import { describe, it, expect, beforeEach } from "bun:test";
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context";
import { getHealthJSON } from "../../dashboard/api/health";

describe("health API", () => {
  let ctx: ReturnType<typeof createFakeDashboardContext>;

  beforeEach(() => {
    ctx = createFakeDashboardContext();
  });

  describe("getHealthJSON", () => {
    it("returns process info with Bun version", () => {
      const result = getHealthJSON(ctx);
      expect(result.process).toBeDefined();
      expect(result.process.runtime).toContain("Bun");
    });

    it("returns process PID", () => {
      const result = getHealthJSON(ctx);
      expect(result.process.pid).toBe(process.pid);
    });

    it("returns memory usage fields", () => {
      const result = getHealthJSON(ctx);
      expect(result.process.heap).toBeNumber();
      expect(result.process.rss).toBeNumber();
      expect(result.process.heap).toBeGreaterThan(0);
      expect(result.process.rss).toBeGreaterThan(0);
    });

    it("returns uptime from session startedAt", () => {
      const result = getHealthJSON(ctx);
      expect(result.process.uptime).toBeNumber();
      // Session started 1 hour ago in fake context
      expect(result.process.uptime).toBeGreaterThanOrEqual(3500);
      expect(result.process.uptime).toBeLessThanOrEqual(3700);
    });

    it("returns database sizes object", () => {
      const result = getHealthJSON(ctx);
      expect(result.databases).toBeDefined();
      expect(typeof result.databases).toBe("object");
    });

    it("returns error counts from metrics", () => {
      const result = getHealthJSON(ctx);
      expect(result.errors).toBeDefined();
      expect(result.errors.total).toBeNumber();
    });

    it("returns uptime timeline segments", () => {
      const result = getHealthJSON(ctx);
      expect(result.uptimeTimeline).toBeArray();
      if (result.uptimeTimeline.length > 0) {
        const seg = result.uptimeTimeline[0];
        expect(seg.start).toBeNumber();
        expect(seg.end).toBeNumber();
        expect(["running", "sleeping", "down"]).toContain(seg.state);
      }
    });
  });
});
