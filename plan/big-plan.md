# Vigil Dashboard v2 — Implementation Plan

> TanStack Start + React rewrite of the HTMX dashboard with plugin-extensible architecture.
> Source spec: `plan/vigil-dashboard-v2-spec.md`

---

## Table of Contents

1. [Architecture Decisions](#architecture-decisions)
2. [Phase 0 — Validation Spike](#phase-0--validation-spike)
3. [Phase 1 — Scaffold](#phase-1--scaffold)
4. [Phase 2 — Shell Layout](#phase-2--shell-layout)
5. [Phase 3 — Plugin System & Timeline](#phase-3--plugin-system--timeline)
6. [Phase 4 — Port Core Plugins](#phase-4--port-core-plugins)
7. [Phase 5 — New Core Plugins](#phase-5--new-core-plugins)
8. [Phase 6 — User Plugin Support](#phase-6--user-plugin-support)
9. [Phase 7 — Remove HTMX Legacy](#phase-7--remove-htmx-legacy)
10. [Dependency Graph](#dependency-graph)

---

## Architecture Decisions

### AD-1: TanStack Start embedded in Bun.serve() (single port)

**Decision**: Build TanStack Start without Nitro. In production, import the built server handler and mount it as a catch-all in Vigil's existing `Bun.serve()` on port 7480.

**Why**: Vigil is a local dev tool — running two servers adds complexity for zero benefit. TanStack Start (without Nitro) exports a `default.fetch` handler that integrates directly into `Bun.serve()`.

**How it works**:
```typescript
// src/dashboard/server.ts — production routing
const serverModule = await import("../../dashboard-v2/dist/server/server.js");
const startHandler = serverModule.default;

Bun.serve({
  port: 7480,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return handleApiRoute(req);
    return startHandler.fetch(req);  // TanStack Start handles everything else
  },
});
```

**In dev**: TanStack Start's Vite dev server runs on a separate port (e.g. 3000) and proxies `/api/*` to Vigil's Bun.serve on 7480.

### AD-2: Server functions access Daemon via module-level singleton

**Decision**: A `setVigilContext()` / `getVigilContext()` module-level singleton injects the `DashboardContext` (Daemon + SSE) at startup.

**Why**: Server functions run in the same Bun process — no isolates, no workers. A module-level singleton is the simplest correct pattern for single-process local tools. This would NOT work on edge/serverless runtimes.

### AD-3: Keep existing JSON API endpoints unchanged

**Decision**: All existing `/api/*` JSON endpoints remain as-is. Server functions wrap them for type-safe SSR loaders. SSE stays as client-side EventSource (not a server function — streaming requires it).

**Why**: Preserves backward compatibility, keeps SSE working, and lets plugins use raw fetch to `/api/*` if they prefer.

### AD-4: vite.config.ts (not app.config.ts)

**Decision**: Use `vite.config.ts` with `@tanstack/react-start/plugin/vite` and `nitro/vite`. The spec references `app.config.ts` in some places — this is from pre-v1.121 Vinxi-era. The current TanStack Start uses standard Vite config.

**Correct config**:
```typescript
// dashboard-v2/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [
    tanstackStart(),
    react(),
    nitro({ preset: "bun" }),
  ],
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
});
```

### AD-5: inputValidator (not validator)

**Decision**: The spec uses `.validator()` but the current TanStack Start API uses `.inputValidator()`. All server function definitions must use `.inputValidator()`.

```typescript
// Correct API (current TanStack Start)
export const getTimeline = createServerFn({ method: "GET" })
  .inputValidator(z.object({ status: z.string().optional() }))
  .handler(async ({ data }) => { /* ... */ });
```

### AD-6: Tailwind v4 CSS-first config with shadcn/ui

**Decision**: Use Tailwind v4's `@theme` directive for Vigil's design tokens. shadcn/ui components are initialized via CLI and copied into `components/ui/`. The `cn()` utility uses `clsx` + `tailwind-merge`.

---

## Phase 0 — Validation Spike

> **Goal**: Prove TanStack Start + Bun.serve() handler embedding works end-to-end.
> **Exit criteria**: A "hello world" route served through Vigil's Bun.serve() with one working server function that reads from a mock DashboardContext.
> **Risk**: This is the highest-risk phase. If TanStack Start's Bun handler doesn't embed cleanly into an existing Bun.serve(), the entire architecture needs rethinking.

### Task 0.1 — Initialize TanStack Start project (~45 min)

**What**: Create the TanStack Start app skeleton inside `dashboard-v2/`.

**Steps**:

1. Create the app directory:
```bash
mkdir -p dashboard-v2
cd dashboard-v2
```

2. Initialize package.json for the app sub-project:
```bash
bun init -y
```

3. Install TanStack Start + React dependencies:
```bash
bun add @tanstack/react-start @tanstack/react-router @tanstack/react-query react@^19 react-dom@^19
bun add -d @vitejs/plugin-react vite nitro
```

4. Create `vite.config.ts`:
```typescript
// dashboard-v2/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import path from "path";

export default defineConfig({
  plugins: [
    tanstackStart(),
    react(),
    nitro({ preset: "bun" }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

5. Create minimal route files:

```typescript
// dashboard-v2/src/routes/__root.tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Vigil Dashboard</title>
      </head>
      <body>
        <Outlet />
      </body>
    </html>
  ),
});
```

```typescript
// dashboard-v2/src/routes/index.tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => <h1>Vigil Dashboard v2 — Spike</h1>,
});
```

6. Add scripts to the app's package.json:
```json
{
  "scripts": {
    "dev": "bun --bun vite dev",
    "build": "bun --bun vite build",
    "start": "bun run dist/server/index.mjs"
  }
}
```

7. Verify standalone dev server starts:
```bash
cd dashboard-v2 && bun run dev
```

**Files created**:
- `dashboard-v2/package.json`
- `dashboard-v2/vite.config.ts`
- `dashboard-v2/src/routes/__root.tsx`
- `dashboard-v2/src/routes/index.tsx`

---

### Task 0.2 — Create server function with mock context (~30 min)

**What**: Prove `createServerFn()` can access a module-level singleton (the DashboardContext pattern).

**Steps**:

1. Create the vigil-context module:
```typescript
// dashboard-v2/src/server/vigil-context.ts
import type { DashboardContext } from "../../../server";

let _ctx: DashboardContext | null = null;

export function setVigilContext(ctx: DashboardContext): void {
  _ctx = ctx;
}

export function getVigilContext(): DashboardContext {
  if (!_ctx) throw new Error("Vigil context not initialized — is the daemon running?");
  return _ctx;
}
```

2. Create a test server function:
```typescript
// dashboard-v2/src/server/functions.ts
import { createServerFn } from "@tanstack/react-start";
import { getVigilContext } from "./vigil-context";

export const getHealthCheck = createServerFn({ method: "GET" })
  .handler(async () => {
    const ctx = getVigilContext();
    return {
      status: "ok",
      repos: ctx.daemon.repoPaths.length,
      tick: ctx.daemon.tickEngine.currentTick,
    };
  });
```

3. Wire it into the index route:
```typescript
// dashboard-v2/src/routes/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { getHealthCheck } from "../server/functions";

export const Route = createFileRoute("/")({
  loader: () => getHealthCheck(),
  component: IndexPage,
});

function IndexPage() {
  const data = Route.useLoaderData();
  return (
    <div>
      <h1>Vigil Dashboard v2</h1>
      <p>Status: {data.status}</p>
      <p>Repos: {data.repos}</p>
      <p>Tick: {data.tick}</p>
    </div>
  );
}
```

4. For the spike, inject a mock context before the dev server starts (temporary test harness — not production code):
```typescript
// dashboard-v2/spike-test.ts (temporary, delete after Phase 0)
import { setVigilContext } from "../../dashboard-v2/src/server/vigil-context";

// Mock DashboardContext for spike validation
setVigilContext({
  daemon: {
    repoPaths: ["/tmp/fake-repo"],
    tickEngine: { currentTick: 42, isSleeping: false },
  },
  sse: { broadcast: () => {}, clientCount: 0, connect: () => new Response() },
} as any);
```

**Verify**: Navigate to `http://localhost:3000/` and confirm "Repos: 1, Tick: 42" renders (SSR'd in page source).

**Files created**:
- `dashboard-v2/src/server/vigil-context.ts`
- `dashboard-v2/src/server/functions.ts`
- `dashboard-v2/spike-test.ts` (temporary)

---

### Task 0.3 — Build and embed handler in Bun.serve() (~45 min)

**What**: Build TanStack Start with `bun` preset, then import the output handler into Vigil's existing `Bun.serve()` and serve both API routes and the React app from port 7480.

**Steps**:

1. Build the TanStack Start app:
```bash
cd dashboard-v2 && bun run build
```

2. Verify the build output exists:
```bash
ls -la dashboard-v2/dist/server/
# Should contain index.mjs or similar entry point
```

3. Create a spike integration test in `server.ts` — add a conditional import of the built handler:
```typescript
// Spike addition to src/dashboard/server.ts (temporary)
let startHandler: { fetch: (req: Request) => Response | Promise<Response> } | null = null;

try {
  const mod = await import("../../dashboard-v2/dist/server/server.js");
  startHandler = mod.default;
  console.log("[dashboard] TanStack Start handler loaded");
} catch (e) {
  console.log("[dashboard] TanStack Start handler not found, serving legacy HTML");
}

// In the Bun.serve() fetch handler, BEFORE the static file fallback:
if (startHandler && !url.pathname.startsWith("/api/")) {
  return startHandler.fetch(req);
}
```

4. Start the daemon and verify:
```bash
bun run src/cli/index.ts watch ~/projects/some-repo
# Navigate to http://localhost:7480/ — should show "Vigil Dashboard v2"
# Navigate to http://localhost:7480/api/overview — should return JSON (existing API)
```

**Exit criteria for Phase 0**:
- [ ] TanStack Start dev server starts (`bun run dev` in app dir)
- [ ] Server function reads from module-level context and returns data
- [ ] SSR renders data in page source (not client-side fetched)
- [ ] Production build completes (`bun run build`)
- [ ] Built handler embeds in Bun.serve() — single port serves both API and React app
- [ ] Existing `/api/overview` endpoint still works unchanged

**If this fails**: Fall back to Option B from the spec (static SPA export served from Bun.serve() as static files). This loses SSR but keeps the plugin architecture intact.

---

### Task 0.4 — Validate Tailwind v4 + shadcn/ui build pipeline (~30 min)

**What**: Confirm Tailwind v4 CSS-first config and shadcn/ui components build correctly within TanStack Start's Vite pipeline.

**Steps**:

1. Install Tailwind v4 and shadcn dependencies:
```bash
cd dashboard-v2
bun add tailwindcss@^4
bun add clsx tailwind-merge class-variance-authority
```

2. Create the CSS entry point with Vigil theme tokens:
```css
/* dashboard-v2/src/app.css */
@import "tailwindcss";

@theme {
  --color-vigil: #FF8102;
  --color-vigil-light: #FF9B33;
  --color-vigil-hover: #E57300;
  --color-background: #222745;
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

  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
}
```

3. Import CSS in the root route:
```typescript
// In __root.tsx <head>:
<link rel="stylesheet" href="/app.css" />
```

4. Create the `cn()` utility:
```typescript
// dashboard-v2/src/lib/cn.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

5. Initialize shadcn/ui:
```bash
cd dashboard-v2
bunx shadcn@latest init
# Select: New York style, Zinc color, CSS variables: yes
```

6. Install a test component:
```bash
bunx shadcn@latest add button card badge
```

7. Render a test card in the index route with Vigil theme colors:
```tsx
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function IndexPage() {
  return (
    <div className="min-h-screen bg-background text-text p-8">
      <Card className="max-w-md bg-surface border-border">
        <CardHeader>
          <CardTitle className="text-vigil">Vigil Dashboard v2</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge className="bg-vigil text-white">SPIKE PASSED</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
```

8. Verify: dev server renders the card with correct colors (navy bg, orange accent). Production build includes all styles.

**Verify**: No external CDN requests (check browser Network tab). All assets self-contained.

**Files created**:
- `dashboard-v2/src/app.css`
- `dashboard-v2/src/lib/cn.ts`
- `dashboard-v2/components.json` (shadcn config)
- `dashboard-v2/src/components/ui/button.tsx`
- `dashboard-v2/src/components/ui/card.tsx`
- `dashboard-v2/src/components/ui/badge.tsx`

---

## Phase 1 — Scaffold

> **Goal**: Full project structure in place — routing, server functions wrapping existing APIs, dev proxy, all shadcn/ui base components installed. No visual changes to the running dashboard yet.

### Task 1.1 — Project structure and routing setup (~1 hr)

**What**: Create the full directory structure from the spec, configure TanStack Router with file-based routes for all core tabs, and set up the dev proxy.

**Steps**:

1. Create all directories:
```bash
cd dashboard-v2
mkdir -p app/routes app/server app/components/{ui,layout,vigil} app/hooks app/lib app/types app/plugins
```

2. Create all route files (empty stubs):
```typescript
// app/routes/__root.tsx — Shell layout (sidebar, header, content outlet)
// app/routes/index.tsx — Timeline (default tab, order 0)
// app/routes/repos.tsx
// app/routes/dreams.tsx
// app/routes/tasks.tsx
// app/routes/actions.tsx
// app/routes/memory.tsx
// app/routes/scheduler.tsx
// app/routes/metrics.tsx
// app/routes/config.tsx
// app/routes/agents.tsx
// app/routes/health.tsx
// app/routes/webhooks.tsx
// app/routes/channels.tsx
// app/routes/notifications.tsx
// app/routes/a2a.tsx
```

Each route file follows this pattern:
```typescript
// app/routes/dreams.tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dreams")({
  component: () => <div>Dreams — Coming in Phase 4</div>,
});
```

3. Configure dev proxy in vite.config.ts — proxy `/api/*` to Vigil's Bun.serve:
```typescript
// Add to vite.config.ts
export default defineConfig({
  // ... plugins ...
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:7480",
        changeOrigin: true,
      },
    },
  },
});
```

4. Create the router setup with QueryClient:
```typescript
// app/router.tsx
import { createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,    // 10s — SSE invalidation handles freshness
      gcTime: 5 * 60_000,   // 5 min
      refetchOnWindowFocus: false,
    },
  },
});

export function createAppRouter() {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
```

**Files created**: 10 route stubs, router.tsx, updated vite.config.ts

---

### Task 1.2 — Install all shadcn/ui base components (~30 min)

**What**: Install every shadcn/ui component referenced in the spec.

**Commands**:
```bash
cd dashboard-v2
bunx shadcn@latest add button card badge tabs dialog sheet command sonner data-table chart separator input textarea select dropdown-menu tooltip scroll-area skeleton switch label
```

**Verify**: Each component exists in `app/components/ui/`. All are local copies (no runtime dependency).

**Files created**: ~16 component files in `app/components/ui/`

---

### Task 1.3 — Define TypeScript types (~45 min)

**What**: Create type definitions matching every JSON API response. These types are the contract between server functions and components.

**Steps**:

1. Create API response types:
```typescript
// app/types/api.ts
export type DecisionType = "SILENT" | "OBSERVE" | "NOTIFY" | "ACT";
export type MessageStatus = "normal" | "proactive" | "scheduled" | "alert";
export type TaskStatus = "pending" | "active" | "waiting" | "completed" | "failed" | "cancelled";
export type ActionStatus = "pending" | "approved" | "rejected" | "executed" | "failed";
export type ActionTier = "safe" | "moderate" | "dangerous";

export interface OverviewData {
  repos: { name: string; path: string; state: "active" | "sleeping" | "dreaming" }[];
  repoCount: number;
  sessionId: string;
  uptime: string;
  uptimeSeconds: number;
  state: "awake" | "sleeping" | "dreaming";
  tickCount: number;
  lastTickAt: string;
  nextTickIn: number;
  tickInterval: number;
  adaptiveInterval: number;
  tickModel: string;
  escalationModel: string;
}

export interface TimelineMessage {
  id: string;
  timestamp: string;
  message: string;
  source: { repo: string; branch?: string; event?: string };
  status: MessageStatus;
  severity: "info" | "warning" | "critical";
  metadata: Record<string, unknown>;
}

export interface TimelineData {
  messages: TimelineMessage[];
  total: number;
  page: number;
  pageCount: number;
  filters: { decision?: string; repo?: string; q?: string };
}

export interface RepoListItem {
  name: string;
  path: string;
  state: string;
  branch: string;
  head: string;
  dirty: boolean;
}

export interface RepoDetail extends RepoListItem {
  headMessage: string;
  dirtyFileCount: number;
  uncommittedSummary: string;
  recentCommits: { sha: string; message: string; date: string }[];
  decisions: Record<DecisionType, number>;
  patterns: string[];
  topics: TopicInfo[];
}

export interface TopicInfo {
  name: string;
  observationCount: number;
  trend: "rising" | "stable" | "cooling";
}

export interface DreamResult {
  timestamp: string;
  repo: string;
  observationsConsolidated: number;
  summary: string;
  patterns: string[];
  insights: string[];
  confidence: number;
}

export interface DreamsData {
  dreams: DreamResult[];
  status: { running: boolean; repo?: string; pid?: number };
}

export interface TaskItem {
  id: string;
  repo: string;
  title: string;
  description: string;
  status: TaskStatus;
  waitCondition: string | null;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
  updatedRelative: string;
}

export interface TasksData {
  tasks: TaskItem[];
  counts: Record<TaskStatus, number>;
  completionRate: number;
}

export interface ActionRequest {
  id: string;
  command: string;
  repo: string;
  tier: ActionTier;
  reason: string;
  confidence: number;
  status: ActionStatus;
  result?: string;
  error?: string;
  gateResults?: Record<string, boolean>;
  createdAt: number;
  updatedAt: number;
}

export interface ActionsData {
  actions: ActionRequest[];
  stats: Record<string, number>;
  byTier: Record<ActionTier, number>;
  pending: number;
}

export interface MemoryData {
  vectorStore: { count: number; types: Record<string, number> };
  logEntries: { count: number; oldestDate: string; newestDate: string };
  topics: { count: number; repos: string[] };
  index: { count: number; repos: string[] };
}

export interface MemorySearchResult {
  id: string;
  type: string;
  text: string;
  similarity: number;
  repo: string;
  timestamp: string;
}

export interface MetricsData {
  decisions: {
    series: { time: string; SILENT: number; OBSERVE: number; NOTIFY: number; ACT: number }[];
    totals: Record<DecisionType, number>;
  };
  latency: {
    series: { tick: number; ms: number }[];
    avg: number; p95: number; max: number; count: number;
  };
  tokens: {
    total: number;
    perTick: { avg: number; max: number };
    costEstimate: string;
  };
  tickTiming: {
    configured: number;
    adaptiveCurrent: number;
    recentActivity: number;
    series: { time: string; count: number }[];
  };
  ticks: { total: number; sleeping: number; proactive: number; current: number };
  state: { isSleeping: boolean; uptime: string; model: string };
}

export interface ScheduleEntry {
  id: string;
  name: string;
  cron: string;
  repo?: string;
  action: string;
  nextRun: string | null;
  msToNext: number | null;
  nextRunRelative: string;
}

export interface SchedulerData {
  entries: ScheduleEntry[];
  history: { id: string; name: string; completedAt: string; success: boolean; output: string }[];
}
```

2. Create plugin types:
```typescript
// app/types/plugin.ts
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

**Files created**: `app/types/api.ts`, `app/types/plugin.ts`

---

### Task 1.4 — Create server functions wrapping existing APIs (~1 hr)

**What**: Create `createServerFn()` wrappers for every existing JSON API handler. These call the same handler functions that the current `/api/*` routes use, but with type-safe inputs/outputs.

```typescript
// app/server/functions.ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getVigilContext } from "./vigil-context";

// Import existing handlers
import { getOverviewJSON } from "../../api/overview";
import { getReposJSON, getRepoDetailJSON } from "../../api/repos";
import { getTimelineJSON } from "../../api/timeline";
import { getDreamsJSON, getDreamPatternsJSON, handleDreamTrigger } from "../../api/dreams";
import { getTasksJSON, handleTaskCreate, handleTaskActivate, handleTaskComplete, handleTaskFail, handleTaskUpdate, handleTaskCancel } from "../../api/tasks";
import { getActionsJSON, getActionsPendingJSON, handleApprove, handleReject } from "../../api/actions";
import { getMemoryJSON, getMemorySearchJSON, handleAsk } from "../../api/memory";
import { getSchedulerJSON, handleSchedulerCreate, handleSchedulerDelete, handleSchedulerTrigger } from "../../api/scheduler";
import { getMetricsJSON } from "../../api/metrics";

import type { OverviewData, TimelineData, DreamsData, TasksData, ActionsData, MemoryData, MemorySearchResult, MetricsData, SchedulerData, RepoDetail, RepoListItem } from "../types/api";

// ── Reads ──────────────────────────────────────────────

export const getOverview = createServerFn({ method: "GET" })
  .handler(async (): Promise<OverviewData> => {
    const ctx = getVigilContext();
    return getOverviewJSON(ctx);
  });

export const getRepos = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ repos: RepoListItem[] }> => {
    const ctx = getVigilContext();
    return getReposJSON(ctx);
  });

export const getRepoDetail = createServerFn({ method: "GET" })
  .inputValidator(z.object({ name: z.string() }))
  .handler(async ({ data }): Promise<RepoDetail | null> => {
    const ctx = getVigilContext();
    return getRepoDetailJSON(ctx, data.name);
  });

export const getTimeline = createServerFn({ method: "GET" })
  .inputValidator(z.object({
    status: z.string().optional(),
    repo: z.string().optional(),
    q: z.string().optional(),
    page: z.number().optional(),
  }))
  .handler(async ({ data }): Promise<TimelineData> => {
    const ctx = getVigilContext();
    const url = new URL("http://localhost/api/timeline");
    if (data.status) url.searchParams.set("status", data.status);
    if (data.repo) url.searchParams.set("repo", data.repo);
    if (data.q) url.searchParams.set("q", data.q);
    if (data.page) url.searchParams.set("page", String(data.page));
    return getTimelineJSON(ctx, url);
  });

export const getDreams = createServerFn({ method: "GET" })
  .handler(async (): Promise<DreamsData> => {
    const ctx = getVigilContext();
    return getDreamsJSON(ctx);
  });

export const getDreamPatterns = createServerFn({ method: "GET" })
  .inputValidator(z.object({ repo: z.string() }))
  .handler(async ({ data }) => {
    const ctx = getVigilContext();
    return getDreamPatternsJSON(ctx, data.repo);
  });

export const getTasks = createServerFn({ method: "GET" })
  .inputValidator(z.object({
    status: z.string().optional(),
    repo: z.string().optional(),
  }))
  .handler(async ({ data }): Promise<TasksData> => {
    const ctx = getVigilContext();
    return getTasksJSON(ctx, data);
  });

export const getActions = createServerFn({ method: "GET" })
  .inputValidator(z.object({ status: z.string().optional() }))
  .handler(async ({ data }): Promise<ActionsData> => {
    const ctx = getVigilContext();
    return getActionsJSON(ctx, data);
  });

export const getActionsPending = createServerFn({ method: "GET" })
  .handler(async () => {
    const ctx = getVigilContext();
    return getActionsPendingJSON(ctx);
  });

export const getMemory = createServerFn({ method: "GET" })
  .handler(async (): Promise<MemoryData> => {
    const ctx = getVigilContext();
    return getMemoryJSON(ctx);
  });

export const searchMemory = createServerFn({ method: "GET" })
  .inputValidator(z.object({ query: z.string(), repo: z.string().optional() }))
  .handler(async ({ data }): Promise<{ results: MemorySearchResult[]; query: string }> => {
    const ctx = getVigilContext();
    return getMemorySearchJSON(ctx, data.query, data.repo);
  });

export const getMetrics = createServerFn({ method: "GET" })
  .handler(async (): Promise<MetricsData> => {
    const ctx = getVigilContext();
    return getMetricsJSON(ctx);
  });

export const getScheduler = createServerFn({ method: "GET" })
  .handler(async (): Promise<SchedulerData> => {
    const ctx = getVigilContext();
    return getSchedulerJSON(ctx);
  });

// ── Mutations ──────────────────────────────────────────

export const triggerDream = createServerFn({ method: "POST" })
  .inputValidator(z.object({ repo: z.string().optional() }))
  .handler(async ({ data }) => {
    const ctx = getVigilContext();
    return handleDreamTrigger(ctx, data.repo);
  });

export const createTask = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    title: z.string(),
    description: z.string().optional(),
    repo: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const ctx = getVigilContext();
    const formData = new FormData();
    formData.set("title", data.title);
    if (data.description) formData.set("description", data.description);
    if (data.repo) formData.set("repo", data.repo);
    return handleTaskCreate(ctx, formData);
  });

export const activateTask = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = getVigilContext();
    return handleTaskActivate(ctx, data.id);
  });

export const completeTask = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = getVigilContext();
    return handleTaskComplete(ctx, data.id);
  });

export const failTask = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = getVigilContext();
    return handleTaskFail(ctx, data.id);
  });

export const updateTask = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    id: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    repo: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const ctx = getVigilContext();
    const formData = new FormData();
    if (data.title) formData.set("title", data.title);
    if (data.description) formData.set("description", data.description);
    if (data.repo) formData.set("repo", data.repo);
    return handleTaskUpdate(ctx, data.id, formData);
  });

export const cancelTask = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = getVigilContext();
    return handleTaskCancel(ctx, data.id);
  });

export const approveAction = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = getVigilContext();
    return handleApprove(ctx, data.id);
  });

export const rejectAction = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = getVigilContext();
    return handleReject(ctx, data.id);
  });

export const askVigil = createServerFn({ method: "POST" })
  .inputValidator(z.object({ question: z.string(), repo: z.string().optional() }))
  .handler(async ({ data }) => {
    const ctx = getVigilContext();
    return handleAsk(ctx, data.question, data.repo);
  });

export const createSchedule = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    name: z.string(),
    cron: z.string(),
    action: z.string(),
    repo: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const ctx = getVigilContext();
    const formData = new FormData();
    formData.set("name", data.name);
    formData.set("cron", data.cron);
    formData.set("action", data.action);
    if (data.repo) formData.set("repo", data.repo);
    return handleSchedulerCreate(ctx, formData);
  });

export const deleteSchedule = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = getVigilContext();
    return handleSchedulerDelete(ctx, data.id);
  });

export const triggerSchedule = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = getVigilContext();
    return handleSchedulerTrigger(ctx, data.id);
  });
```

**Additional server functions needed** (not in Phase 1 initial list — add when Phase 5 is implemented):

```typescript
// Timeline reply (Phase 3)
export const replyToMessage = createServerFn({ method: "POST" })
  .inputValidator(z.object({ messageId: z.string(), reply: z.string() }))
  .handler(async ({ data }) => {
    const ctx = getVigilContext();
    return handleReply(ctx, data.messageId, data.reply);
  });

// Memory sub-endpoints (Phase 4)
export const getMemoryTopics = createServerFn({ method: "GET" })
  .inputValidator(z.object({ repo: z.string() }))
  .handler(async ({ data }) => {
    const ctx = getVigilContext();
    return { topics: ctx.daemon.vectorStore./* topicTier.listTopics(data.repo) */ };
  });

export const getMemoryProfiles = createServerFn({ method: "GET" })
  .handler(async () => {
    const ctx = getVigilContext();
    return { profiles: ctx.daemon.vectorStore.getAllRepoProfiles() };
  });

// Config (Phase 5)
export const getConfig = createServerFn({ method: "GET" })
  .handler(async () => { /* ... */ });
export const updateConfig = createServerFn({ method: "POST" })
  .inputValidator(z.record(z.unknown()))
  .handler(async ({ data }) => { /* ... */ });
export const getFeatureGates = createServerFn({ method: "GET" })
  .handler(async () => { /* ... */ });
export const toggleFeatureGate = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: z.string(), enabled: z.boolean() }))
  .handler(async ({ data }) => { /* ... */ });

// Agents (Phase 5)
export const getAgents = createServerFn({ method: "GET" })
  .handler(async () => { /* scan .claude/agents/ */ });
export const getCurrentAgent = createServerFn({ method: "GET" })
  .handler(async () => { /* ... */ });
export const switchAgent = createServerFn({ method: "POST" })
  .inputValidator(z.object({ agentName: z.string() }))
  .handler(async ({ data }) => { /* ... */ });

// Health (Phase 5)
export const getHealth = createServerFn({ method: "GET" })
  .handler(async () => { /* process stats, db sizes, errors */ });

// Notifications (Phase 5)
export const updateNotificationRules = createServerFn({ method: "POST" })
  .inputValidator(z.object({ /* push config fields */ }))
  .handler(async ({ data }) => { /* ... */ });
```

**Note**: The exact import paths for handler functions may need adjustment based on how the current API modules export their functions. Some handlers currently accept `Request` objects — those will need thin adapter wrappers to accept structured data instead.

**Files created**: `app/server/functions.ts` (full implementation, extended incrementally in later phases)

---

### Task 1.5 — Query key factory and Lucide icon setup (~30 min)

**What**: Create the centralized query key factory and install Lucide React.

```bash
cd dashboard-v2 && bun add lucide-react
```

```typescript
// app/lib/query-keys.ts
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

**Files created**: `app/lib/query-keys.ts`

---

## Phase 2 — Shell Layout

> **Goal**: Build the persistent UI shell using the standard **shadcn/ui Sidebar** component — navigation, repo list, daemon status, all wired to live data via SSE. All content areas show stub text until Phase 3+.
>
> **Design**: Standard shadcn/ui sidebar layout (`SidebarProvider` + `Sidebar` + `SidebarInset`). Navigation lives in the sidebar (not a bottom tab bar). The sidebar collapses to icon-only mode (`collapsible="icon"`). A sticky header inside `SidebarInset` shows daemon status + breadcrumbs. No custom layout primitives — everything uses shadcn's composable sidebar sub-components.

### Task 2.1 — Install shadcn/ui Sidebar + Separator + Breadcrumb (~15 min)

**What**: Add the shadcn sidebar component and its dependencies.

```bash
cd dashboard-v2
bunx shadcn@latest add sidebar separator breadcrumb tooltip
```

This generates:
- `app/components/ui/sidebar.tsx` — Full sidebar primitive (SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuBadge, SidebarRail, SidebarInset, SidebarTrigger, useSidebar)
- `app/components/ui/separator.tsx`
- `app/components/ui/breadcrumb.tsx`
- `app/components/ui/tooltip.tsx` (sidebar dependency)

**Files created**: 4 shadcn component files

---

### Task 2.2 — AppSidebar component (~1.5 hr)

**What**: The main sidebar containing: branding header, navigation menu (all plugin tabs), repos group, and daemon status footer. Uses standard shadcn sub-components throughout.

```typescript
// app/components/layout/app-sidebar.tsx
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import * as LucideIcons from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarRail,
} from "@/components/ui/sidebar";
import { getOverview, getRepos } from "../../server/functions";
import { vigilKeys } from "../../lib/query-keys";
import type { PluginWidget } from "../../types/plugin";
import {
  GitBranch, Circle, Moon, Sparkles, Activity,
} from "lucide-react";

interface AppSidebarProps {
  plugins: PluginWidget[];
}

export function AppSidebar({ plugins }: AppSidebarProps) {
  const { location } = useRouterState();
  const tabs = plugins
    .filter((p) => p.slot === "tab")
    .sort((a, b) => a.order - b.order);

  const { data: repos } = useQuery({
    queryKey: vigilKeys.repos.all,
    queryFn: () => getRepos(),
  });

  const { data: overview } = useQuery({
    queryKey: vigilKeys.overview,
    queryFn: () => getOverview(),
    refetchInterval: 30_000,
  });

  return (
    <Sidebar collapsible="icon">
      {/* Header: Logo + branding */}
      <SidebarHeader>
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
        {/* Navigation Group */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarMenu>
            {tabs.map((tab) => {
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

        {/* Repos Group */}
        <SidebarGroup>
          <SidebarGroupLabel>Repositories</SidebarGroupLabel>
          <SidebarMenu>
            {repos?.repos.map((repo) => (
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

      {/* Footer: Daemon status */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={`${overview?.state ?? "..."} — Tick ${overview?.tickCount ?? 0}`}>
              <DaemonStateIcon state={overview?.state} />
              <div className="flex flex-col gap-0.5 text-xs leading-none">
                <span className="capitalize">{overview?.state ?? "..."}</span>
                <span className="text-text-muted">
                  Tick {overview?.tickCount ?? 0} — {overview?.uptime ?? "..."}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

function RepoStateIndicator({ state, dirty }: { state: string; dirty: boolean }) {
  return (
    <span className="flex items-center gap-1">
      {dirty && <span className="size-1.5 rounded-full bg-warning" />}
      {state === "active" && <Circle className="size-2.5 text-success fill-success" />}
      {state === "sleeping" && <Moon className="size-2.5 text-text-muted" />}
      {state === "dreaming" && <Sparkles className="size-2.5 text-info" />}
    </span>
  );
}

function DaemonStateIcon({ state }: { state?: string }) {
  if (state === "sleeping") return <Moon className="text-text-muted" />;
  if (state === "dreaming") return <Sparkles className="text-info" />;
  return <Circle className="text-success" />;
}
```

**Key details**:
- Uses `collapsible="icon"` — collapses to icon-only rail, expands on hover or `Cmd+B`
- `SidebarMenuButton` `tooltip` prop provides labels when collapsed (requires `<TooltipProvider>` in root)
- `isActive` prop on `SidebarMenuButton` handles highlight styling automatically (shadcn convention)
- `SidebarRail` adds the drag-to-resize handle
- Navigation and Repos are separate `SidebarGroup`s with labels
- Footer shows daemon state (awake/sleeping/dreaming), tick count, uptime

**Files created**: `app/components/layout/app-sidebar.tsx`

---

### Task 2.3 — Site header with breadcrumbs and status bar (~1 hr)

**What**: A sticky header inside `SidebarInset` showing the sidebar trigger, breadcrumbs for the current route, and compact daemon status indicators (tick countdown, repo count).

```typescript
// app/components/layout/site-header.tsx
import { useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink,
  BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { getOverview } from "../../server/functions";
import { vigilKeys } from "../../lib/query-keys";
import { NextTickCountdown } from "./next-tick-countdown";

const routeLabels: Record<string, string> = {
  "/": "Timeline", "/repos": "Repos", "/dreams": "Dreams",
  "/tasks": "Tasks", "/actions": "Actions", "/memory": "Memory",
  "/metrics": "Metrics", "/scheduler": "Scheduler", "/config": "Config",
};

export function SiteHeader() {
  const { location } = useRouterState();
  const pageLabel = routeLabels[location.pathname] ?? "Dashboard";

  const { data } = useQuery({
    queryKey: vigilKeys.overview,
    queryFn: () => getOverview(),
    refetchInterval: 30_000,
  });

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface-dark px-4">
      <SidebarTrigger className="-ml-1 text-text-muted" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Vigil</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{pageLabel}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex-1" />
      {data && (
        <div className="flex items-center gap-3 text-sm text-text-muted">
          <NextTickCountdown nextTickIn={data.nextTickIn} />
          <Badge variant="outline" className="text-text-muted border-border text-xs">
            {data.repoCount} repo{data.repoCount !== 1 ? "s" : ""}
          </Badge>
        </div>
      )}
    </header>
  );
}
```

```typescript
// app/components/layout/next-tick-countdown.tsx
import { useState, useEffect } from "react";

export function NextTickCountdown({ nextTickIn }: { nextTickIn: number }) {
  const [seconds, setSeconds] = useState(Math.max(0, Math.round(nextTickIn)));

  useEffect(() => {
    setSeconds(Math.max(0, Math.round(nextTickIn)));
  }, [nextTickIn]);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [seconds > 0]);

  return (
    <span className="font-mono tabular-nums">
      {seconds > 0 ? `${seconds}s` : "now"}
    </span>
  );
}
```

**Files created**: `app/components/layout/site-header.tsx`, `app/components/layout/next-tick-countdown.tsx`

---

### Task 2.4 — SSE hook with TanStack Query invalidation (~45 min)

**What**: Client-side SSE hook that invalidates query caches when events arrive.

```typescript
// app/hooks/use-sse.ts
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { vigilKeys } from "../lib/query-keys";

const SSE_EVENT_MAP: Record<string, readonly string[][]> = {
  // Core events (existing)
  tick:              [vigilKeys.overview, vigilKeys.repos.all, vigilKeys.timeline({})],
  message:           [vigilKeys.timeline({})],
  decision:          [vigilKeys.timeline({}), vigilKeys.metrics],
  action:            [vigilKeys.actions.all],
  action_pending:    [vigilKeys.actions.pending, vigilKeys.actions.all],
  action_resolved:   [vigilKeys.actions.all, vigilKeys.actions.pending],
  dream:             [vigilKeys.dreams, vigilKeys.memory.stats],
  dream_started:     [vigilKeys.dreams],
  dream_completed:   [vigilKeys.dreams, vigilKeys.memory.stats],
  // State + config
  state_change:      [vigilKeys.overview],
  config_changed:    [vigilKeys.config],
  // Task + scheduler
  task_updated:      [vigilKeys.tasks],
  schedule_fired:    [vigilKeys.scheduler],
  // Phase 5 events
  webhook:           [["webhooks"]],
  channel:           [["channels"]],
  // Health (periodic push from server)
  health:            [["health"]],
};

export function useSSE() {
  const queryClient = useQueryClient();
  const sourceRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);

  useEffect(() => {
    function connect() {
      const source = new EventSource("/api/sse");
      sourceRef.current = source;

      source.addEventListener("connected", () => {
        retryRef.current = 0;
      });

      for (const [event, queryKeys] of Object.entries(SSE_EVENT_MAP)) {
        source.addEventListener(event, () => {
          for (const key of queryKeys) {
            queryClient.invalidateQueries({ queryKey: key as any });
          }
        });
      }

      source.onerror = () => {
        source.close();
        const delay = Math.min(1000 * 2 ** retryRef.current, 30_000);
        retryRef.current++;
        setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      sourceRef.current?.close();
    };
  }, [queryClient]);
}
```

**Key details**:
- Exponential backoff on reconnection (1s, 2s, 4s, ... max 30s)
- Maps SSE event types to query keys for targeted invalidation
- No polling needed — SSE pushes trigger refetches via cache invalidation
- Runs once in root layout (not per-route)

**Files created**: `app/hooks/use-sse.ts`

---

### Task 2.5 — Root layout assembly with SidebarProvider (~45 min)

**What**: Wire everything into the root route using the standard shadcn sidebar layout pattern: `SidebarProvider` > `AppSidebar` + `SidebarInset` > `SiteHeader` + `<Outlet />`.

```typescript
// app/routes/__root.tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { queryClient } from "../router";
import { AppSidebar } from "../components/layout/app-sidebar";
import { SiteHeader } from "../components/layout/site-header";
import { useSSE } from "../hooks/use-sse";
import { corePlugins } from "../plugins";

import "../app.css";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppShell />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function AppShell() {
  useSSE();

  return (
    <SidebarProvider>
      <AppSidebar plugins={corePlugins} />
      <SidebarInset>
        <SiteHeader />
        <main className="flex-1 overflow-y-auto p-4">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

**Layout** (standard shadcn/ui sidebar pattern):
```
┌──────────┬──────────────────────────────────────┐
│ Sidebar  │  SidebarInset                        │
│          │  ┌────────────────────────────────┐   │
│ [vigil]  │  │ SiteHeader (trigger+breadcrumb)│   │
│          │  ├────────────────────────────────┤   │
│ Nav      │  │                                │   │
│  Timeline│  │  <Outlet />                    │   │
│  Repos   │  │  (active route content)        │   │
│  Dreams  │  │                                │   │
│  Tasks   │  │                                │   │
│  Actions │  │                                │   │
│  Memory  │  │                                │   │
│  Metrics │  │                                │   │
│          │  │                                │   │
│ Repos    │  │                                │   │
│  > vigil │  │                                │   │
│  > app   │  └────────────────────────────────┘   │
│          │                                       │
│ [status] │                                       │
└──────────┴──────────────────────────────────────┘
```

- **Sidebar**: Collapsible to icons via `Cmd+B` or `SidebarTrigger` (shadcn `collapsible="icon"`)
- **SidebarHeader**: Vigil logo/branding
- **SidebarContent**: Navigation group (plugin tabs) + Repos group (watched repos with state badges)
- **SidebarFooter**: Daemon state, tick count, uptime
- **SiteHeader**: Trigger button, breadcrumbs, tick countdown, repo count badge
- **Main**: Route content via TanStack Router `<Outlet />`
- **No bottom nav bar** — navigation is in the sidebar (standard desktop app pattern)

**Files modified**: `app/routes/__root.tsx`

---

## Phase 3 — Plugin System & Timeline

> **Goal**: Build the plugin registration system and port Timeline as the first core plugin, proving the plugin interface works end-to-end.

### Task 3.1 — Plugin registry and core plugin manifest (~1 hr)

**What**: Define the core plugin array and the registry that merges core + user plugins, respects feature gates, and provides the sorted plugin list to the nav bar.

```typescript
// app/plugins/index.ts
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
  {
    id: "tasks",
    label: "Tasks",
    icon: "CheckSquare",
    slot: "tab",
    order: 30,
    component: () => import("./tasks/TasksPage"),
    sseEvents: ["tick"],
    queryKeys: [["tasks"]],
    featureGate: "VIGIL_TASKS",
  },
  {
    id: "actions",
    label: "Actions",
    icon: "Zap",
    slot: "tab",
    order: 40,
    component: () => import("./actions/ActionsPage"),
    sseEvents: ["action_pending", "action"],
    queryKeys: [["actions"]],
  },
  {
    id: "memory",
    label: "Memory",
    icon: "Brain",
    slot: "tab",
    order: 50,
    component: () => import("./memory/MemoryPage"),
    sseEvents: ["dream"],
    queryKeys: [["memory"]],
  },
  {
    id: "metrics",
    label: "Metrics",
    icon: "BarChart3",
    slot: "tab",
    order: 60,
    component: () => import("./metrics/MetricsPage"),
    sseEvents: ["tick", "decision"],
    queryKeys: [["metrics"]],
  },
  {
    id: "scheduler",
    label: "Scheduler",
    icon: "Clock",
    slot: "tab",
    order: 70,
    component: () => import("./scheduler/SchedulerPage"),
    sseEvents: ["tick", "schedule_fired"],
    queryKeys: [["scheduler"]],
    featureGate: "VIGIL_SCHEDULER",
  },
  {
    id: "config",
    label: "Config",
    icon: "Settings",
    slot: "tab",
    order: 75,
    component: () => import("./config/ConfigPage"),
    sseEvents: ["config_changed"],
    queryKeys: [["config"]],
  },
  {
    id: "agents",
    label: "Agents",
    icon: "Bot",
    slot: "tab",
    order: 80,
    component: () => import("./agents/AgentsPage"),
    queryKeys: [["agents"]],
    featureGate: "VIGIL_AGENT_IDENTITY",
  },
  {
    id: "health",
    label: "Health",
    icon: "HeartPulse",
    slot: "tab",
    order: 85,
    component: () => import("./health/HealthPage"),
    sseEvents: ["health"],
    queryKeys: [["health"]],
  },
  {
    id: "webhooks",
    label: "Webhooks",
    icon: "Webhook",
    slot: "tab",
    order: 90,
    component: () => import("./webhooks/WebhooksPage"),
    sseEvents: ["webhook"],
    queryKeys: [["webhooks"]],
    featureGate: "VIGIL_WEBHOOKS",
  },
  {
    id: "channels",
    label: "Channels",
    icon: "Radio",
    slot: "tab",
    order: 91,
    component: () => import("./channels/ChannelsPage"),
    sseEvents: ["channel"],
    queryKeys: [["channels"]],
    featureGate: "VIGIL_CHANNELS",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: "Bell",
    slot: "tab",
    order: 92,
    component: () => import("./notifications/NotificationsPage"),
    sseEvents: ["message"],
    queryKeys: [["notifications"]],
    featureGate: "VIGIL_PUSH",
  },
  {
    id: "a2a",
    label: "A2A",
    icon: "Network",
    slot: "tab",
    order: 93,
    component: () => import("./a2a/A2APage"),
    queryKeys: [["a2a"]],
    featureGate: "VIGIL_A2A",
  },
];
```

**Files created**: `app/plugins/index.ts`

---

### Task 3.2 — Plugin slot renderer (~45 min)

**What**: A `<PluginSlot>` component that lazily loads and renders a plugin component with error boundary wrapping.

```typescript
// app/components/vigil/plugin-slot.tsx
import { Suspense, lazy, useMemo } from "react";
import { ErrorBoundary } from "./error-boundary";
import { Skeleton } from "../ui/skeleton";
import type { PluginWidget, WidgetProps } from "../../types/plugin";

interface PluginSlotProps {
  plugin: PluginWidget;
  widgetProps: WidgetProps;
}

export function PluginSlot({ plugin, widgetProps }: PluginSlotProps) {
  const LazyComponent = useMemo(
    () => lazy(plugin.component),
    [plugin.id]
  );

  return (
    <ErrorBoundary fallback={<PluginError pluginId={plugin.id} />}>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <LazyComponent {...widgetProps} />
      </Suspense>
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

```typescript
// app/components/vigil/error-boundary.tsx
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
```

**Files created**: `app/components/vigil/plugin-slot.tsx`, `app/components/vigil/error-boundary.tsx`

---

### Task 3.3 — Timeline plugin — core list and decision badges (~1.5 hr)

**What**: Port the Timeline tab as the first core plugin. Decision feed with filters, expandable rows, and reply input.

```typescript
// app/plugins/timeline/TimelinePage.tsx
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getTimeline } from "../../server/functions";
import { vigilKeys } from "../../lib/query-keys";
import { TimelineEntry } from "../../components/vigil/timeline-entry";
import { DecisionFilter } from "./DecisionFilter";
import { Button } from "../../components/ui/button";
import type { WidgetProps } from "../../types/plugin";

export default function TimelinePage({ activeRepo }: WidgetProps) {
  const [filters, setFilters] = useState<{
    status?: string;
    repo?: string;
    q?: string;
    page?: number;
  }>({ repo: activeRepo ?? undefined });

  const { data, isLoading } = useQuery({
    queryKey: vigilKeys.timeline(filters),
    queryFn: () => getTimeline({ data: filters }),
  });

  return (
    <div className="space-y-4">
      <DecisionFilter
        current={filters.status}
        onChange={(status) => setFilters((f) => ({ ...f, status, page: undefined }))}
      />

      <div className="space-y-2">
        {data?.messages.map((msg) => (
          <TimelineEntry key={msg.id} message={msg} />
        ))}
      </div>

      {data && data.pageCount > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!data.page || data.page <= 1}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
          >
            Previous
          </Button>
          <span className="text-sm text-text-muted self-center">
            {data.page} / {data.pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={data.page >= data.pageCount}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
```

**Sub-components**:

```typescript
// app/components/vigil/decision-badge.tsx
import { Badge } from "../ui/badge";
import { Eye, Bell, Zap, Moon } from "lucide-react";
import { cn } from "../../lib/cn";

const decisionConfig = {
  SILENT:  { icon: Moon,  variant: "outline" as const,      className: "text-text-muted border-border" },
  OBSERVE: { icon: Eye,   variant: "secondary" as const,    className: "text-info bg-info/10" },
  NOTIFY:  { icon: Bell,  variant: "default" as const,      className: "text-warning bg-warning/10" },
  ACT:     { icon: Zap,   variant: "destructive" as const,  className: "text-vigil bg-vigil/10" },
} as const;

type Decision = keyof typeof decisionConfig;

export function DecisionBadge({ decision }: { decision: string }) {
  const config = decisionConfig[decision as Decision] ?? decisionConfig.SILENT;
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={cn("gap-1", config.className)}>
      <Icon className="w-3 h-3" />
      {decision}
    </Badge>
  );
}
```

```typescript
// app/components/vigil/timeline-entry.tsx
import { useState } from "react";
import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { DecisionBadge } from "./decision-badge";
import { cn } from "../../lib/cn";
import type { TimelineMessage } from "../../types/api";

export function TimelineEntry({ message }: { message: TimelineMessage }) {
  const [expanded, setExpanded] = useState(false);
  const decision = (message.metadata?.decision as string) ?? "SILENT";
  const confidence = message.metadata?.confidence as number | undefined;

  return (
    <Card className="bg-surface border-border hover:border-border-light transition-colors">
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-0.5 text-text-muted hover:text-text"
          >
            {expanded
              ? <ChevronDown className="w-4 h-4" />
              : <ChevronRight className="w-4 h-4" />}
          </button>

          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-center gap-2 mb-1">
              <DecisionBadge decision={decision} />
              <span className="text-xs text-text-muted">{message.source.repo}</span>
              {confidence != null && (
                <span className="text-xs text-text-muted ml-auto">
                  {(confidence * 100).toFixed(0)}%
                </span>
              )}
              <time className="text-xs text-text-muted">
                {new Date(message.timestamp).toLocaleTimeString()}
              </time>
            </div>

            {/* Message text */}
            <p className={cn(
              "text-sm text-text",
              !expanded && "line-clamp-2"
            )}>
              {message.message}
            </p>

            {/* Expanded details */}
            {expanded && (
              <div className="mt-3 pt-3 border-t border-border space-y-2">
                <pre className="text-xs text-text-muted bg-surface-dark rounded p-2 overflow-x-auto">
                  {JSON.stringify(message.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

**Additional Timeline features** (must be included in the TimelinePage component):

- **Search input**: Text input with debounced `onChange` (300ms) that sets `filters.q`. Searches via existing `getTimeline` server function which passes `q` to the backend's FTS5 search.
- **Repo filter dropdown**: `<Select>` populated from `getRepos()` query, sets `filters.repo`.
- **Inline reply**: Each expanded `TimelineEntry` includes a reply textarea + submit button. Calls `replyToMessage` server function (see Task 1.4 additions). Shows confirmation on success.
- **Confidence badge**: Each entry displays `confidence` as a percentage pill (e.g., "85%") right-aligned.
- **Live indicator**: A pulsing dot in the header indicating SSE connection is active (from `useSSE` hook state).

**Files created**:
- `app/plugins/timeline/TimelinePage.tsx` — includes search bar, decision filter, repo filter, live indicator
- `app/plugins/timeline/DecisionFilter.tsx`
- `app/plugins/timeline/ReplyForm.tsx` — inline reply textarea + submit
- `app/components/vigil/timeline-entry.tsx` — expandable with reasoning, confidence, reply
- `app/components/vigil/decision-badge.tsx`

---

### Task 3.4 — Wire Timeline route to plugin component (~30 min)

**What**: Connect the index route to load Timeline via the plugin system (proving the plugin → route → lazy-load flow).

```typescript
// app/routes/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { getTimeline } from "../server/functions";
import { Suspense, lazy } from "react";
import { Skeleton } from "../components/ui/skeleton";

const TimelinePage = lazy(() => import("../plugins/timeline/TimelinePage"));

export const Route = createFileRoute("/")({
  loader: () => getTimeline({ data: {} }),
  component: () => (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <TimelinePage activeRepo={null} queryClient={null as any} />
    </Suspense>
  ),
});
```

**Files modified**: `app/routes/index.tsx`

---

## Phase 4 — Port Remaining Core Plugins

> **Goal**: Port all 7 remaining core plugins. Each uses existing JSON APIs — no backend changes needed.

### Task 4.1 — Repos plugin (~1.5 hr)

**What**: Repo list with status indicators, branch/commit info, dirty status. Click to expand with full detail view including recent commits, decision distribution bars, discovered patterns, topic evolution, and uncommitted work breakdown.

**Components**:
- `app/plugins/repos/ReposPage.tsx` — Repo grid/list + detail panel
- `app/components/vigil/repo-card.tsx` — Individual repo card with state indicator

**UI details**:
- Repo list shows: name, branch, HEAD sha (7-char), dirty dot, state icon
- Detail panel (click to expand or sidebar sheet):
  - **Git state**: branch, HEAD commit + message, dirty file count, uncommitted summary (modified/untracked/added/deleted)
  - **Recent commits** (last 5): sha, message, relative date
  - **Decision distribution**: Horizontal bar chart (SILENT/OBSERVE/NOTIFY/ACT proportional bars with percentages)
  - **Patterns**: Bulleted list from `RepoProfile.patterns`
  - **Topics**: Topic list with observation count bars and trend arrows (rising/stable/cooling)
  - **Uncommitted work**: File list grouped by status (NEW/modified/deleted)

**Data flow**: `getRepos()` → repo list, `getRepoDetail({ data: { name } })` → detail panel

**Route**: `app/routes/repos.tsx` with loader calling `getRepos()`

---

### Task 4.2 — Dreams plugin (~1.5 hr)

**What**: Dream consolidation results list, per-repo patterns with confidence scores, topic evolution tracking, manual trigger button, dream lock status indicator.

**Components**:
- `app/plugins/dreams/DreamsPage.tsx` — Dream results + trigger + repo filter
- `app/components/vigil/dream-entry.tsx` — Single dream card with insights/patterns

**UI details**:
- **Dream log**: Cards sorted by date, each showing:
  - Timestamp, repo, observations consolidated count, confidence score
  - Summary text (expandable)
  - Insights list (bulleted)
  - Patterns list (bulleted)
- **Dream status indicator**: Shows "running" with repo name and PID when dream is in progress, "idle" otherwise
- **Trigger button**: Manual dream trigger with optional repo selector
- **Patterns panel**: Per-repo pattern list with confidence scores, sorted by confidence descending
- **Topic evolution panel**: Topic name + observation count bar + trend indicator (rising arrow, stable dash, cooling arrow, "new" tag)
- **Repo filter**: Dropdown to filter dreams by watched repo

**Data flow**: `getDreams()` → dream list + status, `getDreamPatterns({ data: { repo } })` → patterns + topic evolution, `triggerDream()` → mutation

**Route**: `app/routes/dreams.tsx` with loader calling `getDreams()`

---

### Task 4.3 — Tasks plugin (~1.5 hr)

**What**: Task list with status badges, create form with wait conditions, status transitions (activate/complete/fail), filters by status/repo, completion stats.

**Components**:
- `app/plugins/tasks/TasksPage.tsx` — List + create form + filters + stats
- Task status badge component (reuses `<Badge>`)
- Create task dialog (uses `<Dialog>` from shadcn)

**UI details**:
- **Task table**: Status icon, title, repo, updated (relative), action buttons (activate/complete/fail/cancel)
- **Filter tabs**: All, Pending (count), Active (count), Waiting (count), Completed (count)
- **Create form** (in `<Dialog>`):
  - Title (required), Description (textarea), Repo (dropdown)
  - Wait condition selector: None / Event-based (git event type) / Task-based (parent task ID) / Schedule-based (cron expression)
- **Stats bar**: Completion rate progress bar (percentage), task counts by status
- **Parent-child**: Subtasks indented under parent tasks

**Mutations**: `createTask()`, `activateTask()`, `completeTask()`, `failTask()`, `updateTask()`, `cancelTask()` — all invalidate `["tasks"]`

**Route**: `app/routes/tasks.tsx` with loader calling `getTasks({ data: {} })`

---

### Task 4.4 — Actions plugin (~1.5 hr)

**What**: Pending approval cards with 6-gate checklist, approve/reject buttons, action history table, tier badges, confidence scores, aggregate stats.

**Components**:
- `app/plugins/actions/ActionsPage.tsx` — Pending + history tabs + stats
- `app/components/vigil/action-approval.tsx` — Approve/reject card with gate results

**UI details**:
- **Pending approvals section**:
  - Card per pending action: command, repo, tier badge (safe=green, moderate=amber, dangerous=red), reason, confidence
  - 6-gate checklist: Config enabled, Session opted in, Repo in allowlist, Action type allowed, Confidence >= threshold, Awaiting user approval — each gate shows check/cross/pending icon
  - Approve + Reject buttons
- **Action history table**: Time, command, repo, tier badge, status (executed/rejected/failed), result summary
- **Stats bar**: Approved count, Rejected count, Executed count, Failed count. By tier: safe/moderate/dangerous counts

**Mutations**: `approveAction()`, `rejectAction()` — invalidate `["actions"]`

**Route**: `app/routes/actions.tsx` with loader calling `getActions({ data: {} })`

---

### Task 4.5 — Memory plugin (~2 hr)

**What**: Memory pipeline visualization, keyword + semantic search with ranked results, repo profiles, Ask Vigil LLM Q&A.

**Components**:
- `app/plugins/memory/MemoryPage.tsx` — Pipeline viz + search + profiles + ask
- `app/components/vigil/memory-search.tsx` — Search input + results with similarity scores
- `app/components/vigil/ask-vigil.tsx` — Question input + answer display with sources

**UI details**:
- **Memory pipeline visualization**: Four connected boxes showing the tiered flow:
  - EventLog (count, date range) → VectorStore (count, type breakdown) → TopicTier (count, repos) → IndexTier (count, repos)
  - Each box shows count and descriptive subtitle (e.g., "JSONL files", "SQLite FTS5", "Grouped by theme", "Cross-repo summaries")
- **Search**: Text input + repo filter dropdown. Results show: similarity score, repo, content excerpt, type badge (git_event/decision/insight/consolidated)
- **Repo profiles**: Cards for each repo showing summary text, pattern count, last updated
- **Ask Vigil**: Question textarea + optional repo selector + Ask button. Response shows: answer text, source list (which memories were consulted), round count (how many tool-use iterations). Loading state with spinner (may take 5-30s).

**Data flow**:
- `getMemory()` → pipeline stats + repo profiles
- `searchMemory({ data: { query, repo } })` → ranked search results
- `askVigil({ data: { question, repo } })` → LLM answer with sources

**Route**: `app/routes/memory.tsx` with loader calling `getMemory()`

---

### Task 4.6 — Scheduler plugin (~1 hr)

**What**: Schedule list with cron expressions, next run countdown timers, create/delete/trigger, run history table.

**Components**:
- `app/plugins/scheduler/SchedulerPage.tsx` — Schedule table + create form + history

**UI details**:
- **Schedule table**: Name, cron expression, repo, next run (countdown timer ticking down in JS), action buttons (Run Now, Delete)
- **Create form** (in `<Dialog>`): Name, cron expression (with hint e.g. "0 * * * *"), repo dropdown, action text
- **Run history table**: Time, schedule name, status (success check / fail cross), duration, output (truncated, expandable)
- **Countdown timers**: Each schedule row has a live countdown to next run, computed from croner

**Mutations**: `createSchedule()`, `deleteSchedule()`, `triggerSchedule()` — all invalidate `["scheduler"]`

**Route**: `app/routes/scheduler.tsx` with loader calling `getScheduler()`

---

### Task 4.7 — Metrics plugin with Recharts (~2 hr)

**What**: Decision distribution chart, LLM latency chart, token/cost tracking, tick timing chart, sleep/wake history, quick stats panel. All via Recharts (replaces Chart.js).

**Dependencies**:
```bash
cd dashboard-v2 && bun add recharts
```

**Components**:
- `app/plugins/metrics/MetricsPage.tsx` — Dashboard grid with 6 panels
- `app/components/vigil/metrics-chart.tsx` — Reusable Recharts wrapper with Vigil theme colors

**Charts and panels** (all use Recharts):
1. **Decision distribution** — Stacked bar chart (30-min buckets, 24h), colors: SILENT=text-muted, OBSERVE=info, NOTIFY=warning, ACT=vigil. Legend below.
2. **LLM latency** — Line chart with p95 threshold reference line (dashed). X-axis: tick number, Y-axis: ms.
3. **Token usage per tick** — Bar chart with per-tick token counts. Text overlay: total tokens, cost estimate.
4. **Adaptive tick interval** — Dual-line area chart: configured baseline (dashed) vs actual adaptive interval (solid). Shows how the interval adapts to activity.
5. **Sleep/Wake history** — Timeline strip showing running/sleeping/down segments over 24h. Each wake event labeled with trigger (commit, file change, etc.).
6. **Quick stats panel** — Card grid: Total ticks, LLM calls, Tokens used, Cost estimate, Avg latency, P95 latency, Max latency, Sleep cycles count, Total sleep duration, Proactive ticks count.

**Route**: `app/routes/metrics.tsx` with loader calling `getMetrics()`

---

## Phase 5 — New Core Plugins

> **Goal**: Add plugins for Config, Webhooks, Channels, Notifications, and A2A. These require NEW backend API endpoints.

### Task 5.1 — Config API endpoints (~1.5 hr)

**What**: Add `GET/PUT /api/config`, `GET /api/config/features`, and `PATCH /api/config/features/:name` to `src/dashboard/server.ts`.

**New file**: `src/dashboard/api/config.ts`

```typescript
// Handlers:
export function getConfigJSON(ctx: DashboardContext) {
  return {
    tickInterval: ctx.daemon.config.tickInterval,
    sleepAfter: ctx.daemon.config.sleepAfter,
    sleepInterval: ctx.daemon.config.sleepInterval,
    dreamAfter: ctx.daemon.config.dreamAfter,
    blockingBudget: ctx.daemon.config.blockingBudget,
    eventWindow: ctx.daemon.config.eventWindow,
    tickModel: ctx.daemon.config.tickModel,
    escalationModel: ctx.daemon.config.escalationModel,
    actionGates: ctx.daemon.actionExecutor.getGateConfig(),
    notificationBackends: ctx.daemon.config.notificationBackends,
    actionAllowlist: ctx.daemon.config.actionAllowlist,
  };
}

export async function handleConfigUpdate(ctx: DashboardContext, body: Record<string, unknown>) {
  // Validate with Zod, update config, trigger hot-reload via watchConfig()
}

export async function getFeatureGatesJSON(ctx: DashboardContext) {
  const gates = ctx.daemon.featureGates;
  const features = Object.entries(FEATURES);
  return Promise.all(features.map(async ([key, name]) => ({
    key,
    name,
    enabled: await gates.isEnabled(name),
    layers: await gates.diagnose(name),  // { build, config, runtime, session }
  })));
}

export async function handleFeatureToggle(ctx: DashboardContext, featureName: string, enabled: boolean) {
  // Toggle config-layer gate, persist to config.json
}
```

**Routes added to server.ts**:
```
GET   /api/config                  → getConfigJSON
PUT   /api/config                  → handleConfigUpdate
GET   /api/config/features         → getFeatureGatesJSON
PATCH /api/config/features/:name   → handleFeatureToggle
```

---

### Task 5.2 — Config plugin frontend (~2 hr)

**What**: Full settings editor with sliders, dropdowns, feature gate diagnostic table, action gate config, and reset to defaults.

**Components**: `app/plugins/config/ConfigPage.tsx`

**UI details**:
- **Tick settings section**: Slider inputs for tick interval, sleep after, sleep interval, dream after, blocking budget, event window. Each slider shows current value + unit.
- **Model selection section**: Dropdown for tick model and escalation model (populated from known model list).
- **Feature gates table**: One row per feature from `FEATURES` registry. Columns: Feature name, Build (check/cross), Config (check/cross), Runtime (check/cross), Session (check/cross), Status (ON green / OFF red). Click status toggle to flip config-layer gate via `PATCH /api/config/features/:name`.
- **Action gates section**: Enabled toggle, auto-approve toggle, confidence threshold slider (0.0-1.0), allowed repos list (editable), allowed actions list (editable checkboxes for git_stash/run_tests/run_lint/etc).
- **Notification backends section**: Display configured backends (desktop/webhook/file), backend-specific config display.
- **Footer**: Save Config button (calls `PUT /api/config`), Reset Defaults button (loads `DEFAULT_CONFIG`).

**Route**: `app/routes/config.tsx`

---

### Task 5.3 — Webhooks API + plugin (~2 hr each, backend + frontend)

**Backend** (`src/dashboard/api/webhooks.ts`):
```
GET    /api/webhooks/events         → recent webhook events from WebhookProcessor
GET    /api/webhooks/subscriptions  → active subscriptions from SubscriptionManager
POST   /api/webhooks/subscriptions  → add subscription
DELETE /api/webhooks/subscriptions/:id → remove subscription
GET    /api/webhooks/status         → server health, HMAC validation stats
```

**Frontend**: `app/plugins/webhooks/WebhooksPage.tsx`

**UI details**:
- **Server status bar**: Port, webhook path, running status indicator, allowed events list
- **Subscriptions table**: Repo, PR# (if PR-specific), event types, expiry (relative countdown or "never"), unsubscribe button. Add subscription form in `<Dialog>`.
- **Event log table**: Time, event type (push/PR/issues/review), repo, action, status (processed/error). Filterable by event type dropdown.
- **Health stats**: Events received count, errors count, signature failures count, last event time (relative), avg processing time

**SSE**: Add `webhook` event type to SSEManager.broadcast when webhooks are received

---

### Task 5.4 — Channels API + plugin (~2 hr)

**Backend** (`src/dashboard/api/channels.ts`):
```
GET    /api/channels              → registered MCP channels
POST   /api/channels              → register channel
DELETE /api/channels/:id          → unregister
GET    /api/channels/:id/permissions → 5-gate permission results
GET    /api/channels/:id/queue    → pending messages
```

**Frontend**: `app/plugins/channels/ChannelsPage.tsx`

**UI details**:
- **Channel list**: Name, type, status, message queue depth, permissions summary
- **Permission detail** (expandable): 5-gate results per channel (similar to action gates display)
- **Message queue** per channel: Pending messages with delivery status
- **Register/unregister** forms

**SSE**: Add `channel` event type

---

### Task 5.5 — Notifications API + plugin (~2 hr)

**Backend** (`src/dashboard/api/notifications.ts`):
```
GET   /api/notifications       → recent notification deliveries with full detail
POST  /api/notifications/test  → send test notification via configured backend
PATCH /api/notifications/rules → update push notification rules and persist
```

**Frontend**: `app/plugins/notifications/NotificationsPage.tsx`

**UI details**:
- **Config section**:
  - Enabled toggle
  - Min severity selector: info / warning / critical (dropdown)
  - Status checkboxes: normal, alert, proactive, scheduled
  - Max per hour input (number)
  - Quiet hours: start time + end time inputs
  - Backend display: ntfy.sh config (topic, server) or native (OS notification status)
  - Save button + Test Notification button
- **Notification history table**: Time, severity badge (info/warning/critical), message excerpt, backend used, status (sent/skipped/failed). "Skipped (quiet)" for quiet-hours suppressed notifications.
- **Rate limit status**: Sent today count / max, rate per hour, quiet-hours suppression count

---

### Task 5.6 — Agent Identity API + plugin (~2 hr)

**What**: View current agent persona, browse available agents, preview system prompt, switch active persona. This was Phase 9 in the original plan.

**Backend** (`src/dashboard/api/agents.ts`):
```
GET   /api/agents          → scan .claude/agents/ for all agent definitions
GET   /api/agents/current  → active persona (name, description, model, tools, watch patterns, trigger events)
PATCH /api/agents/current  → switch persona (restarts decision engine with new system prompt)
```

**Frontend**: `app/plugins/agents/AgentsPage.tsx`

**UI details**:
- **Current agent card**: Name, description, model, source file path. Lists: tools available, watch patterns (globs), trigger events (new_commit, branch_switch, etc.)
- **Available agents list**: All `.md` files in `.claude/agents/`. Active agent highlighted. Switch button on each inactive agent. Parsed from YAML frontmatter.
- **System prompt preview**: Collapsible card showing the full system prompt generated by `buildSystemPrompt()` with current repo context. "Show Full" / "Collapse" toggle. Monospace font, scrollable.

**Plugin manifest entry** (add to `corePlugins` in `app/plugins/index.ts`):
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

**Route**: `app/routes/agents.tsx`

---

### Task 5.7 — System Health API + plugin (~2 hr)

**What**: Process monitoring, database sizes, uptime timeline, error log. This was Phase 13 in the original plan.

**Backend** (`src/dashboard/api/health.ts`):
```
GET /api/health → process stats, database sizes, error counts, uptime timeline
```

**Handler**:
```typescript
export function getHealthJSON(ctx: DashboardContext) {
  const mem = process.memoryUsage();
  return {
    process: {
      runtime: "Bun " + Bun.version,
      pid: process.pid,
      uptime: ctx.daemon.session?.startedAt,
      heap: mem.heapUsed,
      rss: mem.rss,
      external: mem.external,
    },
    databases: {
      // Walk ~/.vigil/data/ and report file sizes
      vigilDb: getFileSize("vigil.db"),
      metricsDb: getFileSize("metrics.db"),
      jsonlLogs: getDirectorySize("logs/"),
      topics: getDirectorySize("topics/"),
      index: getDirectorySize("index/"),
      dreamResults: countFiles("dream-result-*.json"),
    },
    errors: {
      // Query MetricsStore for error counters in last 24h
      recent: getRecentErrors(ctx),
      rate: errorsPerTick,
    },
    uptimeTimeline: getUptimeSegments(ctx), // running/sleeping/down over 24h
  };
}
```

**Frontend**: `app/plugins/health/HealthPage.tsx`

**UI details**:
- **Process panel**: Runtime version, PID, uptime. Memory bars: Heap (used/total), RSS, External — proportional bar visualization with MB labels. CPU estimate if available.
- **Database panel**: Table of file/directory sizes (vigil.db, metrics.db, JSONL logs, topics, index). Total size. Dream result file count, schedule data file count.
- **Uptime timeline** (24h): Horizontal strip with colored segments: green=running, gray=sleeping, red=down. Time axis labels.
- **Error log table**: Time, type (LLM timeout / tick crash / dream fail / etc.), message. Sortable by time. Total errors (24h) count and error rate (per tick).

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

**Route**: `app/routes/health.tsx`

---

### Task 5.8 — A2A protocol plugin (~1.5 hr)

**What**: A2A server status, agent card display, RPC message log with stats. Upgraded from sidebar widget to full tab for feature parity with old plan.

**Backend** (`src/dashboard/api/a2a-status.ts`):
```
GET /api/a2a/status  → server running, port, endpoint URL, auth info, concurrent connections/limit
GET /api/a2a/skills  → registered agent skills from agent card
GET /api/a2a/history → recent RPC calls with method, status, latency, tokens
```

**Frontend**: `app/plugins/a2a/A2APage.tsx`

**UI details**:
- **Server status bar**: Endpoint URL, port, running status, auth type (bearer token), concurrent connection count / limit
- **Agent card display**: Name, version, capabilities (streaming, pushNotifications), skills list (name + description for each)
- **Message log table**: Time, RPC method (message/send etc.), status code (200/429/500), latency, token count. Rate-limited events highlighted.
- **Aggregate stats**: Total requests, success count, rate limited count, error count

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

**Route**: `app/routes/a2a.tsx`

---

## Phase 6 — User Plugin Support

> **Goal**: Enable third-party plugins loaded from `~/.vigil/plugins/*/widget.ts`.

### Task 6.1 — Plugin loader and scanner (~1.5 hr)

**What**: On dashboard startup, scan `~/.vigil/plugins/` for directories containing `widget.ts`. Validate manifests with Zod. Register API routes.

```typescript
// src/dashboard/plugin-loader.ts
import { z } from "zod";
import { join } from "path";
import { homedir } from "os";

const PluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string(),
  icon: z.string(),
  slot: z.enum(["tab", "sidebar", "timeline-card", "overlay", "top-bar"]),
  order: z.number().min(100),  // User plugins must be >= 100
  component: z.function(),
  sseEvents: z.array(z.string()).optional(),
  queryKeys: z.array(z.array(z.string())).optional(),
  apiRoutes: z.array(z.object({
    method: z.enum(["GET", "POST", "PUT", "DELETE"]),
    path: z.string(),
    handler: z.function(),
  })).optional(),
});

export async function loadUserPlugins(): Promise<PluginWidget[]> {
  const pluginDir = join(homedir(), ".vigil", "plugins");
  // Scan, validate, return manifests
}
```

---

### Task 6.2 — Plugin API route registration (~1 hr)

**What**: Mount user plugin API routes into Bun.serve() under `/api/plugins/:pluginId/*`.

---

### Task 6.3 — Plugin manifest endpoint (~30 min)

**What**: `GET /api/plugins` returns the merged core + user plugin list (minus component functions — those are client-side lazy imports).

---

### Task 6.4 — Plugin development template + docs (~1 hr)

**What**: Create example plugin at `examples/plugin-template/` with README showing how to build a user plugin.

---

## Phase 7 — Remove HTMX Legacy

> **Goal**: Clean removal of all HTMX-era code. Only do this after Phase 4 is complete and all core features are working in the React dashboard.

### Task 7.1 — Remove fragment endpoints (~45 min)

**What**: Delete all `/api/*/fragment` route handlers from `server.ts` and the corresponding `get*Fragment()` functions from each API module.

**Files modified**:
- `src/dashboard/server.ts` — remove ~30 fragment route entries
- `src/dashboard/api/overview.ts` — remove `getOverviewFragment()`
- `src/dashboard/api/repos.ts` — remove `getRepoFragment()`
- `src/dashboard/api/timeline.ts` — remove `getTimelineFragment()`
- `src/dashboard/api/dreams.ts` — remove `getDreamsFragment()`
- `src/dashboard/api/memory.ts` — remove `getMemoryFragment()`, `getMemorySearchFragment()`
- `src/dashboard/api/tasks.ts` — remove `getTasksFragment()`
- `src/dashboard/api/actions.ts` — remove `getActionsFragment()`
- `src/dashboard/api/scheduler.ts` — remove `getSchedulerFragment()`
- `src/dashboard/api/metrics.ts` — remove `getMetricsFragment()`

---

### Task 7.2 — Remove static frontend files (~15 min)

**What**: Delete legacy static assets.

```bash
rm -rf src/dashboard/static/vendor/       # htmx.min.js, htmx-sse.js, pico.min.css, chart.min.js
rm src/dashboard/static/index.html         # Old SPA shell
rm src/dashboard/static/app.js             # Old vanilla JS
rm src/dashboard/static/styles.css         # Old hand-written CSS
rm -rf src/dashboard/static/fragments/     # Empty fragment dir
```

**Keep**:
- `src/dashboard/static/tailwind.css` — may still be referenced by build
- `src/dashboard/static/dist/` — evaluate if still needed

---

### Task 7.3 — Clean up server.ts routing (~30 min)

**What**: Remove the static file serving code, HTML response helpers, `/dash` redirect, and any MIME type handling that's now handled by TanStack Start's Vite output.

**Before**: server.ts routes `/dash/*` to static files, serves `index.html` for SPA fallback.
**After**: server.ts routes `/api/*` to JSON handlers, everything else to TanStack Start handler.

---

### Task 7.4 — Update build scripts (~15 min)

**What**: Update root `package.json` scripts to include the TanStack Start build.

```json
{
  "scripts": {
    "build": "bun run dashboard:build && bun run build.config.ts",
    "dashboard:build": "cd dashboard-v2 && bun --bun vite build",
    "dashboard:dev": "cd dashboard-v2 && bun --bun vite dev",
    "css:build": "...",
    "css:watch": "..."
  }
}
```

---

## Dependency Graph

```
Phase 0 (Validation Spike)
  ├── 0.1 Init TanStack Start
  ├── 0.2 Server function + context ──── depends on 0.1
  ├── 0.3 Embed in Bun.serve() ───────── depends on 0.2
  └── 0.4 Tailwind + shadcn/ui ──────── depends on 0.1

Phase 1 (Scaffold) ──────────────────── depends on Phase 0
  ├── 1.1 Project structure + routing
  ├── 1.2 shadcn/ui components ──────── depends on 0.4
  ├── 1.3 TypeScript types
  ├── 1.4 Server functions ──────────── depends on 0.2, 1.3
  └── 1.5 Query keys + Lucide

Phase 2 (Shell Layout) ─────────────── depends on Phase 1
  ├── 2.1 Install shadcn sidebar ─────── depends on 1.2
  ├── 2.2 AppSidebar component ──────── depends on 2.1, 1.4
  ├── 2.3 Site header + breadcrumbs ── depends on 2.1, 1.4
  ├── 2.4 SSE hook ──────────────────── depends on 1.5
  └── 2.5 Root layout assembly ──────── depends on 2.2-2.4

Phase 3 (Plugin System + Timeline) ── depends on Phase 2
  ├── 3.1 Plugin registry
  ├── 3.2 Plugin slot renderer ──────── depends on 3.1
  ├── 3.3 Timeline plugin ──────────── depends on 1.4, 3.1
  └── 3.4 Wire Timeline route ──────── depends on 3.2, 3.3

Phase 4 (Port Core Plugins) ─────────── depends on Phase 3
  ├── 4.1 Repos         ┐
  ├── 4.2 Dreams        │
  ├── 4.3 Tasks         │ All parallelizable
  ├── 4.4 Actions       │ (no inter-dependencies)
  ├── 4.5 Memory        │
  ├── 4.6 Scheduler     │
  └── 4.7 Metrics       ┘

Phase 5 (New Core Plugins) ──────────── depends on Phase 3
  ├── 5.1 Config API     → 5.2 Config UI
  ├── 5.3 Webhooks API + UI
  ├── 5.4 Channels API + UI
  ├── 5.5 Notifications API + UI (with config editing)
  ├── 5.6 Agent Identity API + UI
  ├── 5.7 System Health API + UI
  └── 5.8 A2A protocol plugin (full tab)

Phase 6 (User Plugins) ─────────────── depends on Phase 3
  ├── 6.1 Plugin loader
  ├── 6.2 API route registration ────── depends on 6.1
  ├── 6.3 Plugin manifest endpoint ──── depends on 6.1
  └── 6.4 Template + docs ──────────── depends on 6.1

Phase 7 (Remove HTMX) ──────────────── depends on Phase 4
  ├── 7.1 Remove fragment endpoints
  ├── 7.2 Remove static files
  ├── 7.3 Clean server.ts
  └── 7.4 Update build scripts
```

**Parallelism opportunities**:
- Phase 4 tasks (4.1-4.7) can all run in parallel
- Phase 5 tasks (5.1-5.8) can all run in parallel (except 5.1→5.2 which are sequential)
- Phase 6 can run in parallel with Phases 4 and 5
- Phase 7 must wait for Phase 4 completion

---

## Total Estimated Sub-tasks: 41

| Phase | Tasks | Parallel? |
|-------|-------|-----------|
| 0 — Validation Spike | 4 | Partially (0.1 first, then 0.2→0.3, 0.4 parallel) |
| 1 — Scaffold | 5 | Partially (1.1 first, then 1.2-1.5 parallel) |
| 2 — Shell Layout | 5 | Partially (2.1 first, 2.2-2.4 parallel, then 2.5) |
| 3 — Plugin System | 4 | Sequential (3.1→3.2→3.3→3.4) |
| 4 — Core Plugins | 7 | Fully parallel |
| 5 — New Core Plugins | 8 | Mostly parallel (5.1→5.2 sequential, rest parallel) |
| 6 — User Plugins | 4 | Sequential (6.1→6.2-6.4) |
| 7 — Remove HTMX | 4 | Fully parallel |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| TanStack Start Bun handler embedding fails | **Critical** — blocks entire architecture | Phase 0 spike validates this first. Fallback: static SPA export served via Bun.serve() |
| TanStack Start breaking changes (young framework) | **High** — API drift | Pin to `~1.121.x`, lockfile committed, test before any upgrade |
| Server functions can't access module-level context | **High** — breaks data flow | Phase 0.2 validates this. Fallback: all data via client-side fetch to `/api/*` endpoints |
| shadcn/ui component conflicts with Tailwind v4 | **Medium** — styling issues | Phase 0.4 validates build pipeline early |
| User plugin loading from filesystem | **Low** — Phase 6 only | Can defer indefinitely; core plugins work without it |
| Recharts bundle size | **Low** — local tool | Tree-shaking mitigates; only import used chart types |
