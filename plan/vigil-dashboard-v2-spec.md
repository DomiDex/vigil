# Vigil Dashboard v2 — Plugin-Ready React Rewrite

> Spec for replacing the HTMX dashboard with a React-based plugin-extensible frontend.

## Motivation

The current dashboard (HTMX + server-rendered HTML fragments) works for a fixed layout. But Vigil is moving toward a plugin architecture where everything is customizable — channels, watchers, rules, actions, dashboard widgets. HTMX cannot cleanly support dynamic widget registration, plugin-provided UI components, or shared state across plugin panels. A component framework earns its place here.

## Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | **TanStack Start** | Full-stack React framework with SSR, server functions, file-based routing |
| Bundler | **Vite** (under the hood) | TanStack Start's build layer (migrated from Vinxi to Vite in v1.121+) |
| Router | **TanStack Router** (built-in) | Type-safe file-based routes, loaders, Zod search params |
| Data | **TanStack Query** | SSE integration, cache invalidation, polling, staleTime |
| Components | **shadcn/ui** | Copied into project (no runtime dep), Radix primitives, Tailwind |
| Styling | **Tailwind v4** | Already in use, CSS-first config, design tokens |
| Icons | **Lucide React** | Already chosen over emojis (vendored, tree-shakable) |
| Charts | **Recharts** (via shadcn) | React-native, replaces Chart.js |
| API Server | **Bun.serve()** | Existing — Vigil's JSON API + SSE (proxied in dev, colocated in prod) |

### Why TanStack Start over bare Vite

- **Server functions** — dashboard can call Vigil internals directly via `createServerFn()` instead of going through HTTP API for everything. Plugins get the same capability.
- **SSR** — initial dashboard load is fast, no flash of empty content waiting for API calls.
- **Integrated router** — TanStack Router is built in, not bolted on. Route loaders, search params, and code splitting work out of the box.
- **Type safety end-to-end** — server functions are fully typed from server to client. No manual fetch wrapper types.

> **Note:** TanStack Start reached v1.0 but is still a young framework. Pin to a specific stable minor (e.g. `~1.121.x`) and test before upgrading. The Vinxi-to-Vite migration (v1.121+) introduced breaking changes — ensure all examples and config reference the Vite-based architecture.

### What gets removed

- `htmx.min.js`, `htmx-sse.js`, `pico.min.css`, `chart.min.js` (vendor/)
- All `/api/*/fragment` endpoints (server-rendered HTML)
- `src/dashboard/static/fragments/` directory
- `src/dashboard/static/app.js` (vanilla JS)
- `src/dashboard/static/styles.css` (old Pico styles)

### What stays

- `src/dashboard/server.ts` — Bun.serve(), JSON API routes, SSE endpoint
- `src/dashboard/api/*.ts` — All JSON endpoints unchanged (still needed for SSE + plugin API routes)
- `src/dashboard/api/sse.ts` — SSEManager unchanged

## Directory Structure

```
src/dashboard/
  server.ts                  # Bun.serve — JSON API + SSE (existing, unchanged)
  api/                       # Backend API handlers (existing, unchanged)
    overview.ts
    repos.ts
    timeline.ts
    dreams.ts
    memory.ts
    actions.ts
    tasks.ts
    scheduler.ts
    metrics.ts
    sse.ts
  app/                       # NEW — TanStack Start application
    app.config.ts            # TanStack Start config (Vinxi)
    app.css                  # Tailwind v4 entry with Vigil theme
    client.tsx               # Client entry (hydrateRoot)
    ssr.tsx                   # SSR entry (renderToStream)
    router.tsx               # Router creation + QueryClient setup
    routes/
      __root.tsx             # Shell layout (top bar, nav, plugin slots)
      index.tsx              # Timeline (default tab)
      dreams.tsx
      tasks.tsx
      actions.tsx
      memory.tsx
      scheduler.tsx
      metrics.tsx
      plugins/
        $pluginId.tsx        # Dynamic route for plugin tabs
    server/
      functions.ts           # createServerFn() — typed server functions
      vigil-context.ts       # Access to Daemon instance from server fns
    components/
      ui/                    # shadcn/ui primitives
        button.tsx
        card.tsx
        badge.tsx
        data-table.tsx
        tabs.tsx
        dialog.tsx
        sheet.tsx
        command.tsx
        chart.tsx
        sonner.tsx           # Toast notifications
      layout/
        top-bar.tsx          # Global health: repos, uptime, tick, state
        nav-bar.tsx          # Bottom tab navigation
        repo-sidebar.tsx     # Per-repo detail panel
      vigil/
        timeline-entry.tsx   # Single timeline row (expandable)
        decision-badge.tsx   # SILENT/OBSERVE/NOTIFY/ACT
        repo-card.tsx        # Repo status card
        dream-entry.tsx      # Dream log row
        action-approval.tsx  # Approve/deny card
        memory-search.tsx    # Search + results
        ask-vigil.tsx        # LLM question input
        metrics-chart.tsx    # Recharts wrapper
    hooks/
      use-sse.ts             # SSE connection + TanStack Query invalidation
      use-plugin-registry.ts # Plugin widget registration
    lib/
      plugin-context.ts      # PluginContext provider
      cn.ts                  # clsx + twMerge utility
    types/
      api.ts                 # Response types matching server JSON
      plugin.ts              # Plugin widget interface
```

## Design System

### Colors (from existing brand)

```css
@theme {
  --color-vigil: #FF8102;        /* Primary accent (orange) */
  --color-vigil-light: #FF9B33;
  --color-vigil-hover: #E57300;
  --color-background: #222745;   /* Deep navy */
  --color-surface: #2A3055;
  --color-surface-dark: #1B2038;
  --color-surface-light: #333A62;
  --color-border: #3D4470;
  --color-border-light: #4A5280;
  --color-text: #E8E9F0;
  --color-text-muted: #9498B8;
  --color-success: #4ADE80;
  --color-warning: #FBBF24;
  --color-error: #F87171;
  --color-info: #60A5FA;
}
```

### Decision Status Colors

| Status | Color | Badge variant |
|--------|-------|---------------|
| SILENT | `text-muted` | `outline` |
| OBSERVE | `info` | `secondary` |
| NOTIFY | `warning` | `default` |
| ACT | `vigil` (orange) | `destructive` |

### Icons — Lucide React only (no emojis ever)

| Concept | Icon |
|---------|------|
| Observe | `Eye` |
| Notify | `Bell` |
| Act | `Zap` |
| Silent | `Moon` |
| Dream | `Sparkles` |
| Repo | `GitBranch` |
| Commit | `GitCommit` |
| Task | `CheckSquare` |
| Memory | `Brain` |
| Search | `Search` |
| Settings | `Settings` |
| Awake | `Circle` (green fill) |
| Sleeping | `Moon` |

## Plugin Widget System

Everything in the dashboard is a plugin. The shell (top bar, repo sidebar, nav bar, SSE connection) is the only non-plugin code. All tabs — including "core" features like Timeline and Dreams — are first-party plugins that use the same interface as third-party plugins.

### Two Plugin Tiers

| Tier | Location | Loaded | Examples |
|------|----------|--------|----------|
| **Core plugins** | `dashboard-v2/src/plugins/` | Bundled at build time | Timeline, Dreams, Tasks, Actions, Memory, Repos, Metrics, Scheduler |
| **User plugins** | `~/.vigil/plugins/*/widget.ts` | Scanned at startup, lazy-loaded | Linear tracker, Slack feed, custom dashboards |

Core plugins ship with Vigil and are always available. User plugins are optional extensions loaded from the filesystem.

### Interface

```typescript
// dashboard-v2/src/types/plugin.ts

export interface PluginWidget {
  /** Unique identifier */
  id: string;

  /** Display name in nav */
  label: string;

  /** Lucide icon name for nav tab */
  icon: string;

  /** Where the widget renders */
  slot: WidgetSlot;

  /** Sort order in nav (lower = earlier). Core plugins use 0-99, user plugins start at 100 */
  order: number;

  /** Lazy-loaded React component */
  component: () => Promise<{ default: React.ComponentType<WidgetProps> }>;

  /** Optional: SSE event names this plugin cares about (for targeted invalidation) */
  sseEvents?: string[];

  /** Optional: TanStack Query keys this plugin owns (for cache management) */
  queryKeys?: readonly string[][];

  /** Optional: required API routes this plugin provides */
  apiRoutes?: PluginApiRoute[];

  /** Optional: feature gate — plugin hidden if gate is disabled */
  featureGate?: string;
}

export type WidgetSlot =
  | "tab"           // Full page tab (appears in nav)
  | "sidebar"       // Sidebar panel
  | "timeline-card" // Inline card in timeline
  | "overlay"       // Modal/sheet overlay
  | "top-bar"       // Top bar widget (small, status-like)

export interface WidgetProps {
  /** Current active repo (if any) */
  activeRepo: string | null;

  /** Access to vigil API */
  api: VigilApiClient;

  /** TanStack Query client for cache ops */
  queryClient: QueryClient;

  /** SSE event stream */
  sse: SSEConnection;
}

export interface PluginApiRoute {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  handler: (req: Request, ctx: DashboardContext) => Promise<Response>;
}
```

### Complete Plugin Registry

Every dashboard feature maps to a plugin. Here is the full registry derived from the codebase:

---

#### 1. `timeline` — Decision Timeline
**Slot**: `tab` | **Icon**: `Activity` | **Order**: 0 (default tab)

The primary feed. Shows every tick decision with full context.

| Feature | Source | API |
|---------|--------|-----|
| Decision feed (SILENT/OBSERVE/NOTIFY/ACT) | `MessageRouter.getRecent()` | `GET /api/timeline` |
| Filter by decision, repo, text search | Query params on timeline endpoint | `?status=&repo=&q=` |
| Expandable entry detail | Per-entry metadata, reasoning | `GET /api/timeline/:id/fragment` |
| User reply to observations | `UserReply` queue → fed into next tick | `POST /api/timeline/:id/reply` |
| Pagination (load more) | Page-based | `?page=N` |
| Decision badges | Color-coded by decision type | Client-side |

**SSE events**: `tick`, `message`
**Query keys**: `["timeline"]`

---

#### 2. `repos` — Repository Explorer
**Slot**: `tab` | **Icon**: `GitBranch` | **Order**: 10

Deep view into each watched repository.

| Feature | Source | API |
|---------|--------|-----|
| Repo list with status indicators | `GitWatcher` state per repo | `GET /api/repos` |
| Branch, HEAD commit, dirty status | Git polling (10s) + fs.watch | Included in repo list |
| Uncommitted file breakdown (modified/untracked/added/deleted) | `git status` parsing | `GET /api/repos/:name` |
| Recent commits (last 5) | `git log` | Included in detail |
| Decision distribution per repo | `MetricsStore` per-repo counters | Included in detail |
| Discovered patterns | `TopicTier` per repo | Included in detail |
| Topic tracking (name, observation count, trend) | `TopicTier.listTopics()` | Included in detail |
| Recent activity (last 8 messages) | `MessageRouter` filtered by repo | Included in detail |

**SSE events**: `tick`
**Query keys**: `["repos"]`

---

#### 3. `dreams` — Consolidation & Insights
**Slot**: `tab` | **Icon**: `Sparkles` | **Order**: 20

Dream consolidation results — Vigil's "thinking during sleep" output.

| Feature | Source | API |
|---------|--------|-----|
| Dream results (summary, insights, patterns, confidence) | `dream-result-*.json` files | `GET /api/dreams` |
| Dream status (running/idle, which repo, PID) | `dream.lock` file | Included in response |
| Per-repo pattern collection | `TopicTier` patterns | `GET /api/dreams/patterns/:repo` |
| Topic evolution tracking | Topic observation trends | Included in patterns |
| Manual dream trigger | Spawns `DreamWorker` subprocess | `POST /api/dreams/trigger` |
| Repo filter for dreams | Filter by watched repo | `?dreamrepo=` |

**SSE events**: `dream`
**Query keys**: `["dreams"]`

---

#### 4. `tasks` — Task Manager
**Slot**: `tab` | **Icon**: `CheckSquare` | **Order**: 30
**Feature gate**: `VIGIL_TASKS`

Task tracking with lifecycle management and wait conditions.

| Feature | Source | API |
|---------|--------|-----|
| Task list with status badges | `TaskManager` (SQLite) | `GET /api/tasks` |
| Create task (title, description, repo) | `TaskManager.create()` | `POST /api/tasks` |
| Status transitions (pending → active → completed/failed) | `TaskManager.activate/complete/fail()` | `POST /api/tasks/:id/activate\|complete\|fail` |
| Edit task | `TaskManager.update()` | `PUT /api/tasks/:id` |
| Cancel task | `TaskManager.cancel()` | `DELETE /api/tasks/:id` |
| Filter by status, repo | Query params | `?status=&repo=` |
| Wait conditions (event/task/schedule-based) | `TaskManager.waitCondition` | Included in task data |
| Progress tracking | Completion rate calculation | Client-side |
| Parent-child task relationships | `TaskManager` parent linking | Included in task data |

**SSE events**: `tick`
**Query keys**: `["tasks"]`

---

#### 5. `actions` — Action Approval Gate
**Slot**: `tab` | **Icon**: `Zap` | **Order**: 40

Approve/reject Vigil's proposed actions before execution.

| Feature | Source | API |
|---------|--------|-----|
| Pending approval cards | `ActionExecutor.getPending()` | `GET /api/actions/pending` |
| Action history (executed, rejected, failed) | `ActionExecutor.getRecent()` | `GET /api/actions` |
| 6-gate approval detail per action | Gate results from executor | Included in action data |
| Approve action | `ActionExecutor.approve()` | `POST /api/actions/:id/approve` |
| Reject action | `ActionExecutor.reject()` | `POST /api/actions/:id/reject` |
| Tier badges (safe/moderate/dangerous) | `ActionTier` classification | Client-side |
| Confidence score display | LLM decision confidence | Included in action data |
| Filter by status | Query params | `?status=` |
| Stats: counts by status and tier | Aggregated from history | Client-side |

**SSE events**: `action_pending`, `action`
**Query keys**: `["actions"]`

---

#### 6. `memory` — Memory Explorer & Ask Vigil
**Slot**: `tab` | **Icon**: `Brain` | **Order**: 50

Search Vigil's memory, explore the knowledge base, ask questions.

| Feature | Source | API |
|---------|--------|-----|
| Vector store stats (count, type distribution) | `VectorStore` SQLite query | `GET /api/memory` |
| Topic tier stats (count, repos) | `TopicTier` | Included in memory data |
| Index tier stats (count, repos) | `IndexTier` | Included in memory data |
| Event log stats (entry count, date range) | JSONL log file scan | Included in memory data |
| Repo profiles (summary, patterns, last updated) | `repo_profiles` table | Included in memory data |
| Keyword + semantic search | `VectorStore` FTS5 + `SemanticIndex` TF-IDF | `GET /api/memory/search` |
| Ask Vigil (LLM Q&A with tool use) | `AskEngine` with code tools | `POST /api/memory/ask` |
| Source tracking (which memories answered) | `AskEngine` response metadata | Included in ask response |

**SSE events**: `dream` (memory changes after consolidation)
**Query keys**: `["memory"]`

---

#### 7. `metrics` — Operational Metrics
**Slot**: `tab` | **Icon**: `BarChart3` | **Order**: 60

Charts and stats for monitoring Vigil's own performance.

| Feature | Source | API |
|---------|--------|-----|
| Decision distribution (SILENT/OBSERVE/NOTIFY/ACT counts) | `MetricsStore.getSummary()` | `GET /api/metrics` |
| Decision time-series (30-min buckets, 24h) | `MetricsStore.getTimeSeries()` | Included in metrics data |
| LLM latency (avg, p95, max, per-call chart) | `MetricsStore` raw `llm.decision_ms` | Included in metrics data |
| Token estimation & cost tracking | Model pricing table × token count | Included in metrics data |
| Tick timing (configured vs adaptive interval) | `TickEngine` + `AdaptiveSleep` | Included in metrics data |
| Tick counters (total, sleeping, proactive) | `MetricsStore` counter queries | Included in metrics data |
| Uptime and model info | `Session` + `Config` | Included in metrics data |

**SSE events**: `tick`, `decision`
**Query keys**: `["metrics"]`

---

#### 8. `scheduler` — Cron Scheduler
**Slot**: `tab` | **Icon**: `Clock` | **Order**: 70
**Feature gate**: `VIGIL_SCHEDULER`

Manage recurring scheduled actions.

| Feature | Source | API |
|---------|--------|-----|
| Schedule list (cron expression, next run, action) | `Scheduler.list()` | `GET /api/scheduler` |
| Create schedule | `Scheduler.create()` | `POST /api/scheduler` |
| Delete schedule | `Scheduler.delete()` | `DELETE /api/scheduler/:id` |
| Manual trigger | `Scheduler.trigger()` | `POST /api/scheduler/:id/trigger` |
| Run history (status, duration) | `Scheduler.getHistory()` | Included in scheduler data |
| Countdown to next run | Computed from cron + last run | Client-side |

**SSE events**: `tick`
**Query keys**: `["scheduler"]`

---

#### 9. `config` — Settings & Feature Gates
**Slot**: `tab` | **Icon**: `Settings` | **Order**: 80

View and modify Vigil configuration and feature flags.

| Feature | Source | API |
|---------|--------|-----|
| Tick interval setting | `config.tickInterval` | `GET /api/overview` (read), needs `PUT /api/config` (write) |
| Model selection (tick + escalation) | `config.tickModel`, `config.escalationModel` | Same |
| Feature gate toggles | `FeatureGates` (3-layer: build, config, env) | Needs `GET /api/config/features` |
| Action gate config (per-tier thresholds) | `config.actionGates` | Same |
| Notification backend selection | `config.notificationBackends` | Same |
| Action allowlist per repo | `config.actionAllowlist` | Same |

**SSE events**: none (config changes trigger hot-reload)
**Query keys**: `["config"]`
**Note**: Requires new API endpoints — current dashboard has no config editing UI.

---

#### 10. `webhooks` — GitHub Webhook Feed
**Slot**: `tab` | **Icon**: `Webhook` | **Order**: 90
**Feature gate**: `VIGIL_WEBHOOKS`

GitHub webhook events flowing into Vigil.

| Feature | Source | API |
|---------|--------|-----|
| Webhook event feed (push, PR, issues, reviews) | `WebhookProcessor` | Needs `GET /api/webhooks/events` |
| Subscription management | `SubscriptionManager` | Needs `GET/POST/DELETE /api/webhooks/subscriptions` |
| Delivery status (HMAC validation results) | `WebhookServer` | Needs `GET /api/webhooks/status` |
| Event type filtering | Allowed events list | Client-side filter |

**SSE events**: needs new `webhook` event type
**Query keys**: `["webhooks"]`
**Note**: Requires new API endpoints — webhook server exists (port 7433) but has no dashboard integration yet.

---

#### 11. `channels` — MCP Channel Manager
**Slot**: `tab` | **Icon**: `Radio` | **Order**: 91
**Feature gate**: `VIGIL_CHANNELS`

Manage MCP server channels for notification delivery.

| Feature | Source | API |
|---------|--------|-----|
| Registered channels list | `ChannelHandler.getChannels()` | Needs `GET /api/channels` |
| Channel permissions (5-gate system) | `ChannelPermissionManager` | Needs `GET /api/channels/:id/permissions` |
| Register/unregister channels | `ChannelHandler` | Needs `POST/DELETE /api/channels` |
| Message queue per channel | `ChannelHandler.getPending()` | Needs `GET /api/channels/:id/queue` |
| Delivery status | Channel events | Client-side |

**SSE events**: needs new `channel` event type
**Query keys**: `["channels"]`
**Note**: Requires new API endpoints — channel system exists but has no dashboard surface.

---

#### 12. `notifications` — Notification Queue
**Slot**: `tab` | **Icon**: `Bell` | **Order**: 92
**Feature gate**: `VIGIL_PUSH`

Push notification history and queue management.

| Feature | Source | API |
|---------|--------|-----|
| Notification queue (recent deliveries) | `NotificationRouter.readQueue()` | Needs `GET /api/notifications` |
| Backend status (desktop/webhook/file) | `config.notificationBackends` | Included in response |
| Delivery history | JSONL notification files | Needs API |
| Test notification | Send test push | Needs `POST /api/notifications/test` |

**SSE events**: `message` (NOTIFY decisions)
**Query keys**: `["notifications"]`
**Note**: Requires new API endpoints.

---

#### 13. `a2a` — Agent-to-Agent Status
**Slot**: `sidebar` | **Icon**: `Network` | **Order**: 93
**Feature gate**: `VIGIL_A2A`

Monitor the A2A JSON-RPC server.

| Feature | Source | API |
|---------|--------|-----|
| Server status (running, port, connections) | `A2AServer` | Needs `GET /api/a2a/status` |
| Registered skills list | Agent card skills | Needs `GET /api/a2a/skills` |
| Recent RPC calls | Request log | Needs `GET /api/a2a/history` |
| Health check | `/health` endpoint on 7431 | Internal proxy |

**SSE events**: none
**Query keys**: `["a2a"]`
**Note**: A2A server exists (port 7431) but has no dashboard surface. Sidebar widget is sufficient — not a full tab.

---

### Plugin Registration

```typescript
// Core plugin registration — dashboard-v2/src/plugins/index.ts
import type { PluginWidget } from "../types/plugin";

export const corePlugins: PluginWidget[] = [
  {
    id: "timeline",
    label: "Timeline",
    icon: "Activity",
    slot: "tab",
    order: 0,
    component: () => import("./timeline/TimelinePage"),
    sseEvents: ["tick", "message"],
    queryKeys: [["timeline"]],
  },
  {
    id: "repos",
    label: "Repos",
    icon: "GitBranch",
    slot: "tab",
    order: 10,
    component: () => import("./repos/ReposPage"),
    sseEvents: ["tick"],
    queryKeys: [["repos"]],
  },
  {
    id: "dreams",
    label: "Dreams",
    icon: "Sparkles",
    slot: "tab",
    order: 20,
    component: () => import("./dreams/DreamsPage"),
    sseEvents: ["dream"],
    queryKeys: [["dreams"]],
  },
  // ... remaining core plugins
];
```

```typescript
// User plugin example — ~/.vigil/plugins/linear-tracker/widget.ts
import { defineWidget } from "vigil/plugin";

export default defineWidget({
  id: "linear-tracker",
  label: "Linear",
  icon: "ListTodo",
  slot: "tab",
  order: 100,
  component: () => import("./LinearWidget"),
  apiRoutes: [
    { method: "GET", path: "/api/plugins/linear/issues", handler: fetchIssues },
  ],
});
```

### Plugin Loading

1. **Core plugins**: Imported at build time from `dashboard-v2/src/plugins/index.ts`
2. **User plugins**: On dashboard start, scan `~/.vigil/plugins/*/widget.ts`
3. Validate all manifests with Zod schema
4. Register user plugin API routes into `Bun.serve()` router
5. Merge core + user plugin manifests, sort by `order`
6. Send combined manifest (minus components) to frontend via `/api/plugins`
7. Frontend lazy-loads components via dynamic import
8. Feature-gated plugins are hidden when their gate is disabled

## Core Routes & Data Flow

### Server Functions (TanStack Start)

Instead of manual fetch wrappers, use `createServerFn()` for type-safe server-to-client data:

```typescript
// server/functions.ts
import { createServerFn } from "@tanstack/react-start";
import { getVigilContext } from "./vigil-context";

export const getOverview = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = getVigilContext();
  return getOverviewJSON(ctx);
});

export const getTimeline = createServerFn({ method: "GET" })
  .validator(z.object({
    status: z.enum(["all", "observe", "notify", "act"]).optional(),
    repo: z.string().optional(),
    limit: z.number().optional(),
  }))
  .handler(async ({ data: filters }) => {
    const ctx = getVigilContext();
    return getTimelineJSON(ctx, filters);
  });

export const approveAction = createServerFn({ method: "POST" })
  .validator(z.object({ actionId: z.string() }))
  .handler(async ({ data }) => {
    const ctx = getVigilContext();
    return handleApprove(ctx, data.actionId);
  });

export const askVigil = createServerFn({ method: "POST" })
  .validator(z.object({ question: z.string(), repo: z.string().optional() }))
  .handler(async ({ data }) => {
    const ctx = getVigilContext();
    return handleAsk(ctx, data.question, data.repo);
  });
```

```typescript
// server/vigil-context.ts
// The Daemon instance is injected at startup, available to all server functions
let _ctx: DashboardContext | null = null;

export function setVigilContext(ctx: DashboardContext) { _ctx = ctx; }
export function getVigilContext(): DashboardContext {
  if (!_ctx) throw new Error("Vigil context not initialized");
  return _ctx;
}
```

### Route Loaders

Each route uses server functions in its loader — data is available before the component renders (SSR):

```typescript
// routes/dreams.tsx
import { createFileRoute } from "@tanstack/react-router";
import { getDreams } from "../server/functions";

export const Route = createFileRoute("/dreams")({
  loader: () => getDreams(),
  component: DreamsPage,
});

function DreamsPage() {
  const dreams = Route.useLoaderData();
  // Data is already loaded — no loading spinner needed on initial render
}
```

### SSE Integration

SSE stays as a client-side EventSource (can't use server functions for streaming). It invalidates TanStack Query caches on events:

```typescript
// hooks/use-sse.ts
function useSSE() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource("/api/sse");

    source.addEventListener("tick", () => {
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      queryClient.invalidateQueries({ queryKey: ["timeline"] });
    });

    source.addEventListener("decision", () => {
      queryClient.invalidateQueries({ queryKey: ["timeline"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
    });

    source.addEventListener("action", () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
    });

    source.addEventListener("dream", () => {
      queryClient.invalidateQueries({ queryKey: ["dreams"] });
    });

    return () => source.close();
  }, [queryClient]);
}
```

### Query Key Structure

```typescript
// Consistent query key factory
const vigilKeys = {
  overview: ["overview"] as const,
  repos: {
    all: ["repos"] as const,
    detail: (name: string) => ["repos", name] as const,
  },
  timeline: (filters: TimelineFilters) => ["timeline", filters] as const,
  dreams: ["dreams"] as const,
  memory: {
    search: (query: string) => ["memory", "search", query] as const,
  },
  actions: {
    pending: ["actions", "pending"] as const,
    all: ["actions"] as const,
  },
  tasks: ["tasks"] as const,
  scheduler: ["scheduler"] as const,
  metrics: ["metrics"] as const,
  plugins: ["plugins"] as const,
};
```

## Layout Architecture

```
+----------------------------------------------------------------------+
|  Top Bar: [vigil logo] | State | Tick # | Next tick | Uptime | Gear  |
+----------------------------------------------------------------------+
|                                                                      |
|  +-----------+  +--------------------------------------------------+ |
|  | Repo Nav  |  |  Active Tab Content                              | |
|  |           |  |                                                  | |
|  | > vigil   |  |  (Timeline / Dreams / Tasks / Actions / Memory / | |
|  |   my-app  |  |   Scheduler / Metrics / Plugin tabs...)          | |
|  |   api-srv |  |                                                  | |
|  |           |  |                                                  | |
|  +-----------+  +--------------------------------------------------+ |
|                                                                      |
+----------------------------------------------------------------------+
|  Nav: [Timeline] [Dreams] [Tasks] [Actions] [Memory] [...plugins]   |
+----------------------------------------------------------------------+
```

- Top bar always visible (SSE-driven, auto-refreshes)
- Left sidebar: repo list with status indicators (collapsible)
- Center: active tab content (TanStack Router outlet)
- Bottom nav: core tabs + dynamically registered plugin tabs

## Build & Dev Workflow

### TanStack Start Config

```typescript
// app.config.ts
import { defineConfig } from "@tanstack/react-start/config";

export default defineConfig({
  server: {
    // In dev, proxy /api/* to Vigil's Bun.serve on :7480
    // In prod, Start's handler is embedded into Vigil's Bun.serve()
    preset: "bun",  // Use Bun as the production server runtime
  },
});
```

> **Note:** Vinxi was removed in TanStack Start v1.121+. The `defineConfig` import is from `@tanstack/react-start/config` (Vite-based). If migrating from older examples, remove any `vinxi` imports or config.

### Development

```bash
# Terminal 1: Vigil daemon (API + SSE on :7480)
bun run src/cli/index.ts watch ~/projects/my-repo

# Terminal 2: TanStack Start dev server (HMR + SSR, proxies /api to :7480)
cd dashboard-v2 && bun run dev
```

### Production

Two deployment options:

**Option A — Standalone (recommended for local dev tool):**
TanStack Start builds to a Bun server. Vigil's daemon injects the DashboardContext at startup, and the Start server handles both the app and API routes on a single port.

```bash
bun run dashboard:build            # Vinxi builds SSR bundle
bun run src/cli/index.ts watch ... # Daemon starts Start server + API
```

**Option B — Static export + Bun.serve:**
Build as a static SPA, serve from existing `Bun.serve()`:

```bash
bun run dashboard:build --preset static  # Static HTML/JS output
# Bun.serve() serves built assets from static/dist/
```

### Integration with Vigil Daemon

The key architectural decision: TanStack Start's server functions need access to the `Daemon` instance (for memory, tasks, metrics, etc). This is wired via a module-level context.

Server functions run in the same Bun process (not isolated workers), so a module-level singleton is safe for this single-process local deployment. This would **not** work on edge/serverless runtimes (Cloudflare Workers, etc.) where each request may run in a separate isolate.

```typescript
// In daemon.ts startup:
import { setVigilContext } from "../../dashboard-v2/src/server/vigil-context";

// After all components initialized:
setVigilContext({ daemon: this, sse });
startDashboardApp(port);  // Starts TanStack Start server
```

### Server Routing Integration

In production, Vigil's `Bun.serve()` acts as the single entry point. TanStack Start's request handler is embedded into the existing server, not run as a separate process:

```typescript
// server.ts — simplified routing
import { createStartHandler } from "@tanstack/react-start/server";

const startHandler = createStartHandler({ /* ... */ });

Bun.serve({
  port: 7480,
  fetch(req) {
    const url = new URL(req.url);

    // Vigil API routes — handled by existing handlers
    if (url.pathname.startsWith("/api/")) {
      return handleApiRoute(req);
    }

    // Everything else — delegate to TanStack Start (SSR + assets)
    return startHandler(req);
  },
});
```

This avoids running two servers and keeps the API + SSE on the same port as the dashboard.

## Migration Plan

### Phase 0 — Validation Spike (1-2 days)
- Confirm TanStack Start + Bun.serve() handler embedding works (single port, shared process)
- Verify `createServerFn()` can access module-level singleton context
- Test SSR renders correctly when served through `Bun.serve()` fetch handler
- Validate Tailwind v4 + shadcn/ui + React 19 build pipeline with Bun
- Confirm all built assets are self-contained (no external CDN fetches)
- **Exit criteria**: a minimal "hello world" route served through Vigil's `Bun.serve()` with one working server function that reads from a mock Daemon context

### Phase 1 — Scaffold (no visual changes)
- Initialize TanStack Start project in `dashboard-v2/src/`
- Configure `app.config.ts` with Bun preset
- Set up Tailwind v4 with existing color tokens
- Install shadcn/ui, add base components (Button, Card, Badge, DataTable)
- Create `server/vigil-context.ts` and wire to Daemon
- Create initial server functions wrapping existing API handlers
- Configure dev proxy to existing Bun.serve API on :7480

### Phase 2 — Shell Layout
- Build top bar component (overview data)
- Build bottom nav (static core tabs)
- Build repo sidebar
- Wire SSE connection

### Phase 3 — Plugin System & First Core Plugin
- Define `PluginWidget` interface, Zod schema, `WidgetProps` context provider
- Build plugin registry (core + user plugin loading)
- Dynamic nav tab rendering from registry
- Plugin slot rendering (tab, sidebar, timeline-card, overlay, top-bar)
- Plugin manifest endpoint (`GET /api/plugins`)
- Port **Timeline** as first core plugin (proves the plugin interface works end-to-end)
  - Timeline entries, decision filters, expandable rows, reply input
  - SSE-driven invalidation of `["timeline"]` query key

### Phase 4 — Port Remaining Core Plugins (existing APIs)
These plugins use existing JSON API endpoints — no backend changes needed:
- **Repos** — repo list, detail view, branch/commit/dirty status, topics, decision distribution
- **Dreams** — dream results, patterns, manual trigger, lock status
- **Tasks** — task CRUD, status transitions, wait conditions, filters
- **Actions** — pending approvals, approve/reject, 6-gate detail, history
- **Memory** — vector/topic/index/log stats, search, Ask Vigil (LLM Q&A)
- **Scheduler** — schedule CRUD, run history, manual trigger, countdown
- **Metrics** — decision charts (Recharts), latency, token cost, tick counters

### Phase 5 — New Core Plugins (require new API endpoints)
These plugins need new backend API routes added to `server.ts`:
- **Config** — settings editor, feature gate toggles, model selection
  - New: `GET/PUT /api/config`, `GET /api/config/features`
- **Webhooks** — GitHub webhook event feed, subscription management
  - New: `GET /api/webhooks/events`, `GET/POST/DELETE /api/webhooks/subscriptions`
- **Channels** — MCP channel list, permissions, queue
  - New: `GET /api/channels`, `POST/DELETE /api/channels`, `GET /api/channels/:id/queue`
- **Notifications** — push notification queue, delivery history
  - New: `GET /api/notifications`, `POST /api/notifications/test`
- **A2A** — server status, skills list, RPC history (sidebar widget)
  - New: `GET /api/a2a/status`, `GET /api/a2a/skills`

### Phase 6 — User Plugin Support
- User plugin loader (scan `~/.vigil/plugins/*/widget.ts`)
- User plugin API route registration in `Bun.serve()`
- Sandboxed plugin rendering (error boundaries)
- Plugin development docs + example plugin template

### Phase 7 — Remove HTMX Legacy
- Delete all `/api/*/fragment` endpoints
- Delete `static/vendor/` (htmx, pico, chart.js)
- Delete `static/app.js`, `static/styles.css`, `static/fragments/`
- Delete `static/index.html` (replaced by Vite entry)
- Clean up server.ts (remove HTML response helpers, fragment routes)

## API Contract

The backend JSON API stays exactly the same for Phases 0-4. Phase 5 adds new endpoints for features that exist in the backend but have no dashboard API yet. Phase 6 adds user plugin route registration.

### Existing endpoints (unchanged — used by Phases 3-4)

```
GET  /api/overview          — Session state, tick count, uptime
GET  /api/repos             — All repos with git state
GET  /api/repos/:name       — Single repo detail
GET  /api/timeline          — Event timeline (filterable)
GET  /api/dreams            — Consolidation results
GET  /api/dreams/patterns/:repo — Per-repo patterns
POST /api/dreams/trigger    — Manual dream trigger
GET  /api/memory            — Memory stats (vector, topic, index, log)
GET  /api/memory/search     — FTS5 + semantic memory search
POST /api/memory/ask        — Ask Vigil (LLM query with tool use)
GET  /api/actions           — Action history
GET  /api/actions/pending   — Pending approvals
POST /api/actions/:id/approve
POST /api/actions/:id/reject
GET  /api/tasks             — All tasks (filterable by status, repo)
POST /api/tasks             — Create task
PUT  /api/tasks/:id         — Update task
POST /api/tasks/:id/activate|complete|fail — Status transitions
DELETE /api/tasks/:id       — Cancel task
GET  /api/scheduler         — All schedules
POST /api/scheduler         — Create schedule
DELETE /api/scheduler/:id
POST /api/scheduler/:id/trigger
GET  /api/metrics           — Decision counts, latency, tokens, cost
GET  /api/sse               — Server-Sent Events stream
```

### New endpoints — Phase 5 (backend features without dashboard API)

```
# Config plugin
GET  /api/config            — Full config object
PUT  /api/config            — Update config keys
GET  /api/config/features   — Feature gate states (build + config + env)

# Webhooks plugin (VIGIL_WEBHOOKS)
GET  /api/webhooks/events   — Recent webhook events received
GET  /api/webhooks/subscriptions — Active subscriptions
POST /api/webhooks/subscriptions — Add subscription
DELETE /api/webhooks/subscriptions/:id
GET  /api/webhooks/status   — Server health, HMAC validation stats

# Channels plugin (VIGIL_CHANNELS)
GET  /api/channels          — Registered MCP channels
POST /api/channels          — Register channel
DELETE /api/channels/:id    — Unregister channel
GET  /api/channels/:id/permissions — Channel gate results
GET  /api/channels/:id/queue — Pending messages for channel

# Notifications plugin (VIGIL_PUSH)
GET  /api/notifications     — Recent notification deliveries
POST /api/notifications/test — Send test notification

# A2A plugin (VIGIL_A2A)
GET  /api/a2a/status        — Server running, port, connection count
GET  /api/a2a/skills        — Registered agent skills
GET  /api/a2a/history       — Recent RPC calls
```

### New endpoints — Phase 6 (user plugins)

```
GET  /api/plugins           — Registered plugin manifests (core + user)
*    /api/plugins/:id/*     — User plugin-provided routes
```

### New SSE event types (Phase 5)

```
webhook     — New GitHub webhook received
channel     — Channel registered/unregistered/message delivered
```

## Dependencies (new)

```json
{
  "dependencies": {
    "@tanstack/react-start": "~1.121.0",
    "@tanstack/react-router": "~1.121.0",
    "@tanstack/react-query": "^5.x",
    "react": "^19.x",
    "react-dom": "^19.x",
    "recharts": "^2.15.0",
    "lucide-react": "^0.470.0",
    "class-variance-authority": "^0.7",
    "clsx": "^2.x",
    "tailwind-merge": "^3.x"
  }
}
```

shadcn/ui components are copied, not installed as a dependency.

TanStack Start uses Vite as its build layer (migrated from Vinxi in v1.121+) — no separate bundler config needed.

## Constraints

- No emojis anywhere in the UI — Lucide icons only
- Dashboard must work fully offline (no CDN, no external fetches)
- Brand colors: `#222745` (navy bg), `#FF8102` (orange accent)
- Backend API layer stays on `Bun.serve()` — JSON endpoints + SSE unchanged
- TanStack Start serves the frontend (SSR + client) with Bun preset
- Server functions access Daemon directly via injected context (no HTTP round-trip for internal data)
- All existing JSON API contracts preserved for SSE and plugin routes
- Charts via Recharts v2.15+ (shadcn chart components), not Chart.js
- Zod validation on server function inputs (matches Vigil's existing Zod-everywhere pattern)
- TanStack Start pinned to `~1.121.x` — test before upgrading (young framework, API may shift)
- Vinxi is no longer used — TanStack Start v1.121+ uses Vite directly
