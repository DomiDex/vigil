import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../../core/config.ts";
import { TopicTier } from "../../memory/topic-tier.ts";
import type { DashboardContext } from "../types.ts";

// ── Helpers ──

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface DreamResult {
  repo: string;
  result: {
    summary?: string;
    insights?: string[];
    patterns?: string[];
    confidence?: number;
  };
  sourceIds: string[];
  completedAt: number;
}

function loadDreamResults(): DreamResult[] {
  const dataDir = getDataDir();
  if (!existsSync(dataDir)) return [];

  const files = readdirSync(dataDir).filter((f) => f.startsWith("dream-result-") && f.endsWith(".json"));
  const results: DreamResult[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(dataDir, file), "utf-8");
      results.push(JSON.parse(content));
    } catch {
      // Skip malformed files
    }
  }

  return results.sort((a, b) => b.completedAt - a.completedAt);
}

function isDreamRunning(): { running: boolean; repo?: string; pid?: number } {
  const lockPath = join(getDataDir(), "dream.lock");
  if (!existsSync(lockPath)) return { running: false };

  try {
    const lock = JSON.parse(readFileSync(lockPath, "utf-8"));
    return { running: true, repo: lock.repo, pid: lock.pid };
  } catch {
    return { running: false };
  }
}

// ── GET /api/dreams ──

export function getDreamsJSON(_ctx: DashboardContext) {
  const dreams = loadDreamResults();
  const lockStatus = isDreamRunning();

  return {
    dreams: dreams.map((d) => ({
      timestamp: new Date(d.completedAt).toISOString(),
      repo: d.repo,
      observationsConsolidated: d.sourceIds.length,
      summary: d.result.summary ?? "",
      patterns: d.result.patterns ?? [],
      insights: d.result.insights ?? [],
      confidence: d.result.confidence ?? 0,
    })),
    status: lockStatus,
  };
}

export function getDreamsFragment(ctx: DashboardContext, repo?: string): string {
  const data = getDreamsJSON(ctx);
  let dreams = data.dreams;
  if (repo) {
    dreams = dreams.filter((d) => d.repo === repo);
  }

  const triggerDisabled = data.status.running ? "disabled" : "";
  const triggerLabel = data.status.running ? `Dreaming (${data.status.repo})...` : "Trigger Dream";

  // Collect all patterns across dreams for the sidebar
  const patternMap = new Map<string, number>();
  for (const dream of data.dreams) {
    for (const pattern of dream.patterns) {
      patternMap.set(pattern, (patternMap.get(pattern) ?? 0) + 1);
    }
  }
  const sortedPatterns = [...patternMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Topic evolution
  const topicEvolution = getTopicEvolution(repo);

  const dreamsHTML =
    dreams.length > 0
      ? dreams
          .map(
            (d) => `
    <div class="bg-surface rounded-lg border border-purple/20 p-5 mb-1 cursor-pointer transition-all duration-150 hover:border-vigil/30 hover:shadow-[0_0_12px_rgba(255,129,2,0.06)] border-l-3 border-l-purple/40">
      <div class="flex items-start gap-2 mb-1.5">
        <svg class="shrink-0 w-4 h-4 text-purple mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
        <span class="flex-1 text-xs text-text-muted">${formatDreamDate(d.timestamp)}</span>
        <span class="shrink-0 text-border">---</span>
        <span class="shrink-0 text-[0.65rem] font-semibold text-success">${d.observationsConsolidated} observations</span>
        <span class="shrink-0 text-border">---</span>
        <span class="shrink-0 text-[0.65rem] font-semibold text-warning">confidence: ${d.confidence.toFixed(2)}</span>
      </div>
      <div class="text-sm text-text leading-relaxed">
        <div class="pl-6 mt-1 border-l-2 border-border pb-1"></div>
        <div>
          ${d.summary ? `<div class="mb-2"><div class="text-xs text-text-muted uppercase tracking-wider mb-1 font-medium">Summary</div><div class="text-xs text-text leading-relaxed">${escapeHtml(d.summary)}</div></div>` : ""}
          ${d.insights.length > 0 ? `<div class="mb-2"><div class="text-xs text-text-muted uppercase tracking-wider mb-1 font-medium">Insights</div>${d.insights.map((i) => `<div class="text-xs text-text leading-relaxed"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="inline text-vigil"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> ${escapeHtml(i)}</div>`).join("")}</div>` : ""}
          ${d.patterns.length > 0 ? `<div class="mb-2"><div class="text-xs text-text-muted uppercase tracking-wider mb-1 font-medium">Patterns</div><ul class="list-none p-0 m-0 flex flex-col gap-0.5">${d.patterns.map((p) => `<li class="text-xs text-text"><span class="text-purple">&#9679;</span> ${escapeHtml(p)}</li>`).join("")}</ul></div>` : ""}
        </div>
      </div>
    </div>`,
          )
          .join("")
      : '<div class="text-sm text-text-muted text-center py-8">No dreams recorded yet. Run the daemon and wait for idle consolidation.</div>';

  const patternsHTML =
    sortedPatterns.length > 0
      ? sortedPatterns
          .map(
            ([pattern, count]) => `
      <div class="flex items-center gap-2 py-1">
        <span class="text-xs font-mono text-vigil w-8">${(count / Math.max(dreams.length, 1)).toFixed(2)}</span>
        <span class="text-xs text-text flex-1">${escapeHtml(pattern)}</span>
      </div>`,
          )
          .join("")
      : '<div class="text-sm text-text-muted text-center py-4">No patterns yet.</div>';

  const topicsHTML =
    topicEvolution.length > 0
      ? topicEvolution
          .map(
            (t) => `
      <div class="flex items-center gap-2 py-1.5 border-b border-border last:border-0">
        <span class="flex-1 text-xs text-text">${escapeHtml(t.name)}</span>
        <span class="flex-1 font-mono text-[0.65rem] tracking-widest">${renderTopicBar(t.count, t.maxCount)}</span>
        <span class="shrink-0 text-xs">${trendIcon(t.trend)}</span>
      </div>`,
          )
          .join("")
      : '<div class="text-sm text-text-muted text-center py-4">No topics yet.</div>';

  // Build repo options from daemon paths
  const repos = ctx.daemon.repoPaths.map((p) => p.split("/").pop() || p);
  const repoOptions = repos
    .map((r) => `<option value="${escapeHtml(r)}"${repo === r ? " selected" : ""}>${escapeHtml(r)}</option>`)
    .join("");

  return `
<div class="flex items-center gap-3 mb-4">
  <button class="inline-flex items-center gap-1.5 bg-purple hover:bg-purple/80 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed" ${triggerDisabled}
          hx-post="/api/dreams/trigger"
          hx-target="#dreams-panel"
          hx-swap="innerHTML"
          hx-include="[name=dreamrepo]">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
    ${triggerLabel}
  </button>
  <select name="dreamrepo" class="bg-surface-dark border border-border rounded-lg px-3 py-2 text-sm text-text"
          hx-get="/api/dreams/fragment"
          hx-trigger="change"
          hx-target="#dreams-panel"
          hx-swap="innerHTML"
          hx-include="[name=dreamrepo]">
    <option value="">All repos</option>
    ${repoOptions}
  </select>
</div>

<div class="flex gap-5">
  <div class="flex-1 flex flex-col gap-1 max-h-[600px] overflow-y-auto">
    <h3 class="text-xs text-text-muted uppercase tracking-wider mb-2 font-medium">Dream Log</h3>
    ${dreamsHTML}
  </div>

  <div class="w-60 shrink-0 flex flex-col gap-4">
    <div class="bg-surface rounded-lg border border-border p-4">
      <h4 class="text-xs text-text-muted uppercase tracking-wider mb-3 font-medium">Patterns</h4>
      ${patternsHTML}
    </div>
    <div class="bg-surface rounded-lg border border-border p-4">
      <h4 class="text-xs text-text-muted uppercase tracking-wider mb-3 font-medium">Topic Evolution</h4>
      ${topicsHTML}
    </div>
  </div>
</div>`;
}

// ── POST /api/dreams/trigger ──

export async function handleDreamTrigger(ctx: DashboardContext, repo?: string): Promise<string> {
  const lockStatus = isDreamRunning();
  if (lockStatus.running) {
    return getDreamsFragment(ctx, repo);
  }

  const targetRepo = repo || (ctx.daemon.repoPaths[0]?.split("/").pop() ?? "");
  if (!targetRepo) {
    return getDreamsFragment(ctx, repo);
  }

  // Spawn dream worker as subprocess
  try {
    const workerPath = join(import.meta.dir, "../../memory/dream-worker.ts");
    Bun.spawn(["bun", "run", workerPath, targetRepo], {
      stdout: "ignore",
      stderr: "ignore",
    });
  } catch {
    // Worker spawn failed — dreams fragment will show status
  }

  // Return updated fragment (will show "Dreaming..." status)
  // Small delay to let the lock file be created
  await new Promise((r) => setTimeout(r, 200));
  return getDreamsFragment(ctx, repo);
}

// ── GET /api/dreams/patterns/:repo ──

export function getDreamPatternsJSON(ctx: DashboardContext, repo: string) {
  const profile = ctx.daemon.vectorStore.getRepoProfile(repo);
  return {
    repo,
    patterns: profile?.patterns ?? [],
    lastUpdated: profile ? new Date(profile.lastUpdated).toISOString() : null,
  };
}

// ── Topic Evolution helpers ──

interface TopicEvolutionEntry {
  name: string;
  count: number;
  maxCount: number;
  trend: "rising" | "stable" | "cooling" | "new";
}

function getTopicEvolution(repo?: string): TopicEvolutionEntry[] {
  const topicTier = new TopicTier();
  const baseDir = join(getDataDir(), "topics");
  if (!existsSync(baseDir)) return [];

  const repos = repo
    ? [repo]
    : readdirSync(baseDir).filter((f) => {
        const p = join(baseDir, f);
        return existsSync(p) && statSync(p).isDirectory();
      });

  const topicEntries: TopicEvolutionEntry[] = [];
  let maxCount = 1;

  for (const r of repos) {
    const names = topicTier.listTopics(r);
    for (const name of names) {
      const topic = topicTier.getTopic(r, name);
      if (!topic) continue;
      const count = topic.observations.length;
      if (count > maxCount) maxCount = count;
      topicEntries.push({
        name: topic.name,
        count,
        maxCount: 0, // filled below
        trend: categorizeTrend(topic),
      });
    }
  }

  // Set maxCount for bar rendering
  for (const entry of topicEntries) {
    entry.maxCount = maxCount;
  }

  return topicEntries.sort((a, b) => b.count - a.count).slice(0, 10);
}

function categorizeTrend(topic: {
  observations: string[];
  lastUpdated: number;
}): "rising" | "stable" | "cooling" | "new" {
  const ageMs = Date.now() - topic.lastUpdated;
  const ageHours = ageMs / (1000 * 60 * 60);

  if (topic.observations.length <= 2) return "new";
  if (ageHours < 6) return "rising";
  if (ageHours < 24) return "stable";
  return "cooling";
}

function renderTopicBar(count: number, maxCount: number): string {
  const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
  const filled = Math.round(pct / 20);
  return `<span class="text-vigil">${"&#9608;".repeat(filled)}</span><span class="text-border">${"&#9617;".repeat(5 - filled)}</span>`;
}

function trendIcon(trend: string): string {
  switch (trend) {
    case "rising":
      return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-success"><polyline points="18 15 12 9 6 15"/></svg>';
    case "cooling":
      return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-error"><polyline points="6 9 12 15 18 9"/></svg>';
    case "new":
      return '<span class="bg-vigil/10 text-vigil px-1.5 py-0.5 rounded text-[0.6rem]">new</span>';
    default:
      return '<span class="text-text-muted">--</span>';
  }
}

function formatDreamDate(iso: string): string {
  const d = new Date(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${months[d.getMonth()]} ${d.getDate()}, ${h12}:${m} ${ampm}`;
}
