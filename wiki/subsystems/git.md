---
title: Git Subsystem
type: subsystem
updated: 2026-04-19
sources:
  - src/git/watcher.ts
  - src/git/exec.ts
---

# Git Subsystem

`src/git/` is the signal source. Everything the daemon reacts to starts as a git event emitted here.

## watcher.ts — `GitWatcher` class

`src/git/watcher.ts:1-400+` combines `fs.watch` with polling to catch events that either mechanism alone would miss.

### Event types

From `src/git/watcher.ts:7`:

| Type | Emitted when |
|---|---|
| `file_change` | fs.watch sees a write outside `.git` / `node_modules` / `dist` etc. |
| `new_commit` | Polling detects a change in `git rev-parse HEAD` |
| `branch_switch` | Polling detects change in `git rev-parse --abbrev-ref HEAD` |
| `uncommitted_drift` | `git diff --stat` shows changes untouched for >30 min |
| `rebase_detected` | Reflog HEAD no longer matches cached HEAD chain |

### Event shape

```ts
interface GitEvent {
  type: GitEventType;
  repo: string;
  timestamp: number;
  detail: string;
  branch?: string;
}
```

### Repo state

`RepoState` (`src/git/watcher.ts:9`) is the watcher's per-repo memory:

- `path`, `name`.
- `lastCommitHash`, `currentBranch`.
- `uncommittedSince` — first seen time of the current uncommitted set.
- `lastReflogHash`, `knownCommitSHAs` — used for rebase detection.

### Deduplication

`EventDeduplicator` (`src/git/watcher.ts:30`) collapses duplicates within a 5-second window. Key is `"{type}:{repo}:{detail}"`. Periodic cleanup triggers at 1000 cached entries.

### Filesystem watching

`startPolling(intervalSec)` (`src/git/watcher.ts:152`) sets up:

- Recursive `fs.watch` on the repo root, ignoring `.git`, `node_modules`, `.claude`, `.next`, `dist`, `.turbo`.
- A separate watcher on `.git/HEAD` for ref changes.
- Error handlers suppress broken-symlink ENOENT exceptions.

The polling interval (default 10s) is the safety net — it catches anything `fs.watch` missed (WSL and network mounts are unreliable).

### Rebase detection

`detectRebase()` compares current reflog HEAD against the cached chain. A mismatch means the history was rewritten. When detected:

1. Emit `rebase_detected` (weight 0.9 — critical).
2. Clear the known-commits cache.
3. Signal the [prompt cache](../concepts/prompt-cache.md) via `onRebaseDetected()` (all scopes clear).

### API

| Method | Use |
|---|---|
| `onEvent(handler)` | Subscribe to emitted events |
| `startPolling(intervalSec)` | Start watching |
| `stopPolling()` | Close all watchers |
| `getRepoState(repoName)` | Snapshot for decision context |

## exec.ts

`gitExec(cmd, cwd)` — thin `Bun.spawnSync` wrapper around the `git` CLI. Used by the watcher and anywhere else that needs a synchronous read of git state. Throws on non-zero exit with stdout/stderr attached to the error.

## Consumers

- `Daemon.start` wires `gitWatcher.onEvent(ev => tickEngine.onGitEvent(ev))`.
- `EventLog.write` persists `GitEvent` as a `MemoryEntry` with `type: "git_event"`.
- [WorkDetector](../concepts/proactive-mode.md) weighs events for proactive mode.
- [Specialist router](specialists.md) matches event types to agents.

## See also

- [Tick Cycle](../concepts/tick-cycle.md)
- [Proactive Mode](../concepts/proactive-mode.md)
- [Prompt Cache](../concepts/prompt-cache.md) — `rebase_detected` cascade.
