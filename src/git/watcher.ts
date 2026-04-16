import { type FSWatcher, watch } from "node:fs";
import { basename, join, resolve } from "node:path";
import { gitExec } from "./exec.ts";

// ── Types ──

export type GitEventType = "file_change" | "new_commit" | "branch_switch" | "uncommitted_drift" | "rebase_detected";

export interface RepoState {
  path: string;
  name: string;
  lastCommitHash: string;
  currentBranch: string;
  uncommittedSince: number | null;
  lastReflogHash: string;
  knownCommitSHAs: Set<string>;
}

export interface GitEvent {
  type: GitEventType;
  repo: string;
  timestamp: number;
  detail: string;
}

export type GitEventHandler = (event: GitEvent) => void;

// ── Event Deduplication ──

export class EventDeduplicator {
  private seen = new Map<string, number>();
  private readonly windowMs: number;

  constructor(windowMs = 5_000) {
    this.windowMs = windowMs;
  }

  /**
   * Returns true if this event is a duplicate (should be dropped).
   * Same type + repo + detail within the dedup window = duplicate.
   */
  isDuplicate(event: { type: string; repo: string; detail: string }): boolean {
    const key = `${event.type}:${event.repo}:${event.detail}`;
    const now = Date.now();
    const lastSeen = this.seen.get(key);

    if (lastSeen && now - lastSeen < this.windowMs) {
      return true;
    }

    this.seen.set(key, now);

    // Periodic cleanup to avoid unbounded growth
    if (this.seen.size > 1000) {
      for (const [k, t] of this.seen) {
        if (now - t > this.windowMs * 2) this.seen.delete(k);
      }
    }

    return false;
  }
}

// ── GitWatcher ──

export class GitWatcher {
  private repos: Map<string, RepoState> = new Map();
  private watchers: FSWatcher[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private handlers: GitEventHandler[] = [];
  private dedup = new EventDeduplicator(5_000);
  private readonly DRIFT_THRESHOLD = 30 * 60 * 1000; // 30 minutes

  onEvent(handler: GitEventHandler): void {
    this.handlers.push(handler);
  }

  private emit(event: GitEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }

  private emitDeduped(event: GitEvent): void {
    if (!this.dedup.isDuplicate(event)) {
      this.emit(event);
    }
  }

  async addRepo(repoPath: string): Promise<void> {
    const absPath = resolve(repoPath);
    const name = basename(absPath);

    const hash = await this.git(absPath, ["rev-parse", "HEAD"]);
    const branch = await this.git(absPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const reflogHash = await this.git(absPath, ["reflog", "show", "--format=%H", "-1"]).catch(() => "");

    const state: RepoState = {
      path: absPath,
      name,
      lastCommitHash: hash.trim(),
      currentBranch: branch.trim(),
      uncommittedSince: null,
      lastReflogHash: reflogHash.trim(),
      knownCommitSHAs: new Set([hash.trim()]),
    };

    this.repos.set(absPath, state);

    // File system watcher for working tree changes
    // Note: recursive fs.watch can crash on broken symlinks (e.g. .claude/worktrees,
    // node_modules/.pnpm). We attach an error handler to prevent process exit.
    try {
      const watcher = watch(absPath, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const IGNORE = [".git", "node_modules", ".claude", ".next", "dist", ".turbo"];
        if (IGNORE.some((dir) => filename.startsWith(dir) || filename.includes(`/${dir}`))) return;
        this.emitDeduped({
          type: "file_change",
          repo: name,
          timestamp: Date.now(),
          detail: `File changed: ${filename}`,
        });
      });
      watcher.on("error", () => {
        // Swallow fs.watch errors (broken symlinks, permission issues)
      });
      this.watchers.push(watcher);
    } catch {
      // fs.watch may not work on all platforms
    }

    // Watch .git/HEAD for immediate ref changes (branch switch, rebase)
    try {
      const gitHeadPath = join(absPath, ".git", "HEAD");
      const headWatcher = watch(gitHeadPath, () => {
        const s = this.repos.get(absPath);
        if (s) {
          s.lastCommitHash = ""; // Force re-read on next poll
        }
      });
      this.watchers.push(headWatcher);
    } catch {
      // .git/HEAD watch may fail on some setups
    }
  }

  startPolling(intervalSec?: number): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.poll(), (intervalSec ?? 10) * 1000);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    for (const w of this.watchers) w.close();
    this.watchers = [];
  }

  private async poll(): Promise<void> {
    for (const [repoPath, state] of this.repos) {
      try {
        // Check for rebase/reset before comparing commits
        const rebased = await this.detectRebase(state);
        if (rebased) {
          state.lastCommitHash = "";
          state.uncommittedSince = null;
          state.knownCommitSHAs.clear();

          this.emitDeduped({
            type: "rebase_detected",
            repo: state.name,
            timestamp: Date.now(),
            detail: "Cache invalidated after rebase/reset",
          });
        }

        // Check for new commits
        const currentHash = (await this.git(repoPath, ["rev-parse", "HEAD"])).trim();
        if (currentHash && currentHash !== state.lastCommitHash) {
          const logMsg = await this.git(repoPath, ["log", "--oneline", "-1"]);
          state.lastCommitHash = currentHash;
          state.knownCommitSHAs.add(currentHash);
          this.emitDeduped({
            type: "new_commit",
            repo: state.name,
            timestamp: Date.now(),
            detail: `New commit: ${logMsg.trim()}`,
          });
        }

        // Check for branch switch
        const currentBranch = (await this.git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
        if (currentBranch !== state.currentBranch) {
          const oldBranch = state.currentBranch;
          state.currentBranch = currentBranch;
          this.emitDeduped({
            type: "branch_switch",
            repo: state.name,
            timestamp: Date.now(),
            detail: `Branch switched: ${oldBranch} → ${currentBranch}`,
          });
        }

        // Check uncommitted drift
        const status = (await this.git(repoPath, ["status", "--porcelain"])).trim();
        if (status) {
          if (!state.uncommittedSince) {
            state.uncommittedSince = Date.now();
          } else if (Date.now() - state.uncommittedSince > this.DRIFT_THRESHOLD) {
            this.emitDeduped({
              type: "uncommitted_drift",
              repo: state.name,
              timestamp: Date.now(),
              detail: `Uncommitted changes for ${Math.round((Date.now() - state.uncommittedSince) / 60000)}min`,
            });
            state.uncommittedSince = Date.now();
          }
        } else {
          state.uncommittedSince = null;
        }
      } catch {
        // Git command failed — gitExec already retried; skip this repo this cycle
      }
    }
  }

  /**
   * Detect rebase/reset/amend by checking if reflog tip changed
   * and validating that the cached SHA still exists.
   */
  private async detectRebase(repo: RepoState): Promise<boolean> {
    try {
      const reflogResult = await this.git(repo.path, ["reflog", "show", "--format=%H", "-1"]);
      const currentReflogHash = reflogResult.trim();

      if (repo.lastReflogHash && currentReflogHash !== repo.lastReflogHash) {
        // Reflog changed — validate that cached SHA still exists on branch
        if (repo.lastCommitHash) {
          const validateResult = await this.git(repo.path, ["cat-file", "-t", repo.lastCommitHash]).catch(() => null);

          if (!validateResult || validateResult.trim() !== "commit") {
            repo.lastReflogHash = currentReflogHash;
            return true; // SHA is orphaned
          }
        }
      }

      repo.lastReflogHash = currentReflogHash;
      return false;
    } catch {
      return false;
    }
  }

  async buildContext(repoPath: string): Promise<string> {
    const absPath = resolve(repoPath);
    const state = this.repos.get(absPath);
    if (!state) return `Unknown repo: ${repoPath}`;

    const [status, log, diffStat] = await Promise.all([
      this.git(absPath, ["status", "--short"]),
      this.git(absPath, ["log", "--oneline", "-10"]),
      this.git(absPath, ["diff", "--stat"]),
    ]);

    return [
      `## Repo: ${state.name}`,
      `Branch: ${state.currentBranch}`,
      `Commit: ${state.lastCommitHash.slice(0, 8)}`,
      "",
      "### Git Status",
      status.trim() || "(clean)",
      "",
      "### Recent Commits",
      log.trim(),
      "",
      "### Diff Stats",
      diffStat.trim() || "(no changes)",
    ].join("\n");
  }

  removeRepo(repoName: string): void {
    for (const [path, state] of this.repos) {
      if (state.name === repoName) {
        this.repos.delete(path);
        // Note: FSWatcher instances don't expose their watched path,
        // so we can't selectively close them here. Events from the old
        // watcher are harmlessly ignored since the repo is no longer in the map.
        return;
      }
    }
  }

  getRepos(): Map<string, RepoState> {
    return this.repos;
  }

  getRepoState(repoPath: string): RepoState | undefined {
    return this.repos.get(resolve(repoPath));
  }

  private async git(cwd: string, args: string[]): Promise<string> {
    const result = await gitExec(cwd, args);
    if (result.exitCode !== 0) {
      throw new Error(`git ${args[0]} failed: ${result.stderr}`);
    }
    return result.stdout;
  }
}
