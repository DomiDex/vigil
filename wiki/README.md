---
title: Vigil Wiki
type: home
updated: 2026-04-19
---

# Vigil Wiki

A compounding, LLM-maintained knowledge base for the **Vigil** codebase — a KAIROS-inspired always-on git agent written in Bun/TypeScript, with a React 19 + TanStack Start dashboard.

The raw sources are:

1. The **code** at `src/` (backend, Bun runtime) and `dashboard-v2/src/` (frontend, React SPA).
2. The **plans & specs** at `plan/*.md` — phased implementation roadmaps.
3. The **CLAUDE.md** instructions at the repo root.

The wiki sits between the reader and those sources. Pages cite file paths with `src/path/file.ts:LINE` so you can jump from the wiki into the code.

---

## Start here

| If you want… | Read |
|---|---|
| A one-screen orientation | [Architecture Overview](concepts/architecture.md) |
| How the tick loop + decision engine work | [Tick Cycle](concepts/tick-cycle.md) → [Decision Engine](concepts/decision-engine.md) |
| What the dashboard actually exposes | [Dashboard Plugins](dashboard/plugins.md) and [Server Functions](dashboard/server-functions.md) |
| Full catalog of every page | [index.md](index.md) |
| What shipped and what's still aspirational | [Roadmap](roadmap/status.md) |
| The conventions this wiki uses | [SCHEMA.md](SCHEMA.md) |

---

## Project in one paragraph

Vigil watches git repositories and calls `claude -p` (via the Max subscription, not the Anthropic API directly) to decide whether to stay SILENT, OBSERVE, NOTIFY, or ACT on each tick. A [WorkDetector](subsystems/core.md#workdetector) gates LLM calls so the daemon only burns tokens when something interesting is happening. After an idle window, it enters a [dream phase](concepts/dream-phase.md) that consolidates the EventLog + VectorStore into repo profiles. A [specialist](subsystems/specialists.md) layer routes post-decision events to focused sub-agents (code-review, security, test-drift, flaky-test). Everything is exposed over a single Bun.serve port via [REST + SSE](reference/api-routes.md) and rendered by a plugin-based React dashboard.

---

## Conventions

- File refs use `src/...:LINE` format so they're clickable in editors.
- "Shipped", "in-flight", and "aspirational" are load-bearing status labels — see [Roadmap](roadmap/status.md).
- Every page has frontmatter (`type:`, `updated:`, `sources:`) used for linting and freshness checks.
- The [log](log.md) is append-only, newest at the bottom, with `## [YYYY-MM-DD] <op> | <subject>` headers so you can `grep "^## \[" log.md`.

See [SCHEMA.md](SCHEMA.md) for the full playbook an LLM follows when ingesting a new source or answering a question against this wiki.
