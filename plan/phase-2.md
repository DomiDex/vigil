# Phase 2 — Shell Layout

---
duration: ~5 hours
depends_on: Phase 1 (Scaffold — routes, types, server functions, query keys all in place)
blocks: Phase 3 (Plugin System & Timeline)
risk: MEDIUM — standard shadcn/ui sidebar pattern, but SSE invalidation mapping needs careful testing
stack: typescript
runner: single-agent
---

## 1. Objective + What Success Looks Like

**Objective**: Build the persistent UI shell using the standard shadcn/ui Sidebar component — navigation, repo list, daemon status, all wired to live data via SSE. All content areas show stub text until Phase 3+.

**Observable success conditions**:

1. The dashboard renders a collapsible sidebar on the left with a Vigil branding header, navigation menu listing all core plugin tabs, a repositories group with state indicators, and a daemon status footer
2. Pressing `Cmd+B` or clicking the `SidebarTrigger` collapses the sidebar to icon-only mode; hovering or clicking again expands it
3. Clicking any navigation item routes to the correct stub page and highlights the active item in the sidebar
4. The sticky site header shows a breadcrumb trail (`Vigil > [current page label]`), a live next-tick countdown, and a repo count badge
5. The next-tick countdown decrements every second without re-fetching from the server, resetting when new overview data arrives via SSE
6. SSE events from `/api/sse` trigger targeted TanStack Query cache invalidations — e.g., a `tick` event invalidates `overview`, `repos`, and `timeline` query keys, causing those queries to refetch
7. SSE reconnects automatically with exponential backoff (1s, 2s, 4s, ... capped at 30s) when the connection drops
8. The root layout wraps the entire app in `QueryClientProvider > TooltipProvider > SidebarProvider` with `useSSE()` running once in the `AppShell` component
9. All existing route stubs from Phase 1 render inside the `<Outlet />` within `SidebarInset`, inheriting the shell layout
10. Repository entries in the sidebar show state indicators: green circle for active, moon icon for sleeping, sparkles icon for dreaming, and a warning dot for dirty repos

---

## 2. Key Design Decisions

### Data model strategy (TypeScript)

| Entity | Pattern | Why |
|---|---|---|
| `PluginWidget` | `interface` (from Phase 1 `types/plugin.ts`) | Defines the contract for sidebar navigation items — `id`, `label`, `icon`, `slot`, `order`, `component`. AppSidebar filters by `slot === "tab"` and sorts by `order`. |
| `OverviewData` | `interface` (from Phase 1 `types/api.ts`) | Provides `state`, `tickCount`, `uptime`, `nextTickIn`, `repoCount` for sidebar footer and site header status displays. |
| `RepoListItem` | `interface` (from Phase 1 `types/api.ts`) | Provides `name`, `state`, `dirty` for repo list in sidebar. State drives the indicator icon selection. |
| `SSE_EVENT_MAP` | `Record<string, readonly string[][]>` | Static lookup table mapping SSE event type strings to arrays of query keys for cache invalidation. Const object, not a class. |
| `routeLabels` | `Record<string, string>` | Maps pathname strings to human-readable labels for breadcrumbs. Simple const object in `site-header.tsx`. |

### Architecture: shell layout pattern

```
QueryClientProvider
  TooltipProvider
    SidebarProvider
      ┌──────────┬──────────────────────────────────────┐
      │ Sidebar  │  SidebarInset                        │
      │ [vigil]  │  ┌────────────────────────────────┐   │
      │ Nav      │  │ SiteHeader (trigger+breadcrumb)│   │
      │  Timeline│  ├────────────────────────────────┤   │
      │  Repos   │  │  <Outlet /> (route content)    │   │
      │  Dreams  │  │  (stub text until Phase 3+)    │   │
      │  Tasks   │  └────────────────────────────────┘   │
      │  Actions │                                       │
      │  Memory  │                                       │
      │  Metrics │                                       │
      │ Repos    │                                       │
      │  > vigil │                                       │
      │  > app   │                                       │
      │ [status] │                                       │
      └──────────┴──────────────────────────────────────┘
```

**SSE data flow**:
```
EventSource(/api/sse)  →  useSSE() hook  →  queryClient.invalidateQueries()
                                              ↓
                                         useQuery() refetches
                                              ↓
                                         AppSidebar / SiteHeader re-render
```

### Critical rules

- **No bottom nav bar** — all navigation lives in the sidebar. This is a standard desktop dashboard layout, not a mobile app.
- **`collapsible="icon"`** — the sidebar collapses to a narrow icon-only rail, never fully hides. `SidebarMenuButton` `tooltip` props provide labels when collapsed.
- **`TooltipProvider` is required** — shadcn sidebar tooltips in collapsed mode depend on it being above `SidebarProvider` in the tree.
- **`useSSE()` runs once** — called in `AppShell`, not in individual route components. All SSE events flow through a single `EventSource` connection.
- **Dynamic Lucide icon lookup** — `AppSidebar` imports `* as LucideIcons from "lucide-react"` and looks up icons by string name from `PluginWidget.icon`. This supports plugin-provided icon names without hardcoding.
- **`queryClient` is shared** — imported from `router.tsx` (created in Phase 1). Same instance used by `QueryClientProvider` and `useSSE()`.

---

## 3. Tasks

### Task 2.1 — Install shadcn/ui Sidebar + Separator + Breadcrumb (~15 min)

**Depends on**: Phase 1 complete (shadcn/ui already initialized, `components.json` exists)
**Completion condition**: `sidebar.tsx`, `separator.tsx`, `breadcrumb.tsx`, and `tooltip.tsx` exist in `src/components/ui/` and export all expected sub-components

**Steps**:
1. Run from `dashboard-v2/`:
   ```bash
   bunx shadcn@latest add sidebar separator breadcrumb tooltip
   ```
2. Verify `sidebar.tsx` exports: `SidebarProvider`, `Sidebar`, `SidebarHeader`, `SidebarContent`, `SidebarFooter`, `SidebarGroup`, `SidebarGroupLabel`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarMenuBadge`, `SidebarRail`, `SidebarInset`, `SidebarTrigger`, `useSidebar`
3. Verify `breadcrumb.tsx` exports: `Breadcrumb`, `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbPage`, `BreadcrumbSeparator`
4. Verify `tooltip.tsx` exports: `TooltipProvider`, `Tooltip`, `TooltipTrigger`, `TooltipContent`

**Sanity check**: `bun run dev` still starts without errors after adding components.

**Files created**:
- `dashboard-v2/src/components/ui/sidebar.tsx`
- `dashboard-v2/src/components/ui/separator.tsx`
- `dashboard-v2/src/components/ui/breadcrumb.tsx`
- `dashboard-v2/src/components/ui/tooltip.tsx`

---

### Task 2.2 — AppSidebar component (~1.5 hr)

**Depends on**: Task 2.1
**Completion condition**: `AppSidebar` renders with three sections (header, content with nav + repos, footer) and responds to `collapsible="icon"` toggling

**Implementation notes**:

1. Create `src/components/layout/app-sidebar.tsx`
2. The component accepts `plugins: PluginWidget[]` prop
3. **Header**: `SidebarHeader` > `SidebarMenu` > `SidebarMenuItem` > `SidebarMenuButton` linking to `/` with `size="lg"`. Contains a square Vigil icon (Activity from Lucide, `bg-vigil text-white rounded-lg`) and "Vigil" / "Dashboard" text.
4. **Navigation group**: `SidebarGroup` with `SidebarGroupLabel` "Navigation". Filters `plugins` by `slot === "tab"`, sorts by `order`. Each plugin tab renders as `SidebarMenuItem` > `SidebarMenuButton` with `asChild` wrapping a TanStack Router `<Link>`. Uses `useRouterState()` to get `location.pathname` for `isActive` comparison. Icon resolved dynamically: `const Icon = (LucideIcons as Record<string, any>)[tab.icon]`. Path mapping: `tab.id === "timeline" ? "/" : \`/${tab.id}\``.
5. **Repos group**: `SidebarGroup` with `SidebarGroupLabel` "Repositories". Uses `useQuery` with `vigilKeys.repos.all` and `getRepos()` server function. Each repo renders with `GitBranch` icon, repo name, and a `SidebarMenuBadge` containing a `RepoStateIndicator` sub-component.
6. **Footer**: `SidebarFooter` > `SidebarMenu` > `SidebarMenuItem` > `SidebarMenuButton` with tooltip showing state and tick count. Uses `useQuery` with `vigilKeys.overview` and `getOverview()` (30s refetch interval). Displays a `DaemonStateIcon` sub-component, state name (capitalized), tick count, and uptime.
7. **`SidebarRail`**: Added at the end of `<Sidebar>` for the drag-to-resize handle.
8. **Sub-components** (defined in same file):
   - `RepoStateIndicator({ state, dirty })`: warning dot if dirty + state icon (green `Circle` for active, `Moon` for sleeping, `Sparkles` for dreaming)
   - `DaemonStateIcon({ state })`: returns `Moon` for sleeping, `Sparkles` for dreaming, `Circle` for awake/default

**Sanity check**: With mock data or dev proxy running, sidebar renders navigation items matching the `corePlugins` array from `plugins/index.ts`. Clicking items navigates to the correct route. Collapsing sidebar shows only icons with tooltips on hover.

**Files created**:
- `dashboard-v2/src/components/layout/app-sidebar.tsx`

---

### Task 2.3 — Site header with breadcrumbs and status bar (~1 hr)

**Depends on**: Task 2.1
**Completion condition**: Sticky header renders breadcrumbs reflecting current route, live tick countdown, and repo count badge

**Implementation notes**:

1. Create `src/components/layout/site-header.tsx`
2. **Structure**: `<header>` with `h-12`, `shrink-0`, `border-b border-border`, `bg-surface-dark`, `px-4`. Flex row with gap-2.
3. **Left side**: `SidebarTrigger` (hamburger icon, `text-text-muted`), vertical `Separator` (height 4), then `Breadcrumb` component.
4. **Breadcrumbs**: Uses a `routeLabels` map (`"/": "Timeline"`, `"/repos": "Repos"`, etc.) keyed by `location.pathname` from `useRouterState()`. Renders `Vigil > [current page label]`. Falls back to "Dashboard" for unknown routes.
5. **Right side** (flex-1 spacer then right-aligned): `NextTickCountdown` component + repo count `Badge` (variant="outline").
6. **Data**: `useQuery` with `vigilKeys.overview` / `getOverview()` at 30s refetch. Displays `data.nextTickIn` and `data.repoCount`.

7. Create `src/components/layout/next-tick-countdown.tsx`
8. **NextTickCountdown**: Pure client component. Props: `{ nextTickIn: number }`. Uses `useState` seeded from `nextTickIn`, `useEffect` to reset when prop changes, `useEffect` with `setInterval` (1s) to decrement. Renders `font-mono tabular-nums` text: `"{seconds}s"` or `"now"` when <= 0. Stops interval at 0 to avoid negative display.

**Sanity check**: Navigate between routes — breadcrumb text updates. Wait for a tick — countdown resets to new value. Open Network tab — no per-second API calls (countdown is client-side only).

**Files created**:
- `dashboard-v2/src/components/layout/site-header.tsx`
- `dashboard-v2/src/components/layout/next-tick-countdown.tsx`

---

### Task 2.4 — SSE hook with TanStack Query invalidation (~45 min)

**Depends on**: Phase 1 complete (query key factory in `lib/query-keys.ts`)
**Completion condition**: SSE events from `/api/sse` trigger cache invalidation for mapped query keys, and the hook reconnects with exponential backoff after disconnection

**Implementation notes**:

1. Create `src/hooks/use-sse.ts`
2. **Event map** (`SSE_EVENT_MAP`): a `Record<string, readonly string[][]>` mapping SSE event type names to arrays of query keys to invalidate:
   - `tick` -> `[vigilKeys.overview, vigilKeys.repos.all, vigilKeys.timeline({})]`
   - `message` -> `[vigilKeys.timeline({})]`
   - `decision` -> `[vigilKeys.timeline({}), vigilKeys.metrics]`
   - `action` -> `[vigilKeys.actions.all]`
   - `action_pending` -> `[vigilKeys.actions.pending, vigilKeys.actions.all]`
   - `action_resolved` -> `[vigilKeys.actions.all, vigilKeys.actions.pending]`
   - `dream` -> `[vigilKeys.dreams, vigilKeys.memory.stats]`
   - `dream_started` -> `[vigilKeys.dreams]`
   - `dream_completed` -> `[vigilKeys.dreams, vigilKeys.memory.stats]`
   - `state_change` -> `[vigilKeys.overview]`
   - `config_changed` -> `[vigilKeys.config]`
   - `task_updated` -> `[vigilKeys.tasks]`
   - `schedule_fired` -> `[vigilKeys.scheduler]`
   - `webhook` -> `[["webhooks"]]`
   - `channel` -> `[["channels"]]`
   - `health` -> `[["health"]]`
3. **Hook body**: `useEffect` with `[queryClient]` dependency. Inside, a `connect()` function creates `new EventSource("/api/sse")`.
4. **Connected handler**: Listens for `"connected"` event to reset retry counter to 0.
5. **Event listeners**: Iterates `Object.entries(SSE_EVENT_MAP)` and adds a listener for each event type. Each listener calls `queryClient.invalidateQueries({ queryKey })` for every key in that event's array.
6. **Error handling**: `source.onerror` closes the source, computes delay as `Math.min(1000 * 2 ** retryRef.current, 30_000)`, increments retry counter, and schedules `connect()` via `setTimeout`.
7. **Cleanup**: Returns `() => sourceRef.current?.close()`.
8. Uses `useRef` for `sourceRef` (EventSource instance) and `retryRef` (retry count).

**Sanity check**: Open browser devtools, watch Network tab for SSE connection. Kill and restart the daemon — observe reconnection attempts at 1s, 2s, 4s intervals. Check React Query devtools — queries invalidate when SSE events arrive.

**Files created**:
- `dashboard-v2/src/hooks/use-sse.ts`

---

### Task 2.5 — Root layout assembly with SidebarProvider (~45 min)

**Depends on**: Tasks 2.2, 2.3, 2.4
**Completion condition**: The root route renders the full shell (sidebar + header + outlet), SSE is active, and all route stubs display within the layout

**Implementation notes**:

1. Modify `src/routes/__root.tsx` (replacing the minimal shell from Phase 0/1)
2. **Imports**:
   - `createRootRoute`, `Outlet` from `@tanstack/react-router`
   - `QueryClientProvider` from `@tanstack/react-query`
   - `TooltipProvider` from `@/components/ui/tooltip`
   - `SidebarProvider`, `SidebarInset` from `@/components/ui/sidebar`
   - `queryClient` from `../router`
   - `AppSidebar` from `../components/layout/app-sidebar`
   - `SiteHeader` from `../components/layout/site-header`
   - `useSSE` from `../hooks/use-sse`
   - `corePlugins` from `../plugins` (Phase 1 created `plugins/index.ts`)
   - `../app.css` (Tailwind v4 entry with Vigil theme tokens)
3. **Route definition**: `createRootRoute({ component: RootLayout })`
4. **RootLayout component**: Wraps in `<html>` + `<head>` (charset, viewport, title) + `<body>` containing:
   ```
   QueryClientProvider client={queryClient}
     TooltipProvider
       AppShell
   ```
5. **AppShell component** (separate function in same file):
   - Calls `useSSE()` (no args, no return value)
   - Renders:
     ```
     SidebarProvider
       AppSidebar plugins={corePlugins}
       SidebarInset
         SiteHeader
         main className="flex-1 overflow-y-auto p-4"
           Outlet
     ```
6. **CSS**: Import `../app.css` at module top level. The `<body>` should have `className="bg-background text-text"` for the Vigil dark theme base.

**Sanity check**: `bun run dev` in `dashboard-v2/` renders the full shell layout. Navigate to `/`, `/dreams`, `/tasks` etc. — sidebar highlights correct item, breadcrumbs update, stub text shows in main area. Sidebar collapses/expands. SSE connection visible in Network tab.

**Files modified**:
- `dashboard-v2/src/routes/__root.tsx`

---

## 4. Deliverables

```
dashboard-v2/src/
├── components/
│   ├── layout/
│   │   ├── app-sidebar.tsx              # Main sidebar: branding, nav, repos, daemon status
│   │   ├── site-header.tsx              # Sticky header: trigger, breadcrumbs, status
│   │   └── next-tick-countdown.tsx      # Client-side countdown timer component
│   └── ui/
│       ├── sidebar.tsx                  # shadcn/ui Sidebar primitive (all sub-components)
│       ├── separator.tsx                # shadcn/ui Separator
│       ├── breadcrumb.tsx               # shadcn/ui Breadcrumb
│       └── tooltip.tsx                  # shadcn/ui Tooltip (sidebar dependency)
├── hooks/
│   └── use-sse.ts                       # SSE EventSource hook with query invalidation
└── routes/
    └── __root.tsx                       # Modified: full shell layout with providers
```

**New files**: 7 (4 shadcn components, 3 custom components/hooks)
**Modified files**: 1 (`__root.tsx`)

---

## 5. Exit Criteria

| # | Criterion | Maps to |
|---|---|---|
| 1 | `sidebar.tsx`, `separator.tsx`, `breadcrumb.tsx`, `tooltip.tsx` exist in `src/components/ui/` and export all expected sub-components | Task 2.1 deliverables |
| 2 | `AppSidebar` renders branding header, navigation menu (all core plugin tabs sorted by order), repos group with state indicators, and daemon status footer | Task 2.2 deliverable |
| 3 | Sidebar collapses to icon-only mode (`collapsible="icon"`) and tooltips appear on hover in collapsed state | Task 2.2 tooltip behavior |
| 4 | `SiteHeader` renders breadcrumbs reflecting current route pathname, a live countdown timer, and a repo count badge | Task 2.3 deliverables |
| 5 | `NextTickCountdown` decrements every second client-side without API calls, resets when `nextTickIn` prop changes | Task 2.3 countdown |
| 6 | `useSSE()` connects to `/api/sse`, maps events to query keys, and calls `invalidateQueries` for each mapped key | Task 2.4 deliverable |
| 7 | SSE reconnects with exponential backoff (1s, 2s, 4s, ... max 30s) and resets retry counter on successful reconnection | Task 2.4 backoff |
| 8 | Root layout wraps app in `QueryClientProvider > TooltipProvider > SidebarProvider` with `useSSE()` in `AppShell` | Task 2.5 deliverable |
| 9 | All Phase 1 route stubs render inside the shell layout via `<Outlet />` in `SidebarInset` | Task 2.5 integration |
| 10 | `bun run dev` starts without errors and renders the complete shell with dark Vigil theme (navy bg, orange accent) | Full integration |

---

## 6. Execution Prompt

You are implementing Phase 2 (Shell Layout) of Vigil Dashboard v2 — a TanStack Start + React rewrite of an existing HTMX dashboard for a local git monitoring daemon.

### What the project is

Vigil is a local dev tool that watches git repos and makes LLM-powered decisions. It has a dashboard served by `Bun.serve()` on port 7480 with JSON API endpoints at `/api/*` and SSE at `/api/sse`. The frontend is being rewritten from HTMX to TanStack Start (React) with a plugin-extensible architecture. The new app lives in `dashboard-v2/` at the repo root.

### What prior phases established

**Phase 0** created:
- TanStack Start app in `dashboard-v2/` with `vite.config.ts` (using `@tanstack/react-start/plugin/vite` and `nitro/vite`)
- `Bun.serve()` handler embedding on port 7480 (single-port production serving)
- Tailwind v4 `@theme` tokens in `src/app.css` (navy bg `#222745`, orange accent `#FF8102`, plus surface/border/text/status colors)
- shadcn/ui initialized with `cn()` utility in `src/lib/cn.ts`
- Server function pattern: `createServerFn({ method: "GET" })` with `getVigilContext()` singleton

**Phase 1** created:
- 15+ route files in `src/routes/` (all stub components saying "Coming in Phase N")
- TypeScript types in `src/types/api.ts` (OverviewData, RepoListItem, TimelineMessage, etc.) and `src/types/plugin.ts` (PluginWidget, WidgetSlot, WidgetProps)
- Server functions in `src/server/functions.ts` wrapping all existing JSON API handlers (getOverview, getRepos, getTimeline, getDreams, getTasks, getActions, getMemory, getMetrics, getScheduler, plus mutations)
- Query key factory in `src/lib/query-keys.ts` (`vigilKeys` object with nested keys for all entities)
- `src/router.tsx` with QueryClient (staleTime: 10s, gcTime: 5min, refetchOnWindowFocus: false)
- Core plugins manifest in `src/plugins/index.ts` (`corePlugins` array with 10+ PluginWidget entries)
- Lucide React installed for icons
- Dev proxy configured in `vite.config.ts` (`/api/*` -> `http://localhost:7480`)
- All shadcn/ui base components installed (button, card, badge, tabs, dialog, etc.)

### What this phase builds

The persistent UI shell: a collapsible sidebar with navigation, repo list, and daemon status; a sticky header with breadcrumbs and live status; SSE-driven cache invalidation; and the root layout wiring it all together. Content areas remain stub text until Phase 3+.

### Architecture decisions (must follow)

- **shadcn/ui Sidebar pattern** — use `SidebarProvider` + `Sidebar` + `SidebarInset` (standard shadcn layout). Do NOT create custom layout primitives.
- **`collapsible="icon"`** — sidebar collapses to icon-only rail, never fully hidden. `SidebarMenuButton tooltip` props required for collapsed labels.
- **`TooltipProvider` above `SidebarProvider`** — required by shadcn sidebar tooltips in collapsed mode.
- **Single EventSource** — `useSSE()` runs once in `AppShell`, not per-route.
- **Dynamic Lucide icons** — `import * as LucideIcons from "lucide-react"`, look up by string name from `PluginWidget.icon`.
- **`inputValidator()` not `validator()`** — current TanStack Start API naming.
- **`@` alias maps to `./src`** — configured in `vite.config.ts` from Phase 0.

### Data model rules (TypeScript)

- Use `interface` for object shapes (OverviewData, RepoListItem, PluginWidget, AppSidebarProps)
- Use `type` for union types only (DecisionType, MessageStatus)
- `SSE_EVENT_MAP` is a `Record<string, readonly string[][]>` — plain const object, not a class
- `routeLabels` is a `Record<string, string>` — maps pathname to display label
- All query hooks use keys from `vigilKeys` factory in `src/lib/query-keys.ts`
- All data fetching uses server functions from `src/server/functions.ts`

### Files to create

**1. `src/components/ui/sidebar.tsx`** (via shadcn CLI)
Run `bunx shadcn@latest add sidebar`. This generates the full sidebar primitive with all sub-components: SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuBadge, SidebarRail, SidebarInset, SidebarTrigger, useSidebar.

**2. `src/components/ui/separator.tsx`** (via shadcn CLI)
Run `bunx shadcn@latest add separator`.

**3. `src/components/ui/breadcrumb.tsx`** (via shadcn CLI)
Run `bunx shadcn@latest add breadcrumb`. Exports: Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator.

**4. `src/components/ui/tooltip.tsx`** (via shadcn CLI)
Run `bunx shadcn@latest add tooltip`. Exports: TooltipProvider, Tooltip, TooltipTrigger, TooltipContent. Required by sidebar tooltips in collapsed mode.

**5. `src/components/layout/app-sidebar.tsx`**
Main sidebar component. Props: `{ plugins: PluginWidget[] }`.

Structure:
```tsx
<Sidebar collapsible="icon">
  <SidebarHeader>
    {/* Vigil branding: Activity icon in orange square + "Vigil" / "Dashboard" text */}
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild>
          <Link to="/">
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-vigil text-white">
              <Activity className="size-4" />
            </div>
            <div className="flex flex-col gap-0.5 leading-none">
              <span className="font-semibold">Vigil</span>
              <span className="text-xs text-text-muted">Dashboard</span>
            </div>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  </SidebarHeader>

  <SidebarContent>
    {/* Navigation group: plugin tabs filtered by slot="tab", sorted by order */}
    <SidebarGroup>
      <SidebarGroupLabel>Navigation</SidebarGroupLabel>
      <SidebarMenu>
        {tabs.map(tab => {
          const Icon = (LucideIcons as Record<string, any>)[tab.icon];
          const path = tab.id === "timeline" ? "/" : `/${tab.id}`;
          const isActive = location.pathname === path;
          return (
            <SidebarMenuItem key={tab.id}>
              <SidebarMenuButton asChild isActive={isActive} tooltip={tab.label}>
                <Link to={path}>
                  {Icon && <Icon />}
                  <span>{tab.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>

    {/* Repos group: live repo list with state indicators */}
    <SidebarGroup>
      <SidebarGroupLabel>Repositories</SidebarGroupLabel>
      <SidebarMenu>
        {repos?.repos.map(repo => (
          <SidebarMenuItem key={repo.name}>
            <SidebarMenuButton tooltip={repo.name}>
              <GitBranch />
              <span>{repo.name}</span>
            </SidebarMenuButton>
            <SidebarMenuBadge>
              <RepoStateIndicator state={repo.state} dirty={repo.dirty} />
            </SidebarMenuBadge>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  </SidebarContent>

  <SidebarFooter>
    {/* Daemon status: state icon + state name + tick count + uptime */}
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton tooltip={`${overview?.state ?? "..."} — Tick ${overview?.tickCount ?? 0}`}>
          <DaemonStateIcon state={overview?.state} />
          <div className="flex flex-col gap-0.5 text-xs leading-none">
            <span className="capitalize">{overview?.state ?? "..."}</span>
            <span className="text-text-muted">Tick {overview?.tickCount ?? 0} — {overview?.uptime ?? "..."}</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  </SidebarFooter>

  <SidebarRail />
</Sidebar>
```

Data fetching:
- `useQuery({ queryKey: vigilKeys.repos.all, queryFn: () => getRepos() })` for repo list
- `useQuery({ queryKey: vigilKeys.overview, queryFn: () => getOverview(), refetchInterval: 30_000 })` for daemon status

Sub-components (same file):
- `RepoStateIndicator({ state, dirty })`: warning dot (`size-1.5 rounded-full bg-warning`) if dirty, then green `Circle` (active), `Moon` (sleeping), or `Sparkles` (dreaming)
- `DaemonStateIcon({ state })`: `Moon` for sleeping, `Sparkles` for dreaming, green `Circle` default

Imports: `Link`, `useRouterState` from `@tanstack/react-router`; `useQuery` from `@tanstack/react-query`; `* as LucideIcons` from `lucide-react`; named icons `GitBranch, Circle, Moon, Sparkles, Activity` from `lucide-react`; all sidebar sub-components from `@/components/ui/sidebar`; `getOverview, getRepos` from `../../server/functions`; `vigilKeys` from `../../lib/query-keys`; `PluginWidget` type from `../../types/plugin`.

**6. `src/components/layout/site-header.tsx`**
Sticky header inside `SidebarInset`.

Route labels map:
```typescript
const routeLabels: Record<string, string> = {
  "/": "Timeline", "/repos": "Repos", "/dreams": "Dreams",
  "/tasks": "Tasks", "/actions": "Actions", "/memory": "Memory",
  "/metrics": "Metrics", "/scheduler": "Scheduler", "/config": "Config",
};
```

Structure: flex row, `h-12`, `border-b border-border`, `bg-surface-dark`, `px-4`.
- Left: `SidebarTrigger` (`-ml-1 text-text-muted`) + vertical `Separator` (`mr-2 h-4`) + `Breadcrumb` (Vigil > page label)
- Right: `NextTickCountdown` + repo count `Badge` (variant="outline")

Data: `useQuery` with `vigilKeys.overview` / `getOverview()`, 30s refetch.

**7. `src/components/layout/next-tick-countdown.tsx`**
Client-only countdown. Props: `{ nextTickIn: number }`.
- `useState(Math.max(0, Math.round(nextTickIn)))` for seconds
- `useEffect` to reset seconds when `nextTickIn` prop changes
- `useEffect` with `setInterval(1s)` to decrement, stops at 0
- Renders `<span className="font-mono tabular-nums">{seconds > 0 ? `${seconds}s` : "now"}</span>`

**8. `src/hooks/use-sse.ts`**
SSE hook. Uses `useQueryClient()`, `useRef` for EventSource and retry counter.

Event map keys and their invalidation targets:
- `tick` -> overview, repos.all, timeline({})
- `message` -> timeline({})
- `decision` -> timeline({}), metrics
- `action` -> actions.all
- `action_pending` -> actions.pending, actions.all
- `action_resolved` -> actions.all, actions.pending
- `dream` -> dreams, memory.stats
- `dream_started` -> dreams
- `dream_completed` -> dreams, memory.stats
- `state_change` -> overview
- `config_changed` -> config
- `task_updated` -> tasks
- `schedule_fired` -> scheduler
- `webhook` -> ["webhooks"]
- `channel` -> ["channels"]
- `health` -> ["health"]

Reconnection: exponential backoff `Math.min(1000 * 2 ** retryRef.current, 30_000)`. Reset retry to 0 on `"connected"` event.

### File to modify

**`src/routes/__root.tsx`** — Replace minimal shell with full layout:
- HTML shell: `<html lang="en">` + `<head>` (charset, viewport, title "Vigil Dashboard") + `<body className="bg-background text-text">`
- Provider stack: `QueryClientProvider` > `TooltipProvider` > `AppShell`
- `AppShell` component: calls `useSSE()`, renders `SidebarProvider` > `AppSidebar plugins={corePlugins}` + `SidebarInset` > `SiteHeader` + `<main className="flex-1 overflow-y-auto p-4"><Outlet /></main>`
- Import `../app.css` at module top level
- Import `corePlugins` from `../plugins` (the core plugin manifest from Phase 1)
- Import `queryClient` from `../router` (the shared QueryClient from Phase 1)

### Execution order

1. Task 2.1 — Install shadcn sidebar + separator + breadcrumb + tooltip
2. Task 2.2 + Task 2.3 — Build AppSidebar and SiteHeader (can run in parallel, both depend only on 2.1)
3. Task 2.4 — Build useSSE hook (depends only on Phase 1 query keys, can run in parallel with 2.2/2.3)
4. Task 2.5 — Wire everything into `__root.tsx` (depends on 2.2, 2.3, 2.4)

### Success criteria

Run these checks after implementation:

```bash
# 1. Dev server starts with shell layout
cd dashboard-v2 && bun run dev
# -> Sidebar visible on left with Vigil branding, nav items, repo list, status footer
# -> Header visible with breadcrumbs and countdown

# 2. Navigation works
# Click "Dreams" in sidebar -> breadcrumb shows "Vigil > Dreams", sidebar highlights Dreams item
# Click "Metrics" -> breadcrumb shows "Vigil > Metrics"

# 3. Sidebar collapse works
# Press Cmd+B or click trigger -> sidebar collapses to icons
# Hover icon -> tooltip shows label
# Press Cmd+B -> sidebar expands

# 4. SSE connection active
# Open DevTools Network tab -> SSE connection to /api/sse visible
# Kill daemon -> SSE reconnects at 1s, 2s, 4s intervals

# 5. Live data flows
# With daemon running: sidebar footer shows tick count and uptime
# Tick fires -> countdown resets, sidebar data refreshes
```

---

## Readiness Check

- [PASS] All inputs from prior phases are listed and available — Phase 1 deliverables enumerated (routes, types, server functions, query keys, plugins manifest, router, shadcn components, Lucide, dev proxy)
- [PASS] Every sub-task has a clear, testable completion condition
- [PASS] Execution prompt is self-contained: includes (a) prior phase facts, (b) confirmed API patterns from Phase 0/1 (shadcn sidebar sub-components, TanStack Router hooks, TanStack Query usage), (c) a "Data Model Rules" section, (d) per-file guidance with full component structures, and (e) observable success criteria
- [PASS] Exit criteria map 1:1 to deliverables (sidebar.tsx -> Task 2.1, app-sidebar.tsx -> Task 2.2, site-header.tsx + next-tick-countdown.tsx -> Task 2.3, use-sse.ts -> Task 2.4, __root.tsx -> Task 2.5)
- [PASS] Any heavy external dependency has a fake/stub strategy noted — dev proxy to port 7480 for live data, stub route components from Phase 1 render inside the shell
- [PASS] New components (shadcn/ui Sidebar) have confirmed sub-component names and usage patterns from shadcn documentation (SidebarProvider, SidebarMenuButton with tooltip and isActive props, collapsible="icon" mode, SidebarRail)
