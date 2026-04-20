---
title: Wiki Index
type: index
updated: 2026-04-19
---

# Index

Full content catalog. Organized by category, not chronology. For date-ordered activity see [log.md](log.md).

## Orientation

| Page | One-line hook |
|---|---|
| [README](README.md) | Landing page, start-here table |
| [SCHEMA](SCHEMA.md) | Conventions and workflows this wiki follows |
| [Architecture Overview](concepts/architecture.md) | One-screen summary of how the pieces fit |

## Concepts (cross-cutting ideas)

| Page | One-line hook |
|---|---|
| [Tick Cycle](concepts/tick-cycle.md) | How the daemon wakes, gathers, decides, sleeps |
| [Decision Engine](concepts/decision-engine.md) | SILENT / OBSERVE / NOTIFY / ACT routing |
| [Dream Phase](concepts/dream-phase.md) | Idle-time memory consolidation |
| [Memory Tiers](concepts/memory-tiers.md) | EventLog + VectorStore + FTS5 + repo profiles |
| [Feature Gates](concepts/feature-gates.md) | 4-layer gating: build / config / runtime / session |
| [Prompt Cache](concepts/prompt-cache.md) | Stable / session / ephemeral sections |
| [Action Gates](concepts/action-gates.md) | 6-gate safety chain before any write-side git op |
| [LLM Billing via Max](concepts/llm-billing-max.md) | Why `claude -p` and not the Anthropic SDK |
| [Proactive Mode](concepts/proactive-mode.md) | WorkDetector + AdaptiveSleep skip idle ticks |

## Subsystems (one page per top-level src/ folder)

| Page | Source | Status |
|---|---|---|
| [Core](subsystems/core.md) | `src/core/` | shipped |
| [LLM Layer](subsystems/llm.md) | `src/llm/` | shipped |
| [Memory](subsystems/memory.md) | `src/memory/` | shipped |
| [Git Watcher](subsystems/git.md) | `src/git/` | shipped |
| [Specialists](subsystems/specialists.md) | `src/specialists/` | shipped (Phases 0–8) |
| [Messaging](subsystems/messaging.md) | `src/messaging/` | shipped |
| [Channels](subsystems/channels.md) | `src/channels/` | shipped (feature-gated) |
| [Webhooks](subsystems/webhooks.md) | `src/webhooks/` | shipped (feature-gated) |
| [Actions](subsystems/actions.md) | `src/action/` | shipped |
| [Dashboard Backend](subsystems/dashboard-backend.md) | `src/dashboard/` | shipped |

## Dashboard (frontend-specific)

| Page | Hook |
|---|---|
| [Stack & Entry](dashboard/stack.md) | TanStack Start + React 19 + Tailwind v4 + Radix |
| [Plugins Catalog](dashboard/plugins.md) | All 16 plugins with queries, mutations, slots |
| [Server Functions](dashboard/server-functions.md) | Full RPC surface from `src/server/functions.ts` |
| [Components](dashboard/components.md) | Layout / UI primitives / Vigil-specific |
| [Routing & SSE](dashboard/routing.md) | File-based routes + SSE-driven cache invalidation |

## Reference (flat lookup)

| Page | Hook |
|---|---|
| [Config Schema](reference/config-schema.md) | `VigilConfig` fields + defaults |
| [CLI Commands](reference/cli-commands.md) | Every `bun run src/cli/index.ts …` invocation |
| [SQLite Schemas](reference/sqlite-schemas.md) | All tables across memory/specialists/tasks/metrics/sessions |
| [API Routes](reference/api-routes.md) | Every `/api/*` endpoint the daemon exposes |
| [SSE Events](reference/sse-events.md) | Event taxonomy emitted on `/api/sse` |
| [Feature Flags](reference/feature-flags.md) | Every `VIGIL_*` flag, owner phase, gating layer |

## Roadmap

| Page | Hook |
|---|---|
| [Status](roadmap/status.md) | Shipped / in-flight / aspirational per subsystem |
| [Dashboard v2 Plan](roadmap/dashboard-v2.md) | Phases 0–7 of the React rewrite |
| [Specialist Agents](roadmap/specialists.md) | Phases 0–8 (all shipped) + future workflow agents |
| [ClaudeClaw Features](roadmap/claudeclaw.md) | 10-feature security/coordination wave |
| [Kairos Advanced](roadmap/kairos.md) | Phases 8–17 of Kairos-inspired features |

## Meta

| Page | Hook |
|---|---|
| [log](log.md) | Chronological record of wiki operations |
