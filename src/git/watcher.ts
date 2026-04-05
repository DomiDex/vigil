import { watch, type FSWatcher } from "fs";
import { basename, resolve } from "path";

export interface RepoState {
  path: string;
  name: string;
  lastCommitHash: string;
  currentBranch: string;
  uncommittedSince: number | null;
}

export interface GitEvent {
  type: "file_change" | "new_commit" | "branch_switch" | "uncommitted_drift";
  repo: string;
  timestamp: number;
  detail: string;
}

export type GitEventHandler = (event: GitEvent) => void;

export class GitWatcher {
  private repos: Map<string, RepoState> = new Map();
  private watchers: FSWatcher[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private handlers: GitEventHandler[] = [];
  private readonly DRIFT_THRESHOLD = 30 * 60 * 1000; // 30 minutes

  onEvent(handler: GitEventHandler): void {
    this.handlers.push(handler);
  }

  private emit(event: GitEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }

  async addRepo(repoPath: string): Promise<void> {
    const absPath = resolve(repoPath);
    const name = basename(absPath);

    const hash = await this.git(absPath, ["rev-parse", "HEAD"]);
    const branch = await this.git(absPath, ["rev-parse", "--abbrev-ref", "HEAD"]);

    const state: RepoState = {
      path: absPath,
      name,
      lastCommitHash: hash.trim(),
      currentBranch: branch.trim(),
      uncommittedSince: null,
    };

    this.repos.set(absPath, state);

    // File system watcher
    try {
      const watcher = watch(absPath, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        if (filename.startsWith(".git") || filename.includes("node_modules")) return;
        this.emit({
          type: "file_change",
          repo: name,
          timestamp: Date.now(),
          detail: `File changed: ${filename}`,
        });
      });
      this.watchers.push(watcher);
    } catch {
      // fs.watch may not work on all platforms
    }
  }

  startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.poll(), 10_000);
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
    for (const [path, state] of this.repos) {
      try {
        // Check for new commits
        const currentHash = (await this.git(path, ["rev-parse", "HEAD"])).trim();
        if (currentHash !== state.lastCommitHash) {
          const logMsg = await this.git(path, ["log", "--oneline", "-1"]);
          state.lastCommitHash = currentHash;
          this.emit({
            type: "new_commit",
            repo: state.name,
            timestamp: Date.now(),
            detail: `New commit: ${logMsg.trim()}`,
          });
        }

        // Check for branch switch
        const currentBranch = (await this.git(path, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
        if (currentBranch !== state.currentBranch) {
          const oldBranch = state.currentBranch;
          state.currentBranch = currentBranch;
          this.emit({
            type: "branch_switch",
            repo: state.name,
            timestamp: Date.now(),
            detail: `Branch switched: ${oldBranch} → ${currentBranch}`,
          });
        }

        // Check uncommitted drift
        const status = (await this.git(path, ["status", "--porcelain"])).trim();
        if (status) {
          if (!state.uncommittedSince) {
            state.uncommittedSince = Date.now();
          } else if (Date.now() - state.uncommittedSince > this.DRIFT_THRESHOLD) {
            this.emit({
              type: "uncommitted_drift",
              repo: state.name,
              timestamp: Date.now(),
              detail: `Uncommitted changes for ${Math.round((Date.now() - state.uncommittedSince) / 60000)}min`,
            });
            // Reset to avoid spamming
            state.uncommittedSince = Date.now();
          }
        } else {
          state.uncommittedSince = null;
        }
      } catch {
        // Git command failed, skip this repo
      }
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

  getRepos(): Map<string, RepoState> {
    return this.repos;
  }

  private async git(cwd: string, args: string[]): Promise<string> {
    const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
    const text = await new Response(proc.stdout).text();
    return text;
  }
}
