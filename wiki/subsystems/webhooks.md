---
title: Webhooks Subsystem
type: subsystem
updated: 2026-04-19
sources:
  - src/webhooks/server.ts
  - src/webhooks/processor.ts
  - src/webhooks/subscriptions.ts
  - plan/kairos-advanced-features-plan.md
---

# Webhooks

`src/webhooks/` (feature flag `VIGIL_WEBHOOKS`, Phase 12) runs a dedicated HTTP receiver for GitHub webhooks, converts payloads into `VigilMessage`s, and exposes a subscription CRUD surface.

## Components

| File | Role |
|---|---|
| `server.ts` | Standalone `Bun.serve()` on `config.webhook.port` (default 7433) |
| `processor.ts` | Event → `VigilMessage` transformation + signature verification |
| `subscriptions.ts` | Persistent per-repo subscriptions (filter events, expiry) |

## Receiver

`WebhookServer` (`src/webhooks/server.ts:1-100+`):

- Listens on `config.webhook.port`.
- Accepts POST on `config.webhook.path` (default `/webhook/github`).
- Verifies `X-Hub-Signature-256` against `config.webhook.secret` (HMAC-SHA256).
- Filters by `config.webhook.allowedEvents` (default `pull_request`, `pull_request_review`, `push`, `issues`, `issue_comment`).
- Passes accepted events to `WebhookProcessor.process(event, payload)`.

Graceful shutdown on daemon stop.

## Processor

`WebhookProcessor` (`src/webhooks/processor.ts:1-100+`):

- Maps GitHub event types → `VigilMessage.source.event`.
- Extracts repo name and matches against the subscription store.
- Builds the message, routes via the `MessageRouter`.
- Records raw event for the [Webhooks plugin](../dashboard/plugins.md#webhooks) event-history view.

## Subscriptions

`SubscriptionManager` (`src/webhooks/subscriptions.ts:1-100+`):

- Persistent — stored in SQLite via the shared store.
- Per-subscription: `repo`, `eventTypes[]`, optional expiry.
- CRUD from the dashboard; lifecycle is `create` / `delete`.

## Dashboard surface

[Webhooks plugin](../dashboard/plugins.md#webhooks) renders:

- Status card (port, events received, errors).
- Subscription list with create/delete.
- Event history (expandable, payload truncated to 50 KB).

API: `/api/webhooks`, `/api/webhooks/subscriptions`, `/api/webhooks/events`. See [API Routes](../reference/api-routes.md#webhooks).

## Status

Shipped Phase 12. Port 7433 is separate from the dashboard port 7480 so GitHub can hit the webhook without exposing the dashboard. Only GitHub is supported — no GitLab/Bitbucket adapters yet.
