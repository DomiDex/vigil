import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MetricsStore } from "../../core/metrics.ts";

let metrics: MetricsStore;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "vigil-metrics-test-"));
  metrics = new MetricsStore(join(tmpDir, "metrics.db"));
});

afterEach(() => {
  metrics.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("counters", () => {
  test("increment accumulates in memory", () => {
    metrics.increment("ticks.total");
    metrics.increment("ticks.total");
    metrics.increment("ticks.total", 3);
    expect(metrics.getCounter("ticks.total")).toBe(5);
  });

  test("flush writes counters to SQLite and clears memory", () => {
    metrics.increment("ticks.total", 10);
    metrics.flush();

    expect(metrics.getCounter("ticks.total")).toBe(0);
    const summary = metrics.getSummary(0);
    expect(summary["ticks.total"]).toBeDefined();
    expect(summary["ticks.total"].max).toBe(10);
  });

  test("flush is a no-op when counters are empty", () => {
    metrics.flush();
    const summary = metrics.getSummary(0);
    expect(Object.keys(summary)).toHaveLength(0);
  });
});

describe("gauge", () => {
  test("records value immediately", () => {
    metrics.gauge("cpu.percent", 42.5);
    const summary = metrics.getSummary(0);
    expect(summary["cpu.percent"]).toBeDefined();
    expect(summary["cpu.percent"].avg).toBe(42.5);
  });

  test("multiple gauges produce correct stats", () => {
    metrics.gauge("latency", 100);
    metrics.gauge("latency", 200);
    metrics.gauge("latency", 300);

    const summary = metrics.getSummary(0);
    expect(summary["latency"].count).toBe(3);
    expect(summary["latency"].avg).toBe(200);
    expect(summary["latency"].max).toBe(300);
  });

  test("gauge with labels stores correctly", () => {
    metrics.gauge("llm.decision_ms", 150, { repo: "my-repo" });
    const summary = metrics.getSummary(0);
    expect(summary["llm.decision_ms"]).toBeDefined();
    expect(summary["llm.decision_ms"].max).toBe(150);
  });
});

describe("timing", () => {
  test("timing records as gauge", () => {
    metrics.timing("llm.call_ms", 500, { model: "haiku" });
    const summary = metrics.getSummary(0);
    expect(summary["llm.call_ms"]).toBeDefined();
    expect(summary["llm.call_ms"].max).toBe(500);
  });
});

describe("getSummary", () => {
  test("filters by time window", () => {
    metrics.gauge("old_metric", 1);

    // Summary with cutoff in the future should return the metric
    const all = metrics.getSummary(0);
    expect(Object.keys(all)).toHaveLength(1);

    // Summary with cutoff in the far future should return nothing
    const none = metrics.getSummary(Date.now() + 100_000);
    expect(Object.keys(none)).toHaveLength(0);
  });

  test("defaults to last 24h", () => {
    metrics.gauge("recent", 1);
    const summary = metrics.getSummary();
    expect(summary["recent"]).toBeDefined();
  });
});

describe("startFlushing / stop", () => {
  test("stop performs final flush", () => {
    metrics.increment("pending", 5);
    metrics.stop();

    // Counter should have been flushed
    expect(metrics.getCounter("pending")).toBe(0);
    const summary = metrics.getSummary(0);
    expect(summary["pending"]).toBeDefined();
    expect(summary["pending"].max).toBe(5);
  });

  test("startFlushing is idempotent", () => {
    // Should not throw when called multiple times
    metrics.startFlushing(60_000);
    metrics.startFlushing(60_000);
    metrics.stop();
  });
});
