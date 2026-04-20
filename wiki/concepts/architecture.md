---
title: Architecture Overview
type: concept
updated: 2026-04-19
sources:
  - CLAUDE.md
  - src/core/daemon.ts
  - src/dashboard/server.ts
  - dashboard-v2/src/router.tsx
---

# Architecture Overview

Vigil is three nested loops running inside one Bun process, talking to one dashboard SPA through one port.

```
┌─────────────────── Bun process ──────────────────────────┐
│                                                          │
│  git repos ─► GitWatcher ─► TickEngine ─► DecisionEngine │
│                (fs.watch +   (adaptive     (claude -p,   │
│                 polling)     sleep +        haiku/sonnet)│
│                              jitter)             │       │
│                                                  ▼       │
│                                         SILENT/OBSERVE/  │
│                                          NOTIFY/ACT      │
│                                                  │       │
│                          ┌───────────────────────┼─────┐ │
│                          ▼                       ▼     ▼ │
│                    ActionExecutor         SpecialistRouter│
│                    (6-gate safety)        (code-review,  │
│                                            security,     │
│                                            test-drift,   │
│                                            flaky-test)   │
│                                                          │
│  EventLog (JSONL) ◄── writes ── every subsystem          │
│  VectorStore (bun:sqlite + FTS5) ◄── dream consolidation │
│                                                          │
│  Bun.serve(7480) ─► REST + SSE ─► dashboard-v2 SPA       │
│                       (TanStack Start embedded on the    │
│                        same port)                        │
└──────────────────────────────────────────────────────────┘
```

## The loops

1. **Tick loop** (`src/core/tick-engine.ts`). Fires every `tickInterval` (default 30s) with deterministic per-repo jitter. In proactive mode, the [WorkDetector](proactive-mode.md) decides if this tick warrants an LLM call. See [Tick Cycle](tick-cycle.md).
2. **Decision loop** (`src/core/daemon.ts:handleTick`). For each triggered repo, build context → call [DecisionEngine](decision-engine.md) → route to the matching handler → record in a 5-item ring buffer → fan out to specialists.
3. **Dream loop** (`src/core/daemon.ts:maybeConsolidate`). After `dreamAfter` seconds of idleness, consolidate memory into repo profiles, analyze cross-repo patterns, prune. See [Dream Phase](dream-phase.md).

## Three persistent stores

| Store | Path | Used for |
|---|---|---|
| EventLog (JSONL) | `~/.vigil/data/logs/YYYY-MM-DD-{repo}.jsonl` | Append-only per-day git events |
| VectorStore (SQLite + FTS5) | `~/.vigil/data/memory.db` | Memories, repo profiles, consolidated dreams — see [Memory Tiers](memory-tiers.md) |
| Specialist store (SQLite) | `~/.vigil/data/specialists.db` | Findings, agent configs, test runs, flakiness stats |

Tasks, metrics, sessions have their own SQLite files — see [SQLite Schemas](../reference/sqlite-schemas.md).

## Four feature-gate layers

Every extension (channels, webhooks, push, specialists, proactive mode, etc.) is gated at up to four points before it runs. See [Feature Gates](feature-gates.md).

1. **Build** — `feature("VIGIL_*")` at `src/build/features.ts` lets the bundler tree-shake entire subsystems (the `require(...)` is inside a `feature() ? … : null` ternary).
2. **Config** — `config.json` flags in `features: {}`.
3. **Runtime** — optional remote URL polled with 5min TTL.
4. **Session** — per-daemon-run opt-in.

## One port, one process

`Bun.serve()` at port 7480 is the only network surface:

- `/api/*` — REST handlers in `src/dashboard/api/*.ts`.
- `/api/sse` — server-sent events stream of daemon state changes.
- Everything else — TanStack Start SSR handler serving the React SPA (lazy-loaded from `dist/server/server.js`).

The dashboard's [server functions](../dashboard/server-functions.md) are just thin `fetch` wrappers around those REST endpoints — there's no separate API server.

## LLM billing lane

All LLM calls go through `claude -p` spawned as a child process, not via `@anthropic-ai/sdk`. The wrapper at `src/llm/decision-max.ts:callClaude` deletes `ANTHROPIC_API_KEY` from the child env so the Claude CLI falls back to Max-subscription auth. See [LLM Billing via Max](llm-billing-max.md).

## Models

| Role | Default | Used for |
|---|---|---|
| Tick | `claude-haiku-4-5-20251001` | Per-tick decisions |
| Escalation / Dream | `claude-sonnet-4-6` | Consolidation, deeper analysis |
| Specialist | inherits tick model (per-agent override) | Code review, security, test drift |

Configurable under `tickModel` / `escalationModel` in [config](../reference/config-schema.md).

## Next

- [Tick Cycle](tick-cycle.md) — the heartbeat in detail.
- [Decision Engine](decision-engine.md) — how the LLM output becomes behavior.
- [Subsystems index](../index.md#subsystems-one-page-per-top-level-src-folder).
