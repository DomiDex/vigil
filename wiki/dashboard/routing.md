---
title: Routing & SSE
type: reference
updated: 2026-04-19
sources:
  - dashboard-v2/src/routes/
  - dashboard-v2/src/routeTree.gen.ts
  - dashboard-v2/src/hooks/use-sse.ts
  - dashboard-v2/src/hooks/use-mobile.ts
---

# Routing & SSE

File-based routing via TanStack Router. Route files under `src/routes/`, auto-generated tree at `src/routeTree.gen.ts`. Each route lazy-loads its plugin page via `lazyRouteComponent(...)`.

## Route table

| Path | File | Component |
|---|---|---|
| `/` | `index.tsx` | `OverviewPage` |
| `/timeline` | `timeline.tsx` | `TimelinePage` |
| `/repos` | `repos.tsx` | `ReposPage` |
| `/dreams` | `dreams.tsx` | `DreamsPage` |
| `/tasks` | `tasks.tsx` | `TasksPage` |
| `/actions` | `actions.tsx` | `ActionsPage` |
| `/memory` | `memory.tsx` | `MemoryPage` |
| `/metrics` | `metrics.tsx` | `MetricsPage` |
| `/scheduler` | `scheduler.tsx` | `SchedulerPage` |
| `/config` | `config.tsx` | `ConfigPage` |
| `/agents` | `agents.tsx` | `AgentsPage` (4 tabs) |
| `/health` | `health.tsx` | `HealthPage` |
| `/webhooks` | `webhooks.tsx` | `WebhooksPage` |
| `/channels` | `channels.tsx` | `ChannelsPage` |
| `/notifications` | `notifications.tsx` | `NotificationsPage` |
| `/a2a` | `a2a.tsx` | `A2APage` |

Root is `src/routes/__root.tsx` — see [Stack](stack.md#root-layout) for the layout tree.

## SSE hook

`src/hooks/use-sse.ts:27-65` exposes `useSSE()` called once in the root layout. It:

1. Opens a single `EventSource('/api/sse')`.
2. For each message, looks up the event type in `SSE_EVENT_MAP`.
3. Calls `queryClient.invalidateQueries(...)` for each key in that mapping.
4. Retries with exponential backoff (capped 30 s) on error.
5. Closes cleanly on unmount.

### SSE_EVENT_MAP

`src/hooks/use-sse.ts:5-25` — event → query-keys to invalidate:

| Event | Invalidates |
|---|---|
| `tick` | `overview`, `repos.all`, `timeline` |
| `message` | `timeline` |
| `decision` | `timeline`, `metrics` |
| `action` | `actions.all` |
| `action_pending` | `actions.pending`, `actions.all` |
| `dream` | `dreams`, `memory.stats` |
| `state_change` | `overview` |
| `config_changed` | `config.all` |
| `task_updated` | `tasks` |
| `schedule_fired` | `scheduler` |
| `webhook` | `webhooks.all` |
| `channel` | `channels.all` |
| `health` | `health` |
| `specialist_finding` | `specialists.all`, `specialists.findings` |
| `specialist_run` | `specialists.all` |
| `flaky_update` | `specialists.flaky` |

This is the core pattern: the daemon emits *one* well-named event when something changes, and every subscribed React Query entry refetches automatically. No manual refetch calls scattered through the UI.

## useIsMobile hook

`src/hooks/use-mobile.ts:1-20` — 768 px breakpoint, re-queries on resize via `MediaQueryList.addEventListener`. Used by the sidebar to auto-collapse on mobile.

## See also

- [Plugins](plugins.md) — what each route actually renders.
- [SSE Events reference](../reference/sse-events.md) — backend side of the event taxonomy.
- [Server Functions](server-functions.md) — query-keys catalog.
