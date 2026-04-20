---
title: Memory Subsystem
type: subsystem
updated: 2026-04-19
sources:
  - src/memory/store.ts
  - src/memory/dream-worker.ts
  - src/memory/cross-repo.ts
  - src/memory/semantic.ts
  - src/memory/topic-tier.ts
  - src/memory/index-tier.ts
  - src/memory/pruner.ts
---

# Memory Subsystem

`src/memory/` owns everything durable. See [Memory Tiers](../concepts/memory-tiers.md) for the conceptual layering; this page is about the files.

## store.ts

The workhorse. Defines:

- **`MemoryEntry`** (`:8`) — `{ id, timestamp, repo, type, content, metadata, confidence }`. `type ∈ git_event | decision | action | insight | consolidated | user_reply`.
- **`EventLog`** class (`:38`) — JSONL writer. One file per day per repo at `~/.vigil/data/logs/YYYY-MM-DD-{repo}.jsonl`. `query({repo?, type?, date?})` filters via regex on the filename glob.
- **`VectorStore`** class (`:99`) — SQLite + FTS5.
  - Schemas: see [SQLite Schemas](../reference/sqlite-schemas.md#memory).
  - Methods: `store`, `search`, `getByRepo`, `getRepoProfile`, `saveRepoProfile`, `storeConsolidated`, `getConsolidatedHistory`, `prune`.
- **`RepoProfile`**, **`ConsolidatedEntry`** — row shapes.

FTS5 trigger sync means you can insert into `memories` and `memories_fts` stays in sync automatically — no explicit index writes.

## dream-worker.ts

Encapsulates the consolidation workflow invoked from `Daemon.maybeConsolidate`:

1. Pull recent memories.
2. Call `DecisionEngine.consolidate()` with the escalation model.
3. Write `ConsolidatedEntry` + updated `RepoProfile`.
4. Surface status via the `GET /api/dreams` endpoint (the `status.running` flag).

See [Dream Phase](../concepts/dream-phase.md).

## cross-repo.ts

`CrossRepoAnalyzer` runs after the per-repo dream. Looks at recent consolidated entries across all repos, finds patterns that appear in more than one (e.g. lockfile churn in two projects at once), and writes a repo-spanning consolidated row.

## semantic.ts

Co-occurrence-based similarity scoring used when building richer context for the Ask Vigil flow.

## topic-tier.ts

Hierarchical topic clustering over memory entries. Powers the topic-filter UI on the [Memory plugin](../dashboard/plugins.md#memory).

## index-tier.ts

Sparse keyword index used as a cheap first-pass filter before FTS5. Kept tiny intentionally.

## pruner.ts

Dashboard-friendly wrapper around `VectorStore.prune`. Adds:

- Schedule-friendly thresholds.
- Statistics returned to `/api/health` so the [Health plugin](../dashboard/plugins.md#health) can show pre/post counts.
- VACUUM trigger after large prunes.

Pruning rules recap:
- `git_event` > 7 days → delete.
- `decision` low-confidence > 3 days → delete.
- `consolidated` → never.
- Floor: 50 rows per repo.

## CLI exposure

- `bun run src/cli/index.ts memory` — prints the current repo profile + recent entries.
- `bun run src/cli/index.ts dream` — forces a consolidation run.

## Dashboard exposure

- `/api/memory` — stats across the four tiers + recent entries.
- `/api/memory/search` — FTS5 search surface.
- `/api/memory/ask` — the Ask Vigil endpoint (delegates to `ask-engine.ts`).
- `/api/memory/relevance` — mark entries relevant/irrelevant (feeds future tuning).

## See also

- [Memory Tiers concept](../concepts/memory-tiers.md)
- [Dream Phase concept](../concepts/dream-phase.md)
- [SQLite Schemas reference](../reference/sqlite-schemas.md#memory)
