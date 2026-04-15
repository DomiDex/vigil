# Phase 0 — Validation Spike

---
duration: 3-4 hours
depends_on: none
blocks: Phase 1 (Scaffold), Phase 2 (Shell Layout), all subsequent phases
risk: HIGH
stack: typescript
runner: single-agent
---

## 1. Objective + What Success Looks Like

**Objective**: Prove that TanStack Start can embed its production build handler into Vigil's existing `Bun.serve()` on port 7480, serving both the React app and the existing JSON API from a single port — with server functions accessing Vigil internals via a module-level singleton.

**Observable success conditions**:

1. `cd dashboard-v2 && bun run dev` starts a Vite dev server on port 3000 without errors
2. `cd dashboard-v2 && bun run build` completes and produces `.output/server/` with a handler entry point
3. Navigating to `http://localhost:7480/` renders "Vigil Dashboard v2" with SSR'd data visible in page source (not client-fetched)
4. The SSR'd page shows `Repos: 1, Tick: 42` (from mock DashboardContext)
5. `curl http://localhost:7480/api/overview` still returns JSON (existing API unbroken)
6. `curl http://localhost:7480/api/sse` still streams SSE events
7. Tailwind v4 `@theme` tokens apply correctly — navy background (#222745), orange accent (#FF8102) visible in browser
8. A shadcn/ui `<Card>` and `<Badge>` render with correct Vigil theme colors, no external CDN requests (verify in browser Network tab)

---

## 2. What Failure Looks Like

| Failure scenario | Signal | Fallback action |
|---|---|---|
| TanStack Start build doesn't produce a `fetch` handler compatible with `Bun.serve()` | Build succeeds but `import("./app/.output/server/server.js")` throws or returns undefined | Try `index.mjs` entry point. If no handler found, fall back to **Option B**: static SPA export (`vite build` → static HTML/JS), served from `Bun.serve()` as static files. SSR is lost but plugin architecture intact. |
| `createServerFn()` can't access module-level singleton | Server function throws "Vigil context not initialized" at runtime despite `setVigilContext()` being called | Server functions may run in isolated module scope. Fallback: all data flows through client-side `fetch("/api/*")` calls (no server functions for data access — they become thin RPC wrappers that just call the HTTP API). |
| Nitro `bun` preset doesn't exist or is broken | Build error: `Unknown preset "bun"` | Try `node` preset and test if the output handler still works in `Bun.serve()`. If not, use `static` preset for SPA mode. |
| Tailwind v4 `@theme` directive not recognized by Vite plugin | CSS build error or tokens ignored at runtime | Confirm `tailwindcss@^4` is installed (not v3). If v4 `@theme` is broken in the Vite pipeline, fall back to CSS custom properties defined manually in `app.css` and reference them as `var(--color-vigil)` instead of `text-vigil`. |
| shadcn/ui components fail to initialize or conflict with Tailwind v4 | `bunx shadcn@latest init` errors, or generated components reference missing CSS variables | Pin to latest shadcn CLI. If init fails, manually copy component source files and adapt imports. shadcn components are just files — they don't require the CLI to work. |

---

## 3. Key Design Decisions

### Data model strategy (TypeScript)

| Entity | Pattern | Why |
|---|---|---|
| `DashboardContext` | `interface` (existing) | Already defined in `src/dashboard/server.ts:44`. Contains `daemon: Daemon` and `sse: SSEManager`. Shared with server functions via module-level singleton. |
| Vigil context singleton | Module-level `let` + getter/setter functions | Single-process local tool — no isolates, no workers. Module-level singleton is the simplest correct pattern. Would NOT work on edge/serverless. |
| Server function return types | `interface` (inline return types for now) | Phase 0 only needs `{ status, repos, tick }`. Full type definitions come in Phase 1 (Task 1.3). |

### Architecture: handler embedding

```
Production (single port 7480):
┌─────────────────────────────────┐
│ Bun.serve({ port: 7480 })       │
│  ├─ /api/*  → existing JSON API │
│  └─ /*      → TanStack Start    │
│              handler.fetch(req)  │
└─────────────────────────────────┘

Development (two ports):
┌──────────────────┐    proxy /api/*    ┌──────────────────┐
│ Vite dev :3000   │ ──────────────────→│ Bun.serve :7480  │
│ (HMR, React)     │                    │ (JSON API, SSE)  │
└──────────────────┘                    └──────────────────┘
```

### Vite config (not app.config.ts)

TanStack Start v1.121+ uses `vite.config.ts` with `@tanstack/react-start/plugin/vite` and `nitro/vite`. The older `app.config.ts` pattern is from the pre-v1.121 Vinxi era — do NOT use it.

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
});
```

### API naming: `inputValidator` (not `validator`)

Current TanStack Start API uses `.inputValidator()`, not `.validator()`. This is a known naming difference from older docs.

---

## 4. Tasks

### Task 0.1 — Initialize TanStack Start project (~45 min)

**Depends on**: nothing
**Completion condition**: `bun run dev` starts Vite dev server, "/" route renders "Vigil Dashboard v2 — Spike" in browser

**Steps**:
1. Create `dashboard-v2/` directory
2. Initialize `package.json` with `bun init -y`
3. Install dependencies:
   ```bash
   bun add @tanstack/react-start @tanstack/react-router @tanstack/react-query react@^19 react-dom@^19
   bun add -d @vitejs/plugin-react vite nitro
   ```
4. Create `vite.config.ts` (see Section 3 for exact config)
5. Create `app/routes/__root.tsx` — minimal HTML shell with `<Outlet />`
6. Create `app/routes/index.tsx` — `<h1>Vigil Dashboard v2 — Spike</h1>`
7. Add scripts to package.json: `"dev": "bun --bun vite dev"`, `"build": "bun --bun vite build"`
8. Verify: `cd dashboard-v2 && bun run dev` → opens on port 3000

**Files created**:
- `dashboard-v2/package.json`
- `dashboard-v2/vite.config.ts`
- `dashboard-v2/tsconfig.json`
- `dashboard-v2/src/routes/__root.tsx`
- `dashboard-v2/src/routes/index.tsx`

---

### Task 0.2 — Server function with mock DashboardContext (~30 min)

**Depends on**: Task 0.1
**Completion condition**: Index route SSR-renders `Repos: 1, Tick: 42` (visible in page source, not client-fetched)

**Steps**:
1. Create `app/server/vigil-context.ts` — module-level singleton with `setVigilContext()` / `getVigilContext()`
2. Create `app/server/functions.ts` — single `getHealthCheck` server function using `createServerFn({ method: "GET" })` that reads from the singleton
3. Wire `getHealthCheck` into the index route as a `loader`
4. Create `spike-test.ts` — temporary file that calls `setVigilContext()` with mock data (`repoPaths: ["/tmp/fake-repo"]`, `tickEngine: { currentTick: 42 }`)
5. Verify: page source shows "Repos: 1, Tick: 42" (SSR confirmation)

**Key API pattern** (confirmed from TanStack Start docs):
```typescript
export const getHealthCheck = createServerFn({ method: "GET" })
  .handler(async () => {
    const ctx = getVigilContext();
    return { status: "ok", repos: ctx.daemon.repoPaths.length, tick: ctx.daemon.tickEngine.currentTick };
  });

// In route:
export const Route = createFileRoute("/")({
  loader: () => getHealthCheck(),
  component: IndexPage,
});
```

**Files created**:
- `dashboard-v2/src/server/vigil-context.ts`
- `dashboard-v2/src/server/functions.ts`
- `dashboard-v2/spike-test.ts` (temporary — delete after Phase 0)

---

### Task 0.3 — Build and embed handler in Bun.serve() (~45 min)

**Depends on**: Task 0.2
**Completion condition**: `http://localhost:7480/` serves the React app AND `http://localhost:7480/api/overview` still returns JSON — both from the same port

**Steps**:
1. Run `cd dashboard-v2 && bun run build`
2. Inspect `.output/server/` — find the entry point (likely `server.js` or `index.mjs`)
3. In `src/dashboard/server.ts`, add a conditional import of the built handler:
   ```typescript
   let startHandler: { fetch: (req: Request) => Response | Promise<Response> } | null = null;
   try {
     const mod = await import("./app/.output/server/server.js");
     startHandler = mod.default;
   } catch (e) {
     console.log("[dashboard] TanStack Start handler not found, serving legacy HTML");
   }
   ```
4. In the `Bun.serve()` fetch handler, add a fallthrough BEFORE static file serving:
   ```typescript
   if (startHandler && !url.pathname.startsWith("/api/")) {
     return startHandler.fetch(req);
   }
   ```
5. Start daemon: `bun run src/cli/index.ts watch ~/projects/some-repo`
6. Verify both routes work from port 7480

**Files modified**:
- `src/dashboard/server.ts` — add handler import + routing fallthrough

---

### Task 0.4 — Validate Tailwind v4 + shadcn/ui build pipeline (~30 min)

**Depends on**: Task 0.1 (can run in parallel with 0.2/0.3)
**Completion condition**: A shadcn/ui Card with Vigil theme colors renders in the browser — navy background, orange accent, no external CDN requests

**Steps**:
1. Install Tailwind v4 and shadcn dependencies:
   ```bash
   cd dashboard-v2
   bun add tailwindcss@^4
   bun add clsx tailwind-merge class-variance-authority
   ```
2. Create `app/app.css` with `@import "tailwindcss"` and `@theme` block defining Vigil tokens:
   - `--color-vigil: #FF8102`, `--color-background: #222745`, `--color-surface: #2A3055`
   - Full token list in big-plan.md Task 0.4
3. Create `app/lib/cn.ts` — standard `cn()` utility (`twMerge(clsx(...inputs))`)
4. Run `bunx shadcn@latest init` (New York style, Zinc, CSS variables: yes)
5. Install test components: `bunx shadcn@latest add button card badge`
6. Render a test Card in the index route with `className="bg-surface border-border"` and `className="text-vigil"`
7. Import `app.css` in `__root.tsx`
8. Verify: colors match in browser, no external network requests

**Files created**:
- `dashboard-v2/src/app.css`
- `dashboard-v2/src/lib/cn.ts`
- `dashboard-v2/components.json` (shadcn config)
- `dashboard-v2/src/components/ui/button.tsx`
- `dashboard-v2/src/components/ui/card.tsx`
- `dashboard-v2/src/components/ui/badge.tsx`

---

## 5. Deliverables

```
dashboard-v2/
├── package.json                          # Sub-project deps and scripts
├── vite.config.ts                        # TanStack Start + React + Nitro (bun preset)
├── tsconfig.json                         # TypeScript config for the app
├── components.json                       # shadcn/ui config
├── spike-test.ts                         # Temporary mock context injector (delete after Phase 0)
├── app/
│   ├── app.css                           # Tailwind v4 entry with @theme Vigil tokens
│   ├── lib/
│   │   └── cn.ts                         # clsx + tailwind-merge utility
│   ├── routes/
│   │   ├── __root.tsx                    # Minimal HTML shell, CSS import, <Outlet />
│   │   └── index.tsx                     # Spike page: health check data + themed Card
│   ├── server/
│   │   ├── vigil-context.ts              # Module-level DashboardContext singleton
│   │   └── functions.ts                  # getHealthCheck server function
│   └── components/ui/
│       ├── button.tsx                    # shadcn/ui Button
│       ├── card.tsx                      # shadcn/ui Card
│       └── badge.tsx                     # shadcn/ui Badge
└── .output/                              # Build output (gitignored)
    └── server/server.js                  # Production handler for Bun.serve() embedding
```

**Modified existing file**:
- `src/dashboard/server.ts` — conditional import of built handler + routing fallthrough

---

## 6. Exit Criteria

- [ ] TanStack Start dev server starts without errors (`bun run dev` in `dashboard-v2/`)
- [ ] `createServerFn()` reads mock DashboardContext via module-level singleton and returns data
- [ ] SSR renders health check data in page source (not client-side fetched)
- [ ] Production build completes (`bun run build` produces `.output/server/`)
- [ ] Built handler embeds in `Bun.serve()` — single port 7480 serves both React app and JSON API
- [ ] Existing `/api/overview` returns JSON unchanged (backward compat)
- [ ] Existing `/api/sse` streams events unchanged
- [ ] Tailwind v4 `@theme` tokens produce correct Vigil colors in browser
- [ ] shadcn/ui Card + Badge render with theme colors, zero external CDN requests
- [ ] **Go/No-Go gate**: If the TanStack Start handler embeds into Bun.serve() and serves SSR'd content on port 7480 → proceed to Phase 1. If handler embedding fails → fall back to static SPA export (Option B from spec) and rewrite Phase 1 tasks accordingly.

---

## 7. Execution Prompt

You are implementing Phase 0 (Validation Spike) of Vigil Dashboard v2 — a TanStack Start + React rewrite of an existing HTMX dashboard for a local git monitoring daemon.

### What the project is

Vigil is a local dev tool that watches git repos. It has an existing dashboard served by `Bun.serve()` on port 7480 with JSON API endpoints at `/api/*` and SSE at `/api/sse`. The current frontend uses HTMX + Pico CSS. We're replacing the frontend with TanStack Start (React) while keeping all backend API endpoints unchanged.

### What this phase proves

This is a validation spike. The goal is to prove three things work together:
1. TanStack Start's production build can be embedded into an existing `Bun.serve()` handler (single port, not separate servers)
2. Server functions can access Vigil internals via a module-level singleton (`setVigilContext` / `getVigilContext`)
3. Tailwind v4 + shadcn/ui build correctly inside TanStack Start's Vite pipeline

### Architecture decisions (must follow)

- **vite.config.ts, NOT app.config.ts** — TanStack Start v1.121+ uses standard Vite config. The older `app.config.ts` is from the Vinxi era.
- **`inputValidator()`, NOT `validator()`** — current TanStack Start API naming.
- **Nitro preset: `"bun"`** — produces a `fetch` handler compatible with `Bun.serve()`.
- **Module-level singleton for context** — `setVigilContext()` / `getVigilContext()` pattern. Single-process, no isolates.
- **Server functions use `createServerFn({ method: "GET" })`** — import from `@tanstack/react-start`.

### Data model rules (TypeScript)

- `DashboardContext` is an existing `interface` in `src/dashboard/server.ts` (line 44): `{ daemon: Daemon; sse: SSEManager }`
- The vigil-context singleton uses `interface` for types, module-level `let` for state
- Server function return types are inline for the spike (just `{ status: string; repos: number; tick: number }`)
- Use `type` for union types, `interface` for object shapes

### Files to create

**1. `dashboard-v2/package.json`**
Initialize with `bun init -y`, then install:
```bash
bun add @tanstack/react-start @tanstack/react-router @tanstack/react-query react@^19 react-dom@^19
bun add -d @vitejs/plugin-react vite nitro
bun add tailwindcss@^4 clsx tailwind-merge class-variance-authority
```
Scripts: `"dev": "bun --bun vite dev"`, `"build": "bun --bun vite build"`

**2. `dashboard-v2/vite.config.ts`**
```typescript
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
    alias: { "@": new URL("./app", import.meta.url).pathname },
  },
});
```

**3. `dashboard-v2/src/routes/__root.tsx`**
Minimal HTML shell: `<html>`, `<head>` with charset/viewport/title, `<body>` with `<Outlet />`. Import `../app.css`.

**4. `dashboard-v2/src/routes/index.tsx`**
Uses `createFileRoute("/")` with a `loader` calling `getHealthCheck()`. Component renders status, repos, tick from loader data. After Task 0.4, also renders a shadcn Card + Badge with Vigil theme colors.

**5. `dashboard-v2/src/server/vigil-context.ts`**
Module-level singleton:
```typescript
import type { DashboardContext } from "../../../../dashboard/server";
let _ctx: DashboardContext | null = null;
export function setVigilContext(ctx: DashboardContext): void { _ctx = ctx; }
export function getVigilContext(): DashboardContext {
  if (!_ctx) throw new Error("Vigil context not initialized");
  return _ctx;
}
```

**6. `dashboard-v2/src/server/functions.ts`**
Single server function for the spike:
```typescript
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

**7. `dashboard-v2/spike-test.ts`** (temporary)
Calls `setVigilContext()` with mock data: `repoPaths: ["/tmp/fake-repo"]`, `tickEngine: { currentTick: 42, isSleeping: false }`. This is a test harness — delete after Phase 0 validation.

**8. `dashboard-v2/src/app.css`**
```css
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

**9. `dashboard-v2/src/lib/cn.ts`**
```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

**10. shadcn/ui components**
Run `bunx shadcn@latest init` then `bunx shadcn@latest add button card badge`. Generates files in `app/components/ui/`.

### File to modify

**`src/dashboard/server.ts`** — Add handler embedding:
- At module top level, try to import `./app/.output/server/server.js` and store as `startHandler`
- In the `Bun.serve()` fetch handler, BEFORE static file fallback, add:
  ```typescript
  if (startHandler && !url.pathname.startsWith("/api/")) {
    return startHandler.fetch(req);
  }
  ```
- Keep ALL existing `/api/*` routes unchanged

### Execution order

1. Task 0.1 — Initialize project, verify dev server starts
2. Task 0.4 — Install Tailwind + shadcn (can be done right after 0.1)
3. Task 0.2 — Add server function + mock context, verify SSR
4. Task 0.3 — Build and embed in Bun.serve(), verify single-port serving

### Success criteria

Run these checks after implementation:
```bash
# 1. Dev server starts
cd dashboard-v2 && bun run dev
# → Opens on port 3000, shows themed page

# 2. Production build succeeds
cd dashboard-v2 && bun run build
# → .output/server/ exists with handler

# 3. Single-port serving works
bun run src/cli/index.ts watch /tmp/test-repo
curl http://localhost:7480/        # → HTML with SSR'd data
curl http://localhost:7480/api/overview  # → JSON response

# 4. No CDN requests
# Open http://localhost:3000/ in browser, check Network tab — zero external requests
```

If the handler embedding fails (Task 0.3), document what went wrong and which fallback was triggered. The spike is successful even if we fall back to Option B — the point is to know which path to take.

---

## Readiness Check

- [PASS] All inputs from prior phases are listed and available — Phase 0 has no prior dependencies
- [PASS] Every sub-task has a clear, testable completion condition
- [PASS] Execution prompt is self-contained: includes (a) no prior phases to reference, (b) confirmed API snippets from TanStack Start docs (createServerFn, createFileRoute, inputValidator), (c) a "Data Model Rules" section, (d) per-file guidance, and (e) observable success criteria
- [PASS] Exit criteria map 1:1 to deliverables (dev server → app skeleton, SSR → server functions, build → .output, embed → server.ts mod, Tailwind → app.css + theme, shadcn → ui components)
- [PASS] Any heavy external dependency has a fake/stub strategy noted — mock DashboardContext via spike-test.ts
- [FAIL — No Context7 available] New libraries (TanStack Start, Nitro, shadcn CLI) do not have confirmed usage snippets from Context7. API patterns are taken from big-plan.md research and official docs references. Verify `tanstackStart()` import path and `nitro()` plugin signature against actual installed package exports before implementing.
