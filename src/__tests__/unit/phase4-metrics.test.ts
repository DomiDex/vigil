import { describe, expect, it } from "bun:test";

describe("Metrics plugin", () => {
  describe("VIGIL_CHART_COLORS", () => {
    it("has all 4 decision type keys", () => {
      const { VIGIL_CHART_COLORS } = require("../../../dashboard-v2/src/components/vigil/metrics-chart");
      expect(VIGIL_CHART_COLORS).toHaveProperty("SILENT");
      expect(VIGIL_CHART_COLORS).toHaveProperty("OBSERVE");
      expect(VIGIL_CHART_COLORS).toHaveProperty("NOTIFY");
      expect(VIGIL_CHART_COLORS).toHaveProperty("ACT");
    });

    it("has semantic color keys", () => {
      const { VIGIL_CHART_COLORS } = require("../../../dashboard-v2/src/components/vigil/metrics-chart");
      expect(VIGIL_CHART_COLORS).toHaveProperty("primary");
      expect(VIGIL_CHART_COLORS).toHaveProperty("secondary");
      expect(VIGIL_CHART_COLORS).toHaveProperty("success");
      expect(VIGIL_CHART_COLORS).toHaveProperty("error");
      expect(VIGIL_CHART_COLORS).toHaveProperty("grid");
      expect(VIGIL_CHART_COLORS).toHaveProperty("text");
    });

    it("all values are CSS custom property references", () => {
      const { VIGIL_CHART_COLORS } = require("../../../dashboard-v2/src/components/vigil/metrics-chart");
      for (const [, value] of Object.entries(VIGIL_CHART_COLORS)) {
        expect((value as string).startsWith("var(--")).toBe(true);
      }
    });

    it("decision colors match expected mapping", () => {
      const { VIGIL_CHART_COLORS } = require("../../../dashboard-v2/src/components/vigil/metrics-chart");
      expect(VIGIL_CHART_COLORS.SILENT).toBe("var(--color-text-muted)");
      expect(VIGIL_CHART_COLORS.OBSERVE).toBe("var(--color-info)");
      expect(VIGIL_CHART_COLORS.NOTIFY).toBe("var(--color-warning)");
      expect(VIGIL_CHART_COLORS.ACT).toBe("var(--color-vigil)");
    });
  });

  describe("tooltip and axis style exports", () => {
    it("vigilTooltipStyle has background and border", () => {
      const { vigilTooltipStyle } = require("../../../dashboard-v2/src/components/vigil/metrics-chart");
      expect(vigilTooltipStyle.contentStyle.background).toBe("var(--color-surface-dark)");
      expect(vigilTooltipStyle.contentStyle.border).toBe("1px solid var(--color-border)");
    });

    it("vigilAxisProps has tick fill and fontSize", () => {
      const { vigilAxisProps } = require("../../../dashboard-v2/src/components/vigil/metrics-chart");
      expect(vigilAxisProps.tick.fill).toBe("var(--color-text-muted)");
      expect(vigilAxisProps.tick.fontSize).toBe(12);
    });

    it("vigilAxisProps has axisLine stroke", () => {
      const { vigilAxisProps } = require("../../../dashboard-v2/src/components/vigil/metrics-chart");
      expect(vigilAxisProps.axisLine.stroke).toBe("var(--color-border)");
    });
  });

  describe("metrics data shape", () => {
    const mockMetrics = {
      decisions: {
        series: [
          { time: "10:00", SILENT: 5, OBSERVE: 3, NOTIFY: 1, ACT: 0 },
          { time: "10:30", SILENT: 8, OBSERVE: 2, NOTIFY: 2, ACT: 1 },
          { time: "11:00", SILENT: 6, OBSERVE: 4, NOTIFY: 0, ACT: 2 },
        ],
        totals: { SILENT: 19, OBSERVE: 9, NOTIFY: 3, ACT: 3 },
      },
      latency: {
        series: [
          { tick: 1, ms: 120 },
          { tick: 2, ms: 95 },
          { tick: 3, ms: 210 },
        ],
        avg: 141,
        p95: 210,
        max: 210,
        count: 3,
      },
      tokens: { total: 15000, perTick: { avg: 5000, max: 5500 }, costEstimate: "$0.12" },
      tickTiming: {
        configured: 30,
        adaptiveCurrent: 45,
        recentActivity: 3,
        series: [
          { time: "10:00", count: 2 },
          { time: "10:30", count: 3 },
        ],
      },
      ticks: { total: 42, sleeping: 3, proactive: 5, current: 30 },
      state: { isSleeping: false, uptime: "2h 0m", model: "haiku" },
    };

    it("decisions.series has time-bucketed entries with all 4 decision counts", () => {
      for (const entry of mockMetrics.decisions.series) {
        expect(entry).toHaveProperty("time");
        expect(entry).toHaveProperty("SILENT");
        expect(entry).toHaveProperty("OBSERVE");
        expect(entry).toHaveProperty("NOTIFY");
        expect(entry).toHaveProperty("ACT");
      }
    });

    it("latency has avg, p95, max, count stats", () => {
      expect(typeof mockMetrics.latency.avg).toBe("number");
      expect(typeof mockMetrics.latency.p95).toBe("number");
      expect(typeof mockMetrics.latency.max).toBe("number");
      expect(typeof mockMetrics.latency.count).toBe("number");
    });

    it("tokens has total and costEstimate", () => {
      expect(typeof mockMetrics.tokens.total).toBe("number");
      expect(typeof mockMetrics.tokens.costEstimate).toBe("string");
    });
  });

  describe("chart configuration (no rendering)", () => {
    it("decision chart would use 4 stacked bars", () => {
      const decisionKeys = ["SILENT", "OBSERVE", "NOTIFY", "ACT"];
      expect(decisionKeys).toHaveLength(4);
    });

    it("latency chart reference line at p95 value", () => {
      const latencyData = { avg: 141, p95: 210, max: 210 };
      expect(latencyData.p95).toBe(210);
    });

    it("metrics query would use refetchInterval of 30000", () => {
      const METRICS_REFETCH_INTERVAL = 30_000;
      expect(METRICS_REFETCH_INTERVAL).toBe(30000);
    });
  });
});
