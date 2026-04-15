import { resolve } from "node:path";
import { gitExec } from "../../git/exec.ts";
import { TopicTier } from "../../memory/topic-tier.ts";
import type { VigilMessage } from "../../messaging/schema.ts";
import type { DashboardContext } from "../types.ts";

// ── Types ────────────────────────────────────────

interface RepoListItem {
  name: string;
  path: string;
  state: "active" | "sleeping" | "dreaming";
  branch: string;
  head: string;
  dirty: boolean;
}

interface RepoCommit {
  sha: string;
  message: string;
  date: string;
}

interface DecisionDistribution {
  SILENT: number;
  OBSERVE: number;
  NOTIFY: number;
  ACT: number;
  total: number;
}

interface TopicInfo {
  name: string;
  observationCount: number;
  trend: "rising" | "stable" | "cooling";
}

interface RepoDetail {
  name: string;
  path: string;
  state: "active" | "sleeping" | "dreaming";
  branch: string;
  head: string;
  headMessage: string;
  dirty: boolean;
  dirtyFileCount: number;
  uncommittedSummary: string;
  recentCommits: RepoCommit[];
  decisions: DecisionDistribution;
  patterns: string[];
  topics: TopicInfo[];
}

// ── Helpers ──────────────────────────────────────

function getDaemonState(ctx: DashboardContext): "active" | "sleeping" | "dreaming" {
  const tick = ctx.daemon.tickEngine as any;
  if (tick.paused) return "dreaming";
  if (tick.isSleeping) return "sleeping";
  return "active";
}

function repoNameFromPath(p: string): string {
  return p.split("/").pop() || p;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function getRecentCommits(repoPath: string, count = 5): Promise<RepoCommit[]> {
  try {
    const result = await gitExec(repoPath, ["log", `--format=%H|%s|%aI`, `-${count}`]);
    if (result.exitCode !== 0) return [];
    return result.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, message, date] = line.split("|");
        return { sha: sha.slice(0, 7), message, date };
      });
  } catch {
    return [];
  }
}

async function getDirtyFileCount(repoPath: string): Promise<{ count: number; summary: string }> {
  try {
    const result = await gitExec(repoPath, ["status", "--short"]);
    if (result.exitCode !== 0) return { count: 0, summary: "(clean)" };
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return { count: 0, summary: "(clean)" };

    const modified = lines.filter((l) => l.startsWith(" M") || l.startsWith("M ")).length;
    const untracked = lines.filter((l) => l.startsWith("??")).length;
    const added = lines.filter((l) => l.startsWith("A ") || l.startsWith("AM")).length;
    const deleted = lines.filter((l) => l.startsWith(" D") || l.startsWith("D ")).length;

    const parts: string[] = [];
    if (modified > 0) parts.push(`${modified} modified`);
    if (untracked > 0) parts.push(`${untracked} untracked`);
    if (added > 0) parts.push(`${added} added`);
    if (deleted > 0) parts.push(`${deleted} deleted`);

    return { count: lines.length, summary: parts.join(", ") || `${lines.length} files changed` };
  } catch {
    return { count: 0, summary: "(unknown)" };
  }
}

function getDecisionDistribution(ctx: DashboardContext, repoName: string): DecisionDistribution {
  const messages = ctx.daemon.messageRouter.getHistory({ limit: 1000 });
  const repoMessages = messages.filter((m) => m.source.repo === repoName);

  const dist: DecisionDistribution = { SILENT: 0, OBSERVE: 0, NOTIFY: 0, ACT: 0, total: 0 };

  for (const msg of repoMessages) {
    const decision = (msg.metadata?.decision as string)?.toUpperCase();
    if (decision === "OBSERVE") dist.OBSERVE++;
    else if (decision === "NOTIFY") dist.NOTIFY++;
    else if (decision === "ACT") dist.ACT++;
  }

  const summary = ctx.daemon.metrics.getSummary();
  const totalSilent = summary["decisions.silent"]?.count ?? 0;
  const totalObserve = summary["decisions.observe"]?.count ?? 0;
  const totalNotify = summary["decisions.notify"]?.count ?? 0;
  const totalAct = summary["decisions.act"]?.count ?? 0;

  const repoCount = ctx.daemon.repoPaths.length;
  if (repoCount <= 1) {
    dist.SILENT = totalSilent;
  } else {
    const repoShare = dist.OBSERVE + dist.NOTIFY + dist.ACT;
    const globalNonSilent = totalObserve + totalNotify + totalAct;
    const ratio = globalNonSilent > 0 ? repoShare / globalNonSilent : 1 / repoCount;
    dist.SILENT = Math.round(totalSilent * ratio);
  }

  dist.total = dist.SILENT + dist.OBSERVE + dist.NOTIFY + dist.ACT;
  return dist;
}

function getTopics(repoName: string): TopicInfo[] {
  const topicTier = new TopicTier();
  const names = topicTier.listTopics(repoName);

  return names.map((name) => {
    const topic = topicTier.getTopic(repoName, name);
    if (!topic) return { name, observationCount: 0, trend: "stable" as const };

    const age = Date.now() - topic.lastUpdated;
    const ONE_HOUR = 3600_000;
    const ONE_DAY = 86400_000;
    let trend: "rising" | "stable" | "cooling" = "stable";
    if (age < ONE_HOUR) trend = "rising";
    else if (age > ONE_DAY) trend = "cooling";

    return { name, observationCount: topic.observations.length, trend };
  });
}

// ── Recent Activity ─────────────────────────────

interface RecentMessage {
  decision: string;
  message: string;
  timestamp: string;
  confidence: number;
}

function getRecentMessages(ctx: DashboardContext, repoName: string, limit = 10): RecentMessage[] {
  // Current session messages
  const messages: VigilMessage[] = ctx.daemon.messageRouter.getHistory({ limit: 200 });
  const repoMsgs = messages
    .filter((m) => m.source.repo === repoName)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);

  return repoMsgs.map((m) => ({
    decision: ((m.metadata?.decision as string) || "SILENT").toUpperCase(),
    message: m.message,
    timestamp: m.timestamp,
    confidence: (m.metadata?.confidence as number) ?? 0,
  }));
}

function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m} ${ampm}`;
}

const DECISION_BADGE: Record<string, string> = {
  SILENT: "bg-surface-light text-text-muted",
  OBSERVE: "bg-info/15 text-info",
  NOTIFY: "bg-warning/15 text-warning",
  ACT: "bg-vigil/15 text-vigil",
};

const DECISION_BORDER: Record<string, string> = {
  SILENT: "border-l-border",
  OBSERVE: "border-l-info",
  NOTIFY: "border-l-warning",
  ACT: "border-l-vigil",
};

const DECISION_ICON: Record<string, string> = {
  SILENT: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 14V2"/><path d="M9 18.12L5.36 14.47A2 2 0 014 13.06V4a2 2 0 012-2h2"/><path d="M12 18.12L15.64 14.47A2 2 0 0117 13.06"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  OBSERVE: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/></svg>`,
  NOTIFY: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>`,
  ACT: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
};

// ── Icons ────────────────────────────────────────

const ICON = {
  branch: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/></svg>`,
  commit: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><line x1="1.05" y1="12" x2="7" y2="12"/><line x1="17.01" y1="12" x2="22.96" y2="12"/></svg>`,
  dirty: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  clean: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  trendUp: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 11 12 6 7 11"/><line x1="12" y1="18" x2="12" y2="6"/></svg>`,
  trendDown: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 13 12 18 17 13"/><line x1="12" y1="6" x2="12" y2="18"/></svg>`,
  trendFlat: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  folder: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>`,
};

// ── API: GET /api/repos ──────────────────────────

export function getReposJSON(ctx: DashboardContext): RepoListItem[] {
  const state = getDaemonState(ctx);
  const watcher = ctx.daemon.gitWatcher as any;

  return ctx.daemon.repoPaths.map((p) => {
    const name = repoNameFromPath(p);
    const repoState = watcher.getRepoState(resolve(p));
    return {
      name,
      path: p,
      state,
      branch: repoState?.currentBranch ?? "unknown",
      head: repoState?.lastCommitHash?.slice(0, 7) ?? "unknown",
      dirty: repoState?.uncommittedSince != null,
    };
  });
}

// ── API: GET /api/repos/fragment (nav list) ──────

export function getRepoNavFragment(ctx: DashboardContext): string {
  const repos = getReposJSON(ctx);
  if (repos.length === 0) {
    return `<div class="px-3 py-4 text-text-muted text-sm">No repos being watched</div>`;
  }

  return repos
    .map(
      (r, i) =>
        `<button class="group flex items-center gap-2.5 w-full px-3 py-2.5 text-left rounded-lg transition-all duration-150
                        ${i === 0 ? "bg-vigil/10 border-l-2 border-vigil" : "border-l-2 border-transparent hover:bg-surface-light hover:border-vigil/40"}"
                hx-get="/api/repos/${encodeURIComponent(r.name)}/fragment"
                hx-target="#repo-detail"
                hx-swap="innerHTML"
                ${i === 0 ? 'hx-trigger="load, click"' : ""}
                data-repo="${escapeHtml(r.name)}"
                onclick="document.querySelectorAll('[data-repo]').forEach(b=>{b.className=b.className.replace(/bg-vigil\\/10/,'').replace(/border-vigil(?!\\/)/g,'border-transparent')});this.classList.add('bg-vigil/10');this.classList.replace('border-transparent','border-vigil')">
          <svg width="8" height="8" viewBox="0 0 8 8">
            <circle cx="4" cy="4" r="4" fill="${r.dirty ? "#eab308" : "#39E795"}"/>
          </svg>
          <div class="flex flex-col min-w-0">
            <span class="text-sm font-medium text-text truncate">${escapeHtml(r.name)}</span>
            <span class="text-xs text-text-muted font-mono truncate">${escapeHtml(r.branch)}</span>
          </div>
        </button>`,
    )
    .join("");
}

// ── API: GET /api/repos/:name ────────────────────

export async function getRepoDetailJSON(ctx: DashboardContext, repoName: string): Promise<RepoDetail | null> {
  const repoPath = ctx.daemon.repoPaths.find((p) => repoNameFromPath(p) === repoName);
  if (!repoPath) return null;

  const watcher = ctx.daemon.gitWatcher as any;
  const repoState = watcher.getRepoState(resolve(repoPath));
  const state = getDaemonState(ctx);

  const [commits, dirtyInfo] = await Promise.all([getRecentCommits(repoPath, 5), getDirtyFileCount(repoPath)]);

  const isDirty = repoState?.uncommittedSince != null || dirtyInfo.count > 0;

  const decisions = getDecisionDistribution(ctx, repoName);
  const profile = ctx.daemon.vectorStore.getRepoProfile(repoName);
  const topics = getTopics(repoName);

  return {
    name: repoName,
    path: repoPath,
    state,
    branch: repoState?.currentBranch ?? "unknown",
    head: repoState?.lastCommitHash?.slice(0, 7) ?? "unknown",
    headMessage: commits[0]?.message ?? "unknown",
    dirty: isDirty,
    dirtyFileCount: dirtyInfo.count,
    uncommittedSummary: isDirty && dirtyInfo.count === 0 ? "uncommitted changes" : dirtyInfo.summary,
    recentCommits: commits,
    decisions,
    patterns: profile?.patterns ?? [],
    topics,
  };
}

// ── Decision bar helper ──────────────────────────

function decisionBar(label: string, count: number, total: number, colorClass: string): string {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const barWidth = total > 0 ? (count / total) * 100 : 0;
  return `<div class="flex items-center gap-2 text-xs">
    <span class="w-16 text-text-muted">${label}</span>
    <div class="flex-1 h-1.5 bg-surface-dark rounded-full overflow-hidden">
      <div class="${colorClass} h-full rounded-full transition-all duration-300" style="width:${barWidth}%"></div>
    </div>
    <span class="w-8 text-right font-mono text-text-muted">${pct}%</span>
  </div>`;
}

function trendIcon(trend: string): string {
  switch (trend) {
    case "rising":
      return `<span class="text-success">${ICON.trendUp}</span>`;
    case "cooling":
      return `<span class="text-text-muted">${ICON.trendDown}</span>`;
    default:
      return `<span class="text-text-muted">${ICON.trendFlat}</span>`;
  }
}

// ── API: GET /api/repos/:name/fragment ───────────

export async function getRepoFragment(ctx: DashboardContext, repoName: string): Promise<string | null> {
  const detail = await getRepoDetailJSON(ctx, repoName);
  if (!detail) return null;

  // Recent commits
  const commitsHtml = detail.recentCommits
    .map(
      (c) =>
        `<div class="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
          <span class="text-text-muted">${ICON.commit}</span>
          <span class="font-mono text-xs text-vigil/80">${c.sha}</span>
          <span class="text-xs text-text truncate">${escapeHtml(c.message)}</span>
        </div>`,
    )
    .join("");

  // Decision bars
  const barsHtml = [
    decisionBar("SILENT", detail.decisions.SILENT, detail.decisions.total, "bg-surface-light"),
    decisionBar("OBSERVE", detail.decisions.OBSERVE, detail.decisions.total, "bg-info"),
    decisionBar("NOTIFY", detail.decisions.NOTIFY, detail.decisions.total, "bg-warning"),
    decisionBar("ACT", detail.decisions.ACT, detail.decisions.total, "bg-vigil"),
  ].join("");

  // Patterns
  const patternsHtml =
    detail.patterns.length > 0
      ? detail.patterns
          .map(
            (p) =>
              `<li class="flex items-start gap-2 text-xs text-text py-1">
                <span class="text-vigil mt-0.5">
                  <svg width="6" height="6" viewBox="0 0 6 6"><circle cx="3" cy="3" r="3" fill="currentColor"/></svg>
                </span>
                ${escapeHtml(p)}
              </li>`,
          )
          .join("")
      : `<li class="text-xs text-text-muted py-1">No patterns detected yet</li>`;

  // Topics
  const topicsHtml =
    detail.topics.length > 0
      ? detail.topics
          .map(
            (t) =>
              `<div class="flex items-center gap-2 py-1.5 text-xs">
                <span class="text-text flex-1 truncate">${escapeHtml(t.name)}</span>
                <span class="font-mono text-text-muted">${t.observationCount}</span>
                ${trendIcon(t.trend)}
              </div>`,
          )
          .join("")
      : `<div class="text-xs text-text-muted py-1">No topics yet</div>`;

  // Recent activity messages
  const recentMessages = getRecentMessages(ctx, repoName, 8);
  const activityHtml = recentMessages.length > 0
    ? recentMessages.map((m) => {
        const badge = DECISION_BADGE[m.decision] || DECISION_BADGE.SILENT;
        const borderColor = DECISION_BORDER[m.decision] || DECISION_BORDER.SILENT;
        const icon = DECISION_ICON[m.decision] || DECISION_ICON.SILENT;
        return `<div class="bg-surface rounded-lg border border-border border-l-2 ${borderColor} p-3 mb-2 hover:shadow-[0_0_12px_rgba(255,129,2,0.06)] transition-shadow">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs text-text-muted font-mono">${formatTimeShort(m.timestamp)}</span>
            <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${badge}">${icon} ${m.decision}</span>
            ${m.confidence > 0 ? `<span class="text-[0.65rem] text-text-muted ml-auto">${m.confidence.toFixed(2)}</span>` : ""}
          </div>
          <div class="text-xs text-text leading-relaxed">${escapeHtml(m.message)}</div>
        </div>`;
      }).join("")
    : `<div class="text-xs text-text-muted text-center py-4">No activity this session. Waiting for tick signals...</div>`;

  // Status section
  const statusIcon = detail.dirty ? ICON.dirty : ICON.clean;
  const statusColor = detail.dirty ? "text-warning" : "text-success";
  const statusText = detail.dirty ? `${detail.dirtyFileCount} files changed` : "Clean";

  return `<div class="space-y-5" hx-get="/api/repos/${encodeURIComponent(repoName)}/fragment"
               hx-trigger="every 30s" hx-swap="outerHTML">

  <!-- Header -->
  <div class="flex items-center justify-between">
    <h3 class="text-lg font-semibold text-text">${escapeHtml(detail.name)}</h3>
    <span class="${statusColor} flex items-center gap-1.5 text-xs font-medium">
      ${statusIcon} ${statusText}
    </span>
  </div>

  <!-- Recent Activity -->
  <div>
    <h4 class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Recent Activity</h4>
    <div class="max-h-[300px] overflow-y-auto">${activityHtml}</div>
  </div>

  <!-- Git Info -->
  <div class="bg-surface rounded-lg border border-border p-4 space-y-3">
    <div class="flex items-center gap-2">
      <span class="text-text-muted">${ICON.branch}</span>
      <span class="font-mono text-sm text-vigil">${escapeHtml(detail.branch)}</span>
    </div>
    <div class="flex items-center gap-2 text-xs">
      <span class="text-text-muted">HEAD</span>
      <span class="font-mono text-vigil/80">${detail.head}</span>
      <span class="text-text-muted truncate">${escapeHtml(detail.headMessage)}</span>
    </div>
  </div>

  ${
    detail.dirty
      ? `<!-- Uncommitted Work -->
  <div class="bg-warning/5 border border-warning/20 rounded-lg p-3">
    <div class="flex items-center gap-2 text-xs font-medium text-warning mb-1">
      ${ICON.dirty} Uncommitted Work
    </div>
    <div class="text-xs text-text-muted">${escapeHtml(detail.uncommittedSummary)}</div>
  </div>`
      : ""
  }

  <!-- Recent Commits -->
  <div>
    <h4 class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Recent Commits</h4>
    <div class="bg-surface rounded-lg border border-border p-3">
      ${commitsHtml || '<div class="text-xs text-text-muted">No commits</div>'}
    </div>
  </div>

  <!-- Decisions -->
  <div>
    <h4 class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Decisions</h4>
    <div class="bg-surface rounded-lg border border-border p-3 space-y-2">
      ${barsHtml}
      <div class="text-xs text-text-muted text-right pt-1">${detail.decisions.total} total</div>
    </div>
  </div>

  <!-- Patterns -->
  <div>
    <h4 class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Patterns</h4>
    <ul class="bg-surface rounded-lg border border-border p-3 space-y-0.5">${patternsHtml}</ul>
  </div>

  <!-- Topics -->
  <div>
    <h4 class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Topics</h4>
    <div class="bg-surface rounded-lg border border-border p-3">${topicsHtml}</div>
  </div>
</div>`;
}
