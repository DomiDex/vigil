---
title: Dream Phase
type: concept
updated: 2026-04-19
sources:
  - src/core/daemon.ts
  - src/memory/dream-worker.ts
  - src/memory/store.ts
  - src/memory/cross-repo.ts
  - src/memory/pruner.ts
---

# Dream Phase

The dream phase is the daemon's sleep-consolidation cycle. When a repo has been idle for `config.dreamAfter` seconds (default 1800), Vigil rolls up recent memories into a **repo profile**, detects patterns, runs cross-repo analysis, and prunes stale rows. The result is a durable summary the next tick can use as context.

## Trigger

`Daemon.maybeConsolidate` (`src/core/daemon.ts:1010`) runs on every tick. For each watched repo:

1. If a dream is already running for the repo, skip.
2. If `now - lastDreamAt < dreamAfter`, skip.
3. Otherwise, enter dream mode for that repo.

The lock prevents concurrent dreams on the same repo even across adjacent ticks.

## What a dream does

| Step | Module | Output |
|---|---|---|
| 1. Gather | `VectorStore.getByRepo(limit)` in `src/memory/store.ts:211` | Recent `MemoryEntry` rows |
| 2. Summarize (LLM) | `callClaude(..., escalationModel)` via `DecisionEngine.consolidate` | A `ConsolidatedEntry` — patterns, insights, confidence |
| 3. Persist | `VectorStore.storeConsolidated` (`src/memory/store.ts:239`) | Row in `consolidated` table (permanent) |
| 4. Profile | `VectorStore.saveRepoProfile` (`src/memory/store.ts:231`) | Row in `repo_profiles` table (one per repo) |
| 5. Cross-repo | `CrossRepoAnalyzer.analyze` (`src/memory/cross-repo.ts:*`) | Shared patterns across repos |
| 6. Prune | `VectorStore.prune` (`src/memory/store.ts:300`) | Old `git_event` + low-confidence `decision` rows removed |
| 7. Plant tasks | `TaskManager.create` from insights | Tasks with wait conditions for recurring patterns |

The escalation model (Sonnet by default) is used because consolidation is the one place longer context and better synthesis actually pay for themselves.

## Consolidated entry shape

From `src/memory/store.ts:239`:

```ts
{
  id,
  repo,
  content,           // the narrative summary
  source_ids: [...],  // which MemoryEntry rows fed this
  patterns: [...],   // structured tags
  insights: [...],   // higher-level observations
  confidence: 0..1,
  created_at
}
```

Consolidated rows are **permanent** — `VectorStore.prune` explicitly skips them (`src/memory/store.ts:300`).

## Repo profiles

`repo_profiles` (`src/memory/store.ts:219`) holds one row per repo: summary text + structured patterns + last_updated. It's the first thing `DecisionEngine.decide` reads for context, so every tick benefits from the last dream.

## Pruning rules

From `VectorStore.prune` (`src/memory/store.ts:300`):

- `git_event` memories older than 7 days → deleted.
- `decision` memories with confidence < threshold older than 3 days → deleted.
- `consolidated` rows → never deleted.
- Minimum 50 rows per repo retained regardless.

## Dashboard surface

The [Dreams plugin](../dashboard/plugins.md#dreams) (`dashboard-v2/src/plugins/dreams/DreamsPage.tsx`) renders these:

- `DreamEntry` card shows per-repo dreams with confidence bar, insights, patterns.
- Auto-refreshes every 3s while a dream is running (uses the `status.running` flag from `GET /api/dreams`).
- A **Trigger** button posts to `/api/dreams/trigger` to force a dream outside the idle window.
- `GET /api/dreams/patterns/{repo}` exposes the pattern tags for a specific repo.

## CLI

`bun run src/cli/index.ts dream` forces a consolidation run and prints the result. See [CLI Commands](../reference/cli-commands.md).

## See also

- [Memory Tiers](memory-tiers.md) — the EventLog/VectorStore/profile layering.
- [Tick Cycle](tick-cycle.md) — where the dream check fires.
- [Subsystems → Memory](../subsystems/memory.md) — file-level details.
