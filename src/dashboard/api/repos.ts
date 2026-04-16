import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { gitExec } from "../../git/exec.ts";
import { TopicTier } from "../../memory/topic-tier.ts";
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

// ── API: POST /api/repos ────────────────────────

export async function addRepoJSON(
  ctx: DashboardContext,
  path: string,
): Promise<{ success: boolean; error?: string }> {
  const absPath = resolve(path);

  if (!existsSync(absPath)) {
    return { success: false, error: `Path does not exist: ${absPath}` };
  }

  if (!existsSync(join(absPath, ".git"))) {
    return { success: false, error: `Not a git repository: ${absPath}` };
  }

  // Check if already watching
  if (ctx.daemon.repoPaths.some((p) => resolve(p) === absPath)) {
    return { success: false, error: `Already watching: ${absPath}` };
  }

  try {
    await ctx.daemon.gitWatcher.addRepo(absPath);
    ctx.daemon.repoPaths.push(absPath);
    // Note: repo list is in-memory only (CLI args). Changes are lost on daemon restart.
    // TODO: persist to ~/.vigil/config.json when a `repos` config field is added.
    return { success: true };
  } catch (err) {
    return { success: false, error: `Failed to add repo: ${(err as Error).message}` };
  }
}

// ── API: DELETE /api/repos/:name ────────────────

export function removeRepoJSON(
  ctx: DashboardContext,
  repoName: string,
): { success: boolean; error?: string } {
  const repoPath = ctx.daemon.repoPaths.find((p) => repoNameFromPath(p) === repoName);
  if (!repoPath) {
    return { success: false, error: `Repo not found: ${repoName}` };
  }

  ctx.daemon.gitWatcher.removeRepo(repoName);
  ctx.daemon.repoPaths = ctx.daemon.repoPaths.filter((p) => repoNameFromPath(p) !== repoName);
  return { success: true };
}
