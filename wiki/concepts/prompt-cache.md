---
title: Prompt Cache
type: concept
updated: 2026-04-19
sources:
  - src/prompts/builder.ts
  - src/prompts/cache.ts
  - src/llm/decision-max.ts
---

# Prompt Cache

Vigil composes its system prompt from labelled sections with different lifetimes. Long-lived sections land in Claude's prompt cache; short-lived ones don't. This keeps per-tick token cost low while leaving the ephemeral slice fresh.

## Sections and scopes

From `PromptBuilder.build` (`src/prompts/builder.ts:16`):

| Section | Scope | Invalidated by |
|---|---|---|
| Agent identity (from `.claude/agents/vigil.md`) | **stable** | `onAgentReloaded()` |
| Dream-mode preface (if `mode === 'dream'`) | **stable** | — |
| Tool documentation | **stable** | build only |
| Active feature list | **session** | `onConfigChanged()` |
| Repo state snippet | **ephemeral** | every tick |
| `<tick>` context (if provided) | **ephemeral** | every tick |

`stable` bits stay cacheable across many ticks (up to Claude's ~5-min cache TTL). `session` bits flip when config hot-reloads. `ephemeral` bits change every call.

## Cache implementation

`PromptCache` (`src/prompts/cache.ts`) stores rendered section text keyed by section name + scope. It tracks a TTL per scope and has explicit invalidation hooks:

- `onRebaseDetected()` (`src/prompts/builder.ts:82`) — clears all scopes; a rebase changes the HEAD the LLM thinks it's looking at.
- `onConfigChanged()` — clears the session scope.
- `onAgentReloaded()` — clears agent identity.

Those hooks are wired into `Daemon.start`:

- Git watcher's `rebase_detected` event → `onRebaseDetected`.
- Config watcher (`src/core/config.ts:watchConfig`) → `onConfigChanged`.
- Agent file change (via `fs.watch` in `agent-loader.ts`) → `onAgentReloaded`.

## Why this matters

The tick model (haiku) is cheap, but tick frequency is high (every 30s on active repos). If the full system prompt were re-encoded every tick, the fixed cost would dominate. Caching the stable + session portions means a tick pays only the ephemeral delta.

## Boundaries

- Cache only matters within Claude's server-side cache window (~5 min idle).
- `AdaptiveSleep.maxTick` is capped to 300s specifically so adaptive sleep doesn't blow the cache by accident.
- Rebase is the one git operation that force-clears everything because commit history shifted.

## See also

- [Tick Cycle](tick-cycle.md) — where the cached prompt is used.
- [Decision Engine](decision-engine.md) — the Zod-validated response shape built on top.
