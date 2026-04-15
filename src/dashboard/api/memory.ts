import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getLogsDir } from "../../core/config.ts";
import { type AskContext, AskEngine } from "../../llm/ask-engine.ts";
import { IndexTier } from "../../memory/index-tier.ts";
import { TopicTier } from "../../memory/topic-tier.ts";
import type { DashboardContext } from "../types.ts";

// ── Helpers ──

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function countLogEntries(): { count: number; oldestDate: string; newestDate: string } {
  const logsDir = getLogsDir();
  if (!existsSync(logsDir)) return { count: 0, oldestDate: "", newestDate: "" };

  const files = readdirSync(logsDir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort();

  if (files.length === 0) return { count: 0, oldestDate: "", newestDate: "" };

  let count = 0;
  for (const file of files) {
    const content = readFileSync(join(logsDir, file), "utf-8");
    count += content.trim().split("\n").filter(Boolean).length;
  }

  const oldestDate = files[0].slice(0, 10);
  const newestDate = files[files.length - 1].slice(0, 10);

  return { count, oldestDate, newestDate };
}

function getVectorStoreStats(ctx: DashboardContext): { count: number; types: Record<string, number> } {
  try {
    const db = (ctx.daemon.vectorStore as any).db;
    const countRow = db.query("SELECT COUNT(*) as cnt FROM memories").get() as { cnt: number } | null;
    const typeRows = db.query("SELECT type, COUNT(*) as cnt FROM memories GROUP BY type").all() as {
      type: string;
      cnt: number;
    }[];

    const types: Record<string, number> = {};
    for (const row of typeRows) {
      types[row.type] = row.cnt;
    }

    return { count: countRow?.cnt ?? 0, types };
  } catch {
    return { count: 0, types: {} };
  }
}

function getTopicStats(): { count: number; repos: string[] } {
  const topicTier = new TopicTier();
  const baseDir = join(getDataDir(), "topics");
  if (!existsSync(baseDir)) return { count: 0, repos: [] };

  const repos = readdirSync(baseDir).filter((f) => {
    const p = join(baseDir, f);
    return existsSync(p) && statSync(p).isDirectory();
  });

  let count = 0;
  for (const repo of repos) {
    count += topicTier.listTopics(repo).length;
  }

  return { count, repos };
}

function getIndexStats(): { count: number; repos: string[] } {
  const indexDir = join(getDataDir(), "index");
  if (!existsSync(indexDir)) return { count: 0, repos: [] };

  const files = readdirSync(indexDir).filter((f) => f.endsWith(".json"));
  const repos = files.map((f) => f.replace(".json", ""));

  return { count: files.length, repos };
}

// ── GET /api/memory ──

export function getMemoryJSON(ctx: DashboardContext) {
  const eventLogStats = countLogEntries();
  const vectorStats = getVectorStoreStats(ctx);
  const topicStats = getTopicStats();
  const indexStats = getIndexStats();

  const profiles = ctx.daemon.vectorStore.getAllRepoProfiles().map((p) => ({
    repo: p.repo,
    summary: p.summary.slice(0, 200),
    patternCount: p.patterns.length,
    lastUpdated: new Date(p.lastUpdated).toISOString(),
  }));

  return {
    pipeline: {
      eventLog: eventLogStats,
      vectorStore: vectorStats,
      topicTier: topicStats,
      indexTier: indexStats,
    },
    profiles,
  };
}

export function getMemoryFragment(ctx: DashboardContext): string {
  const data = getMemoryJSON(ctx);

  const pipelineBoxes = [
    {
      label: "EventLog",
      count: data.pipeline.eventLog.count,
      unit: "events",
      detail: "JSONL files",
      sub:
        data.pipeline.eventLog.oldestDate && data.pipeline.eventLog.newestDate
          ? `${data.pipeline.eventLog.oldestDate} - ${data.pipeline.eventLog.newestDate}`
          : "no data",
    },
    {
      label: "VectorStore",
      count: data.pipeline.vectorStore.count,
      unit: "vectors",
      detail: "SQLite FTS5",
      sub: `${Object.keys(data.pipeline.vectorStore.types).length} types`,
    },
    {
      label: "TopicTier",
      count: data.pipeline.topicTier.count,
      unit: "topics",
      detail: "Grouped by theme",
      sub: `${data.pipeline.topicTier.repos.length} repos`,
    },
    {
      label: "IndexTier",
      count: data.pipeline.indexTier.count,
      unit: "indices",
      detail: "Cross-repo",
      sub: `${data.pipeline.indexTier.repos.length} repos`,
    },
  ];

  const pipelineHTML = pipelineBoxes
    .map(
      (box, i) => `
    <div class="bg-surface-light border border-border rounded-lg p-3 cursor-pointer transition-all duration-150 hover:border-vigil/30 hover:shadow-[0_0_8px_rgba(255,129,2,0.05)]">
      <div class="text-sm text-text font-semibold">${box.label}</div>
      <div class="text-lg font-mono text-vigil mt-0.5">${box.count.toLocaleString()}</div>
      <div class="text-[0.7rem] text-text-muted">${box.unit}</div>
      <div class="text-xs text-text-muted mt-1">${box.detail}</div>
      <div class="text-xs text-text-muted">${box.sub}</div>
    </div>${i < pipelineBoxes.length - 1 ? '<div class="flex items-center justify-center text-vigil py-1"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>' : ""}`,
    )
    .join("");

  const profilesHTML =
    data.profiles.length > 0
      ? data.profiles
          .map(
            (p) => `
      <div class="flex items-center gap-3 py-2 border-b border-border last:border-0">
        <div class="shrink-0 text-[0.7rem] text-vigil font-medium">${escapeHtml(p.repo)}</div>
        <div class="flex-1 text-sm text-text">${escapeHtml(p.summary)}</div>
        <div class="shrink-0 text-[0.7rem] text-text-muted">${p.patternCount} patterns &middot; Updated ${escapeHtml(p.lastUpdated.split("T")[0])}</div>
      </div>`,
          )
          .join("")
      : '<div class="text-sm text-text-muted text-center py-4">No repo profiles yet. Run the daemon to build memory.</div>';

  return `
<div class="bg-surface rounded-lg border border-border p-5 mb-4">
  <h3 class="text-xs text-vigil font-medium uppercase tracking-wider mb-3 flex items-center gap-2">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    Search Memories
  </h3>
  <div class="flex gap-2 mb-4">
    <div class="relative flex-1">
      <svg class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="search" name="memq" placeholder="Search memories (FTS5)..."
             class="w-full bg-surface-dark border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-vigil focus:border-vigil transition-all"
             autocomplete="off"
             hx-get="/api/memory/search/fragment"
             hx-trigger="keyup changed delay:300ms"
             hx-target="#mem-search-results"
             hx-swap="innerHTML"
             hx-include="[name=memq],[name=memrepo]">
    </div>
    <select name="memrepo" class="bg-surface-dark border border-border rounded-lg px-3 py-2 text-sm text-text min-w-[120px]"
            hx-get="/api/memory/search/fragment"
            hx-trigger="change"
            hx-target="#mem-search-results"
            hx-swap="innerHTML"
            hx-include="[name=memq],[name=memrepo]">
      <option value="">All repos</option>
      ${data.profiles.map((p) => `<option value="${escapeHtml(p.repo)}">${escapeHtml(p.repo)}</option>`).join("")}
    </select>
  </div>
  <div id="mem-search-results" class="flex flex-col gap-1.5 max-h-[400px] overflow-y-auto">
    <div class="text-sm text-text-muted text-center py-4">Enter a search query to find memories</div>
  </div>
</div>

<div class="bg-surface rounded-lg border border-border p-5 mb-4">
  <h3 class="text-xs text-vigil font-medium uppercase tracking-wider mb-3 flex items-center gap-2">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
    Memory Pipeline
  </h3>
  <div class="flex flex-col gap-4 py-4">${pipelineHTML}</div>
</div>

<div class="bg-surface rounded-lg border border-border p-5 mb-4">
  <h3 class="text-xs text-vigil font-medium uppercase tracking-wider mb-3 flex items-center gap-2">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
    Repo Profiles
  </h3>
  ${profilesHTML}
</div>

<div class="bg-surface rounded-lg border border-border p-5 mb-4">
  <h3 class="text-xs text-vigil font-medium uppercase tracking-wider mb-3 flex items-center gap-2">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
    Ask Vigil
  </h3>
  <div class="p-4 bg-surface-light border border-border rounded-lg">
    <div class="relative flex">
      <input type="text" name="askq" placeholder="Ask a question about your repositories..."
             class="flex-1 bg-surface-dark border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-vigil"
             autocomplete="off"
             id="mem-ask-input">
    </div>
    <div class="flex gap-1.5 mt-2">
      <select name="askrepo" class="bg-surface-dark border border-border rounded-lg px-3 py-2 text-sm text-text min-w-[120px]">
        <option value="">All repos</option>
        ${data.profiles.map((p) => `<option value="${escapeHtml(p.repo)}">${escapeHtml(p.repo)}</option>`).join("")}
      </select>
      <button class="inline-flex items-center gap-1.5 px-3 py-2 bg-vigil hover:bg-vigil-hover text-black text-sm font-medium rounded-lg transition-colors cursor-pointer" id="mem-ask-btn"
              hx-post="/api/memory/ask"
              hx-target="#mem-ask-result"
              hx-swap="innerHTML"
              hx-include="[name=askq],[name=askrepo]"
              hx-indicator="#mem-ask-spinner">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        Ask
      </button>
    </div>
  </div>
  <div id="mem-ask-spinner" class="htmx-indicator mem-ask-spinner">Investigating...</div>
  <div id="mem-ask-result" class="p-3 bg-surface-dark border-l-3 border-l-vigil rounded-lg mt-3">
    <div class="text-sm text-text-muted py-2">Ask any question about your monitored repositories.</div>
  </div>
</div>`;
}

// ── GET /api/memory/search ──

export function getMemorySearchJSON(ctx: DashboardContext, query: string, repo?: string) {
  if (!query || query.trim().length === 0) return { results: [] };

  try {
    let results = ctx.daemon.vectorStore.search(query, 20);

    if (repo) {
      results = results.filter((r) => r.repo === repo);
    }

    return {
      results: results.map((r) => ({
        id: r.id,
        repo: r.repo,
        type: r.type,
        content: r.content.slice(0, 300),
        confidence: r.confidence,
        timestamp: new Date(r.timestamp).toISOString(),
      })),
    };
  } catch {
    return { results: [] };
  }
}

export function getMemorySearchFragment(ctx: DashboardContext, query: string, repo?: string): string {
  if (!query || query.trim().length === 0) {
    return '<div class="text-sm text-text-muted text-center py-4">Enter a search query to find memories</div>';
  }

  const data = getMemorySearchJSON(ctx, query, repo);

  if (data.results.length === 0) {
    return `<div class="text-sm text-text-muted text-center py-4">No results for "${escapeHtml(query)}"</div>`;
  }

  return data.results
    .map(
      (r) => `
    <div class="bg-surface-light border border-border rounded-lg p-3 cursor-pointer transition-all duration-150 hover:bg-surface hover:shadow-[0_0_8px_rgba(255,129,2,0.05)]">
      <div class="flex items-center gap-2 mb-1">
        <span class="shrink-0 bg-vigil/10 text-vigil text-[0.7rem] px-1.5 py-0.5 rounded font-mono">${r.confidence.toFixed(2)}</span>
        <span class="text-xs text-text-muted">${escapeHtml(r.repo)}</span>
        <span class="inline-block text-[0.65rem] uppercase tracking-wider text-info bg-info/10 px-1.5 py-0.5 rounded">${escapeHtml(r.type)}</span>
        <span class="text-[0.7rem] text-text-muted ml-auto">${r.timestamp.split("T")[0]}</span>
      </div>
      <div class="text-sm text-text-muted leading-relaxed">${escapeHtml(r.content)}</div>
    </div>`,
    )
    .join("");
}

// ── POST /api/memory/ask ──

export async function handleAsk(ctx: DashboardContext, question: string, repo?: string): Promise<string> {
  if (!question || question.trim().length === 0) {
    return '<div class="p-3 bg-error/10 border-l-3 border-l-error rounded-lg text-sm text-error">Please enter a question.</div>';
  }

  // Find the repo path
  const targetRepo = repo || (ctx.daemon.repoPaths[0]?.split("/").pop() ?? "");
  const repoPath = ctx.daemon.repoPaths.find((p) => p.endsWith(`/${targetRepo}`) || p === targetRepo);

  if (!repoPath) {
    return `<div class="p-3 bg-error/10 border-l-3 border-l-error rounded-lg text-sm text-error">Repository "${escapeHtml(targetRepo)}" not found. Select a monitored repo.</div>`;
  }

  const repoName = repoPath.split("/").pop() || repoPath;

  try {
    const topicTier = new TopicTier();
    const indexTier = new IndexTier();

    const askCtx: AskContext = {
      repo: repoName,
      repoPath,
      vectorStore: ctx.daemon.vectorStore,
      topicTier,
      indexTier,
      eventLog: ctx.daemon.eventLog,
    };

    const askEngine = new AskEngine(ctx.daemon.config);
    const gitContext = await getGitContext(repoPath);
    const result = await askEngine.investigate(question, gitContext, askCtx);

    return `
    <div class="text-text">
      <div class="mt-2 text-sm text-text leading-relaxed">${escapeHtml(result.answer)}</div>
      <div class="flex gap-3 mt-2 text-[0.7rem] text-text-muted">
        <span>${result.rounds} round${result.rounds !== 1 ? "s" : ""}</span>
        <span>${result.sources.length} source${result.sources.length !== 1 ? "s" : ""} consulted</span>
      </div>
    </div>`;
  } catch (err) {
    return `<div class="p-3 bg-error/10 border-l-3 border-l-error rounded-lg text-sm text-error">Error: ${escapeHtml(String(err))}</div>`;
  }
}

async function getGitContext(repoPath: string): Promise<string> {
  try {
    const proc = Bun.spawn(["git", "log", "--oneline", "-10"], {
      cwd: repoPath,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    return `Recent commits:\n${stdout.trim()}`;
  } catch {
    return "";
  }
}
