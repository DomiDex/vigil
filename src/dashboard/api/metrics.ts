import type { DashboardContext } from "../types.ts";

/** Model pricing per million tokens (input) */
const MODEL_PRICING: Record<string, number> = {
  "claude-haiku-4-5-20251001": 0.25,
  "claude-sonnet-4-6": 3.0,
  "claude-opus-4-6": 15.0,
};

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function getMetricsJSON(ctx: DashboardContext, opts?: { from?: number; to?: number }) {
  const { daemon } = ctx;
  const tick = daemon.tickEngine as any;
  const session = daemon.session as any;
  const config = daemon.config;
  const metrics = daemon.metrics;

  const since = opts?.from ?? Date.now() - 86_400_000; // default last 24h

  // --- Decision counts ---
  const summary = metrics.getSummary(since);
  const decisionTotals = {
    SILENT: summary["decisions.silent"]?.count ?? 0,
    OBSERVE: summary["decisions.observe"]?.count ?? 0,
    NOTIFY: summary["decisions.notify"]?.count ?? 0,
    ACT: summary["decisions.act"]?.count ?? 0,
  };

  // Decision time-series (30 min buckets)
  const bucketMs = 1_800_000;
  const silentSeries = metrics.getTimeSeries("decisions.silent", since, bucketMs);
  const observeSeries = metrics.getTimeSeries("decisions.observe", since, bucketMs);
  const notifySeries = metrics.getTimeSeries("decisions.notify", since, bucketMs);
  const actSeries = metrics.getTimeSeries("decisions.act", since, bucketMs);

  // Merge all bucket times into a single sorted set
  const allTimes = new Set<string>();
  for (const series of [silentSeries, observeSeries, notifySeries, actSeries]) {
    for (const pt of series) allTimes.add(pt.time);
  }
  const sortedTimes = [...allTimes].sort();

  const toMap = (series: { time: string; count: number }[]) => {
    const m = new Map<string, number>();
    for (const pt of series) m.set(pt.time, pt.count);
    return m;
  };
  const silentMap = toMap(silentSeries);
  const observeMap = toMap(observeSeries);
  const notifyMap = toMap(notifySeries);
  const actMap = toMap(actSeries);

  const decisionSeries = sortedTimes.map((time) => ({
    time,
    SILENT: silentMap.get(time) ?? 0,
    OBSERVE: observeMap.get(time) ?? 0,
    NOTIFY: notifyMap.get(time) ?? 0,
    ACT: actMap.get(time) ?? 0,
  }));

  // --- Latency ---
  const latencyRaw = metrics.getRawMetrics("llm.decision_ms", since, 200);
  const latencySeries = latencyRaw.reverse().map((r, i) => ({ tick: i + 1, ms: Math.round(r.value) }));
  const latencyStats = summary["llm.decision_ms"] ?? { count: 0, avg: 0, max: 0 };

  // Approximate P95 from raw data
  const sortedLatencies = latencyRaw.map((r) => r.value).sort((a, b) => a - b);
  const p95 = sortedLatencies.length > 0 ? sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] : 0;

  // --- Token estimation ---
  const llmCalls = latencyStats.count;
  const tokensPerCall = 100; // rough average
  const totalTokens = llmCalls * tokensPerCall;
  const modelPrice = MODEL_PRICING[config.tickModel] ?? 0.25;
  const costEstimate = (totalTokens / 1_000_000) * modelPrice;

  // Token per-tick series from latency data
  const tokenSeries = latencySeries.map((pt) => ({
    tick: pt.tick,
    tokens: Math.round(pt.ms * 0.08),
  }));
  const maxTokensPerTick = tokenSeries.reduce((max, pt) => Math.max(max, pt.tokens), 0);
  const avgTokensPerTick =
    tokenSeries.length > 0 ? Math.round(tokenSeries.reduce((sum, pt) => sum + pt.tokens, 0) / tokenSeries.length) : 0;

  // --- Tick timing / adaptive interval ---
  const tickTimingSeries = metrics.getTimeSeries("ticks.total", since, bucketMs);

  const adaptiveCurrent = Math.round(tick.sleep.getNextInterval());
  const recentActivity = tick.sleep.recentActivityCount;

  // --- Tick counters ---
  const totalTicks = summary["ticks.total"]?.count ?? 0;
  const sleepingTicks = summary["ticks.sleeping"]?.count ?? 0;
  const proactiveTicks = summary["ticks.proactive"]?.count ?? 0;

  // --- Sleep cycles ---
  const isSleeping = tick.isSleeping;
  const uptime = session ? Date.now() - session.startedAt : 0;

  return {
    decisions: {
      series: decisionSeries,
      totals: decisionTotals,
    },
    latency: {
      series: latencySeries.slice(-50),
      avg: Math.round(latencyStats.avg),
      p95: Math.round(p95),
      max: Math.round(latencyStats.max),
      count: latencyStats.count,
    },
    tokens: {
      total: totalTokens,
      perTick: { avg: avgTokensPerTick, max: maxTokensPerTick },
      costEstimate: `$${costEstimate.toFixed(4)}`,
    },
    tickTiming: {
      configured: config.tickInterval,
      adaptiveCurrent,
      recentActivity,
      series: tickTimingSeries,
    },
    ticks: {
      total: totalTicks,
      sleeping: sleepingTicks,
      proactive: proactiveTicks,
      current: tick.currentTick,
    },
    state: {
      isSleeping,
      uptime: formatDuration(uptime),
      model: config.tickModel,
    },
  };
}
