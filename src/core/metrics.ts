import { Database } from "bun:sqlite";
import { join } from "node:path";
import { getDataDir } from "./config.ts";

/**
 * Lightweight local metrics for Vigil.
 *
 * Tracks operational health without external telemetry services.
 * Counters are batched in memory and flushed periodically to SQLite.
 * Gauges and timings are written immediately.
 */
export class MetricsStore {
  private db: Database;
  private counters = new Map<string, number>();
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor(dbPath?: string) {
    this.db = new Database(dbPath ?? join(getDataDir(), "metrics.db"));
    this.db.run(`
      CREATE TABLE IF NOT EXISTS metrics (
        name TEXT NOT NULL,
        value REAL NOT NULL,
        labels TEXT DEFAULT '{}',
        recorded_at INTEGER NOT NULL
      )
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_metrics_name_time
      ON metrics(name, recorded_at)
    `);
  }

  /** Increment a counter. Batched — flushed periodically. */
  increment(name: string, amount = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
  }

  /** Record a gauge value immediately. */
  gauge(name: string, value: number, labels: Record<string, string> = {}): void {
    this.db.run("INSERT INTO metrics (name, value, labels, recorded_at) VALUES (?, ?, ?, ?)", [
      name,
      value,
      JSON.stringify(labels),
      Date.now(),
    ]);
  }

  /** Record a timing/duration in milliseconds. */
  timing(name: string, durationMs: number, labels: Record<string, string> = {}): void {
    this.gauge(name, durationMs, labels);
  }

  /** Start periodic flush of counters to SQLite. */
  startFlushing(intervalMs = 30_000): void {
    if (this.flushInterval) return;
    this.flushInterval = setInterval(() => this.flush(), intervalMs);
  }

  /** Flush accumulated counters to SQLite. */
  flush(): void {
    if (this.counters.size === 0) return;
    const now = Date.now();
    const stmt = this.db.prepare("INSERT INTO metrics (name, value, labels, recorded_at) VALUES (?, ?, '{}', ?)");
    for (const [name, value] of this.counters) {
      stmt.run(name, value, now);
    }
    this.counters.clear();
  }

  /** Get metrics summary for CLI display. */
  getSummary(since?: number): Record<string, { count: number; avg: number; max: number }> {
    const cutoff = since ?? Date.now() - 86_400_000; // Last 24h
    const rows = this.db
      .query(
        `SELECT name, COUNT(*) as count, AVG(value) as avg, MAX(value) as max
         FROM metrics WHERE recorded_at > ?
         GROUP BY name ORDER BY name`,
      )
      .all(cutoff) as { name: string; count: number; avg: number; max: number }[];

    const summary: Record<string, { count: number; avg: number; max: number }> = {};
    for (const row of rows) {
      summary[row.name] = { count: row.count, avg: row.avg, max: row.max };
    }
    return summary;
  }

  /** Get the in-memory counter value (for testing). */
  getCounter(name: string): number {
    return this.counters.get(name) ?? 0;
  }

  /** Get time-series data for a metric, bucketed by interval. */
  getTimeSeries(
    name: string,
    since?: number,
    bucketMs = 1_800_000, // 30 min default
  ): { time: string; value: number; count: number }[] {
    const cutoff = since ?? Date.now() - 86_400_000;
    const rows = this.db
      .query(
        `SELECT (recorded_at / ? * ?) as bucket, SUM(value) as value, COUNT(*) as count
         FROM metrics WHERE name = ? AND recorded_at > ?
         GROUP BY bucket ORDER BY bucket`,
      )
      .all(bucketMs, bucketMs, name, cutoff) as { bucket: number; value: number; count: number }[];

    return rows.map((r) => ({
      time: new Date(r.bucket).toISOString(),
      value: r.value,
      count: r.count,
    }));
  }

  /** Get raw metric rows for a metric name, ordered by time. */
  getRawMetrics(name: string, since?: number, limit = 200): { value: number; labels: string; recorded_at: number }[] {
    const cutoff = since ?? Date.now() - 86_400_000;
    return this.db
      .query(
        `SELECT value, labels, recorded_at
         FROM metrics WHERE name = ? AND recorded_at > ?
         ORDER BY recorded_at DESC LIMIT ?`,
      )
      .all(name, cutoff, limit) as { value: number; labels: string; recorded_at: number }[];
  }

  /** Get all distinct metric names. */
  getMetricNames(since?: number): string[] {
    const cutoff = since ?? Date.now() - 86_400_000;
    const rows = this.db.query("SELECT DISTINCT name FROM metrics WHERE recorded_at > ? ORDER BY name").all(cutoff) as {
      name: string;
    }[];
    return rows.map((r) => r.name);
  }

  /** Stop flushing and perform a final flush. */
  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush();
  }

  /** Close the database connection. */
  close(): void {
    this.stop();
    this.db.close();
  }
}
