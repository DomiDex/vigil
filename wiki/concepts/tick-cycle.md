---
title: Tick Cycle
type: concept
updated: 2026-04-19
sources:
  - src/core/tick-engine.ts
  - src/core/adaptive-sleep.ts
  - src/core/work-detector.ts
  - src/core/daemon.ts
---

# Tick Cycle

The tick is the daemon's heartbeat. Each tick is a chance to look at a repo, call the LLM, route output, and schedule the next tick. Ticks **do not** always call the LLM — see [Proactive Mode](proactive-mode.md).

## Timing

`TickEngine` (`src/core/tick-engine.ts:65`) schedules each tick via `setTimeout`. The interval is picked by `scheduleNext` (`src/core/tick-engine.ts:182`):

| Situation | Interval |
|---|---|
| Normal, idle | `config.tickInterval` (default 30s) |
| Sleeping (>`sleepAfter` idle) | `config.sleepTickInterval` (default 300s) |
| Proactive mode, active | `AdaptiveSleep.getNextInterval()` (15–300s based on activity window) |

**Jitter.** `computeJitter(repoName, baseIntervalSec)` (`src/core/tick-engine.ts:20`) adds 0–10 % of the interval (max 15s) based on a hash of the repo name. Deterministic, so two daemons watching the same repo don't thunder-herd.

## Phases of a single tick

From `TickEngine.scheduleNext`'s timeout callback (`src/core/tick-engine.ts:205`):

1. **Budget guard.** Wrap the whole handler in `Promise.race(handler, timeoutPromise)` with `config.blockingBudget` (default 120s). Overruns log and emit an error.
2. **Proactive gate.** If `proactiveEnabled && !sleeping`, ask `WorkDetector.shouldAnalyze()`:
   - Returns `null` → skip LLM work, still fall through to regular handlers (for sleep/consolidation checks).
   - Returns an `AnalysisResult` → fire `proactiveHandlers` with a formatted `<tick>` prompt.
3. **Regular handlers.** Fire every handler registered via `onTick(...)`. These include the daemon's main `handleTick`, periodic dream check, and cleanup routines.
4. **Reschedule.** Compute next interval, apply jitter, setTimeout.

## Proactive gating

`WorkDetector` (`src/core/work-detector.ts:61`) weighs accumulated signals:

| Signal | Weight |
|---|---|
| `new_commit` | 0.7 |
| `branch_switch` | 0.5 |
| `rebase_detected` | 0.9 (critical — invalidates prompt cache) |
| `uncommitted_drift` | 0.3 |
| `file_change` | 0.2 |

Trigger reasons (`src/core/work-detector.ts:61`):

- **critical_signal** — any weight ≥ 0.9 → call immediately.
- **threshold_exceeded** — accumulated ≥ 0.5 → call.
- **heartbeat** — ≥ 30 min of silence → call anyway.
- otherwise → skip.

After a successful LLM call, `consumeSignals()` (`src/core/work-detector.ts:124`) clears the buffer.

## Adaptive sleep

`AdaptiveSleep.getNextInterval()` (`src/core/adaptive-sleep.ts:49`) picks a tick interval from the activity window:

- 5+ events in last 10 min → `minTick` (15s).
- 0 events → `maxTick` (300s, bounded by the Claude prompt-cache TTL).
- In-between → linear interpolation.

Its `formatTickPrompt` method (`src/core/adaptive-sleep.ts:85`) emits an XML fragment used by the LLM system prompt:

```xml
<tick>
  <signals>
    <signal type="new_commit">New commit on main: abc123</signal>
  </signals>
  <time_since_last_tick>45s</time_since_last_tick>
  <heartbeat>false</heartbeat>
</tick>
```

## Waking from sleep

`reportActivity()` (`src/core/tick-engine.ts:136`) is called whenever a git event arrives. If the engine is sleeping, it cancels the slow-cadence timer and schedules an immediate tick. If proactive and a signal crosses threshold mid-interval, same behavior — don't wait up to 5 minutes.

## Interaction with the daemon

Wiring happens in `Daemon.start` (see `src/core/daemon.ts:362`). The daemon registers:

- `tickEngine.onTick(handleTick)` — the LLM decision path.
- `tickEngine.onProactiveTick(...)` — proactive-gated path (only when `VIGIL_PROACTIVE` is on).
- `gitWatcher.onEvent(ev => tickEngine.onGitEvent(ev))` — feed signals.

## See also

- [Decision Engine](decision-engine.md) — what `handleTick` does once called.
- [Proactive Mode](proactive-mode.md) — the feature-gated version of this loop.
- [Dream Phase](dream-phase.md) — what happens when ticks go quiet.
