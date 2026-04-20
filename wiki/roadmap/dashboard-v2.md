---
title: Dashboard v2 Roadmap
type: roadmap
updated: 2026-04-19
sources:
  - plan/big-plan.md
  - plan/vigil-dashboard-plan.md
  - plan/vigil-dashboard-v2-spec.md
  - plan/phase-0.md … plan/phase-7.md
---

# Dashboard v2 Roadmap

Replace the HTMX dashboard with a React 19 + TanStack Start plugin-extensible frontend served from the **same** Bun.serve port as the backend (7480). Eight phases.

## Phase 0 — Validation spike [shipped]
**~3–4 h.** Prove the three bets:
- TanStack Start SSR handler embeds cleanly inside `Bun.serve()`.
- Tailwind v4 `@theme` tokens work in this setup.
- shadcn/ui renders end-to-end.

Status JSON: `phase-0-status.json`.

## Phase 1 — Scaffold [shipped]
**~4 h.**
- File-based routes under `src/routes/`.
- Server functions in `src/server/functions.ts` wrapping `/api/*`.
- Query-key factory in `src/lib/query-keys.ts`.
- Dev proxy (`/api/*` → 7480).
- Initial shadcn component set copied into `src/components/ui/`.

## Phase 2 — Shell layout [shipped]
**~5 h.**
- `AppShell` with sidebar, header, main outlet, command palette.
- Theme toggle, breadcrumbs, next-tick countdown.
- `useSSE()` hook wired in `__root.tsx`.
- `routeLabels` map for breadcrumb titles.

## Phase 3 — Plugin system + Timeline [PR open]
**~4 h.** Status JSON: `phase-3-status.json`.
- `PluginWidget` interface + registry at `src/plugins/index.ts`.
- Dynamic tab rendering in `AppSidebar` filtered by slot + order.
- Timeline plugin proves the pattern end-to-end (queries, SSE, filters, reply).
- `GET /api/plugins` endpoint.

## Phase 4 — Port core plugins [in-flight]
**~12 h.** Port from HTMX:
- Repos, Dreams, Tasks, Actions, Memory, Scheduler, Metrics, plus Overview.
- Most of these are landed in `src/plugins/*/` already.

## Phase 5 — New core plugins [in-flight]
**~16 h.** Require new API endpoints:
- **Config** — VigilConfig editor + feature-gate toggles (uses `/api/config`, `/api/config/features`).
- **Webhooks** — event feed, subscription CRUD (uses `/api/webhooks/*`).
- **Channels** — MCP channel manager + permissions (`/api/channels/*`).
- **Notifications** — push queue + test (`/api/notifications/*`).
- **A2A** — server status sidebar (`/api/a2a/*`).

## Phase 6 — User plugin support [aspirational]
**~4 h.**
- Scan `~/.vigil/plugins/` at startup via `src/dashboard/plugin-loader.ts`.
- Lazy-load; sandbox rendering inside `ErrorBoundary`.
- Route prefix `/api/plugins/{name}/*` for user API routes.

## Phase 7 — Remove HTMX legacy [aspirational]
**~2 h.**
- Delete remaining fragment endpoints, vendor files, old CSS.
- Final cutover.

## Plugin inventory

See [Dashboard Plugins](../dashboard/plugins.md). 16 core plugins as of 2026-04-19, ordered by `.order` across `tab` slot:

```
-1 overview   70 scheduler   90 channels
 0 timeline   75 config      92 notifications
10 repos      80 agents      93 a2a
20 dreams     85 health
30 tasks      88 webhooks
40 actions
50 memory
60 metrics
```

## Key architectural decisions

- **Single port** (7480) — no separate API server. Vite dev proxies in development.
- **Server functions** are `fetch` wrappers — transparent network layer.
- **SSE → Query Key invalidation** — no polling, no manual refetch scattering.
- **Plugin architecture** — everything, including core features, is a plugin. See [vigil-dashboard-v2-spec.md](../../plan/vigil-dashboard-v2-spec.md).
- **Copied, not depended** — shadcn components live in `src/components/ui/` so we own them. Radix UI is the peer dep.

## See also

- [Dashboard Stack](../dashboard/stack.md)
- [Plugins Catalog](../dashboard/plugins.md)
- [Project Status](status.md)
