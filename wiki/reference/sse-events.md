---
title: SSE Events
type: reference
updated: 2026-04-19
sources:
  - src/dashboard/server.ts
  - dashboard-v2/src/hooks/use-sse.ts
---

# SSE Events

`GET /api/sse` emits a `text/event-stream` that every connected dashboard subscribes to. On the React side, `src/hooks/use-sse.ts` invalidates the corresponding React Query keys on each event — that's how the UI stays live without polling.

## Event taxonomy

| Event | Emitted when | Client invalidates |
|---|---|---|
| `tick` | Every tick completes | `overview`, `repos.all`, `timeline` |
| `message` | A `VigilMessage` is routed | `timeline` |
| `decision` | DecisionEngine returns a result | `timeline`, `metrics` |
| `action` | Any ActionRequest status change | `actions.all` |
| `action_pending` | New request queued | `actions.pending`, `actions.all` |
| `dream` | Dream starts / finishes | `dreams`, `memory.stats` |
| `state_change` | Daemon state transitions (sleeping, paused, etc.) | `overview` |
| `config_changed` | Config hot-reload fired | `config.all` |
| `task_updated` | Task CRUD or status change | `tasks` |
| `schedule_fired` | Cron trigger fired | `scheduler` |
| `webhook` | Webhook event processed | `webhooks.all` |
| `channel` | Channel registered / updated / test sent | `channels.all` |
| `health` | Periodic health sample | `health` |
| `specialist_finding` | New finding persisted | `specialists.all`, findings |
| `specialist_run` | Specialist started/finished | `specialists.all` |
| `flaky_update` | Flaky-test stats updated | `specialists.flaky` |

## Payload

All events use this envelope:

```ts
event: <eventName>
data: { "type": "<eventName>", "repo"?: "...", ...additional }
```

Most payloads are small metadata — the client refetches the canonical data via the REST endpoint, so the SSE channel stays cheap.

## Connection lifecycle

`use-sse.ts:27-65`:

- Opens `EventSource('/api/sse')`.
- Retries with exponential backoff up to 30 s.
- Calls `close()` on unmount.
- Emits a final `{type: "shutdown"}` from the server on graceful daemon stop.

## Emitter side

`SSEManager` in `src/dashboard/api/sse.ts` (implied, referenced from `server.ts`). Every subsystem can call `sseManager.emit(type, payload)`. Common emitters:

- `TickEngine` → `tick` at the end of each tick.
- `DecisionEngine` → `decision` after parsing.
- `MessageRouter` → `message` on fan-out.
- `ActionExecutor` → `action` / `action_pending` on lifecycle.
- `DreamWorker` → `dream` at start + finish.
- `TaskManager` → `task_updated` on CRUD.
- `Scheduler` → `schedule_fired`.
- `HealthStore` → `health` every N seconds.
- `SpecialistRunner` → `specialist_run` + `specialist_finding`.
- `FlakyTestDetector` → `flaky_update`.
- `FeatureGates` → `config_changed` after reload.
- `WebhookProcessor` → `webhook`.
- `ChannelHandler` → `channel`.

## See also

- [Routing & SSE](../dashboard/routing.md) — React integration.
- [Dashboard Backend](../subsystems/dashboard-backend.md) — server integration.
