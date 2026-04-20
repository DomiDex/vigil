---
title: Memory Tiers
type: concept
updated: 2026-04-19
sources:
  - src/memory/store.ts
  - src/memory/semantic.ts
  - src/memory/topic-tier.ts
  - src/memory/index-tier.ts
  - src/memory/pruner.ts
---

# Memory Tiers

Vigil stores what it's seen in four cooperating tiers. The first two are the durable record; the last two are retrieval helpers built on top.

## Tier 1 — EventLog (JSONL, append-only)

`EventLog` (`src/memory/store.ts:38`) writes one JSONL file per day per repo:

```
~/.vigil/data/logs/2026-04-19-myrepo.jsonl
```

Every row is a `MemoryEntry`:

```ts
{ id, timestamp, repo, type, content, metadata, confidence }
```

`type` ∈ `git_event | decision | action | insight | consolidated | user_reply`. Query with `eventLog.query({ repo?, type?, date? })`.

This tier is the **audit trail**. It outlives pruning. It's what gets rebuilt into SQLite if you blow away the DB.

## Tier 2 — VectorStore (bun:sqlite + FTS5)

`VectorStore` (`src/memory/store.ts:99`) holds four tables in `~/.vigil/data/memory.db`:

| Table | Role |
|---|---|
| `memories` | One row per `MemoryEntry`. Full `INSERT OR REPLACE` on write. |
| `memories_fts` | FTS5 virtual table over `(content, repo, type)`. Auto-synced via triggers. |
| `repo_profiles` | One row per repo — narrative summary + patterns. |
| `consolidated` | [Dream](dream-phase.md) outputs. Never pruned. |

Key methods (`src/memory/store.ts`):

- `store(entry)` @ `:180` — insert or replace.
- `search(query, repo?)` @ `:197` — FTS5 `MATCH` ordered by rank.
- `getByRepo(repo, limit)` @ `:211` — last N by `updated_at DESC`.
- `getRepoProfile(repo)` @ `:219` / `saveRepoProfile` @ `:231`.
- `storeConsolidated(entry)` @ `:239` / `getConsolidatedHistory(repo?, limit)` @ `:262`.
- `prune()` @ `:300` — see below.

## Tier 3 — Semantic & Topic overlay

Two helpers layered on top of the VectorStore for richer retrieval:

- `semantic.ts` — similarity scoring based on co-occurrence across memory entries.
- `topic-tier.ts` — clusters entries into hierarchical topics.

These are called from the [dream phase](dream-phase.md) during consolidation and from `getMemoryRelevance` on the dashboard's [Memory plugin](../dashboard/plugins.md#memory).

## Tier 4 — Index tier

`index-tier.ts` is a sparse keyword index used as a first-pass filter before FTS5. Cheap to maintain, cheap to query.

## Cross-repo layer

`CrossRepoAnalyzer` (`src/memory/cross-repo.ts`) runs in the dream phase to find shared patterns across repos — e.g. dependency churn that shows up in two projects at once. Writes into `consolidated` with a repo-spanning key.

## Pruning

`VectorStore.prune` (`src/memory/store.ts:300`):

- `git_event` older than 7 days → delete.
- `decision` with low confidence older than 3 days → delete.
- `consolidated` → **never** delete.
- Floor: keep at least 50 rows per repo.

`memory/pruner.ts` wraps this with schedule-friendly logic for the dashboard's health controls. The [Health plugin](../dashboard/plugins.md#health) exposes a Vacuum button that runs SQLite `VACUUM` after pruning.

## Retrieval order in practice

When the [Decision Engine](decision-engine.md) builds context for a tick:

1. `getRepoProfile(repo)` — the dream-consolidated narrative.
2. `getByRepo(repo, 20)` — recent entries.
3. Optionally `search(query, repo)` if the LLM asks via tool for specific info.

The combination gives low-latency "what's been happening here" without running a vector similarity at every tick.

## See also

- [Dream Phase](dream-phase.md) — how consolidated rows get written.
- [Subsystems → Memory](../subsystems/memory.md) — file-level details.
- [SQLite Schemas](../reference/sqlite-schemas.md) — full column list.
