---
title: Dashboard Backend
type: subsystem
updated: 2026-04-19
sources:
  - src/dashboard/server.ts
  - src/dashboard/plugin-loader.ts
  - src/dashboard/types.ts
  - src/dashboard/api/
---

# Dashboard Backend

`src/dashboard/` is the HTTP surface. A single `Bun.serve()` at port 7480 handles everything — REST, SSE, and the TanStack Start SSR handler — sharing the same process as the daemon.

## server.ts

`startDashboard(daemon, port)` (`src/dashboard/server.ts:*`) returns the running server. It installs:

- Per-subsystem REST handlers under `/api/*`.
- `/api/sse` — `SSEManager.connect()` returns an event stream (see [SSE Events](../reference/sse-events.md)).
- A lazy TanStack Start handler — on first non-API request, dynamically imports `dashboard-v2/dist/server/server.js` and hands the request to it. The handler can access the daemon via `src/dashboard/plugin-loader.ts` module-level context.
- User plugins loaded from `~/.vigil/plugins/` via `plugin-loader.ts`.

Key property: there is **no separate API process**. The dashboard's [server functions](../dashboard/server-functions.md) are HTTP calls back to the same port, and Vite's dev proxy forwards them during local development.

## plugin-loader.ts

`src/dashboard/plugin-loader.ts:1-100+`:

- Scans `~/.vigil/plugins/` at startup.
- Each plugin exports a `PluginManifest` with optional `routes`, `sseEvents`, `queryKeys`.
- Route wiring: plugin routes are prefixed with `/api/plugins/{name}/` to avoid clashes with core.
- Module-level `vigilContext` — set once, consumed by per-request handlers. Same pattern as Next.js `unstable_cache`.

## API handlers

Under `src/dashboard/api/`:

| File | Routes it owns |
|---|---|
| `actions.ts` | `/api/actions/*` — approval queue, preview, approve/reject |
| `dreams.ts` | `/api/dreams/*` — history, patterns, trigger |
| `specialists.ts` | `/api/specialists/*` — configs, findings, flaky, run, toggle |
| `tasks.ts` | `/api/tasks/*` — CRUD + wait condition transitions |
| `memory.ts` (implied) | `/api/memory/*` — stats, search, ask, CRUD |
| `health.ts` (implied) | `/api/health/*` — stats, vacuum, prune |
| `sse.ts` (implied) | `/api/sse` — event stream, `SSEManager` class |

See the full list in [API Routes reference](../reference/api-routes.md).

## types.ts

Defines the `DashboardContext` passed to every handler (the daemon reference, store references, etc.) and common response shapes.

## SSE

`SSEManager` is the pub/sub layer. Every daemon subsystem can call `sseManager.emit('event-name', payload)` and all connected dashboard clients receive it. The React side uses `useSSE()` (`dashboard-v2/src/hooks/use-sse.ts`) to map each event to query keys to invalidate.

This gives real-time UI without polling — the dashboard stays current by listening to exactly the same events the daemon already emits internally.

## Graceful shutdown

`Daemon.stop` calls `dashboardServer.stop()` with a 5s drain window. Active SSE connections are closed with a final `{type: "shutdown"}` event so clients can show a disconnected banner.

## See also

- [Dashboard Stack](../dashboard/stack.md) — the React side.
- [API Routes](../reference/api-routes.md).
- [SSE Events](../reference/sse-events.md).
