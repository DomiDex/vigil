import { resolve } from "node:path";
import { gitExec } from "../../git/exec.ts";
import { TopicTier } from "../../memory/topic-tier.ts";
import type { DashboardContext } from "../server.ts";

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

  // SILENT decisions aren't routed as messages — estimate from metrics
  const summary = ctx.daemon.metrics.getSummary();
  const totalSilent = summary["decisions.silent"]?.count ?? 0;
  const totalObserve = summary["decisions.observe"]?.count ?? 0;
  const totalNotify = summary["decisions.notify"]?.count ?? 0;
  const totalAct = summary["decisions.act"]?.count ?? 0;

  // For single-repo setups, use global SILENT count. For multi-repo, estimate proportionally.
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

    // Determine trend from recency — rising if updated in last hour, cooling if >24h
    const age = Date.now() - topic.lastUpdated;
    const ONE_HOUR = 3600_000;
    const ONE_DAY = 86400_000;
    let trend: "rising" | "stable" | "cooling" = "stable";
    if (age < ONE_HOUR) trend = "rising";
    else if (age > ONE_DAY) trend = "cooling";

    return { name, observationCount: topic.observations.length, trend };
  });
}

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
    return `<div class="muted">No repos being watched</div>`;
  }

  return repos
    .map(
      (r, i) =>
        `<button class="repo-nav-btn${i === 0 ? " active" : ""}"
                hx-get="/api/repos/${encodeURIComponent(r.name)}/fragment"
                hx-target="#repo-detail"
                hx-swap="innerHTML"
                ${i === 0 ? 'hx-trigger="load, click"' : ""}
                data-repo="${escapeHtml(r.name)}">
          <svg width="8" height="8" viewBox="0 0 8 8">
            <circle cx="4" cy="4" r="4" fill="${r.dirty ? "var(--vigil-warning)" : "var(--vigil-success)"}"/>
          </svg>
          <span class="repo-nav-name">${escapeHtml(r.name)}</span>
          <span class="repo-nav-branch">${escapeHtml(r.branch)}</span>
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

  // Use RepoState.uncommittedSince as the authoritative dirty signal
  // (git status may fail on non-existent paths in tests)
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

// ── API: GET /api/repos/:name/fragment ───────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function decisionBar(label: string, count: number, total: number, cssClass: string): string {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const barWidth = total > 0 ? (count / total) * 100 : 0;
  return `<div class="rs-bar-row">
    <span class="rs-bar-label">${label}</span>
    <div class="rs-bar-track">
      <div class="rs-bar-fill ${cssClass}" style="width:${barWidth}%"></div>
    </div>
    <span class="rs-bar-pct">${pct}%</span>
  </div>`;
}

function trendIcon(trend: string): string {
  switch (trend) {
    case "rising":
      return `<svg class="rs-trend rs-trend-rising" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 11 12 6 7 11"/><line x1="12" y1="18" x2="12" y2="6"/></svg>`;
    case "cooling":
      return `<svg class="rs-trend rs-trend-cooling" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 13 12 18 17 13"/><line x1="12" y1="6" x2="12" y2="18"/></svg>`;
    default:
      return `<svg class="rs-trend rs-trend-stable" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  }
}

function statusDot(dirty: boolean): string {
  const color = dirty ? "var(--vigil-warning)" : "var(--vigil-success)";
  return `<svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="${color}"/></svg>`;
}

export async function getRepoFragment(ctx: DashboardContext, repoName: string): Promise<string | null> {
  const detail = await getRepoDetailJSON(ctx, repoName);
  if (!detail) return null;

  const commitsHtml = detail.recentCommits
    .map(
      (c) =>
        `<div class="rs-commit">
          <span class="rs-sha">${c.sha}</span>
          <span class="rs-commit-msg">${escapeHtml(c.message)}</span>
        </div>`,
    )
    .join("");

  const barsHtml = [
    decisionBar("SILENT", detail.decisions.SILENT, detail.decisions.total, "rs-fill-silent"),
    decisionBar("OBSERVE", detail.decisions.OBSERVE, detail.decisions.total, "rs-fill-observe"),
    decisionBar("NOTIFY", detail.decisions.NOTIFY, detail.decisions.total, "rs-fill-notify"),
    decisionBar("ACT", detail.decisions.ACT, detail.decisions.total, "rs-fill-act"),
  ].join("");

  const patternsHtml =
    detail.patterns.length > 0
      ? detail.patterns.map((p) => `<li>${escapeHtml(p)}</li>`).join("")
      : `<li class="muted">No patterns detected yet</li>`;

  const topicsHtml =
    detail.topics.length > 0
      ? detail.topics
          .map(
            (t) =>
              `<div class="rs-topic">
                <span class="rs-topic-name">${escapeHtml(t.name)}</span>
                <span class="rs-topic-count">${t.observationCount}</span>
                ${trendIcon(t.trend)}
              </div>`,
          )
          .join("")
      : `<div class="muted">No topics yet</div>`;

  return `<div class="rs-panel" hx-get="/api/repos/${encodeURIComponent(repoName)}/fragment"
               hx-trigger="every 30s" hx-swap="outerHTML">
  <h3 class="rs-title">${escapeHtml(detail.name)}</h3>

  <div class="rs-section rs-git-info">
    <div class="rs-row">
      <span class="rs-label">Branch</span>
      <span>${escapeHtml(detail.branch)}</span>
    </div>
    <div class="rs-row">
      <span class="rs-label">HEAD</span>
      <span class="rs-sha">${detail.head}</span>
      <span class="rs-head-msg">${escapeHtml(detail.headMessage)}</span>
    </div>
    <div class="rs-row">
      <span class="rs-label">Status</span>
      <span>${statusDot(detail.dirty)} ${detail.dirty ? `${detail.dirtyFileCount} files changed` : "Clean"}</span>
    </div>
  </div>

  ${
    detail.dirty
      ? `<div class="rs-section rs-uncommitted">
    <h4 class="rs-section-title">Uncommitted Work</h4>
    <div class="rs-uncommitted-summary">${escapeHtml(detail.uncommittedSummary)}</div>
  </div>`
      : ""
  }

  <div class="rs-section">
    <h4 class="rs-section-title">Recent Commits</h4>
    <div class="rs-commits">${commitsHtml || '<div class="muted">No commits</div>'}</div>
  </div>

  <div class="rs-section">
    <h4 class="rs-section-title">Decisions</h4>
    <div class="rs-bars">${barsHtml}</div>
    <div class="rs-total muted">${detail.decisions.total} total decisions</div>
  </div>

  <div class="rs-section">
    <h4 class="rs-section-title">Patterns</h4>
    <ul class="rs-patterns">${patternsHtml}</ul>
  </div>

  <div class="rs-section">
    <h4 class="rs-section-title">Topics</h4>
    <div class="rs-topics">${topicsHtml}</div>
  </div>
</div>`;
}
