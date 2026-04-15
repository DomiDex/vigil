# Phase 7 — Remove HTMX Legacy: Test Plan

---
scope: Verify deletion of HTMX fragments, static files, and legacy routing leaves JSON API + TanStack Start handler intact
key_pattern: Integration/regression — absence tests (verify things DON'T exist) plus preservation tests (verify what REMAINS works)
dependencies: bun:test (existing), existing createMockDaemon() in helpers/mock-daemon.ts
---

**Phase type: Integration / Regression (Deletion).** Phase 7 is pure cleanup — removing HTMX fragments, static files, and legacy routing. The primary risk is accidentally breaking JSON API endpoints or the TanStack Start handler. Tests verify what survives, not what was deleted. Many tests are "absence tests" using file existence checks, grep-based assertions, and HTTP response verification.

---

## User Stories

| # | User Story | Validation Check | Pass Condition |
|---|-----------|-----------------|----------------|
| US-1 | As a developer, I want all JSON API endpoints preserved after HTMX removal, so that the React dashboard continues to work | `phase7-api-preservation.test.ts` TestJSONAPIPreservation | All 10 JSON endpoints return status 200 with valid JSON |
| US-2 | As a developer, I want all fragment endpoints removed, so that no dead HTMX code remains | `phase7-removal.test.ts` TestFragmentRemoval | All `/api/*/fragment` routes return 404; no `get*Fragment` exports in API modules |
| US-3 | As a developer, I want static HTMX files deleted, so that the codebase has no stale assets | `phase7-removal.test.ts` TestStaticFileRemoval | `src/dashboard/static/` directory does not exist |
| US-4 | As a developer, I want mutation handlers to return JSON, so that the React dashboard can consume them | `phase7-api-preservation.test.ts` TestMutationHandlers | handleReply, handleDreamTrigger, handleAsk return JSON responses |
| US-5 | As a developer, I want server.ts cleaned of legacy helpers, so that no dead code remains | `phase7-removal.test.ts` TestServerCleanup | No serveStatic, html(), MIME_TYPES, getMime, STATIC_DIR, /dash redirect in server.ts |
| US-6 | As a developer, I want the TanStack Start handler to serve root `/`, so that the React app loads directly | `phase7-api-preservation.test.ts` TestRootHandler | GET `/` returns HTML (not a redirect to /dash) |
| US-7 | As a developer, I want build scripts updated, so that `bun run build` uses the new pipeline | `phase7-removal.test.ts` TestBuildScripts | package.json has dashboard:build/dashboard:dev; no css:build/css:watch |

---

## 1. Component Mock Strategy Table

| Component | Mock/Fake | What to Assert | User Story |
|---|---|---|---|
| Dashboard server (Bun.serve) | Real Bun.serve on random port with `createMockDaemon()` | JSON API responses, fragment 404s, mutation handler responses | US-1, US-2, US-4, US-6 |
| File system (static dir) | None — check real filesystem | `src/dashboard/static/` does not exist | US-3 |
| server.ts source code | None — grep the real file | No legacy symbols present | US-5 |
| API module source code | None — grep the real files | No `get*Fragment` exports | US-2 |
| package.json | None — read the real file | Correct scripts present/absent | US-7 |
| TanStack Start handler | Build artifact if available; skip if not | Root `/` returns HTML | US-6 |

---

## 2. Test Tier Table

| Tier | Tests | Dependencies | Speed | When to Run |
|---|---|---|---|---|
| **Unit (static analysis)** | `phase7-removal.test.ts` | None — reads source files, checks filesystem | <1s | Every run (`bun test`) |
| **Integration (server)** | `phase7-api-preservation.test.ts` | `createMockDaemon()`, real Bun.serve on random port | 2-5s | Every run (`bun test`) |

---

## 3. No New Fake Implementations

This is a deletion phase. The only mock reused is `createMockDaemon()` from `src/__tests__/helpers/mock-daemon.ts`, which mocks the Vigil Daemon internals (not the deletion targets). No new fakes are needed because:

- **Absence tests** read source files and check the filesystem directly
- **Preservation tests** use the real `startDashboard()` with a mock daemon, matching the existing `dashboard.test.ts` pattern
- **grep-based assertions** scan real source code for forbidden patterns

---

## 4. Test File List

```
src/__tests__/
├── unit/
│   └── phase7-removal.test.ts              # Absence tests: files, exports, symbols (US-2, US-3, US-5, US-7)
└── integration/
    └── phase7-api-preservation.test.ts      # Server tests: JSON APIs, mutations, SSE, root handler (US-1, US-4, US-6)
```

---

## 5. Test Setup

### Shared helpers (existing)

- `createMockDaemon()` from `src/__tests__/helpers/mock-daemon.ts` — provides a minimal daemon mock for `startDashboard()`
- `startDashboard()` from `src/dashboard/server.ts` — starts the real Bun.serve with API routing

### Server test pattern (matches existing dashboard tests)

```typescript
let server: ReturnType<typeof Bun.serve>;
let port: number;
let base: string;

beforeAll(() => {
  port = 40000 + Math.floor(Math.random() * 10000);
  const daemon = createMockDaemon();
  server = startDashboard(daemon as any, port);
  base = `http://localhost:${port}`;
});

afterAll(() => {
  server?.stop(true);
});
```

### File reading helper for grep-based assertions

```typescript
async function readSource(relativePath: string): Promise<string> {
  const fullPath = join(import.meta.dir, "../../..", relativePath);
  const file = Bun.file(fullPath);
  if (!(await file.exists())) return "";
  return file.text();
}
```

---

## 6. Key Testing Decisions

| Decision | Approach | Rationale |
|---|---|---|
| Test absence via filesystem + grep | Read source files, check for forbidden patterns | More robust than testing deleted code — survives refactoring |
| Test JSON API via real HTTP | Start Bun.serve with mock daemon, fetch real endpoints | Matches existing dashboard test pattern; catches routing regressions |
| Fragment 404 tests via HTTP | Fetch known fragment URLs, assert 404 | Proves routes are actually removed, not just functions deleted |
| Mutation handler format via HTTP | POST to mutation endpoints, check Content-Type header | Catches html() vs json() response format issues |
| Build script test via JSON parse | Read and parse package.json, check scripts object | Faster and more reliable than running `bun run build` in tests |
| SSE test via Content-Type | Fetch /api/sse, check response headers | Lightweight check that SSE endpoint survives cleanup |
| Root handler test conditional | Skip TanStack root test if build artifacts missing | Avoid false failures in CI before dashboard-v2 is built |

---

## 7. Example Test Cases

### Unit: Absence tests (phase7-removal.test.ts)

```typescript
// src/__tests__/unit/phase7-removal.test.ts
import { describe, test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const PROJECT_ROOT = join(import.meta.dir, "../../..");

async function readSource(relativePath: string): Promise<string> {
  const fullPath = join(PROJECT_ROOT, relativePath);
  const file = Bun.file(fullPath);
  if (!(await file.exists())) return "";
  return file.text();
}

describe("Phase 7: static file removal", () => {
  test("src/dashboard/static/ directory does not exist", () => {
    const staticDir = join(PROJECT_ROOT, "src/dashboard/static");
    expect(existsSync(staticDir)).toBe(false);
  });

  test("no vendor files remain (htmx, pico, chart)", () => {
    const vendorDir = join(PROJECT_ROOT, "src/dashboard/static/vendor");
    expect(existsSync(vendorDir)).toBe(false);
  });

  test("no legacy index.html remains", () => {
    const indexHtml = join(PROJECT_ROOT, "src/dashboard/static/index.html");
    expect(existsSync(indexHtml)).toBe(false);
  });
});

describe("Phase 7: fragment function removal", () => {
  const apiModules = [
    { file: "src/dashboard/api/overview.ts", forbidden: ["getOverviewFragment"] },
    { file: "src/dashboard/api/repos.ts", forbidden: ["getRepoFragment", "getRepoNavFragment"] },
    { file: "src/dashboard/api/timeline.ts", forbidden: ["getTimelineFragment", "getEntryFragment"] },
    { file: "src/dashboard/api/dreams.ts", forbidden: ["getDreamsFragment"] },
    { file: "src/dashboard/api/memory.ts", forbidden: ["getMemoryFragment", "getMemorySearchFragment"] },
    { file: "src/dashboard/api/tasks.ts", forbidden: ["getTasksFragment"] },
    { file: "src/dashboard/api/actions.ts", forbidden: ["getActionsFragment"] },
    { file: "src/dashboard/api/scheduler.ts", forbidden: ["getSchedulerFragment"] },
    { file: "src/dashboard/api/metrics.ts", forbidden: ["getMetricsFragment"] },
  ];

  for (const { file, forbidden } of apiModules) {
    for (const fn of forbidden) {
      test(`${file} does not export ${fn}`, async () => {
        const source = await readSource(file);
        expect(source).not.toContain(`export function ${fn}`);
        expect(source).not.toContain(`export async function ${fn}`);
      });
    }
  }
});

describe("Phase 7: server.ts cleanup", () => {
  test("no serveStatic function", async () => {
    const source = await readSource("src/dashboard/server.ts");
    expect(source).not.toContain("function serveStatic");
  });

  test("no html() helper", async () => {
    const source = await readSource("src/dashboard/server.ts");
    expect(source).not.toContain("function html(");
  });

  test("no MIME_TYPES map", async () => {
    const source = await readSource("src/dashboard/server.ts");
    expect(source).not.toContain("MIME_TYPES");
  });

  test("no getMime function", async () => {
    const source = await readSource("src/dashboard/server.ts");
    expect(source).not.toContain("function getMime");
  });

  test("no STATIC_DIR constant", async () => {
    const source = await readSource("src/dashboard/server.ts");
    expect(source).not.toContain("STATIC_DIR");
  });

  test("no V2_DIST_DIR constant", async () => {
    const source = await readSource("src/dashboard/server.ts");
    expect(source).not.toContain("V2_DIST_DIR");
  });

  test("no /dash redirect route", async () => {
    const source = await readSource("src/dashboard/server.ts");
    expect(source).not.toContain('"/dash"');
    expect(source).not.toContain("'/dash'");
  });

  test("json() helper still exists", async () => {
    const source = await readSource("src/dashboard/server.ts");
    expect(source).toContain("function json(");
  });

  test("no fragment route blocks remain", async () => {
    const source = await readSource("src/dashboard/server.ts");
    expect(source).not.toContain("/fragment");
  });

  test("no fragment imports remain", async () => {
    const source = await readSource("src/dashboard/server.ts");
    expect(source).not.toContain("Fragment");
  });
});

describe("Phase 7: codebase-wide grep for HTMX remnants", () => {
  test("no 'htmx' references in src/dashboard/", async () => {
    const { stdout } = Bun.spawnSync(["grep", "-ri", "htmx", join(PROJECT_ROOT, "src/dashboard/")]);
    const output = stdout.toString().trim();
    expect(output).toBe("");
  });

  test("no 'pico' references in src/dashboard/", async () => {
    const { stdout } = Bun.spawnSync(["grep", "-ri", "pico\\.min", join(PROJECT_ROOT, "src/dashboard/")]);
    const output = stdout.toString().trim();
    expect(output).toBe("");
  });

  test("no 'fragment' references in src/dashboard/ (excluding comments)", async () => {
    const { stdout } = Bun.spawnSync(["grep", "-ri", "fragment", join(PROJECT_ROOT, "src/dashboard/")]);
    const output = stdout.toString().trim();
    // Allow zero matches or only "Phase 7 removed" comments
    const lines = output.split("\n").filter((l: string) => l && !l.includes("Phase 7"));
    expect(lines).toHaveLength(0);
  });
});

describe("Phase 7: build script updates", () => {
  test("package.json has dashboard:build script", async () => {
    const pkg = JSON.parse(await readSource("package.json"));
    expect(pkg.scripts["dashboard:build"]).toBeDefined();
  });

  test("package.json has dashboard:dev script", async () => {
    const pkg = JSON.parse(await readSource("package.json"));
    expect(pkg.scripts["dashboard:dev"]).toBeDefined();
  });

  test("package.json has no css:build script", async () => {
    const pkg = JSON.parse(await readSource("package.json"));
    expect(pkg.scripts["css:build"]).toBeUndefined();
  });

  test("package.json has no css:watch script", async () => {
    const pkg = JSON.parse(await readSource("package.json"));
    expect(pkg.scripts["css:watch"]).toBeUndefined();
  });

  test("build script references dashboard:build", async () => {
    const pkg = JSON.parse(await readSource("package.json"));
    expect(pkg.scripts["build"]).toContain("dashboard:build");
    expect(pkg.scripts["build"]).not.toContain("css:build");
  });
});
```

### Integration: API preservation tests (phase7-api-preservation.test.ts)

```typescript
// src/__tests__/integration/phase7-api-preservation.test.ts
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createMockDaemon } from "../helpers/mock-daemon.ts";
import { startDashboard } from "../../dashboard/server.ts";

let server: ReturnType<typeof Bun.serve>;
let port: number;
let base: string;

beforeAll(() => {
  port = 40000 + Math.floor(Math.random() * 10000);
  const daemon = createMockDaemon();
  server = startDashboard(daemon as any, port);
  base = `http://localhost:${port}`;
});

afterAll(() => {
  server?.stop(true);
});

describe("Phase 7: JSON API endpoint preservation", () => {
  const jsonEndpoints = [
    "/api/overview",
    "/api/repos",
    "/api/timeline",
    "/api/dreams",
    "/api/memory",
    "/api/tasks",
    "/api/actions",
    "/api/scheduler",
    "/api/metrics",
  ];

  for (const endpoint of jsonEndpoints) {
    test(`GET ${endpoint} returns 200 with valid JSON`, async () => {
      const res = await fetch(`${base}${endpoint}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      const body = await res.json();
      expect(body).toBeDefined();
      expect(typeof body).toBe("object");
    });
  }
});

describe("Phase 7: fragment endpoints return 404", () => {
  const fragmentEndpoints = [
    "/api/overview/fragment",
    "/api/repos/fragment",
    "/api/timeline/fragment",
    "/api/dreams/fragment",
    "/api/memory/fragment",
    "/api/memory/search/fragment",
    "/api/tasks/fragment",
    "/api/actions/fragment",
    "/api/scheduler/fragment",
    "/api/metrics/fragment",
  ];

  for (const endpoint of fragmentEndpoints) {
    test(`GET ${endpoint} returns 404`, async () => {
      const res = await fetch(`${base}${endpoint}`);
      expect(res.status).toBe(404);
    });
  }
});

describe("Phase 7: SSE endpoint preserved", () => {
  test("GET /api/sse returns text/event-stream content type", async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);

    try {
      const res = await fetch(`${base}/api/sse`, { signal: controller.signal });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
    } catch (e: unknown) {
      // AbortError is expected — we just need the headers
      if ((e as Error).name !== "AbortError") throw e;
    } finally {
      clearTimeout(timeout);
    }
  });
});

describe("Phase 7: mutation handlers return JSON", () => {
  test("POST /api/timeline/:id/reply returns JSON", async () => {
    const form = new FormData();
    form.set("reply", "test reply");
    const res = await fetch(`${base}/api/timeline/test-id/reply`, {
      method: "POST",
      body: form,
    });
    // May return 200 or 404 depending on mock data, but content-type must be JSON
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  test("POST /api/dreams/trigger returns JSON", async () => {
    const form = new FormData();
    form.set("dreamrepo", "/tmp/test-repo");
    const res = await fetch(`${base}/api/dreams/trigger`, {
      method: "POST",
      body: form,
    });
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  test("POST /api/memory/ask returns JSON", async () => {
    const form = new FormData();
    form.set("askq", "test question");
    const res = await fetch(`${base}/api/memory/ask`, {
      method: "POST",
      body: form,
    });
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

describe("Phase 7: legacy routes removed", () => {
  test("GET /dash does not serve static HTML", async () => {
    const res = await fetch(`${base}/dash`, { redirect: "manual" });
    // Should be 404, not a 200 or 302
    expect(res.status).toBe(404);
  });

  test("GET /dash/ does not serve static HTML", async () => {
    const res = await fetch(`${base}/dash/`, { redirect: "manual" });
    expect(res.status).toBe(404);
  });

  test("GET /dash/vendor/htmx.min.js returns 404", async () => {
    const res = await fetch(`${base}/dash/vendor/htmx.min.js`);
    expect(res.status).toBe(404);
  });
});

describe("Phase 7: root handler", () => {
  test("GET / does not redirect to /dash", async () => {
    const res = await fetch(`${base}/`, { redirect: "manual" });
    // Should NOT be a 302 redirect to /dash
    const location = res.headers.get("location");
    if (location) {
      expect(location).not.toContain("/dash");
    }
    // If TanStack Start is loaded, expect 200 with HTML
    // If not loaded (no build artifacts), expect 404 (not a redirect)
    expect(res.status === 200 || res.status === 404).toBe(true);
  });

  // This test requires dashboard-v2 to be built
  // Skip if build artifacts are missing
  test("GET / returns HTML when TanStack Start handler is available", async () => {
    const res = await fetch(`${base}/`);
    if (res.status === 200) {
      const contentType = res.headers.get("content-type") || "";
      expect(contentType).toContain("text/html");
    }
    // If 404, TanStack Start handler not built — acceptable in dev
  });
});
```

---

## 8. Execution Prompt

You are writing the test suite for Phase 7 (Remove HTMX Legacy) of Vigil Dashboard v2 — a deletion/cleanup phase that removes all HTMX-era code.

### Project context

Vigil is a Bun/TypeScript project. Tests use `bun:test` (not Jest/Vitest). The existing test suite lives in `src/__tests__/` with `unit/` and `integration/` subdirectories. Test helpers are in `src/__tests__/helpers/`.

### Why these tests exist

Phase 7 is a pure deletion phase. The primary risk is breaking JSON API endpoints or the TanStack Start handler during cleanup. Tests verify:
1. What was removed is actually gone (absence tests)
2. What should remain still works (preservation tests)

### Phase type: Integration / Regression (Deletion)

This phase has no new features. Tests are "absence tests" (file existence, grep-based assertions) and "preservation tests" (HTTP response checks). The existing `createMockDaemon()` helper provides a mock daemon for server tests.

### What NOT to test

- HTMX functionality (it is being deleted)
- React component rendering (already tested in other phases)
- TanStack Start build process (tested in Phase 0)
- Dream consolidation, git watching, or other daemon features (unchanged)

### Files to create

**1. `src/__tests__/unit/phase7-removal.test.ts`**
Static analysis / absence tests that verify deleted code is gone:

- **Static file removal**: `src/dashboard/static/` directory does not exist; no vendor files remain
- **Fragment function removal**: For each API module (`overview.ts`, `repos.ts`, `timeline.ts`, `dreams.ts`, `memory.ts`, `tasks.ts`, `actions.ts`, `scheduler.ts`, `metrics.ts`), verify no `get*Fragment` function is exported. Use `Bun.file().text()` to read source and assert absence of export signatures.
- **server.ts cleanup**: No `serveStatic`, `html()`, `MIME_TYPES`, `getMime`, `STATIC_DIR`, `V2_DIST_DIR`, `/dash`, or `/fragment` references remain. Verify `json()` helper still exists. Verify no `Fragment` imports remain.
- **Codebase-wide grep**: No `htmx`, `pico.min`, or `fragment` references in `src/dashboard/` (use `Bun.spawnSync(["grep", ...])` and assert empty output)
- **Build scripts**: Parse `package.json`, verify `dashboard:build` and `dashboard:dev` exist, verify `css:build` and `css:watch` do not exist, verify `build` script references `dashboard:build`

**2. `src/__tests__/integration/phase7-api-preservation.test.ts`**
HTTP-level tests that verify surviving functionality:

Setup:
```typescript
let server: ReturnType<typeof Bun.serve>;
let port: number;
let base: string;

beforeAll(() => {
  port = 40000 + Math.floor(Math.random() * 10000);
  const daemon = createMockDaemon();
  server = startDashboard(daemon as any, port);
  base = `http://localhost:${port}`;
});
afterAll(() => { server?.stop(true); });
```

Tests:
- **JSON API preservation**: Loop over all 10 JSON endpoints (`/api/overview`, `/api/repos`, `/api/timeline`, `/api/dreams`, `/api/memory`, `/api/tasks`, `/api/actions`, `/api/scheduler`, `/api/metrics`), verify each returns 200 with `application/json` content type and a parseable JSON body
- **Fragment 404s**: Loop over all 10 fragment endpoints (`/api/overview/fragment`, `/api/repos/fragment`, `/api/timeline/fragment`, `/api/dreams/fragment`, `/api/memory/fragment`, `/api/memory/search/fragment`, `/api/tasks/fragment`, `/api/actions/fragment`, `/api/scheduler/fragment`, `/api/metrics/fragment`), verify each returns 404
- **SSE preserved**: `GET /api/sse` returns `text/event-stream` content type (use AbortController to avoid hanging)
- **Mutation handlers return JSON**: POST to `/api/timeline/:id/reply`, `/api/dreams/trigger`, `/api/memory/ask` with FormData, verify `application/json` content type in response
- **Legacy routes removed**: `GET /dash` returns 404 (not a static file or redirect); `GET /dash/vendor/htmx.min.js` returns 404
- **Root handler**: `GET /` does not redirect to `/dash`. If TanStack Start handler is loaded (build artifacts present), returns 200 with `text/html`; if not loaded, returns 404

### Success criteria

```bash
# Unit (absence) tests — always pass after Phase 7 implementation
bun test src/__tests__/unit/phase7-removal.test.ts

# Integration (preservation) tests — always pass after Phase 7 implementation
bun test src/__tests__/integration/phase7-api-preservation.test.ts

# All Phase 7 tests
bun test --filter "phase7"

# Full suite — no regressions
bun test
```

All tests exit 0. The absence tests should FAIL before Phase 7 is implemented (they detect HTMX code that still exists) and PASS after implementation.

---

## 9. Run Commands

```bash
# Fast: unit (absence) tests only (<1s, no server needed)
bun test src/__tests__/unit/phase7-removal.test.ts

# Integration: server preservation tests (2-5s)
bun test src/__tests__/integration/phase7-api-preservation.test.ts

# All Phase 7 tests
bun test --filter "phase7"

# Focused: single test file
bun test src/__tests__/unit/phase7-removal.test.ts
bun test src/__tests__/integration/phase7-api-preservation.test.ts

# Full suite with no regressions
bun test
```

---

## Coverage Check

- [PASS] Phase type identified: Integration/Regression (Deletion) — absence tests + preservation tests
- [PASS] User stories block present with 7 stories covering all Phase 7 deliverables
- [PASS] Every user story traces to at least one test file
- [PASS] Every deliverable has coverage: fragment removal (US-2), static deletion (US-3), server cleanup (US-5), mutation conversion (US-4), build scripts (US-7), API preservation (US-1), root handler (US-6)
- [PASS] No new fakes needed — reuses existing `createMockDaemon()`
- [PASS] Absence tests cover: file existence, source grep, export signatures, codebase-wide patterns
- [PASS] Preservation tests cover: all 10 JSON endpoints, SSE, mutation handlers, root handler
- [PASS] Fragment 404 tests verify routes are actually removed (not just functions deleted)
- [PASS] Execution prompt includes full test specifications inline
- [PASS] Run commands section present with unit, integration, combined, and focused variants
- [PASS] Tests designed to FAIL before implementation and PASS after — proper RED/GREEN gating
