# Phase 3 — Plugin System & Timeline

---
duration: ~4 hours
depends_on: Phase 2 (Shell Layout — sidebar, SSE hook, root layout all working)
blocks: Phase 4 (Port Core Plugins), Phase 5 (New Core Plugins), Phase 6 (User Plugin Support)
risk: MEDIUM — plugin registry is a simple array pattern, but lazy loading + error boundaries need testing
stack: typescript
runner: single-agent
---

## 1. Objective + What Success Looks Like

**Objective**: Build the plugin registration system and port Timeline as the first core plugin, proving the plugin interface works end-to-end — from plugin manifest to lazy-loaded component rendering inside the shell layout with live SSE updates.

**Observable success conditions**:

1. `corePlugins` array in `app/plugins/index.ts` contains all 15 tab plugin entries with correct ids, labels, icons, orders, lazy imports, SSE events, query keys, and feature gates
2. `<PluginSlot>` renders a plugin component via a client-only lazy wrapper (not bare `React.lazy()`, which throws during SSR) with Suspense skeleton fallback and ErrorBoundary catching load failures
3. ErrorBoundary class component displays a styled error message with the failing plugin id when a plugin throws
4. Timeline plugin renders a decision feed with SILENT/OBSERVE/NOTIFY/ACT badges using correct colors and Lucide icons (Moon, Eye, Bell, Zap)
5. Decision filter bar toggles between decision types and updates the feed
6. Search input filters timeline entries via debounced FTS5 query (300ms delay)
7. Repo filter dropdown populated from `getRepos()` narrows results to a single repo
8. Pagination controls (Previous/Next) navigate pages with page count display
9. Timeline entries are expandable — collapsed shows line-clamp-2 message, expanded shows full metadata JSON
10. Inline reply form submits via `replyToMessage` server function and shows confirmation
11. Confidence percentage displays right-aligned on each entry (e.g., "85%")
12. Live SSE indicator (pulsing dot) reflects connection status from `useSSE` hook
13. Index route (`/`) loads Timeline through TanStack Router's `lazyRouteComponent()` (SSR-safe, not bare `React.lazy()`)

---

## 2. Key Design Decisions

### Plugin architecture

The plugin system uses a static array pattern — no dynamic registration, no runtime plugin discovery (that comes in Phase 6). Core plugins are defined as `PluginWidget[]` and consumed directly by the sidebar and route components.

```
Plugin Flow:

corePlugins array ──→ AppSidebar (nav items)
       │                    │
       │                    ▼
       │              Route matched by id
       │                    │
       ▼                    ▼
  PluginSlot ──→ ClientOnly lazy(plugin.component)
       │              │
       ▼              ▼
  ErrorBoundary   Suspense (Skeleton)
       │              │
       ▼              ▼
  Error fallback   Rendered plugin component
```

> **SSR safety**: Native `React.lazy()` throws on the server during SSR. Since plugins render inside routes (not at the route level), PluginSlot uses a client-only wrapper that renders `null` on the server and lazy-loads the plugin component on the client. Route-level code splitting uses TanStack Router's `lazyRouteComponent()` or the `.lazy()` route method instead.

### Data model strategy (TypeScript)

| Entity | Pattern | Why |
|---|---|---|
| `PluginWidget` | `interface` (from Phase 1 types/plugin.ts) | Already defined — `id`, `label`, `icon`, `slot`, `order`, `component`, `sseEvents?`, `queryKeys?`, `featureGate?` |
| `WidgetProps` | `interface` (from Phase 1 types/plugin.ts) | Props passed to every plugin component: `{ activeRepo: string \| null; queryClient: QueryClient }` |
| `WidgetSlot` | `type` union (from Phase 1 types/plugin.ts) | `"tab" \| "sidebar" \| "timeline-card" \| "overlay" \| "top-bar"` |
| `TimelineMessage` | `interface` (from Phase 1 types/api.ts) | Already defined — used by timeline-entry component |
| Timeline filters | Inline state object | `{ status?: string; repo?: string; q?: string; page?: number }` — local component state, not shared |
| Decision config | `const` object | Static mapping of decision type to icon, variant, and className — no need for a type file |

### Critical rules

- **Lazy imports only**: Every plugin uses `() => import("./path/to/Page")` — never static imports. This keeps the initial bundle small and proves the lazy-load pipeline works.
- **SSR-safe lazy loading**: Never use bare `React.lazy()` — it throws on the server during SSR. For route-level splits, use TanStack Router's `lazyRouteComponent()` from `@tanstack/react-router`. For non-route plugin loading (PluginSlot), use a `ClientOnly` wrapper that renders `null` on the server and calls `lazy()` only on the client (guard with `typeof window !== 'undefined'`).
- **Error isolation**: Each plugin renders inside its own ErrorBoundary. A broken plugin must never crash the entire dashboard.
- **Feature gates are strings**: The `featureGate` field references environment variable names (e.g., `"VIGIL_TASKS"`). Gating logic is deferred to Phase 4+ — Phase 3 defines the field but does not implement gate checking.
- **Plugin components export default**: Every plugin page module must have a `default` export matching `ComponentType<WidgetProps>` for lazy import compatibility.
- **No backend changes**: Timeline uses the existing `getTimeline` and `replyToMessage` server functions from Phase 1. No new API endpoints.

---

## 3. Tasks

### Task 3.1 — Plugin registry and core plugin manifest (~1 hr)

**Depends on**: Phase 2 complete (sidebar renders, types exist)
**Completion condition**: `corePlugins` array exports 15 `PluginWidget` entries, each with valid id/label/icon/slot/order/component/sseEvents/queryKeys and optional featureGate

**Implementation notes**:

1. Create `app/plugins/index.ts` importing `PluginWidget` from `../types/plugin`
2. Define `corePlugins: PluginWidget[]` with all 15 entries:
   - `timeline` — order 0, icon "Activity", sseEvents ["tick", "message"], queryKeys [["timeline"]]
   - `repos` — order 10, icon "GitBranch", sseEvents ["tick"], queryKeys [["repos"]]
   - `dreams` — order 20, icon "Sparkles", sseEvents ["dream"], queryKeys [["dreams"]]
   - `tasks` — order 30, icon "CheckSquare", sseEvents ["tick"], queryKeys [["tasks"]], featureGate "VIGIL_TASKS"
   - `actions` — order 40, icon "Zap", sseEvents ["action_pending", "action"], queryKeys [["actions"]]
   - `memory` — order 50, icon "Brain", sseEvents ["dream"], queryKeys [["memory"]]
   - `metrics` — order 60, icon "BarChart3", sseEvents ["tick", "decision"], queryKeys [["metrics"]]
   - `scheduler` — order 70, icon "Clock", sseEvents ["tick", "schedule_fired"], queryKeys [["scheduler"]], featureGate "VIGIL_SCHEDULER"
   - `config` — order 75, icon "Settings", sseEvents ["config_changed"], queryKeys [["config"]]
   - `agents` — order 80, icon "Bot", queryKeys [["agents"]], featureGate "VIGIL_AGENT_IDENTITY"
   - `health` — order 85, icon "HeartPulse", sseEvents ["health"], queryKeys [["health"]]
   - `webhooks` — order 90, icon "Webhook", sseEvents ["webhook"], queryKeys [["webhooks"]], featureGate "VIGIL_WEBHOOKS"
   - `channels` — order 91, icon "Radio", sseEvents ["channel"], queryKeys [["channels"]], featureGate "VIGIL_CHANNELS"
   - `notifications` — order 92, icon "Bell", sseEvents ["message"], queryKeys [["notifications"]], featureGate "VIGIL_PUSH"
   - `a2a` — order 93, icon "Network", queryKeys [["a2a"]], featureGate "VIGIL_A2A"
3. Each `component` field uses lazy import: `() => import("./timeline/TimelinePage")`, etc.
4. Non-timeline plugins point to placeholder modules (stub files created in Phase 4+) — for now, only the timeline component path needs to resolve

**Sanity checks**:
- All 15 entries have unique `id` values
- `order` values are monotonically increasing with no duplicates
- Every entry has `slot: "tab"`
- Feature-gated plugins: tasks, scheduler, agents, webhooks, channels, notifications, a2a (7 total)
- Non-gated plugins: timeline, repos, dreams, actions, memory, metrics, config, health (8 total)

**Files created**: `app/plugins/index.ts`

---

### Task 3.2 — Plugin slot renderer (~45 min)

**Depends on**: Task 3.1 (needs PluginWidget type and manifest)
**Completion condition**: `<PluginSlot plugin={...} widgetProps={...} />` renders a lazy-loaded component with Suspense skeleton, and displays an error card when the plugin throws

**Implementation notes**:

1. Create `app/components/vigil/error-boundary.tsx`:
   - Class component extending `Component<Props, State>`
   - `Props`: `{ children: ReactNode; fallback: ReactNode }`
   - `State`: `{ hasError: boolean }`
   - `static getDerivedStateFromError()` returns `{ hasError: true }`
   - `render()` returns `this.props.fallback` when error, `this.props.children` otherwise

2. Create `app/components/vigil/plugin-slot.tsx`:
   - Accepts `{ plugin: PluginWidget; widgetProps: WidgetProps }`
   - Uses a `ClientOnly` pattern: on the server (`typeof window === 'undefined'`), renders the Skeleton fallback. On the client, calls `useMemo(() => lazy(plugin.component), [plugin.id])` to create a stable lazy component and renders it inside `<Suspense>`.
   - This avoids bare `React.lazy()` during SSR (which throws because `lazy()` relies on client-side module loading).
   - Wraps in `<ErrorBoundary fallback={<PluginError pluginId={plugin.id} />}>`
   - Inner `<Suspense fallback={<Skeleton className="h-64 w-full" />}>`
   - `PluginError` renders styled error div: `bg-error/10 border-error/30 rounded-lg text-error`

**Sanity checks**:
- `useMemo` key is `plugin.id`, not `plugin` object reference — prevents unnecessary re-renders
- Lazy component is only created on the client — server renders the Skeleton placeholder
- ErrorBoundary is a class component (React requirement — hooks cannot catch render errors)
- Skeleton import comes from shadcn/ui `../ui/skeleton` (installed in Phase 1)

**Files created**: `app/components/vigil/error-boundary.tsx`, `app/components/vigil/plugin-slot.tsx`

---

### Task 3.3 — Timeline plugin — core list and decision badges (~1.5 hr)

**Depends on**: Task 3.1 (plugin manifest references TimelinePage), Phase 1 server functions (getTimeline, replyToMessage, getRepos), Phase 1 types (TimelineMessage, WidgetProps)
**Completion condition**: Timeline renders decision feed with working filters, pagination, expandable entries, decision badges, inline reply, and live indicator

**Implementation notes**:

1. Create `app/components/vigil/decision-badge.tsx`:
   - Static `decisionConfig` object mapping decision strings to `{ icon, variant, className }`:
     - SILENT: Moon icon, "outline" variant, `text-text-muted border-border`
     - OBSERVE: Eye icon, "secondary" variant, `text-info bg-info/10`
     - NOTIFY: Bell icon, "default" variant, `text-warning bg-warning/10`
     - ACT: Zap icon, "destructive" variant, `text-vigil bg-vigil/10`
   - `DecisionBadge({ decision: string })` renders a `<Badge>` with the matched icon and styling
   - Falls back to SILENT config for unknown decision values

2. Create `app/components/vigil/timeline-entry.tsx`:
   - `TimelineEntry({ message }: { message: TimelineMessage })` with `useState` for expanded toggle
   - Extracts `decision` from `message.metadata?.decision` (defaults to "SILENT")
   - Extracts `confidence` from `message.metadata?.confidence`
   - Renders inside a `<Card>` with `bg-surface border-border hover:border-border-light`
   - Header row: expand toggle (ChevronDown/ChevronRight), DecisionBadge, repo name, confidence %, timestamp
   - Message body: `line-clamp-2` when collapsed, full text when expanded
   - Expanded section: metadata JSON in `<pre>` block, plus `<ReplyForm>` component
   - Lucide icons: ChevronDown, ChevronRight, MessageSquare

3. Create `app/plugins/timeline/DecisionFilter.tsx`:
   - Horizontal button bar with decision types: All, SILENT, OBSERVE, NOTIFY, ACT
   - Active filter gets highlighted styling
   - `onChange` callback passes selected status string (or undefined for "All")

4. Create `app/plugins/timeline/ReplyForm.tsx`:
   - Textarea for reply text + Submit button
   - Calls `replyToMessage({ data: { messageId, reply } })` on submit
   - Shows confirmation text on success, error state on failure
   - Button disabled while submitting (useMutation pattern)

5. Create `app/plugins/timeline/TimelinePage.tsx`:
   - Default export: `TimelinePage({ activeRepo }: WidgetProps)`
   - Local state: `filters: { status?, repo?, q?, page? }` initialized with `repo: activeRepo ?? undefined`
   - Query: `useQuery({ queryKey: vigilKeys.timeline(filters), queryFn: () => getTimeline({ data: filters }) })`
   - Layout (top to bottom):
     - Live SSE indicator (pulsing dot) — reads connection status from `useSSE` hook or passed prop
     - Search input with 300ms debounce (sets `filters.q`)
     - Repo filter `<Select>` populated from `useQuery({ queryKey: vigilKeys.repos.all, queryFn: getRepos })`
     - `<DecisionFilter>` bar (sets `filters.status`)
     - Entry list: `data.messages.map(msg => <TimelineEntry key={msg.id} message={msg} />)`
     - Pagination: Previous/Next buttons with `{page} / {pageCount}` display
   - Debounce implementation: use `setTimeout`/`clearTimeout` in a `useEffect` or a `useDebouncedCallback` utility

**Sanity checks**:
- `TimelinePage` has a `default` export (required by lazy dynamic imports)
- Search debounce does not fire on mount — only on input change
- Pagination buttons are disabled at boundaries (page 1 for Previous, pageCount for Next)
- Reply form clears textarea after successful submit
- Decision badge falls back gracefully for unknown decision strings

**Files created**:
- `app/plugins/timeline/TimelinePage.tsx`
- `app/plugins/timeline/DecisionFilter.tsx`
- `app/plugins/timeline/ReplyForm.tsx`
- `app/components/vigil/timeline-entry.tsx`
- `app/components/vigil/decision-badge.tsx`

---

### Task 3.4 — Wire Timeline route to plugin component (~30 min)

**Depends on**: Task 3.2 (PluginSlot), Task 3.3 (TimelinePage component)
**Completion condition**: Navigating to `/` loads the Timeline plugin via TanStack Router's `lazyRouteComponent()` (SSR-safe), and the route loader prefetches timeline data

**Implementation notes**:

1. Modify `app/routes/index.tsx`:
   - Import `createFileRoute` from `@tanstack/react-router`
   - Import `lazyRouteComponent` from `@tanstack/react-router`
   - Import `getTimeline` from `../server/functions`
   - Use `lazyRouteComponent(() => import("../plugins/timeline/TimelinePage"), "default")` for the route component — this is SSR-safe unlike bare `React.lazy()` which throws on the server
   - Define route with `createFileRoute("/")`:
     - `loader`: calls `getTimeline({ data: {} })` to prefetch initial page
     - `component`: the lazy-loaded TimelinePage via `lazyRouteComponent`
   - Pass `activeRepo={null}` and `queryClient` to TimelinePage (WidgetProps contract)

2. Verify the full flow: sidebar "Timeline" link navigates to `/`, route loader fires, lazy chunk loads via TanStack Router's SSR-safe mechanism, TimelinePage renders with prefetched data

**Sanity checks**:
- Route loader uses `getTimeline({ data: {} })` with empty filters (no crash on undefined)
- Uses `lazyRouteComponent` (not `React.lazy`) — safe for SSR because TanStack Router handles the server/client boundary
- Lazy import path `../plugins/timeline/TimelinePage` resolves correctly from routes directory
- Skeleton fallback dimensions match content area (not full viewport)

**Files modified**: `app/routes/index.tsx`

---

## 4. Deliverables

```
dashboard-v2/app/
├── plugins/
│   ├── index.ts                              # Core plugin manifest (15 entries)
│   └── timeline/
│       ├── TimelinePage.tsx                   # Decision feed with filters, search, pagination
│       ├── DecisionFilter.tsx                 # Decision type filter bar
│       └── ReplyForm.tsx                      # Inline reply textarea + submit
├── components/vigil/
│   ├── plugin-slot.tsx                        # Lazy loader with ErrorBoundary + Suspense
│   ├── error-boundary.tsx                     # React class component error boundary
│   ├── timeline-entry.tsx                     # Expandable timeline card with metadata
│   └── decision-badge.tsx                     # SILENT/OBSERVE/NOTIFY/ACT colored badges
└── routes/
    └── index.tsx                              # (modified) Wired to Timeline via plugin system
```

**Total**: 7 new files, 1 modified file

---

## 5. Exit Criteria

- [ ] `app/plugins/index.ts` exports `corePlugins` array with 15 `PluginWidget` entries, each with unique id, correct order, icon, slot, lazy component import, sseEvents, queryKeys, and featureGate where applicable
- [ ] `<PluginSlot>` renders a lazy-loaded plugin with Suspense skeleton fallback and catches render errors via ErrorBoundary
- [ ] `ErrorBoundary` class component displays styled error message with plugin id on failure
- [ ] `DecisionBadge` renders four decision types with correct colors and Lucide icons (SILENT: Moon/outline, OBSERVE: Eye/info, NOTIFY: Bell/warning, ACT: Zap/vigil-orange)
- [ ] `TimelineEntry` expands/collapses with line-clamp-2, shows decision badge, repo, confidence %, timestamp, and full metadata JSON when expanded
- [ ] `DecisionFilter` toggles between All/SILENT/OBSERVE/NOTIFY/ACT and updates the feed
- [ ] Search input debounces at 300ms and filters via `getTimeline` server function
- [ ] Repo filter dropdown populates from `getRepos()` and narrows results
- [ ] Pagination (Previous/Next) navigates pages with correct boundary disabling
- [ ] `ReplyForm` submits via `replyToMessage` and shows confirmation
- [ ] Index route (`/`) loads Timeline through `lazyRouteComponent()` (SSR-safe) with route loader prefetching initial data
- [ ] No static imports of plugin components anywhere — all plugin loads go through lazy imports

---

## 6. Execution Prompt

You are implementing Phase 3 (Plugin System & Timeline) of Vigil Dashboard v2 — a TanStack Start + React rewrite of an existing HTMX dashboard for a local git monitoring daemon.

### What the project is

Vigil is a local dev tool that watches git repos and makes LLM-powered decisions. The dashboard v2 lives in `dashboard-v2/` at the repo root. It uses TanStack Start embedded in `Bun.serve()` on port 7480, with TanStack Router, TanStack Query, React 19, shadcn/ui, Tailwind v4, and Lucide React.

### What prior phases established

- **Phase 0**: TanStack Start app scaffolded, Bun.serve() embedding proven, Tailwind v4 + shadcn/ui working
- **Phase 1**: Full project structure including 15+ routes, all shadcn/ui components, TypeScript types (`app/types/api.ts` with all API response types, `app/types/plugin.ts` with `PluginWidget`/`WidgetSlot`/`WidgetProps`), server functions wrapping all APIs (`app/server/functions.ts`), query key factory (`app/lib/query-keys.ts`), Lucide React
- **Phase 2**: Shell layout with shadcn/ui Sidebar (`SidebarProvider` + `AppSidebar` + `SidebarInset` + `SiteHeader`), SSE hook (`useSSE` with event-to-query-key invalidation mapping), root layout assembly, `NextTickCountdown`, breadcrumbs

### What this phase builds

This phase creates the plugin registration system and ports Timeline as the first core plugin, proving that the plugin manifest -> lazy load -> render pipeline works end-to-end.

### Type definitions (already exist from Phase 1)

```typescript
// app/types/plugin.ts — DO NOT recreate, import from here
export type WidgetSlot = "tab" | "sidebar" | "timeline-card" | "overlay" | "top-bar";

export interface WidgetProps {
  activeRepo: string | null;
  queryClient: QueryClient;
}

export interface PluginWidget {
  id: string;
  label: string;
  icon: string;
  slot: WidgetSlot;
  order: number;
  component: () => Promise<{ default: ComponentType<WidgetProps> }>;
  sseEvents?: string[];
  queryKeys?: readonly string[][];
  featureGate?: string;
}
```

```typescript
// app/lib/query-keys.ts — already exists, use these keys
export const vigilKeys = {
  overview: ["overview"] as const,
  repos: {
    all: ["repos"] as const,
    detail: (name: string) => ["repos", name] as const,
  },
  timeline: (filters?: { status?: string; repo?: string; q?: string; page?: number }) =>
    ["timeline", filters ?? {}] as const,
  dreams: ["dreams"] as const,
  // ... (full key factory already defined)
} as const;
```

```typescript
// app/types/api.ts — TimelineMessage interface already exists
// Includes: id, message, source: { repo }, timestamp, metadata (decision, confidence, etc.)
```

### Server functions (already exist from Phase 1)

```typescript
// app/server/functions.ts — DO NOT recreate
export const getTimeline = createServerFn({ method: "GET" })
  .inputValidator(z.object({
    status: z.string().optional(),
    repo: z.string().optional(),
    q: z.string().optional(),
    page: z.number().optional(),
  }))
  .handler(async ({ data }) => { /* calls getTimelineJSON */ });

export const replyToMessage = createServerFn({ method: "POST" })
  .inputValidator(z.object({ messageId: z.string(), reply: z.string() }))
  .handler(async ({ data }) => { /* posts reply */ });

export const getRepos = createServerFn({ method: "GET" })
  .handler(async () => { /* calls getReposJSON */ });
```

### Architecture decisions (must follow)

- **Plugin components must use default exports**: Lazy dynamic imports require `export default function TimelinePage`.
- **All plugin loads are lazy**: Use `() => import("./path")` in the manifest. Never statically import a plugin component.
- **ErrorBoundary is a class component**: React hooks cannot catch render errors. Must extend `Component`.
- **`useMemo` keyed on `plugin.id`**: The lazy component reference must be stable across re-renders. Key on the string id, not the plugin object.
- **No feature gate logic yet**: Define the `featureGate` field on plugins that need it, but do not implement gate checking. That comes in Phase 4+.
- **Use existing imports**: All types, server functions, query keys, shadcn/ui components, and Lucide icons are already installed and available.

### Files to create

**1. `app/plugins/index.ts`** — Core plugin manifest
- Export `corePlugins: PluginWidget[]` with 15 entries (see Task 3.1 for full list)
- Each entry: id, label, icon (Lucide component name as string), slot "tab", order, component (lazy import), sseEvents, queryKeys, optional featureGate
- Only the timeline plugin component exists in this phase — other plugins reference paths that will be created in Phase 4+

**2. `app/components/vigil/error-boundary.tsx`** — ErrorBoundary class component
```typescript
import { Component, type ReactNode } from "react";

interface Props { children: ReactNode; fallback: ReactNode; }
interface State { hasError: boolean; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(): State { return { hasError: true }; }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
```

**3. `app/components/vigil/plugin-slot.tsx`** — Plugin slot renderer (SSR-safe)
```typescript
import { Suspense, lazy, useMemo, useState, useEffect } from "react";
import { ErrorBoundary } from "./error-boundary";
import { Skeleton } from "../ui/skeleton";
import type { PluginWidget, WidgetProps } from "../../types/plugin";

interface PluginSlotProps { plugin: PluginWidget; widgetProps: WidgetProps; }

export function PluginSlot({ plugin, widgetProps }: PluginSlotProps) {
  // Client-only guard: React.lazy() throws during SSR.
  // Render skeleton on server, lazy-load on client.
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  const LazyComponent = useMemo(
    () => (isClient ? lazy(plugin.component) : null),
    [plugin.id, isClient]
  );

  return (
    <ErrorBoundary fallback={<PluginError pluginId={plugin.id} />}>
      {LazyComponent ? (
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <LazyComponent {...widgetProps} />
        </Suspense>
      ) : (
        <Skeleton className="h-64 w-full" />
      )}
    </ErrorBoundary>
  );
}

function PluginError({ pluginId }: { pluginId: string }) {
  return (
    <div className="p-4 bg-error/10 border border-error/30 rounded-lg text-error text-sm">
      Plugin "{pluginId}" failed to load.
    </div>
  );
}
```

**4. `app/components/vigil/decision-badge.tsx`** — Decision type badges
- Config object: SILENT (Moon, outline, muted), OBSERVE (Eye, secondary, info blue), NOTIFY (Bell, default, warning amber), ACT (Zap, destructive, vigil orange)
- Falls back to SILENT for unknown values

**5. `app/components/vigil/timeline-entry.tsx`** — Expandable timeline card
- Card with expand toggle, DecisionBadge, repo, confidence %, timestamp
- Collapsed: line-clamp-2 message
- Expanded: full message, metadata JSON pre block, ReplyForm
- Lucide icons: ChevronDown, ChevronRight

**6. `app/plugins/timeline/DecisionFilter.tsx`** — Filter bar
- Buttons for All, SILENT, OBSERVE, NOTIFY, ACT
- Active state highlighted, onChange callback

**7. `app/plugins/timeline/ReplyForm.tsx`** — Inline reply
- Textarea + Submit button
- Calls `replyToMessage` server function
- Disabled while submitting, confirmation on success

**8. `app/plugins/timeline/TimelinePage.tsx`** — Main Timeline plugin
- Default export (required by React.lazy)
- Accepts `WidgetProps`, uses `activeRepo` for initial filter
- Search input with 300ms debounce
- Repo filter dropdown from `getRepos()` query
- DecisionFilter bar
- TimelineEntry list from `getTimeline()` query with `vigilKeys.timeline(filters)`
- Pagination: Previous/Next with page count
- Live SSE indicator (pulsing dot)

### File to modify

**`app/routes/index.tsx`** — Replace current content:
```typescript
import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getTimeline } from "../server/functions";

export const Route = createFileRoute("/")({
  loader: () => getTimeline({ data: {} }),
  component: lazyRouteComponent(
    () => import("../plugins/timeline/TimelinePage"),
    "default"
  ),
});
```

> **Why `lazyRouteComponent` instead of `React.lazy`**: Native `React.lazy()` throws during SSR because it relies on client-side module loading. TanStack Router's `lazyRouteComponent()` handles the server/client boundary correctly, making it the right choice for route-level code splitting in a TanStack Start app.

### Execution order

1. Task 3.1 — Plugin registry (creates the manifest that everything depends on)
2. Task 3.2 — PluginSlot + ErrorBoundary (rendering infrastructure)
3. Task 3.3 — Timeline components (DecisionBadge, TimelineEntry, DecisionFilter, ReplyForm, TimelinePage)
4. Task 3.4 — Wire index route to Timeline via plugin system

### Success criteria

After implementation, verify:
```bash
# 1. TypeScript compiles without errors
cd dashboard-v2 && bunx tsc --noEmit

# 2. Dev server starts and Timeline renders at /
bun run dev
# Navigate to http://localhost:3000/ — see decision feed

# 3. Decision badges show correct colors
# SILENT: muted outline, OBSERVE: blue, NOTIFY: amber, ACT: orange

# 4. Filters work
# Click OBSERVE filter — only OBSERVE entries shown
# Type in search — debounced filter applied
# Select repo from dropdown — narrows to that repo

# 5. Expand/collapse works
# Click chevron — entry expands, shows metadata JSON
# Click again — collapses to line-clamp-2

# 6. Pagination navigates
# Click Next — page increments, new entries load
# Click Previous — page decrements

# 7. Reply form submits
# Expand entry, type reply, click submit — confirmation shown

# 8. Error boundary catches failures
# Temporarily break a plugin import — error card renders instead of crash

# 9. Plugin manifest is complete
# Verify corePlugins has exactly 15 entries with correct ids and orders
```

---

## Readiness Check

- [PASS] All inputs from prior phases are listed and available — Phase 1 types (PluginWidget, WidgetProps, TimelineMessage), server functions (getTimeline, replyToMessage, getRepos), query key factory (vigilKeys), shadcn/ui components, Lucide React icons
- [PASS] Every sub-task has a clear, testable completion condition
- [PASS] Execution prompt is self-contained: includes (a) full type definitions from Phase 1, (b) server function signatures, (c) query key patterns, (d) per-file implementation guidance, (e) observable success criteria
- [PASS] Exit criteria map 1:1 to deliverables (plugin manifest -> index.ts, PluginSlot -> plugin-slot.tsx, ErrorBoundary -> error-boundary.tsx, badges -> decision-badge.tsx, timeline -> TimelinePage + subcomponents, route wiring -> index.tsx)
- [PASS] Any heavy external dependency has a fake/stub strategy noted — non-timeline plugins reference stub paths that will be created in Phase 4+; no backend changes required
- [PASS] All libraries (React.lazy, Suspense, TanStack Query, shadcn/ui Badge/Card/Button/Skeleton/Select, Lucide icons) are already installed from Phase 0/1 — no new dependencies
