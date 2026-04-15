# Phase 6 — User Plugin Support

---
duration: ~4 hours
depends_on: Phase 3 (Plugin System — registry pattern, PluginSlot, WidgetProps interface)
blocks: nothing
risk: MEDIUM — filesystem scanning and dynamic imports are well-understood patterns in Bun, but plugin sandboxing/validation needs careful Zod schema design
stack: typescript
runner: single-agent (sequential: 6.1 first, then 6.2-6.4)
---

## 1. Objective + What Success Looks Like

**Objective**: Enable third-party plugins loaded from `~/.vigil/plugins/*/widget.ts`, validated with Zod, and rendered through the existing PluginSlot system alongside core plugins — with namespaced API route support and a developer-facing template.

**Observable success conditions**:

1. Placing a valid plugin directory at `~/.vigil/plugins/my-plugin/widget.ts` causes it to appear in the sidebar and render its component when selected
2. An invalid plugin manifest (wrong `id` format, `order` below 100, missing required fields) is rejected at startup with a clear error message logged — it does not crash the daemon
3. A user plugin registering API routes can be reached at `GET /api/plugins/my-plugin/data` and returns its handler's response
4. `GET /api/plugins` returns a merged list of core and user plugins with metadata (id, label, icon, slot, order) but no component functions serialized
5. The example plugin at `examples/plugin-template/` can be symlinked to `~/.vigil/plugins/plugin-template` and renders a working tab in the dashboard
6. User plugins with `order < 100` are rejected by the Zod schema — only core plugins may use orders 0-99
7. A user plugin that throws during component render is caught by the existing PluginSlot error boundary and does not affect other plugins

---

## 2. Key Design Decisions

### Plugin isolation strategy

User plugins run in the same Bun process as Vigil — there is no sandboxing via isolates or workers. This is acceptable because Vigil is a local dev tool (single user, single machine). The isolation boundary is the React error boundary in PluginSlot (Phase 3 deliverable), which catches render errors without crashing the dashboard.

**Why not workers/isolates**: Vigil plugins need access to the DashboardContext singleton (daemon state, SSE manager). Cross-worker serialization would make the plugin API unusable. The threat model for a local dev tool does not justify the complexity.

### Manifest validation

Zod validates every `widget.ts` default export at load time. The schema enforces:
- `id` must match `/^[a-z0-9-]+$/` (URL-safe, no collisions with core plugin IDs)
- `order >= 100` (core plugins own the 0-99 range, preventing user plugins from hijacking sidebar position)
- `slot` must be one of the existing `WidgetSlot` values
- `component` must be a function (lazy import factory)
- `apiRoutes` are optional; each must declare method, path, and handler

If validation fails, the plugin is skipped with a warning log. The remaining plugins still load.

### Route namespacing

User plugin API routes are mounted under `/api/plugins/:pluginId/*`. The `:pluginId` segment is the validated `id` from the manifest. Plugin-declared `path` values are relative (e.g., `/data` becomes `/api/plugins/my-plugin/data`). This prevents route collisions with core `/api/*` endpoints.

### Security considerations

| Risk | Mitigation |
|---|---|
| Malicious plugin code | Acceptable for local dev tool — user installs plugins intentionally. Same trust model as VS Code extensions. |
| Plugin overwriting core routes | Route namespacing under `/api/plugins/:id/*` prevents collisions. Core routes are matched first in `Bun.serve()`. |
| Plugin crashing the dashboard | React error boundary in PluginSlot (Phase 3) catches render errors. API route handlers are wrapped in try/catch. |
| Plugin ID collision with core | Loader checks user plugin IDs against the `corePlugins` array and rejects duplicates. |
| Manifest schema drift | Single Zod schema is the source of truth. Both loader and manifest endpoint use it. |

### Dynamic import pattern

```typescript
// Bun supports dynamic import from absolute paths
const mod = await import(join(pluginDir, pluginId, "widget.ts"));
const manifest = PluginManifestSchema.parse(mod.default);
```

Bun natively handles `.ts` imports — no build step needed for user plugins. The `component` field in the manifest is a lazy import factory that returns `{ default: ComponentType<WidgetProps> }`, matching the pattern used by core plugins.

---

## 3. Tasks

### Task 6.1 — Plugin loader and scanner (~1.5 hr)

**Depends on**: Phase 3 (PluginWidget type, corePlugins array)
**Completion condition**: `loadUserPlugins()` scans `~/.vigil/plugins/`, validates manifests with Zod, rejects invalid plugins with logged warnings, and returns a `PluginWidget[]` array that merges cleanly with `corePlugins`

**New file**: `src/dashboard/plugin-loader.ts`

**Implementation notes**:

1. Define `PluginManifestSchema` using Zod:
   ```typescript
   const PluginManifestSchema = z.object({
     id: z.string().regex(/^[a-z0-9-]+$/),
     label: z.string(),
     icon: z.string(),
     slot: z.enum(["tab", "sidebar", "timeline-card", "overlay", "top-bar"]),
     order: z.number().min(100),
     component: z.function(),
     sseEvents: z.array(z.string()).optional(),
     queryKeys: z.array(z.array(z.string())).optional(),
     apiRoutes: z.array(z.object({
       method: z.enum(["GET", "POST", "PUT", "DELETE"]),
       path: z.string(),
       handler: z.function(),
     })).optional(),
   });
   ```
2. Export `PluginApiRoute` type inferred from the schema's `apiRoutes` element
3. `loadUserPlugins()` function:
   - Read `~/.vigil/plugins/` directory with `readdir`. If directory does not exist, return empty array (no error)
   - For each subdirectory, check if `widget.ts` exists using `Bun.file().exists()`
   - Dynamic import `widget.ts`, parse `mod.default` through the Zod schema
   - Check `id` does not collide with any core plugin ID (import `corePlugins` from `dashboard-v2/app/plugins/index.ts`)
   - On validation failure: log warning with plugin path and Zod error, skip plugin
   - On import error: log warning, skip plugin
   - Return array of validated `PluginWidget` objects
4. Export a `getPluginApiRoutes()` function that returns a `Map<string, PluginApiRoute[]>` keyed by plugin ID — extracted from loaded manifests for use by Task 6.2

---

### Task 6.2 — Plugin API route registration (~1 hr)

**Depends on**: Task 6.1
**Completion condition**: User plugin API routes are reachable at `/api/plugins/:pluginId/*` through `Bun.serve()`, and a test request to a plugin route returns the expected response

**Modified file**: `src/dashboard/server.ts`

**Implementation notes**:

1. Import `loadUserPlugins` and `getPluginApiRoutes` from `plugin-loader.ts`
2. Call `loadUserPlugins()` during dashboard startup (in the `startDashboard` function), after `setVigilContext()`
3. Merge returned user plugins into the plugin array passed to the TanStack Start context
4. In the `Bun.serve()` fetch handler, add a route match block for `/api/plugins/:pluginId/*`:
   ```typescript
   if (url.pathname.startsWith("/api/plugins/")) {
     const segments = url.pathname.split("/");
     const pluginId = segments[3];
     const pluginPath = "/" + segments.slice(4).join("/");
     const routes = pluginApiRoutes.get(pluginId);
     if (routes) {
       const route = routes.find(
         (r) => r.path === pluginPath && r.method === req.method
       );
       if (route) {
         try {
           return await route.handler(req);
         } catch (err) {
           return Response.json({ error: "Plugin error" }, { status: 500 });
         }
       }
     }
     return Response.json({ error: "Not found" }, { status: 404 });
   }
   ```
5. This route block must appear AFTER core `/api/*` routes but BEFORE the TanStack Start handler fallthrough
6. Plugin route handlers receive the raw `Request` object and must return a `Response`

---

### Task 6.3 — Plugin manifest endpoint (~30 min)

**Depends on**: Task 6.1
**Completion condition**: `GET /api/plugins` returns JSON array of all registered plugins (core + user) with metadata fields only — no `component` or `handler` functions serialized

**Modified file**: `src/dashboard/server.ts`

**Implementation notes**:

1. Add a new route handler for `GET /api/plugins` in the existing API routing block
2. Merge `corePlugins` and loaded user plugins into a single array
3. Map each plugin to a serializable object:
   ```typescript
   {
     id: plugin.id,
     label: plugin.label,
     icon: plugin.icon,
     slot: plugin.slot,
     order: plugin.order,
     source: "core" | "user",
     sseEvents: plugin.sseEvents ?? [],
     queryKeys: plugin.queryKeys ?? [],
     hasApiRoutes: (plugin.apiRoutes?.length ?? 0) > 0,
   }
   ```
4. Sort by `order` ascending before returning
5. Response: `Response.json(pluginList)`

---

### Task 6.4 — Plugin development template + docs (~1 hr)

**Depends on**: Task 6.1
**Completion condition**: `examples/plugin-template/` contains a working example plugin with `widget.ts`, a React component, optional API route, and a README explaining installation

**New files**:
- `examples/plugin-template/widget.ts` — manifest default export
- `examples/plugin-template/PluginPage.tsx` — example tab component
- `examples/plugin-template/README.md` — development guide

**Implementation notes**:

1. `widget.ts` — default export matching `PluginManifestSchema`:
   ```typescript
   import type { WidgetProps } from "../../dashboard-v2/app/types/plugin";
   import type { ComponentType } from "react";

   export default {
     id: "plugin-template",
     label: "My Plugin",
     icon: "Puzzle",
     slot: "tab" as const,
     order: 100,
     component: (): Promise<{ default: ComponentType<WidgetProps> }> =>
       import("./PluginPage"),
     sseEvents: ["tick"],
     apiRoutes: [
       {
         method: "GET" as const,
         path: "/hello",
         handler: () => Response.json({ message: "Hello from plugin!" }),
       },
     ],
   };
   ```

2. `PluginPage.tsx` — minimal React component:
   - Accepts `WidgetProps` (activeRepo, queryClient)
   - Renders a Card showing plugin name and active repo
   - Demonstrates fetching from its own API route (`/api/plugins/plugin-template/hello`)

3. `README.md` — covers:
   - Directory structure (what files are required)
   - Manifest schema reference (all fields, which are optional)
   - How to install: `ln -s /path/to/my-plugin ~/.vigil/plugins/my-plugin`
   - API routes: how to define them, URL format, request/response contract
   - Available props: `WidgetProps` interface
   - SSE events: how `sseEvents` array triggers re-fetches
   - Slot types: what each `WidgetSlot` value means for positioning
   - Ordering: must be >= 100, core plugins use 0-99
   - Error handling: plugins are wrapped in error boundaries

---

## 4. Deliverables

```
src/dashboard/
  plugin-loader.ts                    # Scanner, Zod validation, loadUserPlugins()
  server.ts                           # Modified: plugin route mounting, /api/plugins endpoint

examples/plugin-template/
  widget.ts                           # Example manifest (default export)
  PluginPage.tsx                      # Example tab component
  README.md                           # Plugin development guide
```

---

## 5. Exit Criteria

- [ ] `loadUserPlugins()` scans `~/.vigil/plugins/` and returns validated `PluginWidget[]` — empty array when directory does not exist
- [ ] Invalid manifests are rejected with Zod error logged, not thrown — remaining plugins still load
- [ ] User plugin IDs that collide with core plugin IDs are rejected with a warning
- [ ] User plugin with `order < 100` is rejected by the schema
- [ ] User plugin API routes are reachable at `/api/plugins/:pluginId/*`
- [ ] Plugin API route errors return 500 with `{ error: "Plugin error" }`, not a crash
- [ ] `GET /api/plugins` returns merged core + user plugin list without function references
- [ ] Example plugin at `examples/plugin-template/` can be symlinked and renders in the dashboard
- [ ] Example plugin's API route returns JSON at `/api/plugins/plugin-template/hello`
- [ ] Existing core plugins and `/api/*` routes are unaffected by user plugin loading

---

## 6. Execution Prompt

You are implementing Phase 6 (User Plugin Support) of Vigil Dashboard v2 — enabling third-party plugins loaded from the filesystem and rendered through the existing plugin system.

### What the project is

Vigil is a local git monitoring daemon (Bun/TypeScript) with a React dashboard served by `Bun.serve()` on port 7480. The dashboard uses TanStack Start (React 19) with a plugin architecture established in Phase 3: a `PluginWidget` interface, a `corePlugins` registry array, and a `PluginSlot` renderer with lazy loading and error boundaries.

### What this phase adds

User-installable plugins that live at `~/.vigil/plugins/*/widget.ts`. Each plugin exports a manifest validated by Zod, provides a React component rendered through the existing PluginSlot, and optionally registers API routes namespaced under `/api/plugins/:id/*`.

### Architecture decisions (must follow)

- **Bun dynamic imports** — `await import(path)` works with `.ts` files natively in Bun. No build step for user plugins.
- **Zod validation at load time** — every manifest is parsed through `PluginManifestSchema`. Invalid plugins are skipped with a warning, never crash the daemon.
- **Route namespacing** — all user plugin API routes live under `/api/plugins/:pluginId/*`. Core `/api/*` routes are matched first and are never shadowed.
- **Error boundaries** — the existing `PluginSlot` component (Phase 3) wraps every plugin in an error boundary. No additional isolation needed.
- **Order >= 100** — user plugins must have `order` of 100 or higher. Core plugins own 0-99.
- **No component serialization** — `GET /api/plugins` returns metadata only. Component functions stay client-side.

### Existing types and interfaces (from Phase 1/3)

```typescript
// dashboard-v2/app/types/plugin.ts
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

### Files to create

**1. `src/dashboard/plugin-loader.ts`**

Core module with:
- `PluginManifestSchema` — Zod schema enforcing id pattern, order >= 100, valid slot, function types for component and handlers
- `loadUserPlugins(): Promise<PluginWidget[]>` — scans `~/.vigil/plugins/`, validates each `widget.ts` default export, rejects invalid manifests with logged warnings, checks for ID collisions with core plugins
- `getPluginApiRoutes(): Map<string, PluginApiRoute[]>` — returns API routes keyed by plugin ID for route mounting

```typescript
import { z } from "zod";
import { join } from "path";
import { homedir } from "os";
import { readdir } from "fs/promises";
import type { PluginWidget } from "../../dashboard-v2/app/types/plugin";

const PluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string(),
  icon: z.string(),
  slot: z.enum(["tab", "sidebar", "timeline-card", "overlay", "top-bar"]),
  order: z.number().min(100),
  component: z.function(),
  sseEvents: z.array(z.string()).optional(),
  queryKeys: z.array(z.array(z.string())).optional(),
  apiRoutes: z.array(z.object({
    method: z.enum(["GET", "POST", "PUT", "DELETE"]),
    path: z.string(),
    handler: z.function(),
  })).optional(),
});

type PluginManifest = z.infer<typeof PluginManifestSchema>;

export interface PluginApiRoute {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  handler: (req: Request) => Response | Promise<Response>;
}

let loadedApiRoutes = new Map<string, PluginApiRoute[]>();

export async function loadUserPlugins(): Promise<PluginWidget[]> {
  const pluginDir = join(homedir(), ".vigil", "plugins");
  const plugins: PluginWidget[] = [];
  loadedApiRoutes = new Map();

  let entries: string[];
  try {
    entries = await readdir(pluginDir);
  } catch {
    return []; // Directory doesn't exist — not an error
  }

  // Import corePlugins to check for ID collisions
  const { corePlugins } = await import("../../dashboard-v2/app/plugins/index");
  const coreIds = new Set(corePlugins.map((p: PluginWidget) => p.id));

  for (const entry of entries) {
    const widgetPath = join(pluginDir, entry, "widget.ts");
    const exists = await Bun.file(widgetPath).exists();
    if (!exists) continue;

    try {
      const mod = await import(widgetPath);
      const manifest = PluginManifestSchema.parse(mod.default);

      if (coreIds.has(manifest.id)) {
        console.warn(`[plugins] Skipping "${manifest.id}" — ID collides with core plugin`);
        continue;
      }

      if (manifest.apiRoutes?.length) {
        loadedApiRoutes.set(manifest.id, manifest.apiRoutes as PluginApiRoute[]);
      }

      plugins.push({
        id: manifest.id,
        label: manifest.label,
        icon: manifest.icon,
        slot: manifest.slot,
        order: manifest.order,
        component: manifest.component as PluginWidget["component"],
        sseEvents: manifest.sseEvents,
        queryKeys: manifest.queryKeys,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        console.warn(`[plugins] Invalid manifest in ${entry}/:`, err.issues.map(i => i.message).join(", "));
      } else {
        console.warn(`[plugins] Failed to load ${entry}/:`, err);
      }
    }
  }

  return plugins;
}

export function getPluginApiRoutes(): Map<string, PluginApiRoute[]> {
  return loadedApiRoutes;
}
```

**2. `examples/plugin-template/widget.ts`**

Default export with all required and optional manifest fields:
- `id: "plugin-template"`, `label: "My Plugin"`, `icon: "Puzzle"`, `slot: "tab"`, `order: 100`
- `component` lazy import pointing to `./PluginPage`
- One `apiRoutes` entry: `GET /hello` returning `{ message: "Hello from plugin!" }`
- `sseEvents: ["tick"]` to demonstrate SSE-triggered re-fetches

**3. `examples/plugin-template/PluginPage.tsx`**

Minimal React component accepting `WidgetProps`:
- Renders a shadcn Card with plugin name and active repo
- Fetches from `/api/plugins/plugin-template/hello` using TanStack Query
- Shows the API response in a Badge

**4. `examples/plugin-template/README.md`**

Plugin developer guide covering: directory structure, manifest schema, installation via symlink, API route URL format, WidgetProps interface, SSE events, slot types, ordering rules, error handling.

### File to modify

**`src/dashboard/server.ts`** — Three additions:

1. **Plugin loading at startup**: After `setVigilContext()`, call `loadUserPlugins()` and merge with core plugins. Store API routes via `getPluginApiRoutes()`.

2. **Plugin API route handler**: Add a route block for `/api/plugins/:pluginId/*` that matches against loaded routes by plugin ID, path, and method. Wrap handler calls in try/catch returning 500 on error. Place this AFTER core `/api/*` routes but BEFORE TanStack Start handler fallthrough.

3. **Plugin manifest endpoint**: Add `GET /api/plugins` that returns merged core + user plugin metadata (no functions) sorted by order.

### Execution order

1. **Task 6.1** — Create `src/dashboard/plugin-loader.ts` with Zod schema, scanner, and validator
2. **Task 6.2** — Modify `src/dashboard/server.ts` to mount plugin API routes under `/api/plugins/:id/*`
3. **Task 6.3** — Add `GET /api/plugins` endpoint to `src/dashboard/server.ts`
4. **Task 6.4** — Create `examples/plugin-template/` with widget.ts, PluginPage.tsx, and README

### Success criteria

Run these checks after implementation:

```bash
# 1. No plugins directory — should not error
# (ensure ~/.vigil/plugins/ does not exist, start daemon)
bun run src/cli/index.ts watch /tmp/test-repo
# → Dashboard starts normally, no plugin warnings

# 2. Install example plugin
mkdir -p ~/.vigil/plugins
ln -s $(pwd)/examples/plugin-template ~/.vigil/plugins/plugin-template
bun run src/cli/index.ts watch /tmp/test-repo
# → Log shows plugin-template loaded

# 3. Plugin manifest endpoint
curl http://localhost:7480/api/plugins
# → JSON array containing both core plugins and plugin-template

# 4. Plugin API route
curl http://localhost:7480/api/plugins/plugin-template/hello
# → { "message": "Hello from plugin!" }

# 5. Plugin renders in dashboard
# Open http://localhost:7480/ → "My Plugin" tab appears in sidebar at position 100+

# 6. Invalid plugin rejection
# Create ~/.vigil/plugins/bad-plugin/widget.ts with order: 50
# Restart daemon → warning logged, bad-plugin not loaded, other plugins unaffected

# 7. Existing routes unaffected
curl http://localhost:7480/api/overview
# → Normal JSON response
```

---

## Readiness Check

- [PASS] All inputs from prior phases are listed and available — Phase 3 deliverables (PluginWidget type, corePlugins array, PluginSlot renderer with error boundary) are defined in big-plan.md with exact file paths and interfaces
- [PASS] Every sub-task has a clear, testable completion condition
- [PASS] Execution prompt is self-contained: includes (a) existing type definitions from Phase 1/3, (b) complete Zod schema, (c) full plugin-loader.ts implementation, (d) server.ts modification points, (e) example plugin code, and (f) observable success criteria
- [PASS] Exit criteria map 1:1 to deliverables (plugin-loader.ts -> scanning/validation, server.ts -> route mounting + manifest endpoint, examples/ -> template plugin)
- [PASS] Any heavy external dependency has a fake/stub strategy noted — Zod is already in the project deps; Bun dynamic import of .ts files is a core Bun feature; no new dependencies required
- [PASS] Security risks are documented with mitigations — route namespacing prevents collisions, error boundaries prevent crashes, ID collision check prevents core plugin hijacking, Zod schema prevents malformed manifests
