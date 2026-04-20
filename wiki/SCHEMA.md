---
title: Wiki Schema & Workflow
type: schema
updated: 2026-04-19
---

# Wiki Schema

This document tells an LLM (and any human collaborator) how the Vigil wiki is structured and how to maintain it. You and the LLM co-evolve this file as you learn what works.

## Layers

1. **Raw sources** — immutable: `src/`, `dashboard-v2/src/`, `plan/*.md`, `CLAUDE.md`, `package.json`, phase-status JSON files, git log. The LLM reads, never writes.
2. **Wiki** — LLM-owned markdown under `wiki/`. Broken into topic folders (`concepts/`, `subsystems/`, `dashboard/`, `reference/`, `roadmap/`) plus three top-level files: `README.md`, `index.md`, `log.md`.
3. **Schema** — this file. Rules and conventions that keep the wiki coherent.

## Directory layout

```
wiki/
├── README.md                — home page, one-screen orientation
├── SCHEMA.md                — this file
├── index.md                 — full content catalog (content-oriented)
├── log.md                   — append-only activity log (chronological)
├── concepts/                — cross-cutting ideas: tick cycle, dream phase, feature gates, etc.
├── subsystems/              — one page per top-level src/ folder
├── dashboard/               — frontend-specific pages (plugins, server functions, components)
├── reference/               — flat lookup pages: config schema, CLI commands, SQLite tables, API routes
└── roadmap/                 — status, shipped phases, future ideas
```

## Page conventions

Every page starts with YAML frontmatter:

```yaml
---
title: <page title>
type: concept | subsystem | reference | roadmap | entity | home | schema | log
updated: YYYY-MM-DD
sources:          # files from the repo this page synthesizes
  - src/core/daemon.ts
  - plan/big-plan.md
---
```

Body rules:

- **Cite code.** Every non-trivial claim points at `path/to/file.ts:LINE`. If the code moves, the page breaks loudly — that's the feature.
- **Lead with the what, then the why.** Open each section with a one-sentence definition. Detail follows.
- **Prefer tables to prose** for anything enumerable (config fields, SQLite columns, API routes, feature flags).
- **No marketing.** Describe what is, not what is desired. Put aspirational content under `roadmap/` and label it explicitly.
- **Cross-link liberally.** `[Decision Engine](./concepts/decision-engine.md)` is better than re-explaining.

## Workflows

### Ingest a new source

When a new doc, ADR, or significant code change lands:

1. Read the source end-to-end.
2. Update relevant subsystem/concept pages. Add file:line refs.
3. If a new entity or concept appears, create a new page under the right folder.
4. Update [index.md](index.md) — add/move entries by category.
5. Append to [log.md](log.md) with the `## [YYYY-MM-DD] ingest | <subject>` header.
6. Flag contradictions explicitly: `> **Conflict:** page X claims ..., but source Y shows ...`.

### Answer a query

1. Read [index.md](index.md) first to find candidate pages.
2. Read those pages. If a claim looks load-bearing, verify it against the source file cited.
3. Synthesize. If the answer is valuable on its own (a comparison, a derivation, a walkthrough), **file it back** as a new page — don't let it die in chat.
4. Log the query in [log.md](log.md) if it produced a new page.

### Lint

Run periodically. Look for:

- Stale claims (cited line numbers no longer match; renamed symbols).
- Orphans (pages not linked from `index.md` or any other page).
- Duplicates (two pages covering the same entity).
- Missing pages (concepts referenced but never documented).
- Shipped-vs-aspirational drift (a page under `concepts/` describing something that's still only in `plan/`).

A good smoke test: `grep "src/[^:]*:\d\+" wiki/**/*.md` and spot-check a sample.

## Status labels (binding)

- **shipped** — code exists, tests pass, behavior is current. File refs must resolve.
- **in-flight** — PR open or work active on a branch. Include the branch name.
- **aspirational** — documented in `plan/` but no implementation yet. Live under `roadmap/`, never `subsystems/`.

Pages must not mix statuses silently. If a subsystem has some shipped + some aspirational parts, the aspirational bits go in a `## Planned` section at the bottom with a status label.

## Log format

Entries are append-only, one per operation:

```
## [2026-04-19] ingest | Dashboard Plugins spec
- Added wiki/dashboard/plugins.md covering all 16 plugins
- Updated wiki/index.md
- Sources: plan/vigil-dashboard-v2-spec.md, dashboard-v2/src/plugins/index.ts
```

Header prefix is `## [YYYY-MM-DD] <op> | <subject>`. Parseable with `grep "^## \[" log.md | tail -5`.

## What NOT to save

Skip content that's better as a runtime lookup:

- Verbatim code dumps (link to the file instead).
- Generated type definitions (they'll be stale by tomorrow).
- One-off debugging notes (those belong in commits or ADRs).
- CI logs, test output, ephemeral error messages.
