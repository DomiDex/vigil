# Phase 5 — New Core Plugins

---
duration: ~16 hours
depends_on: Phase 3 (Plugin System — plugin registry and PluginSlot proven)
blocks: nothing directly (Phase 7 waits for Phase 4 not 5)
risk: MEDIUM — backend API additions are straightforward (wrapping existing daemon internals), but 8 tasks across backend + frontend is high volume
stack: typescript
runner: single-agent (tasks mostly parallelizable, except 5.1->5.2 sequential)
---

## 1. Objective + What Success Looks Like

**Objective**: Extend the dashboard with 7 new plugin tabs (Config, Webhooks, Channels, Notifications, Agent Identity, System Health, A2A) by adding new backend API endpoints in `src/dashboard/api/` and corresponding React plugin pages in `dashboard-v2/src/`. Each plugin follows the registry+PluginSlot pattern established in Phase 3 and uses TanStack Query for data fetching.

**Observable success conditions**:

1. `GET /api/config` returns a JSON object with all daemon configuration fields (tickInterval, sleepAfter, sleepInterval, dreamAfter, blockingBudget, eventWindow, tickModel, escalationModel, actionGates, notificationBackends, actionAllowlist)
2. `PUT /api/config` accepts a partial config update, validates with Zod, persists to `~/.vigil/config.json`, and hot-reloads the running daemon
3. `GET /api/config/features` returns an array of feature gates with per-layer diagnostic info (build, config, runtime, session)
4. `PATCH /api/config/features/:name` toggles a feature gate's config layer and persists the change
5. The Config plugin page renders tick setting sliders, model dropdowns, feature gate table with toggle switches, action gate controls, and Save/Reset buttons
6. `GET /api/webhooks/events` returns recent webhook events; `GET /api/webhooks/subscriptions` returns active subscriptions; `POST` creates and `DELETE` removes subscriptions; `GET /api/webhooks/status` returns server health
7. The Webhooks plugin page renders a server status bar, subscriptions table with add/remove, filterable event log, and health stats
8. `GET /api/channels` returns registered MCP channels; `POST` registers and `DELETE` unregisters; `GET /api/channels/:id/permissions` returns 5-gate results; `GET /api/channels/:id/queue` returns pending messages
9. The Channels plugin page renders channel list with status, expandable permission detail, message queue, and register/unregister forms
10. `GET /api/notifications` returns recent notification deliveries; `POST /api/notifications/test` sends a test notification; `PATCH /api/notifications/rules` updates and persists push rules
11. The Notifications plugin page renders config controls (enabled toggle, severity selector, rate limits, quiet hours, Save + Test buttons) and a notification history table
12. `GET /api/agents` returns all agent definitions scanned from `.claude/agents/`; `GET /api/agents/current` returns the active persona; `PATCH /api/agents/current` switches persona and restarts the decision engine
13. The Agents plugin page renders the current agent card, available agents list with switch buttons, and a collapsible system prompt preview
14. `GET /api/health` returns process stats (Bun version, PID, uptime, memory), database sizes, recent errors, and a 24-hour uptime timeline
15. The Health plugin page renders process info, memory bars, database size table, uptime timeline strip (green/gray/red), and error log table
16. `GET /api/a2a/status` returns A2A server state; `GET /api/a2a/skills` returns agent card skills; `GET /api/a2a/history` returns RPC call history with method, status, latency, and tokens
17. The A2A plugin page renders server status bar, agent card display, message log table, and aggregate stats
18. All 7 new plugins appear in the sidebar navigation and are registered in the plugin registry with correct icons, order values, and feature gates where applicable
19. SSE events for `webhook` and `channel` are broadcast when relevant state changes and the corresponding plugin pages update in real time

---

## 2. Key Design Decisions

### Backend API pattern

All new API modules follow the established pattern in `src/dashboard/api/`:

| Aspect | Decision | Rationale |
|---|---|---|
| Module shape | Export named functions that accept `DashboardContext` and return plain objects | Matches existing `getOverviewJSON(ctx)`, `getDreamsJSON(ctx)` pattern |
| Route wiring | Add `if (path === "/api/...") { ... }` blocks in `src/dashboard/server.ts` `fetch` handler | Consistent with current routing (no router library) |
| Validation | Zod schemas for all mutation inputs (`PUT /api/config`, `POST /api/webhooks/subscriptions`, etc.) | Already in the stack via dashboard-v2 dependencies |
| Error handling | Return `Response.json({ error: string }, { status: 4xx })` | Matches existing patterns in actions/tasks handlers |
| JSON responses | `Response.json(data)` for all read endpoints | Standard Bun.serve pattern |

### Server function layer

Each new backend endpoint also gets a corresponding TanStack Start server function in `dashboard-v2/src/server/functions.ts` that wraps the fetch call. This allows route loaders and mutations to go through the server function layer established in Phase 0.

```typescript
// Pattern for read endpoints
export const getConfig = createServerFn({ method: "GET" })
  .handler(async () => {
    const ctx = getVigilContext();
    return getConfigJSON(ctx);
  });

// Pattern for mutation endpoints
export const updateConfig = createServerFn({ method: "POST" })
  .inputValidator(configUpdateSchema)
  .handler(async ({ data }) => {
    const ctx = getVigilContext();
    return handleConfigUpdate(ctx, data);
  });
```

### Query key factory

Query keys for all 7 plugins are already defined in `dashboard-v2/src/lib/query-keys.ts` from Phase 1:

```typescript
config: ["config"] as const,
agents: { all: ["agents"] as const, current: ["agents", "current"] as const },
health: ["health"] as const,
webhooks: ["webhooks"] as const,
channels: ["channels"] as const,
notifications: ["notifications"] as const,
a2a: ["a2a"] as const,
```

### Feature gates

Two plugins are gated behind feature flags:
- **Agents** plugin: `featureGate: "VIGIL_AGENT_IDENTITY"` (agent persona system is optional)
- **A2A** plugin: `featureGate: "VIGIL_A2A"` (A2A server is optional)

All other plugins are always visible (Config, Webhooks, Channels, Notifications, Health).

### Plugin registration order

Plugins use `order` values that place them after the Phase 4 core plugins (which occupy 10-70):

| Plugin | Order | Icon (Lucide) |
|---|---|---|
| Config | 75 | Settings |
| Agents | 80 | Bot |
| Health | 85 | HeartPulse |
| Webhooks | 88 | Webhook |
| Channels | 90 | Radio |
| Notifications | 92 | Bell |
| A2A | 93 | Network |

### Data model (TypeScript)

All API response types use `interface` for object shapes. Zod schemas validate mutation inputs. Union types use `type`. No `class` — all data is plain serializable objects.

---

## 3. Tasks

### Task 5.1 — Config API endpoints (~1.5 hr)

**Depends on**: Phase 3 complete (plugin registry exists), existing `src/dashboard/server.ts` routing
**Completion condition**: All 4 config routes return correct JSON when called via curl

**New file**: `src/dashboard/api/config.ts`

Handlers to implement:
- `getConfigJSON(ctx)` — read tickInterval, sleepAfter, sleepInterval, dreamAfter, blockingBudget, eventWindow, tickModel, escalationModel, actionGates (from `ctx.daemon.actionExecutor.getGateConfig()`), notificationBackends, actionAllowlist
- `handleConfigUpdate(ctx, body)` — Zod-validate partial config, merge with current, persist to `~/.vigil/config.json`, call `watchConfig()` for hot-reload
- `getFeatureGatesJSON(ctx)` — iterate `FEATURES` registry, call `gates.isEnabled(name)` and `gates.diagnose(name)` for each, return array with key, name, enabled, layers (build/config/runtime/session)
- `handleFeatureToggle(ctx, featureName, enabled)` — toggle config-layer gate, persist

**Routes added to server.ts**:
```
GET   /api/config                  -> getConfigJSON
PUT   /api/config                  -> handleConfigUpdate
GET   /api/config/features         -> getFeatureGatesJSON
PATCH /api/config/features/:name   -> handleFeatureToggle
```

**Server functions added to dashboard-v2**: `getConfig`, `updateConfig`, `getFeatureGates`, `toggleFeatureGate`

---

### Task 5.2 — Config plugin frontend (~2 hr)

**Depends on**: Task 5.1 (config API must exist)
**Completion condition**: Config page renders all sections, sliders update values, Save persists changes, feature gate toggles work

**New files**:
- `dashboard-v2/src/plugins/config/ConfigPage.tsx`
- `dashboard-v2/src/routes/config.tsx`

**UI sections**:
1. **Tick settings**: Slider inputs for tickInterval (5-300s), sleepAfter (60-3600s), sleepInterval (30-600s), dreamAfter (300-7200s), blockingBudget (1-30s), eventWindow (10-200). Each shows current value + unit label.
2. **Model selection**: Dropdowns for tickModel and escalationModel (haiku, sonnet, opus options).
3. **Feature gates table**: Rows from `GET /api/config/features`. Columns: Feature name, Build (check/cross icon), Config (check/cross icon), Runtime (check/cross icon), Session (check/cross icon), Status (ON green / OFF red toggle). Toggle calls `PATCH /api/config/features/:name`.
4. **Action gates**: Enabled toggle, auto-approve toggle, confidence threshold slider (0.0-1.0 step 0.05), allowed repos list (editable tags), allowed actions checkboxes (git_stash, run_tests, run_lint, etc.).
5. **Notification backends**: Read-only display of configured backends (desktop/webhook/file) with backend-specific config.
6. **Footer**: "Save Config" button (calls `PUT /api/config` with all modified fields), "Reset Defaults" button (loads DEFAULT_CONFIG values into form).

**Plugin manifest entry**:
```typescript
{
  id: "config",
  label: "Config",
  icon: "Settings",
  slot: "tab",
  order: 75,
  component: () => import("./config/ConfigPage"),
}
```

---

### Task 5.3 — Webhooks API + plugin (~2 hr backend, ~2 hr frontend)

**Depends on**: Phase 3 complete
**Completion condition**: All 5 webhook routes return correct JSON; plugin page renders subscriptions, event log, and health stats; SSE `webhook` events appear in real time

**New file (backend)**: `src/dashboard/api/webhooks.ts`

Routes:
```
GET    /api/webhooks/events              -> recent webhook events from WebhookProcessor
GET    /api/webhooks/subscriptions       -> active subscriptions from SubscriptionManager
POST   /api/webhooks/subscriptions       -> add subscription (Zod: repo, eventTypes[], expiry?)
DELETE /api/webhooks/subscriptions/:id   -> remove subscription
GET    /api/webhooks/status              -> server health, HMAC validation stats
```

**SSE addition**: Broadcast `webhook` event type from SSEManager when webhooks are received.

**New files (frontend)**:
- `dashboard-v2/src/plugins/webhooks/WebhooksPage.tsx`
- `dashboard-v2/src/routes/webhooks.tsx`

**UI sections**:
1. **Server status bar**: Port, webhook path, running status indicator, allowed events list
2. **Subscriptions table**: Repo, PR# (if PR-specific), event types, expiry (relative countdown or "never"), unsubscribe button. Add subscription form in shadcn `<Dialog>`.
3. **Event log table**: Time, event type (push/PR/issues/review), repo, action, status (processed/error). Filterable by event type dropdown.
4. **Health stats**: Events received count, errors count, signature failures count, last event time (relative), avg processing time.

**Plugin manifest entry**:
```typescript
{
  id: "webhooks",
  label: "Webhooks",
  icon: "Webhook",
  slot: "tab",
  order: 88,
  component: () => import("./webhooks/WebhooksPage"),
}
```

---

### Task 5.4 — Channels API + plugin (~2 hr)

**Depends on**: Phase 3 complete
**Completion condition**: All 5 channel routes return correct JSON; plugin page renders channel list, permission detail, and message queue; SSE `channel` events appear in real time

**New file (backend)**: `src/dashboard/api/channels.ts`

Routes:
```
GET    /api/channels                   -> registered MCP channels
POST   /api/channels                   -> register channel (Zod: name, type, config)
DELETE /api/channels/:id               -> unregister
GET    /api/channels/:id/permissions   -> 5-gate permission results
GET    /api/channels/:id/queue         -> pending messages
```

**SSE addition**: Broadcast `channel` event type from SSEManager on channel state changes.

**New files (frontend)**:
- `dashboard-v2/src/plugins/channels/ChannelsPage.tsx`
- `dashboard-v2/src/routes/channels.tsx`

**UI sections**:
1. **Channel list**: Name, type, status badge, message queue depth, permissions summary (pass/fail count)
2. **Permission detail** (expandable row or sheet): 5-gate results per channel displayed similarly to action gates
3. **Message queue** per channel: Pending messages table with delivery status
4. **Register/unregister**: Register form in `<Dialog>`, unregister button with confirmation

**Plugin manifest entry**:
```typescript
{
  id: "channels",
  label: "Channels",
  icon: "Radio",
  slot: "tab",
  order: 90,
  component: () => import("./channels/ChannelsPage"),
}
```

---

### Task 5.5 — Notifications API + plugin (~2 hr)

**Depends on**: Phase 3 complete
**Completion condition**: All 3 notification routes return correct JSON; plugin page renders config form, history table, and rate limit status; test notification sends successfully

**New file (backend)**: `src/dashboard/api/notifications.ts`

Routes:
```
GET   /api/notifications        -> recent notification deliveries with full detail
POST  /api/notifications/test   -> send test notification via configured backend
PATCH /api/notifications/rules  -> update push notification rules and persist
```

**New files (frontend)**:
- `dashboard-v2/src/plugins/notifications/NotificationsPage.tsx`
- `dashboard-v2/src/routes/notifications.tsx`

**UI sections**:
1. **Config section**: Enabled toggle, min severity dropdown (info/warning/critical), status checkboxes (normal, alert, proactive, scheduled), max per hour number input, quiet hours start+end time inputs, backend display (ntfy.sh config or native OS status), Save button, Test Notification button
2. **Notification history table**: Time, severity badge (info=blue, warning=yellow, critical=red), message excerpt, backend used, status (sent/skipped/failed). "Skipped (quiet)" for quiet-hours suppressed.
3. **Rate limit status**: Sent today count / max, rate per hour, quiet-hours suppression count

**Plugin manifest entry**:
```typescript
{
  id: "notifications",
  label: "Notifications",
  icon: "Bell",
  slot: "tab",
  order: 92,
  component: () => import("./notifications/NotificationsPage"),
}
```

---

### Task 5.6 — Agent Identity API + plugin (~2 hr)

**Depends on**: Phase 3 complete
**Completion condition**: All 3 agent routes return correct JSON; plugin page renders current agent card, available agents list, and system prompt preview; switching agents restarts the decision engine

**New file (backend)**: `src/dashboard/api/agents.ts`

Routes:
```
GET   /api/agents          -> scan .claude/agents/ for all agent .md files, parse YAML frontmatter
GET   /api/agents/current  -> active persona: name, description, model, tools, watch patterns, triggers
PATCH /api/agents/current  -> switch persona (Zod: agentName), restart decision engine with new prompt
```

**New files (frontend)**:
- `dashboard-v2/src/plugins/agents/AgentsPage.tsx`
- `dashboard-v2/src/routes/agents.tsx`

**UI sections**:
1. **Current agent card**: Name, description, model, source file path. Sub-lists: tools available, watch patterns (globs), trigger events (new_commit, branch_switch, etc.)
2. **Available agents list**: Cards for each `.md` file in `.claude/agents/`. Active agent highlighted with accent border. Switch button on each inactive agent (calls `PATCH /api/agents/current`). Parsed from YAML frontmatter.
3. **System prompt preview**: Collapsible card showing full system prompt from `buildSystemPrompt()`. Monospace font (`font-mono`), scrollable, "Show Full" / "Collapse" toggle.

**Plugin manifest entry**:
```typescript
{
  id: "agents",
  label: "Agents",
  icon: "Bot",
  slot: "tab",
  order: 80,
  component: () => import("./agents/AgentsPage"),
  featureGate: "VIGIL_AGENT_IDENTITY",
}
```

---

### Task 5.7 — System Health API + plugin (~2 hr)

**Depends on**: Phase 3 complete
**Completion condition**: `GET /api/health` returns process stats, database sizes, errors, and uptime timeline; plugin page renders all 4 panels with live data

**New file (backend)**: `src/dashboard/api/health.ts`

Single route:
```
GET /api/health -> process stats, database sizes, error counts, uptime timeline
```

Handler returns:
- `process`: runtime (`"Bun " + Bun.version`), pid, uptime (from `session.startedAt`), heap (`memoryUsage().heapUsed`), rss, external
- `databases`: file sizes for vigil.db, metrics.db, JSONL logs dir, topics dir, index dir, dream result file count. Uses `Bun.file(path).size` and directory walking.
- `errors`: recent 24h error count from MetricsStore, error rate per tick
- `uptimeTimeline`: array of segments over 24h, each with start/end/state (running/sleeping/down)

**New files (frontend)**:
- `dashboard-v2/src/plugins/health/HealthPage.tsx`
- `dashboard-v2/src/routes/health.tsx`

**UI sections**:
1. **Process panel**: Runtime version, PID, uptime (formatted). Memory bars: Heap used/total, RSS, External — proportional bar visualization with MB labels using shadcn `<Progress>` or custom div bars.
2. **Database panel**: Table with columns: Name, Size (formatted), Path. Rows: vigil.db, metrics.db, JSONL logs, topics, index. Total row. Dream result count, schedule data count.
3. **Uptime timeline** (24h): Horizontal strip built with flex divs — green segments for running, gray for sleeping, red for down. Time axis labels at 6h intervals.
4. **Error log table**: Time, type (LLM timeout / tick crash / dream fail / etc.), message. Sortable by time. Header shows total errors (24h) and error rate.

**Plugin manifest entry**:
```typescript
{
  id: "health",
  label: "Health",
  icon: "HeartPulse",
  slot: "tab",
  order: 85,
  component: () => import("./health/HealthPage"),
}
```

---

### Task 5.8 — A2A protocol plugin (~1.5 hr)

**Depends on**: Phase 3 complete
**Completion condition**: All 3 A2A routes return correct JSON; plugin page renders server status, agent card, message log, and aggregate stats

**New file (backend)**: `src/dashboard/api/a2a-status.ts`

Routes:
```
GET /api/a2a/status   -> server running, port, endpoint URL, auth type, concurrent connections/limit
GET /api/a2a/skills   -> registered agent skills from agent card (name, description per skill)
GET /api/a2a/history  -> recent RPC calls: method, status code, latency, token count
```

**New files (frontend)**:
- `dashboard-v2/src/plugins/a2a/A2APage.tsx`
- `dashboard-v2/src/routes/a2a.tsx`

**UI sections**:
1. **Server status bar**: Endpoint URL, port, running status badge, auth type (bearer token), concurrent connection count / limit
2. **Agent card display**: Name, version, capabilities list (streaming, pushNotifications), skills list (name + description for each skill)
3. **Message log table**: Time, RPC method (message/send etc.), status code (200/429/500), latency (ms), token count. Rate-limited rows highlighted with warning color.
4. **Aggregate stats**: Cards showing total requests, success count, rate limited count, error count

**Plugin manifest entry**:
```typescript
{
  id: "a2a",
  label: "A2A",
  icon: "Network",
  slot: "tab",
  order: 93,
  component: () => import("./a2a/A2APage"),
  featureGate: "VIGIL_A2A",
}
```

---

## 4. Deliverables

### Backend files (new)

```
src/dashboard/api/
  config.ts            # getConfigJSON, handleConfigUpdate, getFeatureGatesJSON, handleFeatureToggle
  webhooks.ts          # getWebhookEventsJSON, getWebhookSubscriptionsJSON, handleSubscriptionCreate, handleSubscriptionDelete, getWebhookStatusJSON
  channels.ts          # getChannelsJSON, handleChannelRegister, handleChannelDelete, getChannelPermissionsJSON, getChannelQueueJSON
  notifications.ts     # getNotificationsJSON, handleTestNotification, handleNotificationRulesUpdate
  agents.ts            # getAgentsJSON, getCurrentAgentJSON, handleAgentSwitch
  health.ts            # getHealthJSON
  a2a-status.ts        # getA2AStatusJSON, getA2ASkillsJSON, getA2AHistoryJSON
```

### Backend files (modified)

```
src/dashboard/server.ts     # Add route blocks for all new /api/* endpoints, import new modules
src/dashboard/api/sse.ts    # Add 'webhook' and 'channel' event types to SSEManager
```

### Frontend files (new)

```
dashboard-v2/src/
  plugins/
    config/
      ConfigPage.tsx          # Full settings editor with sliders, dropdowns, gates, save/reset
    webhooks/
      WebhooksPage.tsx        # Server status, subscriptions, event log, health stats
    channels/
      ChannelsPage.tsx        # Channel list, permissions, queue, register/unregister
    notifications/
      NotificationsPage.tsx   # Config form, history table, rate limits
    agents/
      AgentsPage.tsx          # Current agent card, available list, system prompt preview
    health/
      HealthPage.tsx          # Process info, DB sizes, uptime timeline, error log
    a2a/
      A2APage.tsx             # A2A server status, agent card, message log, stats
  routes/
    config.tsx                # Route: /config
    webhooks.tsx              # Route: /webhooks
    channels.tsx              # Route: /channels
    notifications.tsx         # Route: /notifications
    agents.tsx                # Route: /agents
    health.tsx                # Route: /health
    a2a.tsx                   # Route: /a2a
```

### Frontend files (modified)

```
dashboard-v2/src/
  plugins/index.ts            # Add 7 new plugin manifest entries to corePlugins array
  server/functions.ts         # Add server functions: getConfig, updateConfig, getFeatureGates, toggleFeatureGate, getAgents, getCurrentAgent, switchAgent, getHealth, getNotifications, updateNotificationRules, testNotification, getWebhookEvents, getWebhookSubscriptions, createWebhookSubscription, deleteWebhookSubscription, getWebhookStatus, getChannels, registerChannel, deleteChannel, getChannelPermissions, getChannelQueue, getA2AStatus, getA2ASkills, getA2AHistory
  lib/query-keys.ts           # Extend with sub-keys if needed (webhooks.events, webhooks.subscriptions, channels.detail, etc.)
```

---

## 5. Exit Criteria

- [ ] `GET /api/config` returns all daemon config fields as JSON
- [ ] `PUT /api/config` validates, persists, and hot-reloads configuration
- [ ] `GET /api/config/features` returns feature gates with per-layer diagnostics
- [ ] `PATCH /api/config/features/:name` toggles a feature gate and persists
- [ ] Config plugin page renders sliders, dropdowns, feature gates table, action gates, Save/Reset buttons
- [ ] All 5 webhook API routes return correct JSON
- [ ] Webhooks plugin page renders subscriptions table, event log, health stats
- [ ] SSE `webhook` events broadcast on webhook receipt
- [ ] All 5 channel API routes return correct JSON
- [ ] Channels plugin page renders channel list, permission detail, message queue
- [ ] SSE `channel` events broadcast on channel state changes
- [ ] All 3 notification API routes return correct JSON
- [ ] Notifications plugin page renders config form, history table, rate limit status
- [ ] Test notification sends successfully via `POST /api/notifications/test`
- [ ] All 3 agent API routes return correct JSON
- [ ] Agents plugin page renders current agent card, available list, system prompt preview
- [ ] Agent switch via `PATCH /api/agents/current` restarts decision engine
- [ ] `GET /api/health` returns process stats, database sizes, errors, uptime timeline
- [ ] Health plugin page renders process panel, database panel, uptime timeline strip, error log
- [ ] All 3 A2A API routes return correct JSON
- [ ] A2A plugin page renders server status, agent card, message log, aggregate stats
- [ ] All 7 plugins registered in `corePlugins` with correct id, icon, order, and feature gates
- [ ] All 7 route files exist and render the corresponding plugin page
- [ ] Feature-gated plugins (Agents, A2A) are hidden when their gate is disabled

---

## 6. Execution Prompt

You are implementing Phase 5 (New Core Plugins) of Vigil Dashboard v2 — adding 7 new plugin tabs that require new backend API endpoints. The plugin system (registry + PluginSlot) was established in Phase 3. The existing backend API modules in `src/dashboard/api/` demonstrate the established patterns.

### What the project is

Vigil is a local dev tool (Bun/TypeScript) that watches git repos, makes LLM-powered decisions, and consolidates memory during idle time. It has a dashboard served by `Bun.serve()` on port 7480. The dashboard v2 is a TanStack Start + React rewrite using shadcn/ui, Tailwind v4, TanStack Query, and a plugin-extensible architecture. It lives in `dashboard-v2/` at the repo root.

### Architecture context

**Backend routing**: `src/dashboard/server.ts` uses a flat `if (path === "/api/...")` pattern to route requests. Each API module exports named functions that accept `DashboardContext` (containing `daemon: Daemon` and `sse: SSEManager`) and return plain objects. Responses use `Response.json(data)`.

**Frontend plugin pattern**: Each plugin is a lazy-loaded React component registered in `dashboard-v2/src/plugins/index.ts` with id, label, icon (Lucide name), slot, order, component (dynamic import), and optional featureGate. Each plugin has a corresponding route file in `dashboard-v2/src/routes/`. Data fetching uses TanStack Query with keys from `dashboard-v2/src/lib/query-keys.ts`.

**Server function layer**: `dashboard-v2/src/server/functions.ts` contains `createServerFn()` wrappers that call `getVigilContext()` to access daemon internals. Route loaders call these server functions. Mutations use `inputValidator()` with Zod schemas.

### Data model rules (TypeScript)

- Use `interface` for all API response shapes and component props
- Use `type` only for unions and aliases
- Validate all mutation inputs with Zod schemas
- No `class` — all data is plain serializable objects
- Use `as const` for query key factories

### Styling rules

- Tailwind v4 with Vigil theme tokens: `bg-background` (#222745), `bg-surface` (#2A3055), `text-vigil` (#FF8102), `text-text` (#E8E9F0), `text-text-muted` (#9498B8), `border-border` (#3D4470)
- Use shadcn/ui components: Card, Table, Badge, Button, Slider, Select, Switch, Dialog, Tabs, Progress, Tooltip, Separator
- Use Lucide React for all icons (no emojis)
- No external CDN requests

### Per-file guidance

**1. `src/dashboard/api/config.ts`**
- Import `DashboardContext` from `../server.ts`
- `getConfigJSON(ctx)`: Read all config fields from `ctx.daemon.config`, action gates from `ctx.daemon.actionExecutor.getGateConfig()`, notification backends from config
- `handleConfigUpdate(ctx, body)`: Define a Zod schema for partial config (`z.object({...}).partial()`). Validate body. Merge with existing config. Write to `~/.vigil/config.json` using `Bun.write()`. Call config reload.
- `getFeatureGatesJSON(ctx)`: Get `ctx.daemon.featureGates`. Iterate the `FEATURES` registry (import from wherever it is defined). For each feature, call `isEnabled(name)` and `diagnose(name)`. Return array of `{ key, name, enabled, layers: { build, config, runtime, session } }`.
- `handleFeatureToggle(ctx, featureName, enabled)`: Toggle config-layer gate. Persist to config.json.

**2. `src/dashboard/api/webhooks.ts`**
- Import `DashboardContext` from `../server.ts`
- Access webhook processor via `ctx.daemon.webhookProcessor` (or similar — check actual daemon property names)
- `getWebhookEventsJSON(ctx)`: Return recent events from the processor's event buffer
- `getWebhookSubscriptionsJSON(ctx)`: Return active subscriptions from SubscriptionManager
- `handleSubscriptionCreate(ctx, body)`: Zod validate (repo: string, eventTypes: string[], expiry?: number). Create subscription.
- `handleSubscriptionDelete(ctx, id)`: Remove subscription by ID
- `getWebhookStatusJSON(ctx)`: Return server health: port, running status, HMAC stats

**3. `src/dashboard/api/channels.ts`**
- Access MCP channel manager via daemon internals
- `getChannelsJSON(ctx)`: Return all registered channels with name, type, status, queue depth
- `handleChannelRegister(ctx, body)`: Zod validate (name, type, config). Register channel.
- `handleChannelDelete(ctx, id)`: Unregister channel by ID
- `getChannelPermissionsJSON(ctx, channelId)`: Return 5-gate permission results for the channel
- `getChannelQueueJSON(ctx, channelId)`: Return pending messages for the channel

**4. `src/dashboard/api/notifications.ts`**
- Access push notification manager via `ctx.daemon` internals
- `getNotificationsJSON(ctx)`: Return recent deliveries with time, severity, message, backend, status
- `handleTestNotification(ctx)`: Send a test notification through the configured backend
- `handleNotificationRulesUpdate(ctx, body)`: Zod validate rules (enabled, minSeverity, statuses, maxPerHour, quietHours). Persist.

**5. `src/dashboard/api/agents.ts`**
- `getAgentsJSON(ctx)`: Use `readdir` + `Bun.file()` to scan `.claude/agents/` directory. Parse each `.md` file's YAML frontmatter (name, description, model, tools, watchPatterns, triggers). Return array.
- `getCurrentAgentJSON(ctx)`: Return the active persona details from the decision engine
- `handleAgentSwitch(ctx, agentName)`: Zod validate (agentName: string). Load the new agent definition. Restart the decision engine with the new system prompt.

**6. `src/dashboard/api/health.ts`**
- `getHealthJSON(ctx)`:
  - Process: `Bun.version`, `process.pid`, uptime from `ctx.daemon.session?.startedAt`, `process.memoryUsage()` for heap/rss/external
  - Databases: Walk `~/.vigil/data/` using `Bun.file(path).size` for individual files, directory walking for dirs. Report vigil.db, metrics.db, JSONL logs, topics, index, dream result count.
  - Errors: Query MetricsStore for error counters in last 24h. Calculate rate per tick.
  - Uptime timeline: Build segments array from daemon session history. Each segment: `{ start: number, end: number, state: "running" | "sleeping" | "down" }`.

**7. `src/dashboard/api/a2a-status.ts`**
- Access A2A server instance via daemon internals
- `getA2AStatusJSON(ctx)`: Return server state (running, port, endpoint, auth type, connections/limit)
- `getA2ASkillsJSON(ctx)`: Return agent card skills array (name, description per skill)
- `getA2AHistoryJSON(ctx)`: Return recent RPC call array (time, method, status, latency, tokens)

**8. `src/dashboard/server.ts` modifications**
- Import all 7 new API modules at the top
- Add route blocks in the fetch handler, before the TanStack Start handler fallthrough. Follow the existing pattern:
  ```typescript
  if (path === "/api/config" && req.method === "GET") {
    return Response.json(getConfigJSON(ctx));
  }
  if (path === "/api/config" && req.method === "PUT") {
    const body = await req.json();
    return Response.json(await handleConfigUpdate(ctx, body));
  }
  ```
- For parameterized routes like `/api/config/features/:name`, use `path.startsWith()` and extract the parameter:
  ```typescript
  if (path.startsWith("/api/config/features/") && req.method === "PATCH") {
    const name = path.split("/").pop()!;
    const body = await req.json();
    return Response.json(await handleFeatureToggle(ctx, name, body.enabled));
  }
  ```

**9. `src/dashboard/api/sse.ts` modifications**
- Add `webhook` and `channel` to the list of broadcastable event types
- Add broadcast calls in the appropriate handlers (webhook receipt, channel state change)

**10. `dashboard-v2/src/server/functions.ts` additions**
- Add all server functions listed in big-plan.md Task 1.4 addendum for Phase 5
- Each read function uses `getVigilContext()` and calls the corresponding API handler
- Each mutation function uses `inputValidator()` with a Zod schema

**11. `dashboard-v2/src/plugins/index.ts` modifications**
- Add all 7 plugin manifest entries to the `corePlugins` array with correct id, label, icon, slot, order, component (lazy import), and featureGate where applicable

**12. Plugin page components (all 7)**
- Each plugin page follows the same structure:
  - Route file in `src/routes/<name>.tsx` using `createFileRoute("/<name>")` with a `loader` calling the read server function
  - Plugin component file in `src/plugins/<name>/<Name>Page.tsx`
  - Use TanStack Query `useSuspenseQuery` for initial data, `useMutation` for writes
  - Use shadcn/ui components for all UI elements
  - Use `vigilKeys.<name>` for query keys
  - Invalidate relevant queries on successful mutations

**13. `dashboard-v2/src/lib/query-keys.ts` modifications**
- Add sub-keys where needed:
  ```typescript
  webhooks: {
    all: ["webhooks"] as const,
    events: ["webhooks", "events"] as const,
    subscriptions: ["webhooks", "subscriptions"] as const,
    status: ["webhooks", "status"] as const,
  },
  channels: {
    all: ["channels"] as const,
    detail: (id: string) => ["channels", id] as const,
    permissions: (id: string) => ["channels", id, "permissions"] as const,
    queue: (id: string) => ["channels", id, "queue"] as const,
  },
  config: {
    all: ["config"] as const,
    features: ["config", "features"] as const,
  },
  a2a: {
    all: ["a2a"] as const,
    status: ["a2a", "status"] as const,
    skills: ["a2a", "skills"] as const,
    history: ["a2a", "history"] as const,
  },
  ```

### Execution order

1. **Task 5.1** — Config API endpoints (must be first, 5.2 depends on it)
2. **Tasks 5.3-5.8** — All parallelizable with each other and with 5.2
3. **Task 5.2** — Config plugin frontend (after 5.1 completes)
4. After all tasks: update `plugins/index.ts` with all 7 manifest entries, verify all routes exist

### Success criteria

Run these checks after implementation:

```bash
# Backend API smoke tests
curl http://localhost:7480/api/config | jq .tickInterval
curl http://localhost:7480/api/config/features | jq '.[0].layers'
curl http://localhost:7480/api/health | jq .process.runtime
curl http://localhost:7480/api/agents | jq '.[0].name'
curl http://localhost:7480/api/a2a/status | jq .server
curl http://localhost:7480/api/webhooks/status | jq .running
curl http://localhost:7480/api/channels | jq length
curl http://localhost:7480/api/notifications | jq length

# Frontend route checks (verify each resolves without error)
curl -s http://localhost:7480/config | grep -q "Config"
curl -s http://localhost:7480/webhooks | grep -q "Webhooks"
curl -s http://localhost:7480/channels | grep -q "Channels"
curl -s http://localhost:7480/notifications | grep -q "Notifications"
curl -s http://localhost:7480/agents | grep -q "Agents"
curl -s http://localhost:7480/health | grep -q "Health"
curl -s http://localhost:7480/a2a | grep -q "A2A"

# Feature gate check
# Disable VIGIL_A2A -> /a2a route should not appear in sidebar
# Disable VIGIL_AGENT_IDENTITY -> /agents route should not appear in sidebar
```

---

## Readiness Check

- [PASS] All inputs from prior phases are listed and available — Phase 3 plugin registry, Phase 1 query keys, Phase 0 server function pattern
- [PASS] Every sub-task has a clear, testable completion condition
- [PASS] Execution prompt is self-contained: includes (a) architecture context from prior phases, (b) per-file guidance for all 7 backend + 7 frontend files + modified files, (c) data model rules, (d) styling rules, and (e) observable success criteria
- [PASS] Exit criteria map 1:1 to deliverables (each API module -> route tests, each plugin -> page renders, SSE events -> real-time updates)
- [PASS] Any heavy external dependency has a fake/stub strategy noted — backend handlers wrap existing daemon internals; if a daemon subsystem is not yet implemented (e.g., webhookProcessor), the handler returns empty/mock data with a TODO comment
- [PASS] New libraries are not needed — all dependencies (shadcn/ui, Lucide, TanStack Query, Zod, Recharts) are already installed from prior phases
