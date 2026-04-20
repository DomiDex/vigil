---
title: Channels Subsystem
type: subsystem
updated: 2026-04-19
sources:
  - src/channels/handler.ts
  - src/channels/permissions.ts
  - src/channels/gate.ts
  - src/channels/schema.ts
  - src/channels/index.ts
  - plan/kairos-advanced-features-plan.md
---

# Channels

`src/channels/` (feature flag `VIGIL_CHANNELS`, Phase 11) provides MCP-style named channels for notification delivery. A channel is a named endpoint (e.g. a team Slack, a project-specific Telegram bot) with typed permissions.

This is distinct from the [messaging subsystem](messaging.md) — messaging handles the `VigilMessage` → delivery fan-out; channels is the *addressable* delivery surface that richer integrations can target.

## Components

| File | Role |
|---|---|
| `schema.ts` | Zod schemas for channel config, message payloads |
| `handler.ts` | Channel registry — register / lookup / dispatch |
| `permissions.ts` | Per-channel ACL (who can send, what severities, rate limits) |
| `gate.ts` | Allowlist + session-channels check (L5 + L6 gating) |
| `index.ts` | Public re-exports |

## Gate layers

From `config.channels` (`src/core/config.ts`):

- **Enabled flag** — `config.channels.enabled`.
- **Session channels** — `config.channels.sessionChannels[]` declares what channels this run may use (gate 5).
- **Allowlist** — `config.channels.allowlist[]` approved channel server names (gate 6).
- **Dev mode** — bypasses the allowlist for local development.

The build-time `VIGIL_CHANNELS` flag is L1 on top of all of this.

## Permissions

`src/channels/permissions.ts:1-100+` — `ChannelPermissionManager` maps channel id → permissions:

- `minSeverity` — drop messages below threshold.
- `rateLimitPerHour` — hard cap.
- `allowedEvents` — only route messages whose event type is in this list.
- `quietHours` — suppress during configured window.

Stored persistently so dashboard edits survive restarts.

## Handler

`src/channels/handler.ts:1-100+` implements the `ChannelHandler`:

- `register(name, config)` — add a channel.
- `dispatch(message)` — find all registered channels matching message source, check permissions, enqueue delivery.
- `queue` — per-channel in-memory queue exposed on `/api/channels/{id}/queue`.
- `test(name)` — send a synthetic message to verify delivery.

## Dashboard surface

[Channels plugin](../dashboard/plugins.md#channels):

- Cards per channel: type badge, status color, queue depth, permission chips.
- `ChannelPermissionSheet` edits the ACL.
- Mutations: `deleteChannel`, `testChannel`, `updateChannelPermissions`.

API routes: `/api/channels`, `/api/channels/{id}/permissions`, `/api/channels/{id}/queue`, `/api/channels/{id}/test`. See [API Routes](../reference/api-routes.md#channels).

## Status

Shipped as Phase 11, still relatively thin. The dashboard plugin is in place; backend integrations (Telegram, Slack, Discord) are enumerated under [ClaudeClaw roadmap](../roadmap/claudeclaw.md#channel-expansion) but not yet implemented as concrete backends beyond `native` and `ntfy`.
