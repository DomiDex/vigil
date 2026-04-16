import { describe, test, expect } from "bun:test";
import { corePlugins } from "../../dashboard-v2/src/plugins/index";

/**
 * Tests for Overview plugin registration and route structure.
 *
 * The Overview plugin must:
 *   - Register with order: -1 (appears first in sidebar)
 *   - Subscribe to SSE events: tick, message, action_pending
 *   - Route / renders Overview, /timeline renders Timeline
 */

const overviewPlugin = corePlugins.find((p) => p.id === "overview")!;
const timelinePlugin = corePlugins.find((p) => p.id === "timeline")!;

describe("Overview plugin registration", () => {
  test("overview plugin exists", () => {
    expect(overviewPlugin).toBeTruthy();
  });

  test("overview plugin has id 'overview'", () => {
    expect(overviewPlugin.id).toBe("overview");
  });

  test("overview plugin has order -1 (appears first)", () => {
    expect(overviewPlugin.order).toBe(-1);
  });

  test("overview plugin uses LayoutDashboard icon", () => {
    expect(overviewPlugin.icon).toBe("LayoutDashboard");
  });

  test("overview plugin subscribes to tick, message, action_pending SSE events", () => {
    expect(overviewPlugin.sseEvents).toContain("tick");
    expect(overviewPlugin.sseEvents).toContain("message");
    expect(overviewPlugin.sseEvents).toContain("action_pending");
    expect(overviewPlugin.sseEvents!.length).toBe(3);
  });

  test("overview plugin registers overview query key", () => {
    expect(overviewPlugin.queryKeys).toEqual([["overview"]]);
  });

  test("overview plugin is slot 'tab'", () => {
    expect(overviewPlugin.slot).toBe("tab");
  });

  test("overview plugin has path '/'", () => {
    expect(overviewPlugin.path).toBe("/");
  });
});

describe("Plugin ordering", () => {
  test("overview sorts first when order is -1", () => {
    const sorted = [...corePlugins].sort((a, b) => a.order - b.order);
    expect(sorted[0].id).toBe("overview");
  });

  test("timeline comes after overview", () => {
    const sorted = [...corePlugins].sort((a, b) => a.order - b.order);
    const overviewIdx = sorted.findIndex((p) => p.id === "overview");
    const timelineIdx = sorted.findIndex((p) => p.id === "timeline");
    expect(overviewIdx).toBeLessThan(timelineIdx);
  });

  test("all plugins have a path defined", () => {
    for (const plugin of corePlugins) {
      expect(plugin.path).toBeTruthy();
    }
  });
});

describe("Route structure", () => {
  test("overview plugin routes to /", () => {
    expect(overviewPlugin.path).toBe("/");
  });

  test("timeline plugin routes to /timeline", () => {
    expect(timelinePlugin.path).toBe("/timeline");
  });

  test("timeline is not at /", () => {
    expect(timelinePlugin.path).not.toBe("/");
  });
});

describe("Overview parallel queries", () => {
  test("overview plugin registers overview query key", () => {
    expect(overviewPlugin.queryKeys).toContainEqual(["overview"]);
  });
});
