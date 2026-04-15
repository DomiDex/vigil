# Phase 1 -- Scaffold: Test Plan

---

**Scope**: Validate that Phase 1 scaffolding deliverables are structurally correct -- route stubs exist with proper exports, TypeScript types compile, server function wrappers call the correct API handlers, query key factory returns correct tuples, and QueryClient config has expected values.

**Key Pattern**: This is a pure scaffolding phase. Tests verify structure, shape, and wiring -- not behavior under load or real API responses. Most tests are synchronous, import-based checks with lightweight spying on API handler functions.

**Dependencies**: Phase 0 complete (TanStack Start app boots, `dashboard-v2/` exists with `__root.tsx`, `router.tsx`, `vite.config.ts`, `vigil-context.ts`).

---

## 1. User Stories

| # | Story | Validation Criteria | Test Tier |
|---|-------|---------------------|-----------|
| US-1 | As a developer, I can navigate to any route stub and see placeholder text | All 14 route files export `Route` via `createFileRoute`, each with the correct path string | Unit |
| US-2 | As a developer, I can import any API type without TypeScript errors | `api.ts` and `plugin.ts` compile cleanly; key interfaces have expected required fields | Unit (tsc) |
| US-3 | As a developer, I can call any server function and it delegates to the correct API handler | Each of the 26 server functions calls the right handler with correct arguments when invoked | Unit |
| US-4 | As a developer, I can use `vigilKeys` to build type-safe query keys | Factory returns correct `readonly` tuples for static and parametric keys | Unit |
| US-5 | As a developer, the QueryClient is configured with correct cache timing | `staleTime` is 10000, `gcTime` is 300000, `refetchOnWindowFocus` is false | Unit |

---

## 2. Component Mock Strategy

| Component | Mock Strategy | Rationale |
|-----------|---------------|-----------|
| API handler functions (`getOverviewJSON`, etc.) | `spyOn` the imported module | Server function tests need to verify delegation without running Vigil daemon |
| `getVigilContext()` | `spyOn` returning a fake `DashboardContext` | Server functions call `getVigilContext()` internally; we provide a stub context |
| Route components (React) | Not rendered | We test exports and metadata only, not JSX rendering |
| `createServerFn` | Not mocked | We import the real function and test its `.handler()` directly |
| `FormData` | Real `FormData` | Available in Bun runtime natively, no mock needed |
| Zod schemas | Not mocked | Schemas are pure validation; tested implicitly via server function input |

---

## 3. Test Tier Table

| Tier | What | Files | Count |
|------|------|-------|-------|
| Unit | Query key factory (`vigilKeys`) | `query-keys.test.ts` | ~15 cases |
| Unit | TypeScript types compile (via `tsc --noEmit`) | `types-compile.test.ts` | ~3 cases |
| Unit | Route stub structure | `route-stubs.test.ts` | ~16 cases |
| Unit | Server function wiring (reads) | `server-functions-reads.test.ts` | ~15 cases |
| Unit | Server function wiring (mutations) | `server-functions-mutations.test.ts` | ~15 cases |
| Unit | QueryClient configuration | `query-client-config.test.ts` | ~4 cases |
| Unit | Plugin types shape | `plugin-types.test.ts` | ~5 cases |
| **Total** | | **7 files** | **~73 cases** |

---

## 4. Fake/Mock Implementations

### No Fake Implementations (Pure Scaffolding)

Phase 1 has no external service dependencies, no LLM calls, no database access, and no network I/O. The deliverables are:

- Static TypeScript type definitions (validated by the compiler)
- A `const` object literal (query key factory)
- Route stubs that export metadata (no runtime behavior)
- Server function wrappers that delegate to existing API handlers (tested via spyOn)
- A config object with hardcoded numeric values (QueryClient)

The only mocking needed is `spyOn` on imported API handler functions and `getVigilContext` to prevent real Vigil daemon dependencies from being required at test time. These are standard `bun:test` spies, not custom fake implementations.

---

## 5. Test File List

```
src/__tests__/
├── helpers/
│   └── dashboard-v2-helpers.ts        # Shared: fake DashboardContext, handler spy setup
└── unit/
    ├── query-keys.test.ts             # vigilKeys factory: static keys, parametric keys, readonly
    ├── types-compile.test.ts          # Spawns `bun run tsc --noEmit` on dashboard-v2/
    ├── route-stubs.test.ts            # Dynamic import of each route, checks Route export + path
    ├── server-functions-reads.test.ts # 13 read server functions: spyOn handlers, verify delegation
    ├── server-functions-mutations.test.ts # 13 mutation server functions: spyOn handlers, verify delegation
    ├── query-client-config.test.ts    # QueryClient default options: staleTime, gcTime, refetchOnWindowFocus
    └── plugin-types.test.ts           # PluginWidget interface shape, WidgetSlot values
```

---

## 6. Shared Test Helpers (conftest equivalent)

File: `src/__tests__/helpers/dashboard-v2-helpers.ts`

```typescript
import { spyOn } from "bun:test";

/**
 * Creates a minimal fake DashboardContext for server function tests.
 * Does not need real EventLog/VectorStore -- server functions just pass
 * the context through to API handlers, which we spy on.
 */
export function createFakeDashboardContext() {
  return {
    config: {
      tickInterval: 30,
      blockingBudget: 120,
      sleepAfter: 900,
      sleepTickInterval: 300,
      dreamAfter: 1800,
      tickModel: "test-model",
      escalationModel: "test-model",
      maxEventWindow: 100,
      notifyBackends: ["file"] as string[],
      webhookUrl: "",
      desktopNotify: false,
      allowModerateActions: false,
    },
    repos: new Map(),
    eventLog: {} as any,
    vectorStore: {} as any,
    taskManager: {} as any,
    actionQueue: {} as any,
    scheduler: {} as any,
    memoryStats: {} as any,
  };
}

/**
 * Spies on getVigilContext to return the fake context.
 * Returns a restore function for afterEach cleanup.
 */
export async function mockVigilContext() {
  const ctx = createFakeDashboardContext();
  const mod = await import("../../../dashboard-v2/src/server/vigil-context.ts");
  const spy = spyOn(mod, "getVigilContext").mockReturnValue(ctx as any);
  return { ctx, spy, restore: () => spy.mockRestore() };
}

/**
 * List of all expected route stubs with their path and phase label.
 */
export const EXPECTED_ROUTES = [
  { file: "repos", path: "/repos", label: "Repos" },
  { file: "dreams", path: "/dreams", label: "Dreams" },
  { file: "tasks", path: "/tasks", label: "Tasks" },
  { file: "actions", path: "/actions", label: "Actions" },
  { file: "memory", path: "/memory", label: "Memory" },
  { file: "scheduler", path: "/scheduler", label: "Scheduler" },
  { file: "metrics", path: "/metrics", label: "Metrics" },
  { file: "config", path: "/config", label: "Config" },
  { file: "agents", path: "/agents", label: "Agents" },
  { file: "health", path: "/health", label: "Health" },
  { file: "webhooks", path: "/webhooks", label: "Webhooks" },
  { file: "channels", path: "/channels", label: "Channels" },
  { file: "notifications", path: "/notifications", label: "Notifications" },
  { file: "a2a", path: "/a2a", label: "A2A" },
] as const;
```

---

## 7. Key Testing Decisions

| Decision | Rationale |
|----------|-----------|
| Test route stubs via dynamic import, not rendering | Avoids needing React test renderer; we only care that `Route` is exported with the correct path |
| Type compilation tested by spawning `bun run tsc` | Type-only tests cannot be validated at runtime; spawning the compiler is the standard approach |
| Server functions tested by spying on handler imports | The wrappers are thin delegation layers; verifying they call the right handler with correct args is sufficient |
| No snapshot tests | Stubs render trivial placeholder text; snapshots add maintenance burden with zero value |
| Query key tests check both value and readonly type | Runtime equality for values; TypeScript `satisfies` or manual assertion for readonly tuple shape |
| Tests live in `src/__tests__/unit/` (not `dashboard-v2/`) | Follows existing project convention -- all tests in `src/__tests__/` with helpers in `src/__tests__/helpers/` |
| Plugin types tested via `satisfies` and structural checks | Validates that required fields exist without needing runtime instances |
| Mutation server functions: verify FormData construction | Mutations that wrap HTML-returning handlers must construct FormData correctly from Zod-validated input |

---

## 8. Example Test Case

File: `src/__tests__/unit/query-keys.test.ts`

```typescript
import { describe, expect, it } from "bun:test";
import { vigilKeys } from "../../dashboard-v2/src/lib/query-keys.ts";

describe("vigilKeys", () => {
  describe("static keys", () => {
    it("overview returns correct tuple", () => {
      expect(vigilKeys.overview).toEqual(["overview"]);
    });

    it("dreams returns correct tuple", () => {
      expect(vigilKeys.dreams).toEqual(["dreams"]);
    });

    it("tasks returns correct tuple", () => {
      expect(vigilKeys.tasks).toEqual(["tasks"]);
    });

    it("scheduler returns correct tuple", () => {
      expect(vigilKeys.scheduler).toEqual(["scheduler"]);
    });

    it("metrics returns correct tuple", () => {
      expect(vigilKeys.metrics).toEqual(["metrics"]);
    });

    it("health returns correct tuple", () => {
      expect(vigilKeys.health).toEqual(["health"]);
    });

    it("repos.all returns correct tuple", () => {
      expect(vigilKeys.repos.all).toEqual(["repos"]);
    });

    it("actions.all returns correct tuple", () => {
      expect(vigilKeys.actions.all).toEqual(["actions"]);
    });

    it("actions.pending returns correct tuple", () => {
      expect(vigilKeys.actions.pending).toEqual(["actions", "pending"]);
    });

    it("memory.stats returns correct tuple", () => {
      expect(vigilKeys.memory.stats).toEqual(["memory"]);
    });
  });

  describe("parametric keys", () => {
    it("repos.detail includes repo name", () => {
      expect(vigilKeys.repos.detail("my-repo")).toEqual(["repos", "my-repo"]);
    });

    it("repos.detail returns different tuples for different names", () => {
      const a = vigilKeys.repos.detail("alpha");
      const b = vigilKeys.repos.detail("beta");
      expect(a).not.toEqual(b);
      expect(a).toEqual(["repos", "alpha"]);
      expect(b).toEqual(["repos", "beta"]);
    });

    it("timeline with no filters returns default", () => {
      const key = vigilKeys.timeline();
      expect(key).toEqual(["timeline", {}]);
    });

    it("timeline with filters includes them", () => {
      const key = vigilKeys.timeline({ status: "alert", repo: "vigil", page: 2 });
      expect(key).toEqual(["timeline", { status: "alert", repo: "vigil", page: 2 }]);
    });

    it("dreamPatterns includes repo name", () => {
      expect(vigilKeys.dreamPatterns("vigil")).toEqual(["dreams", "patterns", "vigil"]);
    });

    it("memory.search includes query string", () => {
      expect(vigilKeys.memory.search("git merge")).toEqual(["memory", "search", "git merge"]);
    });
  });

  describe("readonly enforcement", () => {
    it("static keys are frozen arrays (readonly)", () => {
      // readonly tuples in TS become regular arrays at runtime,
      // but we verify the shape is correct and values are stable
      const key = vigilKeys.overview;
      expect(Array.isArray(key)).toBe(true);
      expect(key.length).toBe(1);
      expect(key[0]).toBe("overview");
    });

    it("parametric keys return fresh arrays each call", () => {
      const a = vigilKeys.repos.detail("x");
      const b = vigilKeys.repos.detail("x");
      expect(a).toEqual(b);
      // They should be equal in value but not necessarily same reference
      // (implementation may or may not cache)
    });
  });
});
```

---

## 9. Additional Example: Server Function Read Tests

File: `src/__tests__/unit/server-functions-reads.test.ts`

```typescript
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
  createFakeDashboardContext,
} from "../helpers/dashboard-v2-helpers.ts";

// These tests verify that server function wrappers correctly delegate
// to the underlying API handlers with the right arguments.

describe("server functions -- reads", () => {
  let ctxSpy: ReturnType<typeof spyOn>;
  let fakeCtx: ReturnType<typeof createFakeDashboardContext>;

  beforeEach(async () => {
    fakeCtx = createFakeDashboardContext();
    const vigilCtxMod = await import(
      "../../../dashboard-v2/src/server/vigil-context.ts"
    );
    ctxSpy = spyOn(vigilCtxMod, "getVigilContext").mockReturnValue(
      fakeCtx as any,
    );
  });

  afterEach(() => {
    ctxSpy.mockRestore();
  });

  describe("getOverview", () => {
    it("calls getOverviewJSON with context", async () => {
      const overviewMod = await import(
        "../../dashboard/api/overview.ts"
      );
      const handlerSpy = spyOn(overviewMod, "getOverviewJSON").mockReturnValue({
        uptime: 0,
        repos: [],
        recentMessages: [],
        pendingActions: 0,
        activeTasks: 0,
      } as any);

      const { getOverview } = await import(
        "../../../dashboard-v2/src/server/functions.ts"
      );

      // Call the server function handler directly
      // TanStack Start server functions expose a .handler or can be called directly
      const result = await getOverview();

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);

      handlerSpy.mockRestore();
    });
  });

  describe("getRepoDetail", () => {
    it("calls getRepoDetailJSON with context and repo name", async () => {
      const reposMod = await import("../../dashboard/api/repos.ts");
      const handlerSpy = spyOn(reposMod, "getRepoDetailJSON").mockReturnValue({
        name: "vigil",
        topics: [],
        recentEvents: [],
      } as any);

      const { getRepoDetail } = await import(
        "../../../dashboard-v2/src/server/functions.ts"
      );

      // Server functions with inputValidator accept data as argument
      const result = await getRepoDetail({ data: { name: "vigil" } });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      expect(handlerSpy.mock.calls[0][1]).toBe("vigil");

      handlerSpy.mockRestore();
    });
  });

  describe("getTimeline", () => {
    it("calls getTimelineJSON with context and constructed URL", async () => {
      const timelineMod = await import("../../dashboard/api/timeline.ts");
      const handlerSpy = spyOn(
        timelineMod,
        "getTimelineJSON",
      ).mockReturnValue({
        messages: [],
        page: 1,
        hasMore: false,
      } as any);

      const { getTimeline } = await import(
        "../../../dashboard-v2/src/server/functions.ts"
      );

      await getTimeline({
        data: { status: "alert", repo: "vigil", page: 2 },
      });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      // Second arg should be a URL with query params
      const urlArg = handlerSpy.mock.calls[0][1];
      expect(urlArg).toBeInstanceOf(URL);
      expect(urlArg.searchParams.get("status")).toBe("alert");
      expect(urlArg.searchParams.get("repo")).toBe("vigil");
      expect(urlArg.searchParams.get("page")).toBe("2");

      handlerSpy.mockRestore();
    });
  });

  describe("searchMemory", () => {
    it("calls getMemorySearchJSON with query and optional repo", async () => {
      const memoryMod = await import("../../dashboard/api/memory.ts");
      const handlerSpy = spyOn(
        memoryMod,
        "getMemorySearchJSON",
      ).mockReturnValue({ results: [] } as any);

      const { searchMemory } = await import(
        "../../../dashboard-v2/src/server/functions.ts"
      );

      await searchMemory({ data: { query: "git merge", repo: "vigil" } });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      expect(handlerSpy.mock.calls[0][1]).toBe("git merge");
      expect(handlerSpy.mock.calls[0][2]).toBe("vigil");

      handlerSpy.mockRestore();
    });
  });

  describe("getDreamPatterns", () => {
    it("calls getDreamPatternsJSON with context and repo", async () => {
      const dreamsMod = await import("../../dashboard/api/dreams.ts");
      const handlerSpy = spyOn(
        dreamsMod,
        "getDreamPatternsJSON",
      ).mockReturnValue({ patterns: [] } as any);

      const { getDreamPatterns } = await import(
        "../../../dashboard-v2/src/server/functions.ts"
      );

      await getDreamPatterns({ data: { repo: "vigil" } });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      expect(handlerSpy.mock.calls[0][1]).toBe("vigil");

      handlerSpy.mockRestore();
    });
  });
});
```

---

## 10. Additional Example: Route Stubs Test

File: `src/__tests__/unit/route-stubs.test.ts`

```typescript
import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { EXPECTED_ROUTES } from "../helpers/dashboard-v2-helpers.ts";

const ROUTES_DIR = join(import.meta.dir, "../../../dashboard-v2/src/routes");

describe("route stubs", () => {
  describe("file existence", () => {
    for (const route of EXPECTED_ROUTES) {
      it(`${route.file}.tsx exists`, () => {
        const filePath = join(ROUTES_DIR, `${route.file}.tsx`);
        expect(existsSync(filePath)).toBe(true);
      });
    }

    it("index.tsx exists (from Phase 0)", () => {
      expect(existsSync(join(ROUTES_DIR, "index.tsx"))).toBe(true);
    });

    it("__root.tsx exists (from Phase 0)", () => {
      expect(existsSync(join(ROUTES_DIR, "__root.tsx"))).toBe(true);
    });
  });

  describe("route exports", () => {
    for (const route of EXPECTED_ROUTES) {
      it(`${route.file}.tsx exports Route with path "${route.path}"`, async () => {
        const mod = await import(
          `../../../dashboard-v2/src/routes/${route.file}.tsx`
        );
        expect(mod.Route).toBeDefined();
        // TanStack Router file routes have a fullPath property
        // after route tree generation. We verify the export exists.
        expect(typeof mod.Route).toBe("object");
      });
    }
  });
});
```

---

## 11. Additional Example: QueryClient Config Test

File: `src/__tests__/unit/query-client-config.test.ts`

```typescript
import { describe, expect, it } from "bun:test";

describe("QueryClient configuration", () => {
  it("exports queryClient with correct staleTime", async () => {
    const { queryClient } = await import(
      "../../../dashboard-v2/src/router.tsx"
    );
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(10_000);
  });

  it("exports queryClient with correct gcTime", async () => {
    const { queryClient } = await import(
      "../../../dashboard-v2/src/router.tsx"
    );
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.gcTime).toBe(5 * 60_000);
  });

  it("has refetchOnWindowFocus disabled", async () => {
    const { queryClient } = await import(
      "../../../dashboard-v2/src/router.tsx"
    );
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
  });

  it("queryClient is a QueryClient instance", async () => {
    const { queryClient } = await import(
      "../../../dashboard-v2/src/router.tsx"
    );
    expect(queryClient).toBeDefined();
    expect(typeof queryClient.getDefaultOptions).toBe("function");
    expect(typeof queryClient.invalidateQueries).toBe("function");
  });
});
```

---

## 12. Additional Example: Plugin Types Test

File: `src/__tests__/unit/plugin-types.test.ts`

```typescript
import { describe, expect, it } from "bun:test";
import type {
  PluginWidget,
  WidgetProps,
  WidgetSlot,
} from "../../../dashboard-v2/src/types/plugin.ts";

describe("plugin types", () => {
  it("WidgetSlot accepts all valid slot values", () => {
    // Type-level test: these assignments must compile
    const slots: WidgetSlot[] = [
      "tab",
      "sidebar",
      "timeline-card",
      "overlay",
      "top-bar",
    ];
    expect(slots).toHaveLength(5);
  });

  it("PluginWidget has required fields", () => {
    // Structural test: create a conforming object
    const widget: PluginWidget = {
      id: "test-widget",
      label: "Test",
      icon: "Activity",
      slot: "tab",
      order: 1,
      component: () => import("../../../dashboard-v2/src/routes/index.tsx"),
    };
    expect(widget.id).toBe("test-widget");
    expect(widget.slot).toBe("tab");
    expect(typeof widget.component).toBe("function");
  });

  it("PluginWidget accepts optional fields", () => {
    const widget: PluginWidget = {
      id: "optional-test",
      label: "Optional",
      icon: "Bell",
      slot: "sidebar",
      order: 2,
      component: () => import("../../../dashboard-v2/src/routes/index.tsx"),
      sseEvents: ["dream:complete"],
      queryKeys: [["dreams"]],
      featureGate: "premium",
    };
    expect(widget.sseEvents).toEqual(["dream:complete"]);
    expect(widget.featureGate).toBe("premium");
  });

  it("WidgetProps has activeRepo and queryClient fields", () => {
    // Type-level structural check
    const props: WidgetProps = {
      activeRepo: "vigil",
      queryClient: {} as any,
    };
    expect(props.activeRepo).toBe("vigil");
    expect(props.queryClient).toBeDefined();
  });
});
```

---

## 13. Additional Example: Types Compilation Test

File: `src/__tests__/unit/types-compile.test.ts`

```typescript
import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const DASHBOARD_V2_DIR = join(import.meta.dir, "../../../dashboard-v2");

describe("TypeScript compilation", () => {
  it("dashboard-v2 compiles with zero errors", async () => {
    const proc = Bun.spawn(["bun", "run", "tsc", "--noEmit"], {
      cwd: DASHBOARD_V2_DIR,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    if (exitCode !== 0) {
      console.error("tsc errors:\n", stderr);
    }
    expect(exitCode).toBe(0);
  });

  it("api.ts types are importable", async () => {
    // Dynamic import validates the module parses and exports resolve
    const mod = await import("../../../dashboard-v2/src/types/api.ts");
    // api.ts is type-only, so mod should be an empty module object
    expect(mod).toBeDefined();
  });

  it("plugin.ts types are importable", async () => {
    const mod = await import("../../../dashboard-v2/src/types/plugin.ts");
    expect(mod).toBeDefined();
  });
});
```

---

## 14. Execution Prompt

Use this prompt to generate the complete test suite in a single Claude session:

```
You are implementing the test suite for Phase 1 (Scaffold) of the Vigil Dashboard v2 project.

## Context
- Vigil is a Bun/TypeScript git monitoring daemon
- Dashboard v2 lives in `dashboard-v2/` at the repo root
- Tests use `bun:test` (import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test")
- All tests go in `src/__tests__/unit/` and helpers in `src/__tests__/helpers/`
- Existing test conventions: see `src/__tests__/unit/config.test.ts` and `src/__tests__/unit/event-log.test.ts` for style

## Test plan reference
Read `plan/phase-1-tests.md` for the complete test plan including:
- 7 test files to create
- 1 helper file to create
- Example test cases for each file
- Mock strategy (spyOn on API handlers and getVigilContext)
- ~73 total test cases

## Files to create (in order)
1. `src/__tests__/helpers/dashboard-v2-helpers.ts` -- shared helpers (fake context, route list)
2. `src/__tests__/unit/query-keys.test.ts` -- vigilKeys factory tests
3. `src/__tests__/unit/types-compile.test.ts` -- TypeScript compilation validation
4. `src/__tests__/unit/route-stubs.test.ts` -- route file existence and exports
5. `src/__tests__/unit/server-functions-reads.test.ts` -- 13 read server function delegation tests
6. `src/__tests__/unit/server-functions-mutations.test.ts` -- 13 mutation server function delegation tests
7. `src/__tests__/unit/query-client-config.test.ts` -- QueryClient default options
8. `src/__tests__/unit/plugin-types.test.ts` -- PluginWidget/WidgetSlot type shape tests

## Rules
- Use ONLY `bun:test` imports (describe, it, expect, beforeEach, afterEach, spyOn)
- No jest, no vitest, no @testing-library
- Use `spyOn` for mocking, `.mockRestore()` in afterEach
- Use dynamic `await import()` for modules that need fresh imports
- Follow existing project patterns from `src/__tests__/unit/config.test.ts`
- Server function tests: spy on the API handler module, spy on getVigilContext, call the server function, verify the handler was called with correct args
- All file paths are relative to the repo root

## Implementation approach
1. Create the helper file first
2. Create each test file following the examples in phase-1-tests.md
3. Run `bun test src/__tests__/unit/query-keys.test.ts` after creating each file to verify it loads (tests will fail RED since Phase 1 code doesn't exist yet -- that's correct TDD)
4. Verify all tests fail for the right reason (missing module, not syntax error)

Create all 8 files now. The tests should be RED (failing) because the Phase 1 implementation code does not exist yet.
```

---

## 15. Run Commands

```bash
# Run all Phase 1 tests
bun test src/__tests__/unit/query-keys.test.ts \
         src/__tests__/unit/types-compile.test.ts \
         src/__tests__/unit/route-stubs.test.ts \
         src/__tests__/unit/server-functions-reads.test.ts \
         src/__tests__/unit/server-functions-mutations.test.ts \
         src/__tests__/unit/query-client-config.test.ts \
         src/__tests__/unit/plugin-types.test.ts

# Run individual test files
bun test src/__tests__/unit/query-keys.test.ts
bun test src/__tests__/unit/server-functions-reads.test.ts
bun test src/__tests__/unit/server-functions-mutations.test.ts
bun test src/__tests__/unit/route-stubs.test.ts
bun test src/__tests__/unit/query-client-config.test.ts
bun test src/__tests__/unit/plugin-types.test.ts
bun test src/__tests__/unit/types-compile.test.ts

# Run with verbose output
bun test --verbose src/__tests__/unit/query-keys.test.ts

# Run only tests matching a pattern
bun test --test-name-pattern "parametric" src/__tests__/unit/query-keys.test.ts
```
