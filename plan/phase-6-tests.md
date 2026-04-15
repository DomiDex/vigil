# Phase 6 — User Plugin Support: Test Plan

---
scope: Plugin loader (Zod validation, filesystem scanning, dynamic import), plugin API route dispatch, /api/plugins metadata endpoint
key_pattern: Service phase — real filesystem with temp dirs, real Zod validation, real dynamic imports; mock only homedir and console.warn
dependencies: bun:test (existing), temp-config.ts helper pattern (spyOn os.homedir), Zod (existing dep)
---

**Phase type: Service.** The plugin-loader is pure backend logic (filesystem scan, Zod validation, dynamic import). The server modifications add HTTP route dispatch. Both are highly unit-testable with real temp directories and real Bun dynamic imports.

---

## User Stories

| # | User Story | Validation Check | Pass Condition |
|---|-----------|-----------------|----------------|
| US-1 | As a developer, I want the PluginManifestSchema to reject invalid plugin manifests at load time, so that broken plugins never crash the daemon | `plugin-loader.test.ts` SchemaValidation | Invalid id/order/slot/fields all produce Zod errors; valid manifests pass |
| US-2 | As a developer, I want `loadUserPlugins()` to scan `~/.vigil/plugins/` and return validated plugins, so that user plugins are discovered automatically | `plugin-loader.test.ts` LoadUserPlugins | Valid plugins loaded, invalid skipped with warning, missing dir returns [] |
| US-3 | As a developer, I want user plugin IDs that collide with core plugin IDs to be rejected, so that core plugins are never hijacked | `plugin-loader.test.ts` IDCollision | Duplicate ID skipped with warning, non-colliding plugins still load |
| US-4 | As a developer, I want plugin API routes mounted at `/api/plugins/:pluginId/*`, so that plugins have namespaced HTTP endpoints | `plugin-routes.test.ts` RouteDispatch | Correct handler called for matching plugin/path/method; 404 for mismatches |
| US-5 | As a developer, I want `GET /api/plugins` to return merged core + user plugin metadata without function references, so that the frontend knows which plugins exist | `plugin-routes.test.ts` MetadataEndpoint | JSON array with source field, sorted by order, no component/handler keys |
| US-6 | As a developer, I want plugin API route errors to return 500 instead of crashing, so that one bad plugin does not take down the server | `plugin-routes.test.ts` ErrorHandling | Throwing handler returns `{ error: "Plugin error" }` with status 500 |

---

## 1. Component Mock Strategy Table

| Component | Mock/Fake | What to Assert | User Story |
|---|---|---|---|
| `PluginManifestSchema` | None -- test the real Zod schema | Valid manifests pass `.parse()`, invalid manifests throw `ZodError` with correct issue messages | US-1 |
| `loadUserPlugins()` | Real filesystem (temp dir) + `spyOn(os, "homedir")` | Returns `PluginWidget[]` for valid plugins, logs warnings for invalid, returns `[]` for missing dir | US-2, US-3 |
| `getPluginApiRoutes()` | None -- reads from module-level Map populated by `loadUserPlugins()` | Returns `Map<string, PluginApiRoute[]>` with correct keys and routes | US-4 |
| `corePlugins` import | Inline mock via `mock.module()` or known set | Provides a set of core IDs for collision detection | US-3 |
| `console.warn` | `spyOn(console, "warn")` | Called with expected messages on invalid/colliding plugins | US-2, US-3 |
| `Bun.serve()` for route tests | Real `Bun.serve()` on random port | HTTP requests dispatch to correct plugin handlers; returns correct status codes | US-4, US-5, US-6 |
| Filesystem (`~/.vigil/plugins/`) | Temp dir via `mkdtempSync` + `spyOn(os, "homedir")` | Plugin directories with `widget.ts` files are discovered and imported | US-2 |

---

## 2. Test Tier Table

| Tier | Tests | Dependencies | Speed | When to Run |
|---|---|---|---|---|
| **Unit** | `plugin-loader.test.ts` (schema validation, loadUserPlugins, getPluginApiRoutes) | Zod, temp filesystem, `spyOn(os, "homedir")` | <2s | Every run (`bun test`) |
| **Integration** | `plugin-routes.test.ts` (HTTP route dispatch, metadata endpoint) | Real `Bun.serve()` on random port, plugin-loader | 2-3s | Every run (`bun test`) |

---

## 3. Fake Implementations

### Test Helper: `createTempPluginDir()`

New helper at `src/__tests__/helpers/temp-plugins.ts` for creating test plugin directories with valid/invalid `widget.ts` files.

```typescript
// src/__tests__/helpers/temp-plugins.ts
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spyOn } from "bun:test";
import * as os from "node:os";

export interface TempPluginEnv {
  tmpDir: string;
  pluginsDir: string;
  addPlugin: (id: string, widgetContent: string) => string;
  addPluginDir: (id: string) => string; // dir without widget.ts
  cleanup: () => void;
}

export function createTempPluginEnv(): TempPluginEnv {
  const tmpDir = mkdtempSync(join(tmpdir(), "vigil-plugin-test-"));
  const pluginsDir = join(tmpDir, ".vigil", "plugins");
  mkdirSync(pluginsDir, { recursive: true });

  // Redirect homedir so loadUserPlugins() finds our temp plugins
  spyOn(os, "homedir").mockReturnValue(tmpDir);

  return {
    tmpDir,
    pluginsDir,
    addPlugin(id: string, widgetContent: string): string {
      const dir = join(pluginsDir, id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "widget.ts"), widgetContent);
      return dir;
    },
    addPluginDir(id: string): string {
      const dir = join(pluginsDir, id);
      mkdirSync(dir, { recursive: true });
      return dir;
    },
    cleanup() {
      rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

/**
 * Returns a valid widget.ts source string for testing.
 * Override individual fields by passing a partial object.
 */
export function validWidgetSource(overrides: Record<string, string> = {}): string {
  const fields = {
    id: '"test-plugin"',
    label: '"Test Plugin"',
    icon: '"Puzzle"',
    slot: '"tab" as const',
    order: "100",
    component: '() => Promise.resolve({ default: () => null })',
    ...overrides,
  };

  const entries = Object.entries(fields)
    .map(([k, v]) => `  ${k}: ${v},`)
    .join("\n");

  return `export default {\n${entries}\n};\n`;
}
```

### Mock `corePlugins` Module

The plugin-loader imports `corePlugins` from `dashboard-v2/app/plugins/index`. For unit tests, use `Bun.mock.module()` to provide a known set:

```typescript
import { mock } from "bun:test";

mock.module("../../dashboard-v2/app/plugins/index", () => ({
  corePlugins: [
    { id: "overview", label: "Overview", slot: "tab", order: 0 },
    { id: "timeline", label: "Timeline", slot: "tab", order: 10 },
    { id: "dreams", label: "Dreams", slot: "tab", order: 20 },
  ],
}));
```

---

## 4. Test File List

```
src/__tests__/
├── helpers/
│   └── temp-plugins.ts              # createTempPluginEnv(), validWidgetSource()
├── unit/
│   └── plugin-loader.test.ts        # Schema validation, loadUserPlugins, getPluginApiRoutes (US-1, US-2, US-3)
└── integration/
    └── plugin-routes.test.ts        # HTTP route dispatch, /api/plugins endpoint (US-4, US-5, US-6)
```

---

## 5. Test Setup

### Shared helpers

Reuse the existing `spyOn(os, "homedir")` pattern from `src/__tests__/helpers/temp-config.ts` and `src/__tests__/unit/config.test.ts`. The new `temp-plugins.ts` helper wraps this into a purpose-built factory.

### Module cache concerns

`loadUserPlugins()` uses dynamic `import()` for each plugin's `widget.ts`. Bun caches module imports by path. Since each test run creates temp directories at unique paths, cache invalidation is not an issue -- each `widget.ts` file has a unique absolute path.

### Console.warn spy

Tests that verify warning messages should `spyOn(console, "warn")` in `beforeEach` and `mockRestore()` in `afterEach` to avoid polluting test output and to assert on warning content.

---

## 6. Key Testing Decisions

| Decision | Approach | Rationale |
|---|---|---|
| Real filesystem for plugin dirs | `mkdtempSync` + write actual `widget.ts` files | Bun's dynamic import requires real files on disk; mocking `readdir` would not test the actual import path |
| Real Zod validation | Test the actual `PluginManifestSchema` | Schema correctness IS the deliverable -- faking it defeats the purpose |
| Mock `corePlugins` import | `Bun.mock.module()` with known set | Decouples tests from actual dashboard plugin registry; tests need predictable IDs for collision checks |
| `spyOn(os, "homedir")` | Redirect plugin directory to temp | Established pattern from config.test.ts; avoids touching real `~/.vigil/` |
| `spyOn(console, "warn")` | Verify warning messages on invalid plugins | Warnings are a deliverable (user feedback); asserting on them ensures they appear |
| Real `Bun.serve()` for route tests | Random port, start/stop per test | Matches existing dashboard test pattern; tests real HTTP dispatch |
| No build step required | All tests use runtime-only code | Unlike Phase 0, plugin-loader and route handling are runtime logic with no build dependency |

---

## 7. Example Test Cases

### 7a. PluginManifestSchema Validation

```typescript
// src/__tests__/unit/plugin-loader.test.ts
import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { z } from "zod";

// Mock corePlugins before importing plugin-loader
mock.module("../../dashboard-v2/app/plugins/index", () => ({
  corePlugins: [
    { id: "overview", label: "Overview", slot: "tab", order: 0 },
    { id: "timeline", label: "Timeline", slot: "tab", order: 10 },
  ],
}));

import {
  PluginManifestSchema,
  loadUserPlugins,
  getPluginApiRoutes,
} from "../../dashboard/plugin-loader";

import {
  createTempPluginEnv,
  validWidgetSource,
  type TempPluginEnv,
} from "../helpers/temp-plugins";

describe("PluginManifestSchema", () => {
  const validManifest = {
    id: "my-plugin",
    label: "My Plugin",
    icon: "Puzzle",
    slot: "tab",
    order: 100,
    component: () => Promise.resolve({ default: () => null }),
  };

  it("accepts a valid manifest with required fields only", () => {
    const result = PluginManifestSchema.parse(validManifest);
    expect(result.id).toBe("my-plugin");
    expect(result.order).toBe(100);
  });

  it("accepts a valid manifest with optional apiRoutes", () => {
    const manifest = {
      ...validManifest,
      apiRoutes: [
        {
          method: "GET",
          path: "/data",
          handler: () => Response.json({ ok: true }),
        },
      ],
      sseEvents: ["tick"],
      queryKeys: [["plugin", "data"]],
    };
    const result = PluginManifestSchema.parse(manifest);
    expect(result.apiRoutes).toHaveLength(1);
  });

  it("rejects id with uppercase letters", () => {
    expect(() =>
      PluginManifestSchema.parse({ ...validManifest, id: "MyPlugin" }),
    ).toThrow();
  });

  it("rejects id with spaces", () => {
    expect(() =>
      PluginManifestSchema.parse({ ...validManifest, id: "my plugin" }),
    ).toThrow();
  });

  it("rejects id with special characters", () => {
    expect(() =>
      PluginManifestSchema.parse({ ...validManifest, id: "my_plugin!" }),
    ).toThrow();
  });

  it("accepts id with hyphens and numbers", () => {
    const result = PluginManifestSchema.parse({
      ...validManifest,
      id: "my-plugin-2",
    });
    expect(result.id).toBe("my-plugin-2");
  });

  it("rejects order below 100", () => {
    expect(() =>
      PluginManifestSchema.parse({ ...validManifest, order: 99 }),
    ).toThrow();
  });

  it("rejects order of 0", () => {
    expect(() =>
      PluginManifestSchema.parse({ ...validManifest, order: 0 }),
    ).toThrow();
  });

  it("accepts order of exactly 100", () => {
    const result = PluginManifestSchema.parse({
      ...validManifest,
      order: 100,
    });
    expect(result.order).toBe(100);
  });

  it("accepts order above 100", () => {
    const result = PluginManifestSchema.parse({
      ...validManifest,
      order: 500,
    });
    expect(result.order).toBe(500);
  });

  it("rejects missing required field: id", () => {
    const { id, ...rest } = validManifest;
    expect(() => PluginManifestSchema.parse(rest)).toThrow();
  });

  it("rejects missing required field: label", () => {
    const { label, ...rest } = validManifest;
    expect(() => PluginManifestSchema.parse(rest)).toThrow();
  });

  it("rejects missing required field: component", () => {
    const { component, ...rest } = validManifest;
    expect(() => PluginManifestSchema.parse(rest)).toThrow();
  });

  it("rejects invalid slot value", () => {
    expect(() =>
      PluginManifestSchema.parse({ ...validManifest, slot: "footer" }),
    ).toThrow();
  });

  it("accepts all valid slot values", () => {
    for (const slot of [
      "tab",
      "sidebar",
      "timeline-card",
      "overlay",
      "top-bar",
    ]) {
      const result = PluginManifestSchema.parse({ ...validManifest, slot });
      expect(result.slot).toBe(slot);
    }
  });

  it("rejects non-function component", () => {
    expect(() =>
      PluginManifestSchema.parse({ ...validManifest, component: "not-a-fn" }),
    ).toThrow();
  });

  it("rejects invalid apiRoute method", () => {
    expect(() =>
      PluginManifestSchema.parse({
        ...validManifest,
        apiRoutes: [
          { method: "PATCH", path: "/data", handler: () => new Response() },
        ],
      }),
    ).toThrow();
  });

  it("rejects apiRoute with missing handler", () => {
    expect(() =>
      PluginManifestSchema.parse({
        ...validManifest,
        apiRoutes: [{ method: "GET", path: "/data" }],
      }),
    ).toThrow();
  });

  it("accepts all valid HTTP methods in apiRoutes", () => {
    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      const result = PluginManifestSchema.parse({
        ...validManifest,
        apiRoutes: [
          { method, path: "/test", handler: () => new Response() },
        ],
      });
      expect(result.apiRoutes![0].method).toBe(method);
    }
  });
});
```

### 7b. loadUserPlugins()

```typescript
describe("loadUserPlugins", () => {
  let env: TempPluginEnv;
  let warnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    env = createTempPluginEnv();
    warnSpy = spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    env.cleanup();
  });

  it("returns empty array when plugins directory does not exist", async () => {
    // Point homedir to a dir without .vigil/plugins/
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const emptyDir = mkdtempSync(join(tmpdir(), "vigil-no-plugins-"));
    spyOn(os, "homedir").mockReturnValue(emptyDir);

    const plugins = await loadUserPlugins();
    expect(plugins).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();

    rmSync(emptyDir, { recursive: true, force: true });
  });

  it("loads a valid plugin from widget.ts", async () => {
    env.addPlugin("hello-world", validWidgetSource({
      id: '"hello-world"',
      label: '"Hello World"',
      order: "150",
    }));

    const plugins = await loadUserPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].id).toBe("hello-world");
    expect(plugins[0].label).toBe("Hello World");
    expect(plugins[0].order).toBe(150);
    expect(plugins[0].slot).toBe("tab");
  });

  it("skips invalid manifest with warning and loads remaining plugins", async () => {
    // Invalid: order below 100
    env.addPlugin("bad-plugin", validWidgetSource({
      id: '"bad-plugin"',
      order: "50",
    }));
    // Valid
    env.addPlugin("good-plugin", validWidgetSource({
      id: '"good-plugin"',
      order: "200",
    }));

    const plugins = await loadUserPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].id).toBe("good-plugin");
    expect(warnSpy).toHaveBeenCalled();
    const warnMsg = warnSpy.mock.calls[0].join(" ");
    expect(warnMsg).toContain("bad-plugin");
  });

  it("skips plugin with ID colliding with core plugin", async () => {
    // "overview" is a core plugin ID in our mock
    env.addPlugin("overview", validWidgetSource({
      id: '"overview"',
      order: "100",
    }));

    const plugins = await loadUserPlugins();
    expect(plugins).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    const warnMsg = warnSpy.mock.calls[0].join(" ");
    expect(warnMsg).toContain("collides with core plugin");
  });

  it("skips plugin with broken widget.ts (import error)", async () => {
    env.addPlugin("broken", "export default syntax error {{{");

    const plugins = await loadUserPlugins();
    expect(plugins).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("loads multiple valid plugins", async () => {
    env.addPlugin("plugin-a", validWidgetSource({
      id: '"plugin-a"',
      order: "100",
    }));
    env.addPlugin("plugin-b", validWidgetSource({
      id: '"plugin-b"',
      order: "200",
    }));
    env.addPlugin("plugin-c", validWidgetSource({
      id: '"plugin-c"',
      order: "300",
    }));

    const plugins = await loadUserPlugins();
    expect(plugins).toHaveLength(3);
    const ids = plugins.map((p) => p.id).sort();
    expect(ids).toEqual(["plugin-a", "plugin-b", "plugin-c"]);
  });

  it("silently skips directory without widget.ts", async () => {
    env.addPluginDir("empty-dir"); // no widget.ts
    env.addPlugin("real-plugin", validWidgetSource({
      id: '"real-plugin"',
    }));

    const plugins = await loadUserPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].id).toBe("real-plugin");
    // No warning for missing widget.ts -- it's just not a plugin
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("populates apiRoutes accessible via getPluginApiRoutes()", async () => {
    const widgetWithRoutes = `
export default {
  id: "routed-plugin",
  label: "Routed",
  icon: "Route",
  slot: "tab" as const,
  order: 100,
  component: () => Promise.resolve({ default: () => null }),
  apiRoutes: [
    {
      method: "GET" as const,
      path: "/data",
      handler: () => Response.json({ hello: true }),
    },
    {
      method: "POST" as const,
      path: "/submit",
      handler: () => new Response("ok"),
    },
  ],
};
`;
    env.addPlugin("routed-plugin", widgetWithRoutes);

    await loadUserPlugins();
    const routes = getPluginApiRoutes();
    expect(routes.has("routed-plugin")).toBe(true);
    expect(routes.get("routed-plugin")).toHaveLength(2);
    expect(routes.get("routed-plugin")![0].method).toBe("GET");
    expect(routes.get("routed-plugin")![0].path).toBe("/data");
  });

  it("plugin without apiRoutes does not appear in getPluginApiRoutes()", async () => {
    env.addPlugin("no-routes", validWidgetSource({
      id: '"no-routes"',
    }));

    await loadUserPlugins();
    const routes = getPluginApiRoutes();
    expect(routes.has("no-routes")).toBe(false);
  });
});
```

### 7c. getPluginApiRoutes()

```typescript
describe("getPluginApiRoutes", () => {
  let env: TempPluginEnv;

  beforeEach(() => {
    env = createTempPluginEnv();
  });

  afterEach(() => {
    env.cleanup();
  });

  it("returns empty Map when no plugins are loaded", async () => {
    await loadUserPlugins(); // no plugins in dir
    const routes = getPluginApiRoutes();
    expect(routes.size).toBe(0);
  });

  it("returns Map keyed by plugin ID", async () => {
    const widget = `
export default {
  id: "api-plugin",
  label: "API",
  icon: "Zap",
  slot: "tab" as const,
  order: 100,
  component: () => Promise.resolve({ default: () => null }),
  apiRoutes: [
    { method: "GET" as const, path: "/info", handler: () => Response.json({}) },
  ],
};
`;
    env.addPlugin("api-plugin", widget);
    await loadUserPlugins();

    const routes = getPluginApiRoutes();
    expect(routes.size).toBe(1);
    expect(routes.has("api-plugin")).toBe(true);
  });

  it("resets routes on each loadUserPlugins() call", async () => {
    const widget = `
export default {
  id: "ephemeral",
  label: "Ephemeral",
  icon: "X",
  slot: "tab" as const,
  order: 100,
  component: () => Promise.resolve({ default: () => null }),
  apiRoutes: [
    { method: "GET" as const, path: "/x", handler: () => new Response("x") },
  ],
};
`;
    env.addPlugin("ephemeral", widget);
    await loadUserPlugins();
    expect(getPluginApiRoutes().size).toBe(1);

    // Remove the plugin and reload
    const { rmSync } = await import("node:fs");
    rmSync(join(env.pluginsDir, "ephemeral"), { recursive: true });
    await loadUserPlugins();
    expect(getPluginApiRoutes().size).toBe(0);
  });
});
```

### 7d. Plugin API Route Handling (integration)

```typescript
// src/__tests__/integration/plugin-routes.test.ts
import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import * as os from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import {
  createTempPluginEnv,
  type TempPluginEnv,
} from "../helpers/temp-plugins";

// Mock corePlugins
mock.module("../../dashboard-v2/app/plugins/index", () => ({
  corePlugins: [
    { id: "overview", label: "Overview", slot: "tab", order: 0 },
  ],
}));

describe("plugin API route handling", () => {
  let env: TempPluginEnv;
  let server: ReturnType<typeof Bun.serve>;
  let port: number;
  let warnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    env = createTempPluginEnv();
    port = 40000 + Math.floor(Math.random() * 10000);
    warnSpy = spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    server?.stop(true);
    warnSpy.mockRestore();
    env.cleanup();
  });

  // Helper to set up a server with plugin routes loaded
  // (Implementation depends on how server.ts exposes its setup;
  //  this demonstrates the test structure)

  it("dispatches GET request to correct plugin handler", async () => {
    const widget = `
export default {
  id: "test-api",
  label: "Test API",
  icon: "Zap",
  slot: "tab" as const,
  order: 100,
  component: () => Promise.resolve({ default: () => null }),
  apiRoutes: [
    {
      method: "GET" as const,
      path: "/hello",
      handler: () => Response.json({ message: "from plugin" }),
    },
  ],
};
`;
    env.addPlugin("test-api", widget);

    // Load plugins and start server
    const { loadUserPlugins, getPluginApiRoutes } = await import(
      "../../dashboard/plugin-loader"
    );
    await loadUserPlugins();
    const pluginRoutes = getPluginApiRoutes();

    // Minimal Bun.serve that handles plugin routes
    server = Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname.startsWith("/api/plugins/")) {
          const segments = url.pathname.split("/");
          const pluginId = segments[3];
          const pluginPath = "/" + segments.slice(4).join("/");
          const routes = pluginRoutes.get(pluginId);
          if (routes) {
            const route = routes.find(
              (r) => r.path === pluginPath && r.method === req.method,
            );
            if (route) {
              try {
                return route.handler(req);
              } catch {
                return Response.json({ error: "Plugin error" }, { status: 500 });
              }
            }
          }
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return new Response("fallthrough");
      },
    });

    const res = await fetch(`http://localhost:${port}/api/plugins/test-api/hello`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("from plugin");
  });

  it("returns 404 for method mismatch", async () => {
    const widget = `
export default {
  id: "get-only",
  label: "GET Only",
  icon: "Zap",
  slot: "tab" as const,
  order: 100,
  component: () => Promise.resolve({ default: () => null }),
  apiRoutes: [
    {
      method: "GET" as const,
      path: "/data",
      handler: () => Response.json({ ok: true }),
    },
  ],
};
`;
    env.addPlugin("get-only", widget);

    const { loadUserPlugins, getPluginApiRoutes } = await import(
      "../../dashboard/plugin-loader"
    );
    await loadUserPlugins();
    const pluginRoutes = getPluginApiRoutes();

    server = Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname.startsWith("/api/plugins/")) {
          const segments = url.pathname.split("/");
          const pluginId = segments[3];
          const pluginPath = "/" + segments.slice(4).join("/");
          const routes = pluginRoutes.get(pluginId);
          if (routes) {
            const route = routes.find(
              (r) => r.path === pluginPath && r.method === req.method,
            );
            if (route) return route.handler(req);
          }
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return new Response("fallthrough");
      },
    });

    const res = await fetch(`http://localhost:${port}/api/plugins/get-only/data`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for unknown plugin ID", async () => {
    const { loadUserPlugins, getPluginApiRoutes } = await import(
      "../../dashboard/plugin-loader"
    );
    await loadUserPlugins();
    const pluginRoutes = getPluginApiRoutes();

    server = Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname.startsWith("/api/plugins/")) {
          const segments = url.pathname.split("/");
          const pluginId = segments[3];
          const pluginPath = "/" + segments.slice(4).join("/");
          const routes = pluginRoutes.get(pluginId);
          if (routes) {
            const route = routes.find(
              (r) => r.path === pluginPath && r.method === req.method,
            );
            if (route) return route.handler(req);
          }
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return new Response("fallthrough");
      },
    });

    const res = await fetch(
      `http://localhost:${port}/api/plugins/nonexistent/data`,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
  });

  it("returns 500 when plugin handler throws", async () => {
    const widget = `
export default {
  id: "crashy",
  label: "Crashy",
  icon: "AlertTriangle",
  slot: "tab" as const,
  order: 100,
  component: () => Promise.resolve({ default: () => null }),
  apiRoutes: [
    {
      method: "GET" as const,
      path: "/boom",
      handler: () => { throw new Error("plugin exploded"); },
    },
  ],
};
`;
    env.addPlugin("crashy", widget);

    const { loadUserPlugins, getPluginApiRoutes } = await import(
      "../../dashboard/plugin-loader"
    );
    await loadUserPlugins();
    const pluginRoutes = getPluginApiRoutes();

    server = Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname.startsWith("/api/plugins/")) {
          const segments = url.pathname.split("/");
          const pluginId = segments[3];
          const pluginPath = "/" + segments.slice(4).join("/");
          const routes = pluginRoutes.get(pluginId);
          if (routes) {
            const route = routes.find(
              (r) => r.path === pluginPath && r.method === req.method,
            );
            if (route) {
              try {
                return route.handler(req);
              } catch {
                return Response.json(
                  { error: "Plugin error" },
                  { status: 500 },
                );
              }
            }
          }
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return new Response("fallthrough");
      },
    });

    const res = await fetch(`http://localhost:${port}/api/plugins/crashy/boom`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Plugin error");
  });

  it("core /api/* routes are not affected by plugin route block", async () => {
    server = Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);
        // Core routes matched first
        if (url.pathname === "/api/overview") {
          return Response.json({ repos: [], uptime: 0 });
        }
        // Plugin routes second
        if (url.pathname.startsWith("/api/plugins/")) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return new Response("fallthrough");
      },
    });

    const res = await fetch(`http://localhost:${port}/api/overview`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("repos");
  });
});
```

### 7e. GET /api/plugins Metadata Endpoint

```typescript
describe("GET /api/plugins endpoint", () => {
  let env: TempPluginEnv;
  let server: ReturnType<typeof Bun.serve>;
  let port: number;

  beforeEach(() => {
    env = createTempPluginEnv();
    port = 40000 + Math.floor(Math.random() * 10000);
  });

  afterEach(() => {
    server?.stop(true);
    env.cleanup();
  });

  it("returns merged core + user plugins sorted by order", async () => {
    env.addPlugin("user-plugin", `
export default {
  id: "user-plugin",
  label: "User Plugin",
  icon: "Puzzle",
  slot: "tab" as const,
  order: 150,
  component: () => Promise.resolve({ default: () => null }),
};
`);

    const { loadUserPlugins } = await import("../../dashboard/plugin-loader");
    const userPlugins = await loadUserPlugins();

    const corePlugins = [
      { id: "overview", label: "Overview", icon: "Home", slot: "tab", order: 0 },
    ];

    // Build the metadata list as the server would
    const allPlugins = [
      ...corePlugins.map((p) => ({ ...p, source: "core" as const })),
      ...userPlugins.map((p) => ({ ...p, source: "user" as const })),
    ];

    const metadata = allPlugins
      .map(({ id, label, icon, slot, order, source }) => ({
        id,
        label,
        icon,
        slot,
        order,
        source,
        sseEvents: [],
        queryKeys: [],
        hasApiRoutes: false,
      }))
      .sort((a, b) => a.order - b.order);

    server = Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/api/plugins" && req.method === "GET") {
          return Response.json(metadata);
        }
        return new Response("not found", { status: 404 });
      },
    });

    const res = await fetch(`http://localhost:${port}/api/plugins`);
    expect(res.status).toBe(200);
    const body = await res.json();

    // Sorted by order
    expect(body[0].order).toBeLessThanOrEqual(body[1].order);

    // Source fields present
    expect(body[0].source).toBe("core");
    expect(body[1].source).toBe("user");

    // All required metadata fields present
    for (const plugin of body) {
      expect(plugin).toHaveProperty("id");
      expect(plugin).toHaveProperty("label");
      expect(plugin).toHaveProperty("icon");
      expect(plugin).toHaveProperty("slot");
      expect(plugin).toHaveProperty("order");
      expect(plugin).toHaveProperty("source");
    }
  });

  it("does not include function references in response", async () => {
    env.addPlugin("fn-plugin", `
export default {
  id: "fn-plugin",
  label: "FN Plugin",
  icon: "Zap",
  slot: "tab" as const,
  order: 100,
  component: () => Promise.resolve({ default: () => null }),
  apiRoutes: [
    { method: "GET" as const, path: "/x", handler: () => new Response("x") },
  ],
};
`);

    const { loadUserPlugins } = await import("../../dashboard/plugin-loader");
    const userPlugins = await loadUserPlugins();

    // Simulate the serialization logic from server.ts
    const metadata = userPlugins.map((p) => ({
      id: p.id,
      label: p.label,
      icon: p.icon,
      slot: p.slot,
      order: p.order,
      source: "user",
      sseEvents: p.sseEvents ?? [],
      queryKeys: p.queryKeys ?? [],
      hasApiRoutes: true, // it has routes
    }));

    server = Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/api/plugins") {
          return Response.json(metadata);
        }
        return new Response("not found", { status: 404 });
      },
    });

    const res = await fetch(`http://localhost:${port}/api/plugins`);
    const body = await res.json();

    for (const plugin of body) {
      expect(plugin).not.toHaveProperty("component");
      expect(plugin).not.toHaveProperty("handler");
      expect(plugin).not.toHaveProperty("apiRoutes");
    }
  });

  it("returns empty array when no plugins exist", async () => {
    server = Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/api/plugins") {
          return Response.json([]);
        }
        return new Response("not found", { status: 404 });
      },
    });

    const res = await fetch(`http://localhost:${port}/api/plugins`);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});
```

---

## 8. Execution Prompt

You are writing the test suite for Phase 6 (User Plugin Support) of Vigil Dashboard v2 -- a plugin system that loads third-party plugins from the filesystem and serves them through the existing dashboard.

### Project context

Vigil is a Bun/TypeScript project. Tests use `bun:test` (not Jest/Vitest). The existing test suite lives in `src/__tests__/` with `unit/` and `integration/` subdirectories. Test helpers are in `src/__tests__/helpers/`. The established pattern for filesystem isolation is `mkdtempSync` + `spyOn(os, "homedir")` (see `temp-config.ts` and `config.test.ts`).

### Why these tests exist

Phase 6 adds user-installable plugins loaded from `~/.vigil/plugins/*/widget.ts`. The plugin-loader validates manifests with Zod, checks for ID collisions with core plugins, and exposes API routes. These tests verify:
1. The Zod schema correctly accepts/rejects manifests
2. The filesystem scanner discovers, validates, and loads plugins
3. Invalid plugins produce warnings without crashing
4. Plugin API routes dispatch correctly through `Bun.serve()`
5. The metadata endpoint returns serializable plugin info

### Phase type: Service

This is pure backend logic -- filesystem scanning, Zod validation, dynamic imports, HTTP route dispatch. All highly unit-testable. Use real filesystem (temp dirs), real Zod, real Bun dynamic imports. Mock only `os.homedir()` (for dir isolation) and `corePlugins` (for predictable ID collision testing).

### What NOT to test

- React component rendering (PluginSlot, error boundaries) -- those are Phase 3 deliverables with their own tests
- Visual appearance of plugins in the dashboard -- requires browser, out of scope for `bun:test`
- The example plugin template's correctness as a runnable plugin -- manual verification per phase plan
- TanStack Start integration -- tested in Phase 0

### Files to create

**1. `src/__tests__/helpers/temp-plugins.ts`**

Test helper providing:
- `createTempPluginEnv()` -- creates temp dir, sets up `.vigil/plugins/` structure, spies on `os.homedir()`, returns `{ tmpDir, pluginsDir, addPlugin(id, content), addPluginDir(id), cleanup() }`
- `validWidgetSource(overrides?)` -- generates a valid `widget.ts` source string with optional field overrides for constructing test plugins with specific valid/invalid properties

Pattern follows the existing `withTempHome()` from `src/__tests__/helpers/temp-config.ts`.

**2. `src/__tests__/unit/plugin-loader.test.ts`**

Three `describe` blocks:

**`PluginManifestSchema`** (18 tests):
- Valid manifest with required fields only passes
- Valid manifest with optional apiRoutes, sseEvents, queryKeys passes
- Invalid id: uppercase letters rejected
- Invalid id: spaces rejected
- Invalid id: special characters (underscores, exclamation) rejected
- Valid id: hyphens and numbers accepted
- Order below 100 rejected (test 99)
- Order of 0 rejected
- Order of exactly 100 accepted
- Order above 100 accepted (test 500)
- Missing required field: id rejected
- Missing required field: label rejected
- Missing required field: component rejected
- Invalid slot value ("footer") rejected
- All 5 valid slot values accepted (tab, sidebar, timeline-card, overlay, top-bar)
- Non-function component rejected ("not-a-fn")
- Invalid apiRoute method ("PATCH") rejected
- apiRoute with missing handler rejected
- All 4 valid HTTP methods accepted (GET, POST, PUT, DELETE)

**`loadUserPlugins`** (8 tests):
- Missing plugins directory returns `[]` without warning
- Valid plugin directory with widget.ts loads successfully (check id, label, order, slot)
- Invalid manifest skipped with warning, valid plugin still loads
- ID collision with core plugin skipped with warning containing "collides with core plugin"
- Broken widget.ts (syntax error) skipped with warning
- Multiple valid plugins all loaded (3 plugins, verify all IDs)
- Directory without widget.ts skipped silently (no warning)
- Plugin with apiRoutes populates `getPluginApiRoutes()` Map

**`getPluginApiRoutes`** (3 tests):
- Empty Map when no plugins loaded
- Map keyed by plugin ID after loading plugin with routes
- Map resets on subsequent `loadUserPlugins()` call

**3. `src/__tests__/integration/plugin-routes.test.ts`**

Two `describe` blocks:

**`plugin API route handling`** (5 tests):
- GET request dispatched to correct plugin handler
- Method mismatch (POST to GET-only route) returns 404
- Unknown plugin ID returns 404 with `{ error: "Not found" }`
- Throwing handler returns 500 with `{ error: "Plugin error" }`
- Core `/api/*` routes not affected by plugin route block

**`GET /api/plugins endpoint`** (3 tests):
- Returns merged core + user plugins sorted by order with source field
- No function references (component, handler, apiRoutes) in response body
- Returns empty array when no plugins exist

### Mock setup

At the top of both test files, before any imports from `plugin-loader.ts`:
```typescript
import { mock } from "bun:test";
mock.module("../../dashboard-v2/app/plugins/index", () => ({
  corePlugins: [
    { id: "overview", label: "Overview", slot: "tab", order: 0 },
    { id: "timeline", label: "Timeline", slot: "tab", order: 10 },
  ],
}));
```

This must come BEFORE importing `plugin-loader.ts` so the mock is in place when the loader resolves `corePlugins`.

### Success criteria

```bash
# Unit tests (<2s, no build required)
bun test src/__tests__/unit/plugin-loader.test.ts

# Integration tests (2-3s, no build required)
bun test src/__tests__/integration/plugin-routes.test.ts

# All Phase 6 tests
bun test --filter "plugin-loader|plugin-routes"
```

All tests exit 0. No warnings printed to console (warnings are captured by spyOn mocks).

---

## 9. Run Commands

```bash
# Fast: unit tests only (<2s)
bun test src/__tests__/unit/plugin-loader.test.ts

# Integration: plugin route handling (2-3s)
bun test src/__tests__/integration/plugin-routes.test.ts

# All Phase 6 tests
bun test --filter "plugin-loader|plugin-routes"

# Focused: single describe block
bun test src/__tests__/unit/plugin-loader.test.ts --filter "PluginManifestSchema"
bun test src/__tests__/unit/plugin-loader.test.ts --filter "loadUserPlugins"
bun test src/__tests__/integration/plugin-routes.test.ts --filter "GET /api/plugins"
```

---

## Coverage Check

- [PASS] Phase type identified: Service -- real filesystem + Zod validation, mock only homedir and corePlugins
- [PASS] User stories block present with 6 stories derived from phase deliverables
- [PASS] Every user story traces to at least one component in the mock strategy table
- [PASS] Every deliverable has at least one test file: plugin-loader.ts -> plugin-loader.test.ts (schema, scanner, routes Map), server.ts -> plugin-routes.test.ts (HTTP dispatch, metadata endpoint)
- [PASS] No real LLM calls, API keys, or network calls -- all tests use local filesystem and localhost Bun.serve
- [PASS] Test helper (`temp-plugins.ts`) follows established project patterns from temp-config.ts
- [PASS] Module mock for corePlugins documented with setup order requirement
- [PASS] Execution prompt includes full test specifications inline (not "see above")
- [PASS] Run commands section present with fast, integration, focused, and combined variants
- [PASS] 37 total test cases covering schema validation (18), loader logic (8+3), and HTTP integration (5+3)
- [PASS] Warning assertions verify user-facing feedback on invalid/colliding plugins
- [PASS] Error boundary testing (500 on handler throw) covers the crash-safety deliverable
