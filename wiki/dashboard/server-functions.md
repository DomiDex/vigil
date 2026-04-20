---
title: Server Functions (RPC surface)
type: reference
updated: 2026-04-19
sources:
  - dashboard-v2/src/server/functions.ts
  - dashboard-v2/src/server/vigil-context.ts
---

# Server Functions

Every read and write from the dashboard goes through a server function in `dashboard-v2/src/server/functions.ts`. They're thin `fetch` wrappers around the daemon's `/api/*` routes, exposed as TanStack Start `createServerFn` calls so React components can use them directly without importing `fetch`.

## Reads

| Function | HTTP | Notes |
|---|---|---|
| `getOverview()` | GET `/api/overview` | Top-line stats for the home page |
| `getRepos()` | GET `/api/repos` | All watched repos |
| `getRepoDetail({data:{name}})` | GET `/api/repos/{name}` | Full state for one repo |
| `getRepoDiff({data:{name}})` | GET `/api/repos/{name}/diff` | git diff viewer payload |
| `getTimeline({data:{decision?, repo?, q?, page?}})` | GET `/api/timeline?…` | Message history with filters |
| `getDreams()` | GET `/api/dreams` | History + `status.running` flag |
| `getDreamPatterns({data:{repo}})` | GET `/api/dreams/patterns/{repo}` | Pattern tags |
| `getTasks({data:{status?, repo?}})` | GET `/api/tasks?…` | Filtered task list |
| `getActions({data:{status?}})` | GET `/api/actions?…` | Action history |
| `getActionsPending()` | GET `/api/actions/pending` | Approval queue |
| `getActionPreview({data:{id}})` | GET `/api/actions/{id}/preview` | Dry-run preview |
| `getMemory()` | GET `/api/memory` | Tier stats + recent |
| `searchMemory({data:{query, repo?}})` | GET `/api/memory/search?…` | FTS5 |
| `updateMemoryRelevance({id, data:{relevant}})` | POST `/api/memory/{id}/relevance` | Tuning signal |
| `getMetrics({from?, to?})` | GET `/api/metrics?…` | Bucketed series |
| `getScheduler()` | GET `/api/scheduler` | Schedules + run history |
| `getConfig()` | GET `/api/config` | Full VigilConfig |
| `getFeatureGates()` | GET `/api/config/features` | Diagnose output per flag |
| `getWebhookEvents()` | GET `/api/webhooks/events` | — |
| `getWebhookSubscriptions()` | GET `/api/webhooks/subscriptions` | — |
| `getWebhookStatus()` | GET `/api/webhooks/status` | Port, counts |
| `getWebhookEventDetail({data:{id}})` | GET `/api/webhooks/events/{id}` | Raw payload |
| `getChannels()` | GET `/api/channels` | — |
| `getChannelPermissions({data:{id}})` | GET `/api/channels/{id}/permissions` | — |
| `getChannelQueue({data:{id}})` | GET `/api/channels/{id}/queue` | — |
| `getNotifications()` | GET `/api/notifications` | Config + history |
| `getAgents()` | GET `/api/agents` | Available agents |
| `getCurrentAgent()` | GET `/api/agents/current` | Active agent |
| `getHealth()` | GET `/api/health` | Process + DB stats |
| `getSpecialists()` | GET `/api/specialists` | All specialists with stats |
| `getSpecialistDetail({data:{name}})` | GET `/api/specialists/{name}` | — |
| `getSpecialistFindings({data:{specialist?, severity?, repo?, page?}})` | GET `/api/specialists/findings?…` | Paginated |
| `getSpecialistFindingDetail({data:{id}})` | GET `/api/specialists/findings/{id}` | — |
| `getFlakyTests({data:{repo?}})` | GET `/api/specialists/flaky?…` | Flakiness aggregates |
| `getA2AStatus()` | GET `/api/a2a/status` | Port, connections |
| `getA2ASkills()` | GET `/api/a2a/skills` | Registered skills |
| `getA2AHistory()` | GET `/api/a2a/history` | Call log |

## Mutations

| Function | HTTP | Purpose |
|---|---|---|
| `addRepo({data:{path}})` | POST `/api/repos` | Add a watched repo |
| `removeRepo({data:{name}})` | DELETE `/api/repos/{name}` | Unwatch |
| `triggerDream({data:{repo?}})` | POST `/api/dreams/trigger` | Force consolidation |
| `createTask({data:{title, description?, repo?}})` | POST `/api/tasks` | — |
| `activateTask({data:{id}})` | PATCH `/api/tasks/{id}/activate` | — |
| `completeTask({data:{id, result?}})` | PATCH `/api/tasks/{id}/complete` | — |
| `failTask({data:{id, error}})` | PATCH `/api/tasks/{id}/fail` | — |
| `updateTask({data:{id, ...}})` | PATCH `/api/tasks/{id}` | — |
| `cancelTask({data:{id}})` | PATCH `/api/tasks/{id}/cancel` | — |
| `approveAction({data:{id}})` | POST `/api/actions/{id}/approve` | Gate 6 pass |
| `rejectAction({data:{id}})` | POST `/api/actions/{id}/reject` | — |
| `askVigil({data:{question, repo?}})` | POST `/api/memory/ask` | Delegates to `ask-engine.ts` |
| `createMemory({data:FormData})` | POST `/api/memory` | Manual insert |
| `deleteMemory({id})` | DELETE `/api/memory/{id}` | — |
| `createSchedule({data:{name, cron, action, repo?}})` | POST `/api/scheduler` | — |
| `deleteSchedule({data:{id}})` | DELETE `/api/scheduler/{id}` | — |
| `triggerSchedule({data:{id}})` | POST `/api/scheduler/{id}/trigger` | Manual fire |
| `updateConfig({data:Record})` | PUT `/api/config` | Full-config PUT |
| `toggleFeatureGate({data:{name, enabled}})` | POST `/api/config/features` | L2 only |
| `registerChannel({data:{name, type, config?}})` | POST `/api/channels` | — |
| `deleteChannel({data:{id}})` | DELETE `/api/channels/{id}` | — |
| `testChannel({data:{id}})` | POST `/api/channels/{id}/test` | Synthetic message |
| `updateChannelPermissions({data:{id, perms}})` | PUT `/api/channels/{id}/permissions` | — |
| `testNotification()` | POST `/api/notifications/test` | — |
| `updateNotificationRules({data})` | PUT `/api/notifications/rules` | — |
| `switchAgent({data:{agentName}})` | PATCH `/api/agents/current` | Change active persona |
| `vacuumDatabase()` | POST `/api/health/vacuum` | SQLite VACUUM |
| `pruneEvents({data:{olderThanDays}})` | POST `/api/health/prune` | — |
| `createSpecialist({data:{name, class, description, model?, triggerEvents, watchPatterns?, systemPrompt?, cooldownSeconds?, severityThreshold?}})` | POST `/api/specialists` | User-defined agent |
| `updateSpecialist({data:{name, …}})` | PUT `/api/specialists/{name}` | — |
| `deleteSpecialist({data:{name}})` | DELETE `/api/specialists/{name}` | — |
| `toggleSpecialist({data:{name, enabled}})` | POST `/api/specialists/{name}/toggle` | — |
| `runSpecialist({data:{name, repo?}})` | POST `/api/specialists/{name}/run` | Run-now |
| `dismissFinding({data:{id, ignorePattern?}})` | POST `/api/specialists/findings/{id}/dismiss` | Optional ignore |
| `createActionFromFinding({data:{id, command?, args?, reason?}})` | POST `/api/specialists/findings/{id}/action` | Create ActionRequest |
| `runFlakyTests({data:{repo}})` | POST `/api/specialists/flaky/run` | — |
| `resetFlakyTest({data:{repo, testName}})` | POST `/api/specialists/flaky/reset` | — |
| `createWebhookSubscription({data:{repo, eventTypes, expiry?}})` | POST `/api/webhooks/subscriptions` | — |
| `deleteWebhookSubscription({data:{id}})` | DELETE `/api/webhooks/subscriptions/{id}` | — |

## VigilContext

`src/server/vigil-context.ts` is a tiny module that sets the base URL for server-side calls (it differs between dev proxy, SSR, and client). Everything ultimately goes through `fetch(`${baseURL}/api/...`)`.

## Patterns

- All mutations invalidate related query keys via `useSSE` rather than optimistic refetch on success — the single source of truth is the daemon emitting an SSE event when the mutation lands.
- Every function accepts `{ data: ... }` (not positional args) to match TanStack Start's `createServerFn` contract.
- Failures throw — React Query catches and surfaces via `error` state.

## See also

- [API Routes reference](../reference/api-routes.md) — the route side.
- [SSE Events reference](../reference/sse-events.md) — what invalidates what.
