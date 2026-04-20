---
title: Core Subsystem
type: subsystem
updated: 2026-04-19
sources:
  - src/core/daemon.ts
  - src/core/tick-engine.ts
  - src/core/adaptive-sleep.ts
  - src/core/work-detector.ts
  - src/core/scheduler.ts
  - src/core/task-manager.ts
  - src/core/feature-gates.ts
  - src/core/metrics.ts
  - src/core/session.ts
  - src/core/config.ts
  - src/core/instance-lock.ts
  - src/core/output.ts
  - src/core/user-reply.ts
  - src/core/rule-engine.ts
  - src/core/sleep-controller.ts
  - src/core/circuit-breaker.ts
  - src/core/coordinator.ts
---

# Core

`src/core/` is the heart of the daemon. It orchestrates everything else.

## Daemon

`src/core/daemon.ts` (`Daemon` class, ~1100 lines) owns the process lifecycle.

- **Dependency injection** (`:142`) — every collaborator is injectable for testability.
- **Feature-gated imports** (`:30-70`) — `require()` calls are wrapped in `feature("VIGIL_*") ? … : null` so the bundler tree-shakes disabled subsystems. Type-only `import type` stays zero-cost. See [Feature Gates](../concepts/feature-gates.md).
- **Startup** (`:362`) — acquires instance lock, restores last session, seeds message history from JSONL, wires git events → tickEngine.
- **handleTick** (`:556`) — the per-repo decision loop. Builds context, calls the [Decision Engine](../concepts/decision-engine.md), routes output (SILENT / OBSERVE / NOTIFY / ACT), records a 5-item ring buffer, fans out to specialists.
- **maybeConsolidate** (`:1010`) — the [dream phase](../concepts/dream-phase.md) entry point.
- **Graceful shutdown** — `SIGINT` triggers session stop, flush metrics, release lock.

Key helpers inside daemon.ts:
- `readMessagesJsonl(path, limit)` (`:108`) — seed the `MessageRouter` history on startup.
- `rowToFinding(row)` (`:128`) — narrow a DB row into the Finding type.

## Tick Engine

`src/core/tick-engine.ts:65` — `TickEngine` class.

| Surface | Purpose |
|---|---|
| `onTick(handler)` | Fired every tick |
| `onProactiveTick(handler)` | Fired only when `WorkDetector` triggers |
| `onError(handler)` | Budget overruns, handler exceptions |
| `onGitEvent(ev)` | Feeds signals into detector + adaptive sleep |
| `reportActivity()` | Wakes sleeping engine, optionally preempts current timer |
| `pause()` / `resume()` | For config reloads and tests |

Deterministic per-repo jitter (`computeJitter`, `:20`) prevents thundering herd. See [Tick Cycle](../concepts/tick-cycle.md) for the full schedule logic.

## Adaptive Sleep

`src/core/adaptive-sleep.ts:1-105` — activity-window-based interval picker + `<tick>` prompt formatter. Full detail in [Proactive Mode](../concepts/proactive-mode.md).

## Work Detector

`src/core/work-detector.ts:1-128` — weighted signal buffer with decay. Returns an `AnalysisResult` with `reason ∈ critical_signal | threshold_exceeded | heartbeat`. See [Proactive Mode](../concepts/proactive-mode.md).

## Scheduler

`src/core/scheduler.ts:1-203` — Cron-based task scheduling via the `croner` library.

- Entries persisted to `~/.vigil/data/schedules.json`.
- `add()` / `remove()` / `trigger()` / `startJob()` / `stopJob()`.
- Run history: last 50 returned, last 200 retained.
- Dashboard surface: [Scheduler plugin](../dashboard/plugins.md#scheduler).

## Task Manager

`src/core/task-manager.ts:1-284` — SQLite task DAG with wait conditions.

- `TaskStatus` ∈ `pending | active | waiting | completed | failed | cancelled`.
- `WaitCondition.type` ∈ `event | task | schedule`.
- `checkWaitConditions()` (`:220`) fires when a git event or task-completion can unblock dependents.

Schema: see [SQLite Schemas](../reference/sqlite-schemas.md#tasks).

## Feature Gates

`src/core/feature-gates.ts:1-128` — 4-layer flag evaluation (build / config / runtime / session). See [Feature Gates](../concepts/feature-gates.md).

## Metrics

`src/core/metrics.ts:1-150` — SQLite metrics store with batched flush.

- `increment(name, labels?)` — batched, flushed every 30s.
- `gauge(name, value, labels?)` — immediate.
- `timing(name, ms, labels?)` — wraps gauge.
- Query: `getSummary`, `getTimeSeries` (bucketed), `getRawMetrics`, `getMetricNames`.

## Session

`src/core/session.ts:1-125` — `SessionStore` tracks each `vigil watch` invocation.

- `create()` marks any active session as `crashed`, starts a new one.
- `updateTick()` bumps `tick_count` + `last_tick_at`.
- `stop()` on shutdown.
- `getActiveSession()` / `getLastSession()` for resumption.

Schema: see [SQLite Schemas](../reference/sqlite-schemas.md#sessions).

## Config

`src/core/config.ts:1-264` — load, save, hot-reload.

- `loadConfig()` merges `DEFAULT_CONFIG` with `~/.vigil/config.json` via `deepMerge`.
- `watchConfig(handler)` installs an `fs.watch` with 300 ms debounce + content snapshot to skip spurious WSL events.
- Full schema: [Config Schema reference](../reference/config-schema.md).

## Output

`src/core/output.ts:1-115` — `OutputFormatter` with chalked, colorized tick/notify/observe/act/dream/sleep lines. Brief mode suppresses routine output.

## Instance Lock

`src/core/instance-lock.ts` — atomic lockfile prevents two daemons watching the same repo. PID written; stale locks are reaped.

## Other core modules

| Module | Role |
|---|---|
| `rule-engine.ts` | Declarative rule matching (pre-LLM filters). |
| `sleep-controller.ts` | Idle detection that feeds `AdaptiveSleep`. |
| `circuit-breaker.ts` | Generic circuit breaker used by feature gates and LLM calls. |
| `coordinator.ts` | Cross-subsystem event routing (not a dependency graph — a shared EventEmitter). |
| `user-reply.ts` | Readline interface for user responses to `NOTIFY`. |

## See also

- [LLM subsystem](llm.md) — how decisions are produced.
- [Memory subsystem](memory.md) — where context comes from.
- [Git subsystem](git.md) — signal source.
