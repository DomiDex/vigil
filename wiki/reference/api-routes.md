---
title: API Routes
type: reference
updated: 2026-04-19
sources:
  - src/dashboard/server.ts
  - src/dashboard/api/
---

# API Routes

Every route Vigil's `Bun.serve()` exposes. All live on the same port as the dashboard (default 7480). See [Dashboard Backend](../subsystems/dashboard-backend.md) for how they're wired.

Format: `METHOD PATH — purpose — handler in src/dashboard/{server,api/*}.ts`.

## Overview

- `GET /api/overview` — top-line stats (repo count, pending actions, next tick ETA)

## Repos

- `GET /api/repos` — list watched repos + state
- `GET /api/repos/{name}` — single repo detail
- `GET /api/repos/{name}/diff` — git diff payload
- `POST /api/repos` — add a watched repo
- `DELETE /api/repos/{name}` — unwatch

## Timeline

- `GET /api/timeline?decision=&repo=&q=&page=` — VigilMessage history
- `POST /api/timeline/reply` — user reply to an observation

## Dreams

- `GET /api/dreams` — consolidated history + `status.running`
- `GET /api/dreams/patterns/{repo}` — pattern tags
- `POST /api/dreams/trigger` — force consolidation now

## Tasks

- `GET /api/tasks?status=&repo=` — filtered list
- `POST /api/tasks` — create
- `PATCH /api/tasks/{id}` — update
- `PATCH /api/tasks/{id}/activate` — pending → active
- `PATCH /api/tasks/{id}/complete` — + result
- `PATCH /api/tasks/{id}/fail` — + error
- `PATCH /api/tasks/{id}/cancel` — cancel

## Memory

- `GET /api/memory` — tier stats + recent entries
- `GET /api/memory/search?query=&repo=` — FTS5 search
- `POST /api/memory` — manual insert (multipart)
- `DELETE /api/memory/{id}` — remove
- `POST /api/memory/{id}/relevance` — tuning signal
- `POST /api/memory/ask` — Ask Vigil (delegates to `ask-engine.ts`)

## Metrics

- `GET /api/metrics?from=&to=` — bucketed series

## Scheduler

- `GET /api/scheduler` — entries + history
- `POST /api/scheduler` — create
- `DELETE /api/scheduler/{id}` — delete
- `POST /api/scheduler/{id}/trigger` — manual fire

## Actions

- `GET /api/actions?status=` — full history with filter
- `GET /api/actions/pending` — approval queue
- `GET /api/actions/{id}/preview` — dry-run preview (env scrubbed)
- `POST /api/actions/{id}/approve` — pass gate 6
- `POST /api/actions/{id}/reject` — drop

## Specialists

- `GET /api/specialists` — all specialists with stats
- `GET /api/specialists/{name}` — detail
- `POST /api/specialists` — user-defined create
- `PUT /api/specialists/{name}` — update
- `DELETE /api/specialists/{name}` — delete
- `POST /api/specialists/{name}/toggle` — enable/disable
- `POST /api/specialists/{name}/run` — run-now, bypass cooldown
- `GET /api/specialists/findings?specialist=&severity=&repo=&page=` — paginated findings
- `GET /api/specialists/findings/{id}` — detail
- `POST /api/specialists/findings/{id}/dismiss` — optional ignorePattern
- `POST /api/specialists/findings/{id}/action` — create ActionRequest from finding
- `GET /api/specialists/flaky?repo=` — flakiness aggregates
- `POST /api/specialists/flaky/run` — run tests now
- `POST /api/specialists/flaky/reset` — clear stats for a test

## Webhooks

- `GET /api/webhooks/status` — port, counts
- `GET /api/webhooks/events` — event history
- `GET /api/webhooks/events/{id}` — raw payload (50 KB cap)
- `GET /api/webhooks/subscriptions` — list
- `POST /api/webhooks/subscriptions` — create
- `DELETE /api/webhooks/subscriptions/{id}` — delete

## Channels

- `GET /api/channels` — list
- `POST /api/channels` — register
- `DELETE /api/channels/{id}` — remove
- `POST /api/channels/{id}/test` — synthetic message
- `GET /api/channels/{id}/permissions` — ACL snapshot
- `PUT /api/channels/{id}/permissions` — update
- `GET /api/channels/{id}/queue` — in-memory queue

## Health

- `GET /api/health` — process + DB stats
- `POST /api/health/vacuum` — SQLite `VACUUM`
- `POST /api/health/prune` — prune events older than N days

## Config

- `GET /api/config` — full `VigilConfig`
- `PUT /api/config` — update
- `GET /api/config/features` — per-flag diagnose output
- `POST /api/config/features` — toggle (L2 layer)

## Agents

- `GET /api/agents` — available personas
- `GET /api/agents/current` — active persona
- `PATCH /api/agents/current` — switch

## Notifications

- `GET /api/notifications` — config + history
- `POST /api/notifications/test` — send synthetic
- `PUT /api/notifications/rules` — update rules

## A2A

- `GET /api/a2a/status` — server status
- `GET /api/a2a/skills` — registered skills
- `GET /api/a2a/history` — call history

## SSE

- `GET /api/sse` — text/event-stream; see [SSE Events](sse-events.md)

## Plugins

- `GET /api/plugins` — plugin registry (core + user)
- User plugin routes are prefixed: `/api/plugins/{name}/*`.

## See also

- [Server Functions](../dashboard/server-functions.md) — dashboard side.
- [SSE Events](sse-events.md) — realtime complement.
