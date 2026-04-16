import { describe, expect, it } from "bun:test";

// Use a cache-busting query to bypass mock.module pollution from
// plugin-loader.test.ts and plugin-routes.test.ts which stub corePlugins
const { corePlugins } = await import(`../../../dashboard-v2/src/plugins/index.ts?t=${Date.now()}`);

describe("corePlugins registry", () => {
  it("has at least one plugin entry", () => {
    expect(corePlugins.length).toBeGreaterThan(0);
  });

  it("all ids are unique", () => {
    const ids = corePlugins.map((p: any) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("orders are monotonically increasing with no duplicates", () => {
    const orders = corePlugins.map((p: any) => p.order);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]).toBeGreaterThan(orders[i - 1]);
    }
  });

  it("all entries have slot 'tab'", () => {
    for (const plugin of corePlugins) {
      expect(plugin.slot).toBe("tab");
    }
  });

  it("gated + non-gated equals total", () => {
    const gated = corePlugins.filter((p: any) => p.featureGate);
    const nonGated = corePlugins.filter((p: any) => !p.featureGate);
    expect(gated.length + nonGated.length).toBe(corePlugins.length);
  });

  it("all component fields are functions", () => {
    for (const plugin of corePlugins) {
      expect(typeof plugin.component).toBe("function");
    }
  });

  it("all entries have sseEvents or queryKeys defined", () => {
    for (const plugin of corePlugins) {
      const hasSse = plugin.sseEvents && plugin.sseEvents.length > 0;
      const hasKeys = plugin.queryKeys && plugin.queryKeys.length > 0;
      expect(hasSse || hasKeys).toBe(true);
    }
  });

  it("timeline plugin is first (order 0) with correct sseEvents", () => {
    const timeline = corePlugins.find((p: any) => p.id === "timeline");
    expect(timeline).toBeDefined();
    expect(timeline!.order).toBe(0);
    expect(timeline!.sseEvents).toEqual(["tick", "message"]);
    expect(timeline!.queryKeys).toEqual([["timeline"]]);
    expect(timeline!.featureGate).toBeUndefined();
  });
});
