import { describe, it, expect } from "bun:test";
import { corePlugins } from "../../../dashboard-v2/src/plugins/index";

describe("corePlugins registry", () => {
  it("contains exactly 15 plugin entries", () => {
    expect(corePlugins).toHaveLength(15);
  });

  it("all ids are unique", () => {
    const ids = corePlugins.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("orders are monotonically increasing with no duplicates", () => {
    const orders = corePlugins.map((p) => p.order);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]).toBeGreaterThan(orders[i - 1]);
    }
  });

  it("all entries have slot 'tab'", () => {
    for (const plugin of corePlugins) {
      expect(plugin.slot).toBe("tab");
    }
  });

  it("has 7 feature-gated and 8 non-gated plugins", () => {
    const gated = corePlugins.filter((p) => p.featureGate);
    const nonGated = corePlugins.filter((p) => !p.featureGate);
    expect(gated).toHaveLength(7);
    expect(nonGated).toHaveLength(8);
  });

  it("feature-gated plugins are tasks, scheduler, agents, webhooks, channels, notifications, a2a", () => {
    const gatedIds = corePlugins
      .filter((p) => p.featureGate)
      .map((p) => p.id)
      .sort();
    expect(gatedIds).toEqual(
      ["a2a", "agents", "channels", "notifications", "scheduler", "tasks", "webhooks"]
    );
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
    const timeline = corePlugins.find((p) => p.id === "timeline");
    expect(timeline).toBeDefined();
    expect(timeline!.order).toBe(0);
    expect(timeline!.sseEvents).toEqual(["tick", "message"]);
    expect(timeline!.queryKeys).toEqual([["timeline"]]);
    expect(timeline!.featureGate).toBeUndefined();
  });
});
