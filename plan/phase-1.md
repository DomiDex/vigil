# Phase 1 — Scaffold

---
duration: ~4 hours
depends_on: Phase 0 (Validation Spike -- TanStack Start app, Tailwind v4, shadcn/ui confirmed working)
blocks: Phase 2 (Shell Layout), Phase 3 (Plugin System)
risk: MEDIUM -- standard scaffolding with proven libraries, but server function imports from existing API may need adapter wrappers
stack: typescript
runner: single-agent
---

## 1. Objective + What Success Looks Like

**Objective**: Full project structure in place -- routing, server functions wrapping existing APIs, dev proxy, all shadcn/ui base components installed. No visual changes to the running dashboard yet.

**Observable success conditions**:

1. `cd dashboard-v2 && bun run dev` starts Vite dev server on port 3000 with zero TypeScript errors
2. Navigating to `http://localhost:3000/dreams` renders "Dreams -- Coming in Phase 4" (route stub works)
3. Navigating to `http://localhost:3000/nonexistent` shows TanStack Router's 404 (file-based routing active)
4. `curl http://localhost:3000/api/overview` proxies through to Vigil on port 7480 and returns JSON (dev proxy works)
5. `bun run tsc --noEmit` in `dashboard-v2/` passes with zero errors (all types compile)
6. `ls dashboard-v2/src/components/ui/ | wc -l` shows 16+ component files (all shadcn/ui components installed)
7. `grep "vigilKeys" dashboard-v2/src/lib/query-keys.ts` shows the centralized key factory
8. `grep "getOverview" dashboard-v2/src/server/functions.ts` confirms server function wrappers exist
9. `grep "lucide-react" dashboard-v2/package.json` confirms icon library is installed

---

## 2. Key Design Decisions

### Data model strategy (TypeScript)

| Entity | Pattern | Why |
|---|---|---|
| API response shapes (`OverviewData`, `TimelineData`, etc.) | `interface` | Object shapes with no union semantics. Interfaces give better error messages and are extendable. |
| Union enums (`DecisionType`, `TaskStatus`, etc.) | `type` alias of string literal union | Simpler than `enum`, tree-shakes, works with Zod `.enum()` directly. |
| Server function inputs | Zod schemas (inline) | `.inputValidator()` requires Zod. Schemas double as runtime validation + static inference. |
| Server function return types | Explicit `Promise<T>` annotation referencing `api.ts` interfaces | Ensures server functions and components share the same contract. |
| Plugin types (`WidgetSlot`, `PluginWidget`) | `type` for unions, `interface` for object shapes | Consistent with project convention. |
| Query key factory | `as const` object literal | TanStack Query best practice. Enables type-safe invalidation and co-location of key structure. |

### Architecture notes

**Dev proxy**: Vite's built-in `server.proxy` forwards `/api/*` requests to Vigil's `Bun.serve()` on port 7480. This means during development, the React app on port 3000 can call all existing API endpoints without CORS issues. In production, both are served from the same port via handler embedding (established in Phase 0).

**Server functions vs. API handlers**: The existing API handlers in `src/dashboard/api/` accept `DashboardContext` and return plain objects (for JSON endpoints) or HTML strings (for HTMX fragments). Server functions in `dashboard-v2/src/server/functions.ts` wrap only the JSON-returning functions. Some handlers accept `URL` objects for query params (e.g., `getTimelineJSON`) -- these need a synthetic `URL` constructed from the Zod-validated input.

**Mutation handlers returning HTML**: Several mutation handlers (`handleTaskCreate`, `handleApprove`, etc.) currently return HTML strings (HTMX fragments). The server function wrappers must either (a) call the JSON-returning variant if one exists, or (b) call the handler and return a success/error status object instead of the HTML string. Phase 1 wraps them with `{ success: true }` returns and defers proper return types to Phase 3 when components actually consume them.

### Critical rules

- All route files use `createFileRoute()` from `@tanstack/react-router` with stub components
- The `__root.tsx` from Phase 0 is preserved as-is (it already has Tailwind, `<HeadContent>`, `<Scripts>`)
- The existing `router.tsx` from Phase 0 must be updated to include `QueryClient` setup
- Do NOT modify any files outside `dashboard-v2/` in this phase
- shadcn/ui components go in `src/components/ui/` (matching Phase 0's `components.json` path convention)
- `inputValidator` is the correct method name (not `validator`) -- confirmed in Phase 0

---

## 3. Tasks

### Task 1.1 -- Project structure and routing setup (~1 hr)

**Depends on**: Phase 0 complete
**Completion condition**: All 15 route files exist, dev proxy works, router has QueryClient integration

**Steps**:

1. Create directory structure:
   ```
   dashboard-v2/src/
   ├── components/{layout,vigil}/
   ├── hooks/
   ├── types/
   ├── plugins/
   └── server/          (already exists from Phase 0)
   ```

2. Create 14 route stub files (index.tsx already exists from Phase 0):
   - `repos.tsx`, `dreams.tsx`, `tasks.tsx`, `actions.tsx`, `memory.tsx`
   - `scheduler.tsx`, `metrics.tsx`, `config.tsx`, `agents.tsx`
   - `health.tsx`, `webhooks.tsx`, `channels.tsx`, `notifications.tsx`, `a2a.tsx`

   Each follows this pattern:
   ```typescript
   import { createFileRoute } from "@tanstack/react-router";
   export const Route = createFileRoute("/dreams")({
     component: () => <div>Dreams -- Coming in Phase 4</div>,
   });
   ```

3. Add dev proxy to `vite.config.ts`:
   ```typescript
   server: {
     port: 3000,
     proxy: {
       "/api": {
         target: "http://localhost:7480",
         changeOrigin: true,
       },
     },
   },
   ```

4. Update `src/router.tsx` to include QueryClient:
   ```typescript
   import { QueryClient } from "@tanstack/react-query";
   export const queryClient = new QueryClient({
     defaultOptions: {
       queries: {
         staleTime: 10_000,
         gcTime: 5 * 60_000,
         refetchOnWindowFocus: false,
       },
     },
   });
   ```

5. Regenerate route tree: run `bun run dev` briefly to trigger TanStack Router's code generation, then verify `routeTree.gen.ts` includes all new routes.

**Sanity check**: `bun run dev` starts without errors. Navigating to `/dreams`, `/repos`, `/config` etc. each show their stub text. `/api/overview` proxies to Vigil.

---

### Task 1.2 -- Install all shadcn/ui base components (~30 min)

**Depends on**: Task 1.1 (directory structure must exist)
**Completion condition**: 16+ component files exist in `src/components/ui/`

**Steps**:

1. If `components.json` does not exist, run `bunx shadcn@latest init` first:
   - Style: New York
   - Base color: Zinc
   - CSS variables: Yes
   - Ensure `aliases.components` points to `@/components` and `aliases.utils` points to `@/lib/cn`
   - `tailwindCss` path: `src/app.css`

2. Install all components in one batch:
   ```bash
   cd dashboard-v2
   bunx shadcn@latest add button card badge tabs dialog sheet command \
     sonner table chart separator input textarea select \
     dropdown-menu tooltip scroll-area skeleton switch label
   # data-table is a shadcn recipe, not a single component.
   # Install the `table` component via CLI (above) and add
   # @tanstack/react-table as a separate dependency:
   bun add @tanstack/react-table
   ```

3. Verify each component file exists and imports compile without errors.

**Note**: shadcn may install additional dependency components (e.g., `popover` for `command`). Accept all transitive installs. The `button`, `card`, and `badge` components may already exist from Phase 0 -- shadcn will overwrite them, which is fine since they were spike versions. `data-table` is a shadcn recipe (not a CLI component) -- install the `table` component via CLI and `@tanstack/react-table` as a separate `bun add` dependency.

**Sanity check**: `bun run tsc --noEmit` passes. No missing imports in any UI component file.

---

### Task 1.3 -- Define TypeScript types (~45 min)

**Depends on**: Task 1.1 (types directory must exist)
**Completion condition**: `src/types/api.ts` and `src/types/plugin.ts` exist and compile without errors

**Steps**:

1. Create `src/types/api.ts` with all API response types. The types must match the shape returned by existing JSON handlers in `src/dashboard/api/*.ts`. Key types:

   **Union types** (use `type`):
   - `DecisionType = "SILENT" | "OBSERVE" | "NOTIFY" | "ACT"`
   - `MessageStatus = "normal" | "proactive" | "scheduled" | "alert"`
   - `TaskStatus = "pending" | "active" | "waiting" | "completed" | "failed" | "cancelled"`
   - `ActionStatus = "pending" | "approved" | "rejected" | "executed" | "failed"`
   - `ActionTier = "safe" | "moderate" | "dangerous"`

   **Interfaces** (use `interface`):
   - `OverviewData` -- matches `getOverviewJSON()` return shape
   - `TimelineMessage`, `TimelineData` -- matches `getTimelineJSON()` return shape
   - `RepoListItem`, `RepoDetail`, `TopicInfo` -- matches `getReposJSON()` / `getRepoDetailJSON()`
   - `DreamResult`, `DreamsData` -- matches `getDreamsJSON()`
   - `TaskItem`, `TasksData` -- matches `getTasksJSON()`
   - `ActionRequest`, `ActionsData` -- matches `getActionsJSON()`
   - `MemoryData`, `MemorySearchResult` -- matches `getMemoryJSON()` / `getMemorySearchJSON()`
   - `MetricsData` -- matches `getMetricsJSON()`
   - `ScheduleEntry`, `SchedulerData` -- matches `getSchedulerJSON()`

   Full type definitions are specified in big-plan.md Task 1.3.

2. Create `src/types/plugin.ts` with plugin extension types:
   - `type WidgetSlot = "tab" | "sidebar" | "timeline-card" | "overlay" | "top-bar"`
   - `interface WidgetProps` -- receives `activeRepo` and `queryClient`
   - `interface PluginWidget` -- defines `id`, `label`, `icon`, `slot`, `order`, `component` (lazy import), optional `sseEvents`, `queryKeys`, `featureGate`

**Sanity check**: `bun run tsc --noEmit` passes. Import `type { OverviewData } from "../types/api"` resolves in any route file.

---

### Task 1.4 -- Create server functions wrapping existing APIs (~1 hr)

**Depends on**: Task 1.3 (types must exist for return type annotations)
**Completion condition**: `src/server/functions.ts` exports all read and mutation server functions, compiles without errors

**Steps**:

1. Install Zod (needed for `inputValidator`):
   ```bash
   cd dashboard-v2 && bun add zod
   ```

2. Create `src/server/functions.ts` with `createServerFn()` wrappers for every existing JSON API handler.

   **Reads** (13 functions):
   - `getOverview` -- calls `getOverviewJSON(ctx)`
   - `getRepos` -- calls `getReposJSON(ctx)`
   - `getRepoDetail` -- calls `getRepoDetailJSON(ctx, data.name)`, input: `z.object({ name: z.string() })`
   - `getTimeline` -- calls `getTimelineJSON(ctx, url)`, constructs synthetic `URL` from validated input `{ status?, repo?, q?, page? }`
   - `getDreams` -- calls `getDreamsJSON(ctx)`
   - `getDreamPatterns` -- calls `getDreamPatternsJSON(ctx, data.repo)`, input: `z.object({ repo: z.string() })`
   - `getTasks` -- calls `getTasksJSON(ctx, data)`, input: `z.object({ status?, repo? })`
   - `getActions` -- calls `getActionsJSON(ctx, data)`, input: `z.object({ status? })`
   - `getActionsPending` -- calls `getActionsPendingJSON(ctx)`
   - `getMemory` -- calls `getMemoryJSON(ctx)`
   - `searchMemory` -- calls `getMemorySearchJSON(ctx, data.query, data.repo)`, input: `z.object({ query, repo? })`
   - `getMetrics` -- calls `getMetricsJSON(ctx)`
   - `getScheduler` -- calls `getSchedulerJSON(ctx)`

   **Mutations** (13 functions):
   - `triggerDream` -- calls `handleDreamTrigger(ctx, data.repo)`
   - `createTask`, `activateTask`, `completeTask`, `failTask`, `updateTask`, `cancelTask` -- call respective task handlers
   - `approveAction`, `rejectAction` -- call respective action handlers
   - `askVigil` -- calls `handleAsk(ctx, data.question, data.repo)`
   - `createSchedule`, `deleteSchedule`, `triggerSchedule` -- call respective scheduler handlers

3. **Import path resolution**: The existing API handlers live in `src/dashboard/api/`. From `dashboard-v2/src/server/functions.ts`, the import path is `../../../src/dashboard/api/overview` (going up from `dashboard-v2/src/server/` to repo root, then into `src/dashboard/api/`). Alternatively, set up a TypeScript path alias `@vigil/*` pointing to the repo root `src/` directory if paths become unwieldy.

4. **Adapter pattern for mutation handlers**: Handlers like `handleTaskCreate` accept `FormData` and return HTML strings. Wrap them:
   ```typescript
   export const createTask = createServerFn({ method: "POST" })
     .inputValidator(z.object({ title: z.string(), description: z.string().optional(), repo: z.string().optional() }))
     .handler(async ({ data }) => {
       const ctx = getVigilContext();
       const formData = new FormData();
       formData.set("title", data.title);
       if (data.description) formData.set("description", data.description);
       if (data.repo) formData.set("repo", data.repo);
       handleTaskCreate(ctx, formData);
       return { success: true };
     });
   ```

**Sanity check**: `bun run tsc --noEmit` passes. Every server function has an explicit return type annotation or the handler return is type-compatible with the declared API type.

---

### Task 1.5 -- Query key factory and Lucide icon setup (~30 min)

**Depends on**: Task 1.1 (lib directory must exist)
**Completion condition**: `src/lib/query-keys.ts` exports `vigilKeys`, `lucide-react` is in `package.json`

**Steps**:

1. Install Lucide React:
   ```bash
   cd dashboard-v2 && bun add lucide-react
   ```

2. Create `src/lib/query-keys.ts` with the centralized `vigilKeys` factory:
   ```typescript
   export const vigilKeys = {
     overview: ["overview"] as const,
     repos: {
       all: ["repos"] as const,
       detail: (name: string) => ["repos", name] as const,
     },
     timeline: (filters?: { status?: string; repo?: string; q?: string; page?: number }) =>
       ["timeline", filters ?? {}] as const,
     dreams: ["dreams"] as const,
     dreamPatterns: (repo: string) => ["dreams", "patterns", repo] as const,
     memory: {
       stats: ["memory"] as const,
       search: (query: string) => ["memory", "search", query] as const,
     },
     actions: {
       all: ["actions"] as const,
       pending: ["actions", "pending"] as const,
     },
     tasks: ["tasks"] as const,
     scheduler: ["scheduler"] as const,
     metrics: ["metrics"] as const,
     config: ["config"] as const,
     plugins: ["plugins"] as const,
     agents: {
       all: ["agents"] as const,
       current: ["agents", "current"] as const,
     },
     health: ["health"] as const,
     webhooks: ["webhooks"] as const,
     channels: ["channels"] as const,
     notifications: ["notifications"] as const,
     a2a: ["a2a"] as const,
   } as const;
   ```

3. Verify Lucide icons import correctly by checking that `import { Activity } from "lucide-react"` resolves in any component file.

**Sanity check**: `bun run tsc --noEmit` passes. `vigilKeys.repos.detail("my-repo")` returns `readonly ["repos", "my-repo"]`.

---

## 4. Deliverables

```
dashboard-v2/
├── package.json                          # Updated: +zod, +lucide-react, +@tanstack/react-table deps
├── vite.config.ts                        # Updated: dev proxy for /api/*
├── components.json                       # NEW: shadcn/ui configuration
├── src/
│   ├── app.css                           # Unchanged from Phase 0
│   ├── router.tsx                        # Updated: QueryClient integration
│   ├── routeTree.gen.ts                  # Auto-generated: includes all 15 routes
│   ├── lib/
│   │   ├── cn.ts                         # Unchanged from Phase 0
│   │   └── query-keys.ts                 # NEW: vigilKeys factory
│   ├── types/
│   │   ├── api.ts                        # NEW: all API response interfaces
│   │   └── plugin.ts                     # NEW: WidgetSlot, PluginWidget types
│   ├── routes/
│   │   ├── __root.tsx                    # Unchanged from Phase 0
│   │   ├── index.tsx                     # Unchanged from Phase 0
│   │   ├── repos.tsx                     # NEW: stub route
│   │   ├── dreams.tsx                    # NEW: stub route
│   │   ├── tasks.tsx                     # NEW: stub route
│   │   ├── actions.tsx                   # NEW: stub route
│   │   ├── memory.tsx                    # NEW: stub route
│   │   ├── scheduler.tsx                 # NEW: stub route
│   │   ├── metrics.tsx                   # NEW: stub route
│   │   ├── config.tsx                    # NEW: stub route
│   │   ├── agents.tsx                    # NEW: stub route
│   │   ├── health.tsx                    # NEW: stub route
│   │   ├── webhooks.tsx                  # NEW: stub route
│   │   ├── channels.tsx                  # NEW: stub route
│   │   ├── notifications.tsx             # NEW: stub route
│   │   └── a2a.tsx                       # NEW: stub route
│   ├── server/
│   │   ├── vigil-context.ts              # Unchanged from Phase 0
│   │   └── functions.ts                  # NEW: 26 server function wrappers
│   ├── components/
│   │   ├── ui/
│   │   │   ├── button.tsx                # shadcn/ui (may exist from Phase 0)
│   │   │   ├── card.tsx                  # shadcn/ui (may exist from Phase 0)
│   │   │   ├── badge.tsx                 # shadcn/ui (may exist from Phase 0)
│   │   │   ├── tabs.tsx                  # NEW: shadcn/ui
│   │   │   ├── dialog.tsx                # NEW: shadcn/ui
│   │   │   ├── sheet.tsx                 # NEW: shadcn/ui
│   │   │   ├── command.tsx               # NEW: shadcn/ui
│   │   │   ├── sonner.tsx                # NEW: shadcn/ui
│   │   │   ├── table.tsx                 # NEW: shadcn/ui (data-table is a recipe, not a component)
│   │   │   ├── chart.tsx                 # NEW: shadcn/ui
│   │   │   ├── separator.tsx             # NEW: shadcn/ui
│   │   │   ├── input.tsx                 # NEW: shadcn/ui
│   │   │   ├── textarea.tsx              # NEW: shadcn/ui
│   │   │   ├── select.tsx                # NEW: shadcn/ui
│   │   │   ├── dropdown-menu.tsx         # NEW: shadcn/ui
│   │   │   ├── tooltip.tsx               # NEW: shadcn/ui
│   │   │   ├── scroll-area.tsx           # NEW: shadcn/ui
│   │   │   ├── skeleton.tsx              # NEW: shadcn/ui
│   │   │   ├── switch.tsx                # NEW: shadcn/ui
│   │   │   ├── label.tsx                 # NEW: shadcn/ui
│   │   │   └── (transitive deps)        # popover, table, etc. installed by shadcn
│   │   ├── layout/                       # NEW: empty dir (used in Phase 2)
│   │   └── vigil/                        # NEW: empty dir (used in Phase 3+)
│   ├── hooks/                            # NEW: empty dir (used in Phase 2+)
│   └── plugins/                          # NEW: empty dir (used in Phase 3)
```

---

## 5. Exit Criteria

| # | Criterion | Maps to |
|---|---|---|
| 1 | `bun run dev` starts Vite dev server on port 3000 with zero errors | Task 1.1 -- routing setup |
| 2 | All 15 routes render their stub text when navigated to in browser | Task 1.1 -- route files |
| 3 | `/api/overview` proxied from port 3000 returns JSON from Vigil | Task 1.1 -- dev proxy |
| 4 | `bun run tsc --noEmit` passes with zero errors in `dashboard-v2/` | Task 1.3 -- types, Task 1.4 -- functions |
| 5 | 16+ component files exist in `src/components/ui/` | Task 1.2 -- shadcn/ui install |
| 6 | `components.json` exists with correct path aliases | Task 1.2 -- shadcn/ui init |
| 7 | `src/types/api.ts` exports all API response interfaces | Task 1.3 -- types |
| 8 | `src/types/plugin.ts` exports `WidgetSlot`, `WidgetProps`, `PluginWidget` | Task 1.3 -- plugin types |
| 9 | `src/server/functions.ts` exports 13 read + 13 mutation server functions | Task 1.4 -- server functions |
| 10 | `src/lib/query-keys.ts` exports `vigilKeys` factory | Task 1.5 -- query keys |
| 11 | `lucide-react` and `zod` are in `package.json` dependencies | Task 1.2/1.5 -- deps |
| 12 | `router.tsx` creates `QueryClient` with `staleTime: 10_000`, `gcTime: 300_000` | Task 1.1 -- router |

---

## 6. Execution Prompt

You are implementing Phase 1 (Scaffold) of Vigil Dashboard v2 -- a TanStack Start + React rewrite of an existing HTMX dashboard for a local git monitoring daemon.

### What the project is

Vigil is a local dev tool (Bun/TypeScript) that watches git repos, makes LLM-powered decisions, and consolidates memory during idle time. It has an existing dashboard served by `Bun.serve()` on port 7480 with JSON API endpoints at `/api/*` and SSE at `/api/sse`. The current frontend uses HTMX + Pico CSS. We are replacing the frontend with TanStack Start (React) in `dashboard-v2/` at the repo root.

### What Phase 0 established

Phase 0 (Validation Spike) proved these work together:
- TanStack Start app initialized in `dashboard-v2/` with `vite.config.ts` using `@tanstack/react-start/plugin/vite` and `@tailwindcss/vite`
- Server functions work via `createServerFn()` accessing `DashboardContext` via `globalThis.__vigil_ctx__` (`setVigilContext` / `getVigilContext` in `src/server/vigil-context.ts`). Phase 0 spike discovered that module-level `let _ctx` singletons do not survive Vite bundling -- `globalThis` is required.
- Production build embeds into Vigil's `Bun.serve()` on port 7480 (single port for API + React)
- Tailwind v4 with `@theme` tokens (navy bg `#222745`, orange accent `#FF8102`) in `src/app.css`
- `cn()` utility at `src/lib/cn.ts` (clsx + tailwind-merge)
- Routes use `createFileRoute()` / `createRootRoute()` from `@tanstack/react-router`
- Existing `src/router.tsx` has `createRouter({ routeTree, scrollRestoration: true })` and `Register` type declaration

### What Phase 0 did NOT set up (your job)

- Only 2 routes exist (`__root.tsx`, `index.tsx`) -- need 14 more stub routes
- No dev proxy in `vite.config.ts` -- need `/api/*` proxy to localhost:7480
- No QueryClient in router -- need TanStack Query integration
- No `components.json` -- shadcn/ui CLI was not initialized
- No shadcn/ui component files (button/card/badge were mentioned in Phase 0 plan but the `src/components/ui/` directory does not exist)
- No TypeScript type definitions for API responses
- No server function wrappers for existing API handlers
- No query key factory
- No Lucide icons, no Zod

### Goal

Full project structure in place -- routing, server functions wrapping existing APIs, dev proxy, all shadcn/ui base components installed. No visual changes to the running dashboard yet. After this phase, Phase 2 (Shell Layout) can build the sidebar + header using these components and data sources.

### Data model rules (TypeScript)

- Use `interface` for object shapes (`OverviewData`, `TimelineMessage`, etc.)
- Use `type` for string literal unions (`DecisionType`, `TaskStatus`, etc.)
- Server function inputs use Zod schemas via `.inputValidator()`
- Server function returns use explicit `Promise<T>` annotations referencing types from `src/types/api.ts`
- Query keys use `as const` assertions for type safety
- Plugin types use `interface` for shapes, `type` for slot unions

### Confirmed library APIs

**TanStack Router** (file-based routing):
```typescript
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/dreams")({
  component: () => <div>Dreams</div>,
});
```

**TanStack Start server functions** (note: `inputValidator`, not `validator`):
```typescript
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
export const getRepoDetail = createServerFn({ method: "GET" })
  .inputValidator(z.object({ name: z.string() }))
  .handler(async ({ data }): Promise<RepoDetail | null> => {
    const ctx = getVigilContext();
    return getRepoDetailJSON(ctx, data.name);
  });
```

**TanStack Query client config**:
```typescript
import { QueryClient } from "@tanstack/react-query";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false },
  },
});
```

**shadcn/ui CLI** (install components):
```bash
bunx shadcn@latest init    # First time setup
bunx shadcn@latest add button card badge tabs ...
```

**Vite dev proxy**:
```typescript
// In vite.config.ts defineConfig
server: {
  port: 3000,
  proxy: {
    "/api": { target: "http://localhost:7480", changeOrigin: true },
  },
},
```

### Per-file guidance

**`src/routes/*.tsx` (14 new stub routes)**:
Each file exports a `Route` using `createFileRoute("/path")` with a simple component returning a `<div>` with placeholder text like "Dreams -- Coming in Phase 4". No loaders, no data fetching. Just stubs.

**`vite.config.ts` (update)**:
Add `server.proxy` configuration. Keep all existing plugins (`tailwindcss()`, `tanstackStart({ srcDirectory: "src" })`, `viteReact()`). The existing `server.port: 3000` stays.

**`src/router.tsx` (update)**:
Add `QueryClient` creation and export. Update `createRouter` to pass `context: { queryClient }` and `defaultPreload: "intent"`. Keep the existing `Register` type declaration.

**`components.json` (new, via shadcn init)**:
Run `bunx shadcn@latest init`. Configure:
- Style: New York
- Base color: Zinc
- CSS variables: Yes
- `tailwindCss`: `src/app.css`
- Component alias: `@/components`
- Utils alias: `@/lib/cn`

Verify that `@` resolves correctly -- Phase 0's `vite.config.ts` has no explicit alias for `@`, but the `tsconfig.json` may have path mapping. If `@` does not resolve, add it to both `tsconfig.json` and `vite.config.ts`:
```typescript
// vite.config.ts
resolve: { tsconfigPaths: true },
// tsconfig.json
"paths": { "@/*": ["./src/*"] }
```
The Phase 0 vite.config.ts already has `resolve: { tsconfigPaths: true }` so check tsconfig.json for path config.

**`src/types/api.ts` (new)**:
Contains all API response type definitions. Full type listing is in the big-plan.md Phase 1 Task 1.3 section. The types must match the return shapes of the JSON handler functions in `src/dashboard/api/*.ts` (repo root). Cross-reference `getOverviewJSON()` in `src/dashboard/api/overview.ts`, `getReposJSON()` in `src/dashboard/api/repos.ts`, etc. to verify field names match.

**`src/types/plugin.ts` (new)**:
```typescript
import type { QueryClient } from "@tanstack/react-query";
import type { ComponentType } from "react";

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

**`src/server/functions.ts` (new)**:
26 server functions wrapping existing API handlers. Import handlers from `../../../src/dashboard/api/*` (relative path from `dashboard-v2/src/server/` to repo root `src/dashboard/api/`). All reads use `createServerFn({ method: "GET" })`, mutations use `createServerFn({ method: "POST" })`.

Key import paths (from `dashboard-v2/src/server/functions.ts`):
```typescript
import { getOverviewJSON } from "../../../src/dashboard/api/overview";
import { getReposJSON, getRepoDetailJSON } from "../../../src/dashboard/api/repos";
import { getTimelineJSON } from "../../../src/dashboard/api/timeline";
import { getDreamsJSON, getDreamPatternsJSON, handleDreamTrigger } from "../../../src/dashboard/api/dreams";
import { getTasksJSON, handleTaskCreate, handleTaskActivate, handleTaskComplete, handleTaskFail, handleTaskUpdate, handleTaskCancel } from "../../../src/dashboard/api/tasks";
import { getActionsJSON, getActionsPendingJSON, handleApprove, handleReject } from "../../../src/dashboard/api/actions";
import { getMemoryJSON, getMemorySearchJSON, handleAsk } from "../../../src/dashboard/api/memory";
import { getSchedulerJSON, handleSchedulerCreate, handleSchedulerDelete, handleSchedulerTrigger } from "../../../src/dashboard/api/scheduler";
import { getMetricsJSON } from "../../../src/dashboard/api/metrics";
```

Note: `handleAsk` is `async` and returns a `Promise<string>` (HTML). Wrap it to return `{ answer: string }` or similar structured response.

Handlers that return HTML strings (mutations): wrap and return `{ success: true }` for now. The actual structured response types will be refined in Phase 3 when components consume them.

For `getTimelineJSON(ctx, url)` which expects a `URL` object, construct one:
```typescript
const url = new URL("http://localhost/api/timeline");
if (data.status) url.searchParams.set("status", data.status);
if (data.repo) url.searchParams.set("repo", data.repo);
if (data.q) url.searchParams.set("q", data.q);
if (data.page) url.searchParams.set("page", String(data.page));
return getTimelineJSON(ctx, url);
```

**`src/lib/query-keys.ts` (new)**:
Centralized query key factory. All keys use `as const` for type inference. The full key structure covers: overview, repos (all/detail), timeline, dreams, dreamPatterns, memory (stats/search), actions (all/pending), tasks, scheduler, metrics, config, plugins, agents (all/current), health, webhooks, channels, notifications, a2a.

### Execution order

1. **Task 1.1** -- Create directories, route stubs, update vite.config.ts proxy, update router.tsx with QueryClient
2. **Task 1.2** -- Initialize shadcn/ui (`bunx shadcn@latest init`), install all 16+ components
3. **Task 1.3** -- Create `src/types/api.ts` and `src/types/plugin.ts`
4. **Task 1.4** -- Install Zod, create `src/server/functions.ts` with all 26 server function wrappers
5. **Task 1.5** -- Install lucide-react, create `src/lib/query-keys.ts`

### Success criteria

Run these checks after implementation:

```bash
# 1. Dev server starts with all routes
cd dashboard-v2 && bun run dev
# Open http://localhost:3000/dreams -> shows stub text
# Open http://localhost:3000/repos -> shows stub text
# Open http://localhost:3000/config -> shows stub text

# 2. Dev proxy works (requires Vigil daemon running on 7480)
curl http://localhost:3000/api/overview
# -> Returns JSON from Vigil

# 3. TypeScript compiles
cd dashboard-v2 && bun run tsc --noEmit
# -> Zero errors

# 4. All shadcn components installed
ls dashboard-v2/src/components/ui/ | wc -l
# -> 16+ files

# 5. Dependencies installed
grep '"zod"' dashboard-v2/package.json
grep '"lucide-react"' dashboard-v2/package.json
# -> Both present
```

### Expected file structure after Phase 1

```
dashboard-v2/src/
├── app.css
├── router.tsx                     # Updated with QueryClient
├── routeTree.gen.ts               # Auto-generated with all routes
├── lib/
│   ├── cn.ts
│   └── query-keys.ts              # NEW
├── types/
│   ├── api.ts                     # NEW
│   └── plugin.ts                  # NEW
├── routes/
│   ├── __root.tsx
│   ├── index.tsx
│   ├── repos.tsx                  # NEW (stub)
│   ├── dreams.tsx                 # NEW (stub)
│   ├── tasks.tsx                  # NEW (stub)
│   ├── actions.tsx                # NEW (stub)
│   ├── memory.tsx                 # NEW (stub)
│   ├── scheduler.tsx              # NEW (stub)
│   ├── metrics.tsx                # NEW (stub)
│   ├── config.tsx                 # NEW (stub)
│   ├── agents.tsx                 # NEW (stub)
│   ├── health.tsx                 # NEW (stub)
│   ├── webhooks.tsx               # NEW (stub)
│   ├── channels.tsx               # NEW (stub)
│   ├── notifications.tsx          # NEW (stub)
│   └── a2a.tsx                    # NEW (stub)
├── server/
│   ├── vigil-context.ts
│   └── functions.ts               # NEW (26 server functions)
├── components/
│   ├── ui/                        # 16+ shadcn components
│   ├── layout/                    # Empty (Phase 2)
│   └── vigil/                     # Empty (Phase 3+)
├── hooks/                         # Empty (Phase 2+)
└── plugins/                       # Empty (Phase 3)
```

---

## Readiness Check

- [PASS] All inputs from prior phases are listed and available -- Phase 0 deliverables enumerated (vite.config.ts, router.tsx, __root.tsx, index.tsx, vigil-context.ts, app.css, cn.ts)
- [PASS] Every sub-task has a clear, testable completion condition -- each task has a sanity check command
- [PASS] Execution prompt is self-contained -- includes project context, Phase 0 state, data model rules, confirmed API snippets, per-file guidance, import paths, and success criteria
- [PASS] Exit criteria map 1:1 to deliverables -- 12 criteria covering all 5 tasks and their output files
- [PASS] Any heavy external dependency has a fake/stub strategy noted -- route stubs are placeholder divs; mutation wrappers return `{ success: true }` pending Phase 3 consumption
- [PASS] New libraries have a confirmed usage snippet in the execution prompt -- Zod (`z.object()`), lucide-react (`import { Activity } from "lucide-react"`), shadcn CLI (`bunx shadcn@latest add`), TanStack Query (`QueryClient` config), Vite proxy (`server.proxy`)
