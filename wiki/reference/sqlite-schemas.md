---
title: SQLite Schemas
type: reference
updated: 2026-04-19
sources:
  - src/memory/store.ts
  - src/specialists/store.ts
  - src/core/task-manager.ts
  - src/core/metrics.ts
  - src/core/session.ts
---

# SQLite Schemas

Vigil uses `bun:sqlite` (never `better-sqlite3`). Databases live under `~/.vigil/data/`.

## memory.db — `src/memory/store.ts`

### memories
| Column | Type |
|---|---|
| `id` | TEXT PK |
| `repo` | TEXT |
| `type` | TEXT (`git_event`, `decision`, `action`, `insight`, `consolidated`, `user_reply`) |
| `content` | TEXT |
| `metadata` | TEXT (JSON) |
| `confidence` | REAL |
| `created_at` | INTEGER |
| `updated_at` | INTEGER |

Indices: `(repo, updated_at)`, `(type)`.

### memories_fts — FTS5 virtual
Columns: `content`, `repo`, `type`. Triggers auto-sync with `memories` on INSERT / UPDATE / DELETE. Used for `VectorStore.search(q, repo?)`.

### repo_profiles
| Column | Type |
|---|---|
| `repo` | TEXT PK |
| `summary` | TEXT |
| `patterns` | TEXT (JSON) |
| `last_updated` | INTEGER |

### consolidated
| Column | Type |
|---|---|
| `id` | TEXT PK |
| `repo` | TEXT |
| `content` | TEXT |
| `source_ids` | TEXT (JSON) |
| `patterns` | TEXT (JSON) |
| `insights` | TEXT (JSON) |
| `confidence` | REAL |
| `created_at` | INTEGER |

Never pruned. See [Dream Phase](../concepts/dream-phase.md).

---

## specialists.db — `src/specialists/store.ts`

### findings
| Column | Type |
|---|---|
| `id` | TEXT PK |
| `specialist` | TEXT |
| `severity` | TEXT (`info`, `warning`, `critical`) |
| `title` | TEXT |
| `detail` | TEXT |
| `file` | TEXT |
| `line` | INTEGER |
| `suggestion` | TEXT |
| `repo` | TEXT |
| `confidence` | REAL |
| `commit_hash` | TEXT |
| `dismissed` | INTEGER (0/1) |
| `dismissed_at` | INTEGER |
| `ignore_pattern` | TEXT |
| `source_action_id` | TEXT |
| `created_at` | INTEGER |

Dedup key: `(specialist, repo, title, file, line)`.

### specialist_config
| Column | Type |
|---|---|
| `name` | TEXT PK |
| `class` | TEXT (`deterministic`, `analytical`) |
| `description` | TEXT |
| `trigger_events` | TEXT (JSON) |
| `watch_patterns` | TEXT (JSON) |
| `enabled` | INTEGER |
| `is_builtin` | INTEGER |
| `created_at` | INTEGER |
| `updated_at` | INTEGER |

### test_runs
| Column | Type |
|---|---|
| `id` | TEXT PK |
| `repo` | TEXT |
| `commit_hash` | TEXT |
| `branch` | TEXT |
| `test_name` | TEXT |
| `test_file` | TEXT |
| `passed` | INTEGER |
| `created_at` | INTEGER |

### flakiness
| Column | Type |
|---|---|
| `repo` | TEXT (PK part) |
| `test_name` | TEXT (PK part) |
| `total_runs` | INTEGER |
| `total_passes` | INTEGER |
| `total_failures` | INTEGER |
| `flaky_commits` | TEXT (JSON) |
| `last_seen_commit` | TEXT |
| `last_seen_passed` | INTEGER |
| `updated_at` | INTEGER |

---

## tasks

Managed by `src/core/task-manager.ts`. Columns:

| Column | Type |
|---|---|
| `id` | TEXT PK |
| `repo` | TEXT |
| `title` | TEXT |
| `description` | TEXT |
| `status` | TEXT (`pending`, `active`, `waiting`, `completed`, `failed`, `cancelled`) |
| `wait_condition` | TEXT (JSON) |
| `parent_id` | TEXT |
| `metadata` | TEXT (JSON) |
| `result` | TEXT |
| `created_at` | INTEGER |
| `updated_at` | INTEGER |

Wait-condition shape:
```ts
{ type: "event", eventType: string, payloadMatch?: object }
{ type: "task",  taskId: string,    requiredStatus: TaskStatus }
{ type: "schedule", cron: string }
```

---

## metrics

Managed by `src/core/metrics.ts`. Columns:

| Column | Type |
|---|---|
| `name` | TEXT |
| `value` | REAL |
| `labels` | TEXT (JSON) |
| `recorded_at` | INTEGER |

Index: `(name, recorded_at)`. Batched writes flushed every 30 s.

---

## sessions

Managed by `src/core/session.ts`. Columns:

| Column | Type |
|---|---|
| `id` | TEXT PK |
| `started_at` | INTEGER |
| `last_tick_at` | INTEGER |
| `tick_count` | INTEGER |
| `repos` | TEXT (JSON) |
| `config` | TEXT (JSON snapshot) |
| `state` | TEXT (`active`, `stopped`, `crashed`) |
| `stopped_at` | INTEGER |

---

## schedules — JSON, not SQLite

`src/core/scheduler.ts` persists to `~/.vigil/data/schedules.json`. Schema:

```jsonc
{
  "entries": [
    { "id", "name", "cron", "action", "repo?", "createdAt" }
  ],
  "runHistory": [
    { "id", "scheduleId", "firedAt", "status", "error?" }
  ]
}
```

Run history keeps last 200, `getRunHistory()` returns last 50.

## See also

- [Memory Tiers](../concepts/memory-tiers.md) — conceptual layering above the memory tables.
- [Specialists](../subsystems/specialists.md) — how the findings table is populated.
