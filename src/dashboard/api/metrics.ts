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

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

export function getMetricsJSON(ctx: DashboardContext) {
  const { daemon } = ctx;
  const tick = daemon.tickEngine as any;
  const session = daemon.session as any;
  const config = daemon.config;
  const metrics = daemon.metrics;

  const since = Date.now() - 86_400_000; // last 24h

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
  // Estimate tokens from latency count * avg chars per LLM call (rough proxy)
  const llmCalls = latencyStats.count;
  const tokensPerCall = 100; // rough average
  const totalTokens = llmCalls * tokensPerCall;
  const modelPrice = MODEL_PRICING[config.tickModel] ?? 0.25;
  const costEstimate = (totalTokens / 1_000_000) * modelPrice;

  // Token per-tick series from latency data (proxy: more latency ≈ more tokens)
  const tokenSeries = latencySeries.map((pt) => ({
    tick: pt.tick,
    tokens: Math.round(pt.ms * 0.08), // rough: ~80 tokens per second of LLM time
  }));
  const maxTokensPerTick = tokenSeries.reduce((max, pt) => Math.max(max, pt.tokens), 0);
  const avgTokensPerTick =
    tokenSeries.length > 0 ? Math.round(tokenSeries.reduce((sum, pt) => sum + pt.tokens, 0) / tokenSeries.length) : 0;

  // --- Tick timing / adaptive interval ---
  const tickTimingSeries = metrics.getTimeSeries("ticks.total", since, bucketMs);

  // Current adaptive state
  const adaptiveCurrent = Math.round(tick.sleep.getNextInterval());
  const recentActivity = tick.sleep.recentActivityCount;

  // --- Tick counters ---
  const totalTicks = summary["ticks.total"]?.count ?? 0;
  const sleepingTicks = summary["ticks.sleeping"]?.count ?? 0;
  const proactiveTicks = summary["ticks.proactive"]?.count ?? 0;

  // --- Sleep cycles ---
  // We approximate from tick engine state — no persistent history exists
  const isSleeping = tick.isSleeping;
  const uptime = session ? Date.now() - session.startedAt : 0;

  return {
    decisions: {
      series: decisionSeries,
      totals: decisionTotals,
    },
    latency: {
      series: latencySeries.slice(-50), // last 50 points for chart
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

/** Render the full metrics panel HTML fragment */
export function getMetricsFragment(ctx: DashboardContext): string {
  const data = getMetricsJSON(ctx);

  const STAT_ROW = "flex justify-between items-center py-1.5 border-b border-border last:border-0";
  const STAT_LABEL = "flex-1 text-sm text-text-muted";
  const STAT_VALUE = "shrink-0 text-sm font-semibold font-mono text-text";

  return `<div class="flex gap-5 items-start">
  <!-- Left column: Charts -->
  <div class="flex-1 grid gap-4">
    <div class="bg-surface rounded-lg border border-border p-5">
      <h3 class="text-sm font-medium text-text mb-4 flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
        Decisions Over Time
      </h3>
      <div class="relative h-[300px]"><canvas id="chart-decisions"></canvas></div>
    </div>

    <div class="bg-surface rounded-lg border border-border p-5">
      <h3 class="text-sm font-medium text-text mb-4 flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        LLM Latency
      </h3>
      <div class="relative h-[300px]"><canvas id="chart-latency"></canvas></div>
    </div>

    <div class="bg-surface rounded-lg border border-border p-5">
      <h3 class="text-sm font-medium text-text mb-4 flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Adaptive Tick Interval
      </h3>
      <div class="relative h-[300px]"><canvas id="chart-tick-interval"></canvas></div>
    </div>
  </div>

  <!-- Right column: Stats -->
  <div class="w-60 shrink-0 flex flex-col gap-4">
    <div class="bg-surface rounded-lg border border-border p-4">
      <h3 class="text-xs text-text-muted uppercase tracking-wider mb-2 font-medium">Quick Stats</h3>
      <div class="flex flex-col gap-2">
        <div class="${STAT_ROW}"><span class="${STAT_LABEL}">Total Ticks</span><span class="${STAT_VALUE}">${data.ticks.total}</span></div>
        <div class="${STAT_ROW}"><span class="${STAT_LABEL}">LLM Calls</span><span class="${STAT_VALUE}">${data.latency.count}</span></div>
        <div class="${STAT_ROW}"><span class="${STAT_LABEL}">Tokens (est.)</span><span class="${STAT_VALUE}">${data.tokens.total > 1000 ? `${(data.tokens.total / 1000).toFixed(1)}k` : data.tokens.total}</span></div>
        <div class="${STAT_ROW}"><span class="${STAT_LABEL}">Cost Est.</span><span class="${STAT_VALUE} text-vigil">${data.tokens.costEstimate}</span></div>
        <div class="h-px bg-border my-2"></div>
        <div class="${STAT_ROW}"><span class="${STAT_LABEL}">Avg Latency</span><span class="${STAT_VALUE}">${formatMs(data.latency.avg)}</span></div>
        <div class="${STAT_ROW}"><span class="${STAT_LABEL}">P95 Latency</span><span class="${STAT_VALUE}">${formatMs(data.latency.p95)}</span></div>
        <div class="${STAT_ROW}"><span class="${STAT_LABEL}">Max Latency</span><span class="${STAT_VALUE}">${formatMs(data.latency.max)}</span></div>
        <div class="h-px bg-border my-2"></div>
        <div class="${STAT_ROW}"><span class="${STAT_LABEL}">Proactive</span><span class="${STAT_VALUE}">${data.ticks.proactive}</span></div>
        <div class="${STAT_ROW}"><span class="${STAT_LABEL}">Sleeping</span><span class="${STAT_VALUE}">${data.ticks.sleeping}</span></div>
      </div>
    </div>

    <div class="bg-surface rounded-lg border border-border p-4">
      <h3 class="text-xs text-text-muted uppercase tracking-wider mb-2 font-medium">Token Usage / Tick</h3>
      <div class="relative h-[300px]"><canvas id="chart-tokens"></canvas></div>
    </div>

    <div class="bg-surface rounded-lg border border-border p-4">
      <h3 class="text-xs text-text-muted uppercase tracking-wider mb-2 font-medium">Decision Totals</h3>
      <div class="flex flex-col gap-2">
        <div class="flex justify-between items-center">
          <span class="inline-flex items-center gap-1.5 text-[0.7rem] px-2 py-1 rounded" style="background: rgba(107,114,128,0.2); color: #6b7280;">SILENT</span>
          <span class="font-mono font-bold">${data.decisions.totals.SILENT}</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="inline-flex items-center gap-1.5 text-[0.7rem] px-2 py-1 rounded" style="background: rgba(96,165,250,0.15); color: #60a5fa;">OBSERVE</span>
          <span class="font-mono font-bold">${data.decisions.totals.OBSERVE}</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="inline-flex items-center gap-1.5 text-[0.7rem] px-2 py-1 rounded" style="background: rgba(234,179,8,0.15); color: #eab308;">NOTIFY</span>
          <span class="font-mono font-bold">${data.decisions.totals.NOTIFY}</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="inline-flex items-center gap-1.5 text-[0.7rem] px-2 py-1 rounded" style="background: rgba(239,68,68,0.15); color: #ef4444;">ACT</span>
          <span class="font-mono font-bold">${data.decisions.totals.ACT}</span>
        </div>
      </div>
    </div>
  </div>
</div>`;
}
