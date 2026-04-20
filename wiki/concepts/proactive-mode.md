---
title: Proactive Mode
type: concept
updated: 2026-04-19
sources:
  - src/core/work-detector.ts
  - src/core/adaptive-sleep.ts
  - src/core/tick-engine.ts
  - plan/kairos-advanced-features-plan.md
---

# Proactive Mode

Proactive mode (feature flag `VIGIL_PROACTIVE`, Phase 10) replaces fixed-interval ticking with signal-driven ticking. Instead of "every 30 seconds, call the LLM", proactive ticks say "call the LLM only when there's useful work to do, otherwise stay quiet".

## The two collaborators

Proactive mode is just `WorkDetector` + `AdaptiveSleep` plugged into the existing `TickEngine`.

### WorkDetector

`src/core/work-detector.ts:12-26` holds a weighted signal buffer. Git events arrive with a weight:

| Event | Weight |
|---|---|
| `rebase_detected` | 0.9 (critical — invalidates cache) |
| `new_commit` | 0.7 |
| `branch_switch` | 0.5 |
| `uncommitted_drift` | 0.3 |
| `file_change` | 0.2 |

Signals decay at 0.001 / sec. `shouldAnalyze` (`src/core/work-detector.ts:61`) returns:

- **critical_signal** if any single signal is ≥ 0.9.
- **threshold_exceeded** if the decayed sum is ≥ 0.5.
- **heartbeat** if ≥ 30 min have passed with no LLM call at all.
- `null` otherwise → skip this tick.

On return, the tick engine calls `consumeSignals()` (`:124`) to clear the buffer.

### AdaptiveSleep

`src/core/adaptive-sleep.ts:49` decides the interval to the next tick based on a 10-minute activity window:

- 5+ events → `minTick` (15s).
- 0 events → `maxTick` (300s, bounded by the Claude prompt-cache TTL so we don't blow the [cache](prompt-cache.md) by oversleeping).
- In-between → linear interpolation.

It also formats the `<tick>` XML fragment that's injected as the ephemeral slice of the system prompt (`:85`).

## Wiring

`TickEngine` has two registration surfaces (`src/core/tick-engine.ts:91`):

- `onTick(handler)` — always fires on every tick.
- `onProactiveTick(handler)` — only fires when `WorkDetector.shouldAnalyze()` returns non-null.

`src/core/daemon.ts` registers the decision-engine handler via `onProactiveTick` when `VIGIL_PROACTIVE` is on; otherwise it falls back to `onTick` with a fixed cadence.

Git events feed the detector via `tickEngine.onGitEvent(ev)` (`src/core/tick-engine.ts:124`) — this also resets `AdaptiveSleep.recordActivity()` and can wake a sleeping engine immediately if the new signal crosses threshold mid-interval.

## Behavior vs plain mode

| Situation | Plain mode | Proactive mode |
|---|---|---|
| Completely idle repo | ticks every `sleepTickInterval` (300s), still calls LLM | ticks at `maxTick`, **skips** LLM call |
| Single commit lands | calls LLM on next 30s tick | calls LLM immediately (critical signal fast-path) |
| Burst of file saves | N LLM calls (one per tick) | One LLM call when accumulated weight crosses 0.5 |
| 30+ min silent | periodic LLM call | one heartbeat LLM call |

## Cost impact

Proactive mode is primarily a **cost** knob. On a Max subscription this matters less, but there's still a throughput budget — the fewer LLM calls, the lower the chance of hitting rate limits on a burst tick.

## See also

- [Tick Cycle](tick-cycle.md) — the scheduling layer proactive mode plugs into.
- [Prompt Cache](prompt-cache.md) — why `maxTick` is capped at 300s.
- [Roadmap → Kairos](../roadmap/kairos.md) — Phase 10 context.
