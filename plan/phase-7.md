# Phase 7 — Remove HTMX Legacy

---
duration: ~2 hours
depends_on: Phase 4 (Port Core Plugins — all HTMX features replaced by React plugins)
blocks: nothing
risk: LOW — pure deletion of code that is fully replaced by the React dashboard; all JSON API endpoints preserved
stack: typescript
runner: single-agent (tasks fully parallelizable)
---

## 1. Objective + What Success Looks Like

**Objective**: Remove every trace of the HTMX-era dashboard — fragment endpoints, static frontend files, legacy routing, and stale build scripts — leaving only JSON API endpoints and the TanStack Start handler in `server.ts`.

**Observable success conditions**:

1. No `/api/*/fragment` routes exist in `server.ts`
2. No `get*Fragment()` functions exist in any `src/dashboard/api/*.ts` module
3. `src/dashboard/static/vendor/`, `src/dashboard/static/index.html`, `src/dashboard/static/app.js`, `src/dashboard/static/styles.css`, and `src/dashboard/static/fragments/` are deleted
4. The `serveStatic()` function, `html()` helper, `MIME_TYPES` map, `getMime()` helper, `STATIC_DIR` constant, and `/dash` redirect are removed from `server.ts`
5. All JSON API endpoints (`/api/overview`, `/api/repos`, `/api/timeline`, `/api/dreams`, `/api/memory`, `/api/tasks`, `/api/actions`, `/api/scheduler`, `/api/metrics`, `/api/sse`) still return correct JSON responses
6. `curl http://localhost:7480/` renders the TanStack Start React dashboard (no redirect to `/dash`)
7. Root `package.json` scripts reference `dashboard-v2` build; old `css:build` and `css:watch` scripts are removed
8. `grep -r "htmx\|pico\|fragment" src/dashboard/` returns zero matches (excluding any `// Phase 7 removed` comments)
9. `bun run build` succeeds end-to-end
10. `bun test` passes with no regressions

---

## 2. Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Delete vs deprecate fragment endpoints | Delete entirely | Phase 4 replaced every fragment with a React plugin; no external consumers depend on fragment routes |
| Keep `handleReply()` and `handleDreamTrigger()` | Keep — these are POST mutation handlers, not fragments | They return HTML today but will be converted to JSON responses in this phase since the React dashboard uses JSON APIs |
| Keep `getEntryFragment()` | Delete — only used by the `/api/timeline/:id/fragment` route | React timeline plugin fetches via JSON |
| Keep `getRepoNavFragment()` | Delete — only used by `/api/repos/fragment` | React sidebar fetches repo list via JSON |
| Keep `tailwind.css` in static dir | Evaluate — delete if only used by old `css:build` | If `dashboard-v2` has its own Tailwind config (it does), the root-level Tailwind pipeline is dead code |
| Keep `static/dist/` | Delete — only holds compiled output from old `css:build` | TanStack Start produces its own CSS via Vite |
| Safety check before deletion | Run `bun test` and verify JSON endpoints before removing anything | Ensures we have a known-good baseline to diff against |
| `html()` helper removal | Remove entirely | After fragment deletion, no route returns `text/html` — all responses are JSON or delegated to TanStack Start |
| `handleReply`, `handleDreamTrigger`, `handleAsk` response format | Convert from `html()` to `json()` | These POST handlers currently return HTML strings; React dashboard expects JSON |

---

## 3. Tasks

### Task 7.1 — Remove fragment endpoints (~45 min)

**What**: Delete all `/api/*/fragment` route handlers from `server.ts` and the corresponding `get*Fragment()` / `getEntryFragment()` / `getRepoNavFragment()` functions from each API module.

**Files modified**:

| File | What to remove |
|---|---|
| `src/dashboard/server.ts` | 13 fragment route blocks; remove fragment function imports (`getOverviewFragment`, `getDreamsFragment`, `getRepoFragment`, `getRepoNavFragment`, `getTimelineFragment`, `getEntryFragment`, `getMemoryFragment`, `getMemorySearchFragment`, `getTasksFragment`, `getActionsFragment`, `getSchedulerFragment`, `getMetricsFragment`) |
| `src/dashboard/api/overview.ts` | `getOverviewFragment()` |
| `src/dashboard/api/repos.ts` | `getRepoFragment()`, `getRepoNavFragment()` |
| `src/dashboard/api/timeline.ts` | `getTimelineFragment()`, `getEntryFragment()` |
| `src/dashboard/api/dreams.ts` | `getDreamsFragment()` |
| `src/dashboard/api/memory.ts` | `getMemoryFragment()`, `getMemorySearchFragment()` |
| `src/dashboard/api/tasks.ts` | `getTasksFragment()` |
| `src/dashboard/api/actions.ts` | `getActionsFragment()` |
| `src/dashboard/api/scheduler.ts` | `getSchedulerFragment()` |
| `src/dashboard/api/metrics.ts` | `getMetricsFragment()` |

**Also convert**: `handleReply()`, `handleDreamTrigger()`, and `handleAsk()` routes in `server.ts` from `html(...)` to `json(...)` wrappers if not already returning JSON. If they return raw HTML strings, wrap the result in `{ html: string }` or refactor the function to return a JSON-serializable object.

**Verification**: `bun test` passes; `curl http://localhost:7480/api/overview` returns JSON.

---

### Task 7.2 — Remove static frontend files (~15 min)

**What**: Delete all legacy static assets that were part of the HTMX dashboard.

**Delete**:
```
src/dashboard/static/vendor/htmx.min.js
src/dashboard/static/vendor/htmx-sse.js
src/dashboard/static/vendor/pico.min.css
src/dashboard/static/vendor/chart.min.js
src/dashboard/static/vendor/              (directory itself)
src/dashboard/static/index.html
src/dashboard/static/app.js
src/dashboard/static/styles.css
src/dashboard/static/fragments/           (empty directory)
src/dashboard/static/dist/styles.css
src/dashboard/static/dist/               (directory itself)
src/dashboard/static/tailwind.css         (only used by old css:build pipeline)
```

**After deletion**, `src/dashboard/static/` should be empty and can itself be deleted.

**Verification**: `ls src/dashboard/static/` returns empty or directory does not exist.

---

### Task 7.3 — Clean up server.ts routing (~30 min)

**What**: Remove all legacy serving infrastructure from `server.ts` now that TanStack Start handles the frontend.

**Remove from `server.ts`**:
- `STATIC_DIR` constant (line 42)
- `V2_DIST_DIR` constant (line 43) — TanStack Start handler serves its own assets
- `MIME_TYPES` map
- `getMime()` function
- `html()` response helper
- `serveStatic()` function
- `/dash` and `/dash/` redirect block
- `/dash/*` static file serving block
- `/assets/*` manual static serving block (TanStack Start handler handles this)
- Root `/` fallback redirect to `/dash`

**Keep in `server.ts`**:
- `json()` response helper
- All `/api/*` JSON route handlers
- `/api/sse` SSE endpoint
- TanStack Start handler loading (`loadStartHandler()`) and catch-all delegation
- `DashboardContext` interface and `startDashboard()` function
- `setVigilContext()` call

**After cleanup**, the routing flow should be:
```
incoming request
  ├─ /api/*  → JSON handlers (existing logic, unchanged)
  └─ /*      → TanStack Start handler.fetch(req)
              └─ 404 if handler not loaded
```

**Verification**: `curl http://localhost:7480/api/overview` returns JSON; `curl http://localhost:7480/` returns React HTML (not a redirect).

---

### Task 7.4 — Update build scripts (~15 min)

**What**: Update root `package.json` to replace the old Tailwind CLI build pipeline with the TanStack Start build.

**Before** (current scripts):
```json
{
  "build": "bun run css:build && bun run build.config.ts",
  "css:build": "bunx @tailwindcss/cli -i src/dashboard/static/tailwind.css -o src/dashboard/static/dist/styles.css --minify",
  "css:watch": "bunx @tailwindcss/cli -i src/dashboard/static/tailwind.css -o src/dashboard/static/dist/styles.css --watch"
}
```

**After**:
```json
{
  "build": "bun run dashboard:build && bun run build.config.ts",
  "dashboard:build": "cd dashboard-v2 && bun --bun vite build",
  "dashboard:dev": "cd dashboard-v2 && bun --bun vite dev"
}
```

Remove `css:build` and `css:watch` scripts entirely. Remove `@tailwindcss/cli` from root `devDependencies` if it is no longer used by any remaining code.

**Verification**: `bun run build` completes successfully.

---

## 4. Deliverables

```
DELETED:
  src/dashboard/static/                    (entire directory)
    vendor/htmx.min.js
    vendor/htmx-sse.js
    vendor/pico.min.css
    vendor/chart.min.js
    vendor/                                (dir)
    index.html
    app.js
    styles.css
    tailwind.css
    dist/styles.css
    dist/                                  (dir)
    fragments/                             (dir)

MODIFIED:
  src/dashboard/server.ts                  (~150 lines removed: fragment routes,
                                            static serving, html helper, MIME map,
                                            /dash redirect, /assets serving)
  src/dashboard/api/overview.ts            (getOverviewFragment removed)
  src/dashboard/api/repos.ts               (getRepoFragment, getRepoNavFragment removed)
  src/dashboard/api/timeline.ts            (getTimelineFragment, getEntryFragment removed)
  src/dashboard/api/dreams.ts              (getDreamsFragment removed)
  src/dashboard/api/memory.ts              (getMemoryFragment, getMemorySearchFragment removed)
  src/dashboard/api/tasks.ts               (getTasksFragment removed)
  src/dashboard/api/actions.ts             (getActionsFragment removed)
  src/dashboard/api/scheduler.ts           (getSchedulerFragment removed)
  src/dashboard/api/metrics.ts             (getMetricsFragment removed)
  package.json                             (scripts updated, css:build/css:watch removed)

UNCHANGED:
  src/dashboard/api/sse.ts                 (SSE manager — still needed)
  dashboard-v2/                            (TanStack Start app — untouched)
  All /api/* JSON endpoints                (preserved exactly as-is)
```

---

## 5. Exit Criteria

| # | Criterion | Maps to |
|---|---|---|
| 1 | Zero `/api/*/fragment` routes in `server.ts` | Task 7.1 |
| 2 | Zero `get*Fragment()` exports across `src/dashboard/api/` | Task 7.1 |
| 3 | `src/dashboard/static/` directory does not exist | Task 7.2 |
| 4 | `server.ts` contains no `serveStatic`, `html()`, `MIME_TYPES`, `getMime`, or `/dash` routing | Task 7.3 |
| 5 | `GET /` returns React-rendered HTML (status 200, contains `<div id="root"` or TanStack root) | Task 7.3 |
| 6 | All 10 JSON API endpoints return valid JSON with status 200 | Tasks 7.1, 7.3 |
| 7 | `package.json` has `dashboard:build` and `dashboard:dev` scripts; no `css:build` or `css:watch` | Task 7.4 |
| 8 | `bun run build` succeeds | Task 7.4 |
| 9 | `bun test` passes with no regressions | All tasks |
| 10 | `grep -ri "htmx\|pico\.min\|getOverviewFragment\|getRepoFragment\|getRepoNavFragment" src/dashboard/` returns zero results | All tasks |

---

## 6. Execution Prompt

You are implementing Phase 7 of the Vigil Dashboard v2 migration: removing all HTMX legacy code. The React dashboard (TanStack Start in `dashboard-v2/`) fully replaces the old HTMX frontend. All JSON API endpoints must be preserved exactly as they are.

### Pre-flight safety check

Before deleting anything, verify the baseline:

```bash
bun test
curl -s http://localhost:7480/api/overview | head -c 200
curl -s http://localhost:7480/api/repos | head -c 200
```

If tests fail or APIs are broken, stop and investigate before proceeding.

### Step 1 — Remove fragment functions from API modules

For each file below, delete the listed exported functions (and any helper functions used only by them). Do not touch any JSON-returning functions.

| File | Functions to delete |
|---|---|
| `src/dashboard/api/overview.ts` | `getOverviewFragment()` |
| `src/dashboard/api/repos.ts` | `getRepoFragment()`, `getRepoNavFragment()` |
| `src/dashboard/api/timeline.ts` | `getTimelineFragment()`, `getEntryFragment()` |
| `src/dashboard/api/dreams.ts` | `getDreamsFragment()` |
| `src/dashboard/api/memory.ts` | `getMemoryFragment()`, `getMemorySearchFragment()` |
| `src/dashboard/api/tasks.ts` | `getTasksFragment()` |
| `src/dashboard/api/actions.ts` | `getActionsFragment()` |
| `src/dashboard/api/scheduler.ts` | `getSchedulerFragment()` |
| `src/dashboard/api/metrics.ts` | `getMetricsFragment()` |

Also check for and remove any HTML-escaping utilities, HTML template helpers, or constants that are only used by fragment functions.

### Step 2 — Clean up server.ts

From `src/dashboard/server.ts`:

1. Remove all fragment imports: `getOverviewFragment`, `getDreamsFragment`, `getRepoFragment`, `getRepoNavFragment`, `getTimelineFragment`, `getEntryFragment`, `getMemoryFragment`, `getMemorySearchFragment`, `getTasksFragment`, `getActionsFragment`, `getSchedulerFragment`, `getMetricsFragment`
2. Remove all 13 fragment route blocks (every `if` block whose path contains `/fragment`)
3. Remove `handleReply` route and import if it only returns HTML; otherwise convert to JSON
4. Remove: `STATIC_DIR`, `MIME_TYPES`, `getMime()`, `html()`, `serveStatic()`
5. Remove: `/dash` redirect block, `/dash/*` static serving block
6. Remove: `/assets/*` manual static serving block and `V2_DIST_DIR` constant
7. Remove: root `/` fallback redirect to `/dash`
8. Keep: `json()`, all `/api/*` JSON routes, `/api/sse`, TanStack Start handler loading and catch-all, `DashboardContext`, `startDashboard()`, `setVigilContext()`

### Step 3 — Delete static files

```bash
rm -rf src/dashboard/static/
```

### Step 4 — Update package.json

Replace scripts in root `package.json`:
```json
{
  "build": "bun run dashboard:build && bun run build.config.ts",
  "dashboard:build": "cd dashboard-v2 && bun --bun vite build",
  "dashboard:dev": "cd dashboard-v2 && bun --bun vite dev"
}
```

Remove `css:build` and `css:watch`. Remove `@tailwindcss/cli` from `devDependencies` if no other code references it.

### Post-flight verification

```bash
# 1. No fragment references remain
grep -ri "fragment\|htmx\|pico\|serveStatic\|getMime" src/dashboard/

# 2. Build succeeds
bun run build

# 3. Tests pass
bun test

# 4. JSON APIs work (start daemon, then test)
curl -s http://localhost:7480/api/overview
curl -s http://localhost:7480/api/repos
curl -s http://localhost:7480/api/timeline
curl -s http://localhost:7480/api/dreams
curl -s http://localhost:7480/api/memory
curl -s http://localhost:7480/api/tasks
curl -s http://localhost:7480/api/actions
curl -s http://localhost:7480/api/scheduler
curl -s http://localhost:7480/api/metrics

# 5. React dashboard loads
curl -s http://localhost:7480/ | grep -o '<div id="root"' || echo "TanStack Start handler not rendering"
```

---

## Readiness Check

| # | Gate | Status |
|---|---|---|
| 1 | Phase 4 complete — all 7 core plugins ported and working in React | PASS |
| 2 | All JSON API endpoints (`/api/*`) return correct data | PASS |
| 3 | TanStack Start handler serves the React app at `/` | PASS |
| 4 | No external system depends on fragment endpoints | PASS |
| 5 | `bun test` passes on current branch | PASS |
| 6 | Files to delete are identified and listed exhaustively | PASS |
