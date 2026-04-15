# Phase 0 — Validation Spike: Test Plan

---
scope: Prove TanStack Start + Bun.serve() embedding, server function singleton, Tailwind v4 + shadcn/ui pipeline
key_pattern: Research/validation — the real dependencies ARE what's being tested; no fakes for the spike targets
dependencies: bun:test (existing), existing createMockDaemon() in dashboard.test.ts
---

**Phase type: Research / Validation.** The entire point of Phase 0 is to prove that real TanStack Start, real Nitro, and real Tailwind v4 work together. Faking these would defeat the purpose. Tests validate the integration outputs (build artifacts, HTTP responses, module behavior), not mock replacements.

---

## User Stories

| # | User Story | Validation Check | Pass Condition |
|---|-----------|-----------------|----------------|
| US-1 | As a developer, I want the TanStack Start build to produce a handler I can embed in Bun.serve(), so that the dashboard serves from a single port | `spike-embed.test.ts` TestHandlerEmbedding | Built handler responds with HTML containing SSR'd data on a test port; `/api/overview` returns JSON on same port |
| US-2 | As a developer, I want server functions to access Vigil internals via a module-level singleton, so that SSR can render live daemon data | `vigil-context.test.ts` TestVigilContext | `getVigilContext()` returns the context set by `setVigilContext()`; throws before initialization |
| US-3 | As a developer, I want Tailwind v4 @theme tokens to compile into valid CSS, so that Vigil's design system works in the new stack | `tailwind-theme.test.ts` TestThemeTokens | Built CSS output contains `--color-vigil` and `--color-background` as valid CSS custom properties |
| US-4 | As a developer, I want the existing JSON API to remain unchanged after embedding the new handler, so that nothing breaks during migration | `spike-embed.test.ts` TestBackwardCompat | All existing `/api/*` endpoints return identical response shapes |
| US-5 | As a developer, I want the `cn()` utility to correctly merge Tailwind classes, so that shadcn/ui components compose properly | `cn-utility.test.ts` TestCn | `cn("p-4 p-2")` returns `"p-2"`, conflicting classes resolved correctly |

---

## 1. Component Mock Strategy Table

| Component | Mock/Fake | What to Assert | User Story |
|---|---|---|---|
| `vigil-context.ts` singleton | None — test the real module | `setVigilContext()` stores, `getVigilContext()` retrieves, throws when unset | US-2 |
| `cn()` utility | None — pure function | Class merging, conflict resolution, falsy filtering | US-5 |
| Tailwind v4 build output | None — test the real CSS build | `@theme` tokens appear as CSS custom properties in compiled output | US-3 |
| TanStack Start build handler | None — test the real build artifact | Handler export exists, returns Response for non-API paths | US-1 |
| Existing dashboard API | Reuse `createMockDaemon()` from `dashboard.test.ts` | `/api/overview`, `/api/repos` still return JSON with expected shape | US-4 |
| `Bun.serve()` embedding | Real Bun.serve on random port | Single port serves both React handler and API routes | US-1, US-4 |

---

## 2. Test Tier Table

| Tier | Tests | Dependencies | Speed | When to Run |
|---|---|---|---|---|
| **Unit** | `vigil-context.test.ts`, `cn-utility.test.ts` | None (pure module imports) | <1s | Every run (`bun test`) |
| **Integration** | `spike-embed.test.ts`, `tailwind-theme.test.ts` | Requires prior `bun run build` in `dashboard-v2/`, real Bun.serve | 2-5s | After build (`bun test --filter spike`) |

---

## 3. No Fake Implementations (Research Phase)

This is a validation spike. The entire purpose is to test that real TanStack Start, real Nitro build output, and real Tailwind v4 CSS compilation work as expected. Introducing fakes for these would invalidate the spike. The only mock reused is the existing `createMockDaemon()` from `src/__tests__/integration/dashboard.test.ts`, which mocks the Vigil Daemon (not the spike targets).

---

## 4. Test File List

```
src/__tests__/
├── unit/
│   ├── vigil-context.test.ts        # Singleton set/get/throw behavior (US-2)
│   └── cn-utility.test.ts           # Tailwind class merge utility (US-5)
└── integration/
    ├── spike-embed.test.ts          # Handler embedding + backward compat (US-1, US-4)
    └── tailwind-theme.test.ts       # CSS build output contains @theme tokens (US-3)
```

---

## 5. Test Setup

Additions to existing test infrastructure (no conftest.py — this is Bun/TypeScript using `bun:test`).

### Shared helper: `createMockDaemon()`

Already exists in `src/__tests__/integration/dashboard.test.ts` (lines 10-120). Extract it to `src/__tests__/helpers/mock-daemon.ts` for reuse across Phase 0 tests and future dashboard tests. The existing `dashboard.test.ts` should import from the shared helper.

```typescript
// src/__tests__/helpers/mock-daemon.ts
// Move createMockDaemon() from dashboard.test.ts to here
// Export for reuse in spike-embed.test.ts and future phases
export function createMockDaemon() { /* existing implementation */ }
```

### Build prerequisite for integration tests

Integration tests (`spike-embed.test.ts`, `tailwind-theme.test.ts`) require a prior build:
```bash
cd dashboard-v2 && bun run build
```

Tests should check for `.output/server/` existence and skip with a clear message if not found, rather than failing cryptically.

---

## 6. Key Testing Decisions

| Decision | Approach | Rationale |
|---|---|---|
| No mocking of TanStack Start or Nitro | Test the real build artifacts | Phase 0 IS the validation — faking defeats the purpose |
| Reuse existing `createMockDaemon()` | Extract to shared helper, import in both old and new tests | Mock daemon already proven correct in 40+ existing dashboard tests |
| Integration tests require prior build | Skip with message if `.output/` missing | Avoid coupling test runner to build step; CI can run build first |
| Random port for Bun.serve tests | `40000 + Math.floor(Math.random() * 10000)` | Matches existing pattern in `dashboard.test.ts`, avoids port conflicts |
| Test CSS output as string, not visual | Read compiled CSS file and check for token strings | Visual rendering tests need a browser; string checks are fast and sufficient for the spike |
| `cn()` tested as pure function | Direct import, parametrized inputs | No DOM or React needed — it's just `twMerge(clsx(...))` |

---

## 7. Example Test Case

```typescript
// src/__tests__/unit/vigil-context.test.ts
import { describe, test, expect, beforeEach } from "bun:test";

// Import the real module — no mocks
// Note: exact import path depends on Phase 0 implementation
import {
  setVigilContext,
  getVigilContext,
} from "../../dashboard/app/app/server/vigil-context";

describe("vigil-context singleton", () => {
  beforeEach(() => {
    // Reset module state between tests by setting to null
    // This tests the "uninitialized" path
    try {
      // @ts-expect-error — accessing private reset for testing
      setVigilContext(null as any);
    } catch {
      // ignore if already null
    }
  });

  test("throws when context not initialized", () => {
    // Reset by reimporting or test isolation
    // The real test: calling getVigilContext() before setVigilContext()
    // should throw with a clear error message
    expect(() => getVigilContext()).toThrow("Vigil context not initialized");
  });

  test("returns context after initialization", () => {
    const mockCtx = {
      daemon: {
        repoPaths: ["/tmp/test-repo"],
        tickEngine: { currentTick: 42, isSleeping: false },
      },
      sse: { broadcast: () => {}, clientCount: 0, connect: () => new Response() },
    } as any;

    setVigilContext(mockCtx);
    const result = getVigilContext();

    expect(result).toBe(mockCtx);
    expect(result.daemon.repoPaths).toHaveLength(1);
    expect(result.daemon.tickEngine.currentTick).toBe(42);
  });

  test("overwrites previous context on re-set", () => {
    const ctx1 = { daemon: { repoPaths: ["/a"] }, sse: {} } as any;
    const ctx2 = { daemon: { repoPaths: ["/b", "/c"] }, sse: {} } as any;

    setVigilContext(ctx1);
    expect(getVigilContext().daemon.repoPaths).toHaveLength(1);

    setVigilContext(ctx2);
    expect(getVigilContext().daemon.repoPaths).toHaveLength(2);
    expect(getVigilContext()).toBe(ctx2);
  });
});
```

---

## 8. Execution Prompt

You are writing the test suite for Phase 0 (Validation Spike) of Vigil Dashboard v2 — a TanStack Start + React rewrite of an existing HTMX dashboard.

### Project context

Vigil is a Bun/TypeScript project. Tests use `bun:test` (not Jest/Vitest). The existing test suite lives in `src/__tests__/` with `unit/` and `integration/` subdirectories. Test helpers are in `src/__tests__/helpers/`.

### Why these tests exist

Phase 0 is a validation spike proving three things:
1. TanStack Start's production build handler can embed into Vigil's existing `Bun.serve()`
2. Server functions can access a module-level DashboardContext singleton
3. Tailwind v4 `@theme` tokens + shadcn/ui components build correctly in the Vite pipeline

These tests automate the manual verification steps from the phase plan so they can run in CI.

### Phase type: Research/Validation

The real dependencies ARE what's being tested. Do NOT mock TanStack Start, Nitro, Tailwind, or shadcn. The only mock is the existing `createMockDaemon()` for the Vigil Daemon (so tests don't need a real git watcher running).

### What NOT to test

- Visual rendering (colors, layout) — requires a browser, out of scope for `bun:test`
- shadcn/ui component behavior (Button click, Card rendering) — these are vendored copies of proven Radix components
- TanStack Router navigation — not wired up yet in Phase 0
- SSE streaming — already tested in existing `dashboard.test.ts`

### Files to create

**1. `src/__tests__/helpers/mock-daemon.ts`**
Extract the existing `createMockDaemon()` function from `src/__tests__/integration/dashboard.test.ts` (lines 10-120) into a shared helper. The function creates a minimal mock daemon with:
- `config` with tick/sleep intervals and model names
- `repoPaths` array
- `messageRouter` (real MessageRouter instance)
- `vectorStore` with stub `search()`, `getByRepo()`, `getRepoProfile()`
- `eventLog` with stub `query()`
- `metrics` with stub `getSummary()`, `getTimeSeries()`, `getRawMetrics()`, `getMetricNames()`
- `userReply` with `pendingReplies` array and `drain()`
- `gitWatcher` with stub `getRepoState()`
- `tickEngine` with `currentTick: 42`, `isSleeping: false`, `lastTickAt`, `onTick()`
- `session` with `id`, `startedAt`, `tickCount`

Update `src/__tests__/integration/dashboard.test.ts` to import from the shared helper instead of defining inline.

**2. `src/__tests__/unit/vigil-context.test.ts`**
Tests for the module-level singleton (`dashboard-v2/src/server/vigil-context.ts`):
- `throws when context not initialized` — `getVigilContext()` before `setVigilContext()` throws "Vigil context not initialized"
- `returns context after initialization` — set a mock context, verify `getVigilContext()` returns the same object
- `overwrites previous context on re-set` — set twice, verify second context is returned

Note on module isolation: `bun:test` may cache module state between tests. If `beforeEach` reset is needed, call `setVigilContext(null as any)` to clear state (the real function accepts any DashboardContext, but null triggers the throw path on next get).

**3. `src/__tests__/unit/cn-utility.test.ts`**
Tests for `cn()` utility (`dashboard-v2/src/lib/cn.ts`):
- `merges class strings` — `cn("p-4", "m-2")` → `"p-4 m-2"`
- `resolves Tailwind conflicts (last wins)` — `cn("p-4", "p-2")` → `"p-2"`
- `handles conditional classes` — `cn("base", false && "hidden", "visible")` → `"base visible"`
- `handles undefined and null inputs` — `cn("a", undefined, null, "b")` → `"a b"`
- `handles empty string` — `cn("")` → `""`
- `merges complex Tailwind conflicts` — `cn("text-red-500 hover:text-blue-500", "text-green-300")` → last color wins

**4. `src/__tests__/integration/spike-embed.test.ts`**
Integration test requiring prior `bun run build` in `dashboard-v2/`:

Setup:
```typescript
import { existsSync } from "node:fs";
const BUILD_DIR = join(import.meta.dir, "../../dashboard/app/.output/server");
const buildExists = existsSync(BUILD_DIR);

describe.skipIf(!buildExists)("spike handler embedding", () => { ... });
```

Tests:
- `build output exists` — `.output/server/` directory contains a server entry file
- `handler exports a fetch function` — dynamic import of the handler module, verify `default` has a `fetch` method
- `embedded handler serves HTML for root path` — start `Bun.serve()` with both the handler and mock API routes on a random port, `fetch("/")` returns HTML
- `existing API routes still work` — same server, `fetch("/api/overview")` returns JSON with expected fields (`repos`, `uptime`, `tickCount`)
- `API routes take priority over handler` — requests to `/api/*` never reach the TanStack handler

Server setup pattern (matches existing dashboard tests):
```typescript
let server: ReturnType<typeof Bun.serve>;
let port: number;

beforeEach(() => {
  port = 40000 + Math.floor(Math.random() * 10000);
});
afterEach(() => { server?.stop(true); });
```

Use `createMockDaemon()` from `src/__tests__/helpers/mock-daemon.ts` and `startDashboard()` from `src/dashboard/server.ts`.

**5. `src/__tests__/integration/tailwind-theme.test.ts`**
Integration test checking Tailwind v4 build output:

Setup: Same `describe.skipIf(!buildExists)` guard as spike-embed.

Tests:
- `app.css contains @theme tokens` — read `dashboard-v2/src/app.css`, verify it contains `--color-vigil`, `--color-background`, `--color-surface`
- `compiled CSS output contains custom properties` — find compiled CSS in `.output/` (glob for `*.css`), verify the Vigil theme tokens appear as CSS custom property declarations
- `no external CDN imports in CSS` — compiled CSS does not contain `url(http` or `@import url(`

### Success criteria

```bash
# Unit tests (always pass, no build required)
bun test src/__tests__/unit/vigil-context.test.ts
bun test src/__tests__/unit/cn-utility.test.ts

# Integration tests (require prior build)
cd dashboard-v2 && bun run build
cd ../../..
bun test src/__tests__/integration/spike-embed.test.ts
bun test src/__tests__/integration/tailwind-theme.test.ts

# All Phase 0 tests
bun test --filter "vigil-context|cn-utility|spike-embed|tailwind-theme"
```

All tests exit 0. Integration tests skip cleanly (not fail) when build artifacts are missing.

---

## 9. Run Commands

```bash
# Fast: unit tests only (<1s, no build required)
bun test src/__tests__/unit/vigil-context.test.ts src/__tests__/unit/cn-utility.test.ts

# Integration: requires prior build
cd dashboard-v2 && bun run build && cd ../../..
bun test src/__tests__/integration/spike-embed.test.ts src/__tests__/integration/tailwind-theme.test.ts

# All Phase 0 tests
bun test --filter "vigil-context|cn-utility|spike-embed|tailwind-theme"

# Focused: single test file
bun test src/__tests__/unit/vigil-context.test.ts
bun test src/__tests__/integration/spike-embed.test.ts
```

---

## Coverage Check

- [PASS] Phase type identified: Research/Validation — real dependencies tested, not mocked
- [PASS] User stories block present with 5 stories derived from phase deliverables
- [PASS] Every user story traces to at least one component in the mock strategy table
- [PASS] Every deliverable has at least one test file: singleton → vigil-context.test.ts, cn → cn-utility.test.ts, build handler → spike-embed.test.ts, Tailwind → tailwind-theme.test.ts, API compat → spike-embed.test.ts
- [PASS] No real models, APIs, or network calls in unit tests — only pure module imports
- [PASS] Integration tests gated behind build existence check (`describe.skipIf`)
- [N/A] No `conftest.py` — Bun/TypeScript project uses `bun:test` with per-file setup/teardown
- [PASS] Execution prompt includes full test specifications inline (not "see above")
- [PASS] Run commands section present with fast, integration, and focused variants
- [PASS] Research phase: Section 3 explicitly states why no fakes are needed
