---
title: Messaging Subsystem
type: subsystem
updated: 2026-04-19
sources:
  - src/messaging/router.ts
  - src/messaging/schema.ts
  - src/messaging/displayFilter.ts
  - src/messaging/index.ts
  - src/messaging/backends/
  - src/messaging/channels/
  - src/notify/push.ts
---

# Messaging

`src/messaging/` is the fan-out layer for user-visible messages. Every OBSERVE / NOTIFY from the daemon produces a `VigilMessage` routed to one or more delivery channels.

## VigilMessage shape

From `src/messaging/schema.ts:1-62`:

```ts
interface VigilMessage {
  id: string;                 // UUID
  timestamp: string;          // ISO
  source: {
    repo: string;
    branch?: string;
    event?: string;
    agent?: string;
  };
  status: "normal" | "proactive" | "scheduled" | "alert";
  severity: "info" | "warning" | "critical";
  message: string;
  attachments?: unknown[];
  metadata?: Record<string, unknown>;
}
```

`createMessage(partial)` is a helper that fills in `id` and `timestamp` defaults.

## Router

`MessageRouter` (`src/messaging/router.ts:1-95`) extends `EventEmitter`.

- `registerChannel(channel)` adds a `DeliveryChannel` impl.
- `route(msg)` fans out to every enabled channel in parallel, awaits all, emits `'delivered'` with results.
- In-memory circular history (max 1000) is exposed on `/api/timeline`. On startup, seeded from `~/.vigil/data/logs/messages.jsonl` via `readMessagesJsonl` in `daemon.ts:108`.

## Delivery channels

Built-ins:

| Channel | File | Purpose |
|---|---|---|
| Console | `src/messaging/channels/console.ts` | chalk-formatted stdout |
| JSONL | `src/messaging/channels/jsonl.ts` | append to `messages.jsonl` for crash recovery |
| Push (feature-gated) | `src/messaging/channels/push.ts` | Fans out to push backends below |

Push backends (in `src/messaging/backends/`):

- `native.ts` — desktop (notify-send / osascript / powershell).
- `ntfy.ts` — ntfy.sh HTTP publish.

The `VIGIL_PUSH` feature flag gates all of these.

## displayFilter.ts

`src/messaging/displayFilter.ts:1-62` is a subscribable filter used by the console channel in brief mode — it throttles routine OBSERVE output while letting NOTIFY through.

## notify/push.ts — legacy route

`src/notify/push.ts` (`NotificationRouter`) is the pre-messaging-subsystem notification fan-out. It still runs in parallel with the messaging subsystem for two reasons:

1. The dashboard has a separate `/api/notifications` surface with different config (rate limiting, quiet hours).
2. Desktop notifications have a simpler contract than the full `VigilMessage` shape.

Backends:

- `desktop` — `notify-send` / `osascript` / `powershell`.
- `webhook` — POST to `config.webhookUrl` with `{title, message, severity, timestamp}`.
- `file` — appends `~/.vigil/data/notifications/queue.jsonl`.

API: `send()`, `readQueue(limit)`.

## Dashboard surface

- [Timeline plugin](../dashboard/plugins.md#timeline) renders `VigilMessage` history.
- [Notifications plugin](../dashboard/plugins.md#notifications) shows push queue + config (severity threshold, rate limit, quiet hours).

Routes: `/api/timeline`, `/api/timeline/reply`, `/api/notifications`, `/api/notifications/test`, `/api/notifications/rules`.

## See also

- [Channels subsystem](channels.md) — MCP-based channel notifications (different surface).
- [SSE Events reference](../reference/sse-events.md) — how messages reach the UI live.
