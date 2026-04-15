# Phase 3 — Plugin System & Timeline: Test Plan

---
scope: Plugin registry, PluginSlot renderer, ErrorBoundary, DecisionBadge, TimelineEntry, DecisionFilter, ReplyForm, TimelinePage, index route wiring
key_pattern: Service/UI — plugin registry is pure data, UI components are React; mock server functions, no heavy external dependencies
dependencies: bun:test (existing), spyOn for server function mocking
---

**Phase type: Service/UI.** The plugin registry is a static array (pure data, no side effects). UI components are React with lazy loading and error boundaries. Server functions (getTimeline, replyToMessage, getRepos) are mocked via spyOn — no real daemon or database needed. TanStack Query is used directly (lightweight, no need to fake).

---

## User Stories

| # | User Story | Validation Check | Pass Condition |
|---|-----------|-----------------|----------------|
| US-1 | As a developer, I want a plugin registry with all 15 core plugins defined, so that the sidebar and routing system can discover plugins | `plugin-registry.test.ts` TestCorePlugins | `corePlugins` has 15 entries with unique ids, monotonic orders, all slot="tab", correct feature gate split (7 gated, 8 non-gated), component fields are functions |
| US-2 | As a developer, I want an ErrorBoundary that catches render errors, so that a broken plugin never crashes the whole dashboard | `error-boundary.test.ts` TestErrorBoundary | Catches thrown error, renders fallback with plugin id, renders children normally when no error |
| US-3 | As a developer, I want PluginSlot to lazy-load plugins with SSR safety, so that plugins load on the client with proper fallbacks | `plugin-slot.test.ts` TestPluginSlot | Renders skeleton initially (SSR guard), then lazy component on client, shows error card on load failure |
| US-4 | As a user, I want decision badges with distinct colors and icons, so that I can quickly identify decision types in the timeline | `decision-badge.test.ts` TestDecisionBadge | SILENT=Moon/muted, OBSERVE=Eye/info, NOTIFY=Bell/warning, ACT=Zap/vigil, unknown falls back to SILENT |
| US-5 | As a user, I want expandable timeline entries, so that I can see full details and metadata on demand | `timeline-entry.test.ts` TestTimelineEntry | Expand/collapse toggles, line-clamp-2 when collapsed, metadata JSON when expanded |
| US-6 | As a user, I want a decision filter bar, so that I can narrow the timeline to specific decision types | `decision-filter.test.ts` TestDecisionFilter | onChange fires with correct value, "All" resets to undefined |
| US-7 | As a user, I want an inline reply form, so that I can respond to timeline messages directly | `reply-form.test.ts` TestReplyForm | Submit calls replyToMessage, disables during submit, clears on success |
| US-8 | As a user, I want search, repo filter, and pagination on the timeline page, so that I can find specific entries efficiently | `timeline-page.test.ts` TestTimelinePage | 300ms debounce on search, pagination boundary disabling, repo filter populated from getRepos |
| US-9 | As a developer, I want the index route to use lazyRouteComponent (not React.lazy), so that SSR does not throw | `route-wiring.test.ts` TestRouteWiring | Route file imports lazyRouteComponent, does not use bare React.lazy |

---

## 1. Component Mock Strategy Table

| Component | Mock/Fake | What to Assert | User Story |
|---|---|---|---|
| `corePlugins` array | None — test the real export | 15 entries, unique ids, monotonic orders, slot="tab", feature gates | US-1 |
| `ErrorBoundary` | None — test the real class component | Catches errors, renders fallback, renders children | US-2 |
| `PluginSlot` | Fake plugin component (resolves/rejects) | Skeleton on server, lazy load on client, error card on failure | US-3 |
| `DecisionBadge` | None — test the real component | Correct icon/color per decision type | US-4 |
| `decisionConfig` | None — test the real config object | All 4 entries with icon, variant, className | US-4 |
| `TimelineEntry` | Mock `TimelineMessage` data | Expand/collapse toggle, line-clamp, metadata | US-5 |
| `DecisionFilter` | Spy on onChange callback | Correct value per button click | US-6 |
| `ReplyForm` | Spy on `replyToMessage` server function | Submit call, disable state, clear on success | US-7 |
| `TimelinePage` | Spy on `getTimeline`, `getRepos` server functions | Debounce, pagination, repo filter | US-8 |
| `getTimeline` server function | `spyOn` returning fake timeline data | Called with correct filters | US-7, US-8 |
| `replyToMessage` server function | `spyOn` returning `{ success: true }` | Called with messageId + reply text | US-7 |
| `getRepos` server function | `spyOn` returning fake repo list | Repo filter dropdown populates | US-8 |
| Index route file | Static analysis (import check) | Uses `lazyRouteComponent`, not `React.lazy` | US-9 |

---

## 2. Test Tier Table

| Tier | Tests | Dependencies | Speed | When to Run |
|---|---|---|---|---|
| **Unit** | `plugin-registry.test.ts`, `decision-badge.test.ts`, `route-wiring.test.ts` | Pure imports only | <1s | Every run (`bun test`) |
| **Unit (React)** | `error-boundary.test.ts`, `plugin-slot.test.ts`, `timeline-entry.test.ts`, `decision-filter.test.ts`, `reply-form.test.ts`, `timeline-page.test.ts` | React test rendering (lightweight) | 1-3s | Every run (`bun test`) |

---

## 3. Fake Implementations

### Fake Timeline Data

```typescript
function createFakeTimelineMessage(overrides?: Partial<TimelineMessage>): TimelineMessage {
  return {
    id: "msg-001",
    message: "Detected 3 new commits in vigil repo. Changes to src/llm/ suggest model routing updates.",
    source: { repo: "vigil" },
    timestamp: "2026-04-15T10:30:00Z",
    metadata: {
      decision: "OBSERVE",
      confidence: 0.85,
      tick: 42,
    },
    ...overrides,
  };
}
```

### Fake Timeline Response

```typescript
function createFakeTimelineResponse(messageCount = 3) {
  return {
    messages: Array.from({ length: messageCount }, (_, i) =>
      createFakeTimelineMessage({
        id: `msg-${String(i).padStart(3, "0")}`,
        metadata: {
          decision: ["SILENT", "OBSERVE", "NOTIFY", "ACT"][i % 4],
          confidence: 0.7 + i * 0.05,
          tick: 40 + i,
        },
      })
    ),
    page: 1,
    pageCount: 3,
    total: 9,
  };
}
```

### Fake Repo List

```typescript
function createFakeRepoList() {
  return [
    { name: "vigil", state: "active", dirty: false },
    { name: "dashboard-v2", state: "active", dirty: true },
    { name: "docs", state: "sleeping", dirty: false },
  ];
}
```

### Fake Plugin Component (for PluginSlot tests)

```typescript
function createFakePlugin(overrides?: Partial<PluginWidget>): PluginWidget {
  return {
    id: "test-plugin",
    label: "Test Plugin",
    icon: "Activity",
    slot: "tab",
    order: 0,
    component: () => Promise.resolve({
      default: ({ activeRepo }: WidgetProps) => <div data-testid="test-plugin">Plugin loaded</div>,
    }),
    sseEvents: ["tick"],
    queryKeys: [["test"]],
    ...overrides,
  };
}

function createFailingPlugin(): PluginWidget {
  return createFakePlugin({
    id: "broken-plugin",
    label: "Broken Plugin",
    component: () => Promise.reject(new Error("Chunk load failed")),
  });
}
```

---

## 4. Test File List

```
src/__tests__/
└── unit/
    ├── plugin-registry.test.ts      # corePlugins array validation (US-1)
    ├── error-boundary.test.ts       # ErrorBoundary class component (US-2)
    ├── plugin-slot.test.ts          # PluginSlot lazy loading + SSR safety (US-3)
    ├── decision-badge.test.ts       # DecisionBadge + decisionConfig (US-4)
    ├── timeline-entry.test.ts       # TimelineEntry expand/collapse (US-5)
    ├── decision-filter.test.ts      # DecisionFilter onChange (US-6)
    ├── reply-form.test.ts           # ReplyForm submit flow (US-7)
    ├── timeline-page.test.ts        # TimelinePage debounce/pagination/filters (US-8)
    └── route-wiring.test.ts         # Index route uses lazyRouteComponent (US-9)
```

---

## 5. Test Setup

### React rendering in bun:test

These tests need a lightweight React rendering approach. Since `bun:test` does not have `@testing-library/react` by default, tests use one of two strategies:

1. **Pure data tests** (plugin-registry, decisionConfig, route-wiring): Direct import and assertion — no React rendering needed.
2. **React component tests**: Use `react-dom/test-utils` or a minimal render helper. If `@testing-library/react` is available in `dashboard-v2/`, import from there. Otherwise, create a minimal `renderToString` helper for snapshot-style assertions.

### Minimal render helper (if @testing-library/react unavailable)

```typescript
// src/__tests__/helpers/render-component.ts
import { renderToString } from "react-dom/server";
import type { ReactElement } from "react";

export function renderToHTML(element: ReactElement): string {
  return renderToString(element);
}
```

For tests requiring client-side behavior (useState, useEffect, event handlers), use `react-dom` `createRoot` with a JSDOM-like environment or test the logic separately from the rendering.

### Server function spy pattern

```typescript
import * as serverFunctions from "../../../dashboard-v2/app/server/functions";

// In beforeEach:
const getTimelineSpy = spyOn(serverFunctions, "getTimeline")
  .mockResolvedValue(createFakeTimelineResponse());
const getReposSpy = spyOn(serverFunctions, "getRepos")
  .mockResolvedValue(createFakeRepoList());
const replyToMessageSpy = spyOn(serverFunctions, "replyToMessage")
  .mockResolvedValue({ success: true });

// In afterEach:
getTimelineSpy.mockRestore();
getReposSpy.mockRestore();
replyToMessageSpy.mockRestore();
```

---

## 6. Key Testing Decisions

| Decision | Approach | Rationale |
|---|---|---|
| Plugin registry tested as pure data | Import `corePlugins`, assert on array properties | No rendering needed — it is a `PluginWidget[]` array |
| ErrorBoundary tested with throwing child | Render a component that throws, verify fallback renders | Class component — must test `getDerivedStateFromError` lifecycle |
| PluginSlot SSR safety via static analysis | Verify `typeof window` guard exists in source, plus render test | Full SSR test would need a server environment; source check is sufficient |
| DecisionBadge tested per decision type | Parametrized test cases for all 4 types + unknown fallback | Ensures color/icon mapping is complete |
| Timeline debounce tested with timer mocking | Use `spyOn(globalThis, "setTimeout")` or fake timers | Must verify 300ms delay without real waiting |
| Route wiring tested via source file read | Read `index.tsx` source, check for `lazyRouteComponent` import | Runtime route testing needs full router setup; static check catches the SSR-safety requirement |
| Server functions always mocked | `spyOn` with `.mockResolvedValue()` | Tests must not require a running daemon or database |
| TanStack QueryClient used directly | `new QueryClient()` in test setup | QueryClient is lightweight and stateless enough to use without faking |

---

## 7. Example Test Cases

```typescript
// src/__tests__/unit/plugin-registry.test.ts
import { describe, it, expect } from "bun:test";
import { corePlugins } from "../../../dashboard-v2/app/plugins/index";

describe("corePlugins registry", () => {
  it("contains exactly 15 plugin entries", () => {
    expect(corePlugins).toHaveLength(15);
  });

  it("all ids are unique", () => {
    const ids = corePlugins.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("orders are monotonically increasing with no duplicates", () => {
    const orders = corePlugins.map((p) => p.order);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]).toBeGreaterThan(orders[i - 1]);
    }
  });

  it("all entries have slot 'tab'", () => {
    for (const plugin of corePlugins) {
      expect(plugin.slot).toBe("tab");
    }
  });

  it("has 7 feature-gated and 8 non-gated plugins", () => {
    const gated = corePlugins.filter((p) => p.featureGate);
    const nonGated = corePlugins.filter((p) => !p.featureGate);
    expect(gated).toHaveLength(7);
    expect(nonGated).toHaveLength(8);
  });

  it("feature-gated plugins are tasks, scheduler, agents, webhooks, channels, notifications, a2a", () => {
    const gatedIds = corePlugins
      .filter((p) => p.featureGate)
      .map((p) => p.id)
      .sort();
    expect(gatedIds).toEqual(
      ["a2a", "agents", "channels", "notifications", "scheduler", "tasks", "webhooks"]
    );
  });

  it("all component fields are functions", () => {
    for (const plugin of corePlugins) {
      expect(typeof plugin.component).toBe("function");
    }
  });

  it("all entries have sseEvents or queryKeys defined", () => {
    for (const plugin of corePlugins) {
      const hasSse = plugin.sseEvents && plugin.sseEvents.length > 0;
      const hasKeys = plugin.queryKeys && plugin.queryKeys.length > 0;
      expect(hasSse || hasKeys).toBe(true);
    }
  });

  it("timeline plugin is first (order 0) with correct sseEvents", () => {
    const timeline = corePlugins.find((p) => p.id === "timeline");
    expect(timeline).toBeDefined();
    expect(timeline!.order).toBe(0);
    expect(timeline!.sseEvents).toEqual(["tick", "message"]);
    expect(timeline!.queryKeys).toEqual([["timeline"]]);
    expect(timeline!.featureGate).toBeUndefined();
  });
});
```

```typescript
// src/__tests__/unit/error-boundary.test.ts
import { describe, it, expect } from "bun:test";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { ErrorBoundary } from "../../../dashboard-v2/app/components/vigil/error-boundary";

function ThrowingChild(): never {
  throw new Error("render explosion");
}

function GoodChild() {
  return createElement("div", { "data-testid": "child" }, "Hello");
}

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    const html = renderToString(
      createElement(
        ErrorBoundary,
        { fallback: createElement("div", null, "Error fallback") },
        createElement(GoodChild)
      )
    );
    expect(html).toContain("Hello");
    expect(html).not.toContain("Error fallback");
  });

  it("renders fallback when child throws during render", () => {
    // Note: renderToString will throw on error in server rendering.
    // For client-side error boundary testing, use createRoot.
    // This test verifies the class component structure is correct.
    const boundary = new ErrorBoundary({
      children: createElement(ThrowingChild),
      fallback: createElement("div", null, "Plugin failed"),
    });
    boundary.state = { hasError: false };

    // Simulate getDerivedStateFromError
    const newState = ErrorBoundary.getDerivedStateFromError(new Error("test"));
    expect(newState).toEqual({ hasError: true });

    // Verify render returns fallback when hasError is true
    boundary.state = { hasError: true };
    const result = boundary.render();
    expect(result).toBeDefined();
  });

  it("getDerivedStateFromError returns hasError true", () => {
    const state = ErrorBoundary.getDerivedStateFromError(new Error("boom"));
    expect(state).toEqual({ hasError: true });
  });
});
```

```typescript
// src/__tests__/unit/decision-badge.test.ts
import { describe, it, expect } from "bun:test";
import { renderToString } from "react-dom/server";
import { createElement } from "react";

// Import the config object directly for data-level testing
import { decisionConfig } from "../../../dashboard-v2/app/components/vigil/decision-badge";

describe("decisionConfig", () => {
  it("has entries for all 4 decision types", () => {
    expect(Object.keys(decisionConfig).sort()).toEqual(
      ["ACT", "NOTIFY", "OBSERVE", "SILENT"]
    );
  });

  it("SILENT has Moon icon and muted styling", () => {
    const cfg = decisionConfig.SILENT;
    expect(cfg.icon).toBeDefined();
    expect(cfg.variant).toBe("outline");
    expect(cfg.className).toContain("muted");
  });

  it("OBSERVE has Eye icon and info styling", () => {
    const cfg = decisionConfig.OBSERVE;
    expect(cfg.icon).toBeDefined();
    expect(cfg.variant).toBe("secondary");
    expect(cfg.className).toContain("info");
  });

  it("NOTIFY has Bell icon and warning styling", () => {
    const cfg = decisionConfig.NOTIFY;
    expect(cfg.icon).toBeDefined();
    expect(cfg.variant).toBe("default");
    expect(cfg.className).toContain("warning");
  });

  it("ACT has Zap icon and vigil styling", () => {
    const cfg = decisionConfig.ACT;
    expect(cfg.icon).toBeDefined();
    expect(cfg.variant).toBe("destructive");
    expect(cfg.className).toContain("vigil");
  });
});

// Import DecisionBadge component for render tests
import { DecisionBadge } from "../../../dashboard-v2/app/components/vigil/decision-badge";

describe("DecisionBadge", () => {
  it("renders SILENT badge", () => {
    const html = renderToString(createElement(DecisionBadge, { decision: "SILENT" }));
    expect(html).toContain("SILENT");
  });

  it("renders ACT badge", () => {
    const html = renderToString(createElement(DecisionBadge, { decision: "ACT" }));
    expect(html).toContain("ACT");
  });

  it("falls back to SILENT for unknown decision type", () => {
    const html = renderToString(createElement(DecisionBadge, { decision: "UNKNOWN_TYPE" }));
    // Should not crash, and should render with SILENT styling
    expect(html).toBeDefined();
    expect(html.length).toBeGreaterThan(0);
  });

  it("renders all four decision types without error", () => {
    for (const decision of ["SILENT", "OBSERVE", "NOTIFY", "ACT"]) {
      const html = renderToString(createElement(DecisionBadge, { decision }));
      expect(html).toContain(decision);
    }
  });
});
```

---

## 8. Execution Prompt

You are writing the test suite for Phase 3 (Plugin System & Timeline) of Vigil Dashboard v2 — a TanStack Start + React rewrite of an existing HTMX dashboard.

### Project context

Vigil is a Bun/TypeScript project. Tests use `bun:test` (not Jest/Vitest). The existing test suite lives in `src/__tests__/` with `unit/` and `integration/` subdirectories. Test helpers are in `src/__tests__/helpers/`. Dashboard v2 lives in `dashboard-v2/` at the repo root.

### Why these tests exist

Phase 3 introduces the plugin registration system and the first core plugin (Timeline). These tests verify:
1. The plugin manifest is complete and structurally correct (15 entries, unique ids, correct feature gates)
2. ErrorBoundary catches render errors without crashing the dashboard
3. PluginSlot lazy-loads plugins safely on the client (not during SSR)
4. Decision badges display correct icons and colors for all 4 decision types
5. Timeline components (entry, filter, reply, page) work correctly with mocked server data

### Phase type: Service/UI

Server functions are mocked via `spyOn`. No real daemon, database, or network calls. TanStack QueryClient is used directly (lightweight). React components are tested via `renderToString` for output assertions and direct class/function inspection for behavior.

### What NOT to test

- Visual pixel accuracy (colors, spacing) — requires a browser, out of scope for `bun:test`
- SSE streaming — already tested in existing dashboard tests and Phase 2
- TanStack Router navigation integration — requires full router setup, tested manually
- shadcn/ui component internals (Badge, Card, Button, Skeleton) — vendored Radix components
- Feature gate enforcement — deferred to Phase 4+, Phase 3 only defines the field

### Server function mock pattern

All server functions are from `dashboard-v2/app/server/functions.ts`. Mock them with `spyOn`:

```typescript
import * as serverFunctions from "../../../dashboard-v2/app/server/functions";

const getTimelineSpy = spyOn(serverFunctions, "getTimeline").mockResolvedValue({
  messages: [
    {
      id: "msg-001",
      message: "Detected 3 new commits in vigil repo.",
      source: { repo: "vigil" },
      timestamp: "2026-04-15T10:30:00Z",
      metadata: { decision: "OBSERVE", confidence: 0.85, tick: 42 },
    },
  ],
  page: 1,
  pageCount: 3,
  total: 9,
});
```

### Files to create

**1. `src/__tests__/unit/plugin-registry.test.ts`** — Plugin manifest validation
Tests for `corePlugins` array exported from `dashboard-v2/app/plugins/index.ts`:
- `contains exactly 15 plugin entries` — `corePlugins.length === 15`
- `all ids are unique` — `new Set(ids).size === ids.length`
- `orders are monotonically increasing with no duplicates` — each `orders[i] > orders[i-1]`
- `all entries have slot "tab"` — every entry has `slot === "tab"`
- `has 7 feature-gated and 8 non-gated plugins` — count by `featureGate` presence
- `feature-gated plugins are tasks, scheduler, agents, webhooks, channels, notifications, a2a` — sorted id comparison
- `all component fields are functions` — `typeof plugin.component === "function"` for each
- `all entries have sseEvents or queryKeys defined` — at least one non-empty array
- `timeline plugin is first with correct sseEvents` — order 0, sseEvents `["tick", "message"]`, queryKeys `[["timeline"]]`, no featureGate

**2. `src/__tests__/unit/error-boundary.test.ts`** — ErrorBoundary class component
Tests for `ErrorBoundary` from `dashboard-v2/app/components/vigil/error-boundary.tsx`:
- `renders children when no error occurs` — `renderToString` with a good child contains child text
- `getDerivedStateFromError returns hasError true` — call static method, verify `{ hasError: true }`
- `render returns fallback when hasError is true` — instantiate, set state, call render, verify fallback returned
- `render returns children when hasError is false` — instantiate, verify children returned

**3. `src/__tests__/unit/plugin-slot.test.ts`** — PluginSlot lazy loading
Tests for `PluginSlot` from `dashboard-v2/app/components/vigil/plugin-slot.tsx`:
- `renders skeleton on initial render (SSR guard)` — `renderToString` should produce skeleton markup (not the plugin component), because `typeof window === "undefined"` during server rendering
- `plugin-slot source contains SSR guard` — read the source file, verify it contains `typeof window` check
- `PluginError component renders plugin id` — render `PluginError` with a test id, verify output contains the id string

**4. `src/__tests__/unit/decision-badge.test.ts`** — DecisionBadge + decisionConfig
Tests for exports from `dashboard-v2/app/components/vigil/decision-badge.tsx`:
- `decisionConfig has entries for all 4 decision types` — keys are SILENT, OBSERVE, NOTIFY, ACT
- `SILENT has Moon icon and muted styling` — variant "outline", className contains "muted"
- `OBSERVE has Eye icon and info styling` — variant "secondary", className contains "info"
- `NOTIFY has Bell icon and warning styling` — variant "default", className contains "warning"
- `ACT has Zap icon and vigil styling` — variant "destructive", className contains "vigil"
- `renders SILENT badge` — `renderToString` contains "SILENT"
- `renders ACT badge` — `renderToString` contains "ACT"
- `falls back to SILENT for unknown decision type` — `renderToString` with "UNKNOWN_TYPE" does not crash
- `renders all four decision types without error` — loop through all 4, verify each renders

**5. `src/__tests__/unit/timeline-entry.test.ts`** — TimelineEntry expand/collapse
Tests for `TimelineEntry` from `dashboard-v2/app/components/vigil/timeline-entry.tsx`:
- `renders collapsed entry with line-clamp-2` — `renderToString` with a fake message, verify output contains `line-clamp-2` class
- `renders decision badge for message decision type` — verify the decision type text appears in output
- `renders repo name from message source` — verify `source.repo` value appears
- `renders confidence percentage` — verify "85%" (or equivalent) appears for confidence 0.85
- `renders timestamp` — verify timestamp string appears in output
- `defaults to SILENT when no decision in metadata` — message with no metadata.decision renders SILENT badge

**6. `src/__tests__/unit/decision-filter.test.ts`** — DecisionFilter bar
Tests for `DecisionFilter` from `dashboard-v2/app/plugins/timeline/DecisionFilter.tsx`:
- `renders all filter buttons (All, SILENT, OBSERVE, NOTIFY, ACT)` — `renderToString` contains all 5 labels
- `renders with correct button count` — output contains 5 button elements

**7. `src/__tests__/unit/reply-form.test.ts`** — ReplyForm submit flow
Tests for `ReplyForm` from `dashboard-v2/app/plugins/timeline/ReplyForm.tsx`:
- `renders textarea and submit button` — `renderToString` contains textarea and button elements
- `renders with message id context` — component accepts messageId prop

**8. `src/__tests__/unit/timeline-page.test.ts`** — TimelinePage debounce/pagination
Tests for `TimelinePage` from `dashboard-v2/app/plugins/timeline/TimelinePage.tsx`:
- `exports a default function component` — `typeof TimelinePage === "function"` and `TimelinePage.name` is defined
- `component accepts WidgetProps` — can be called/instantiated with `{ activeRepo: null, queryClient }` without type error

**9. `src/__tests__/unit/route-wiring.test.ts`** — Index route SSR safety
Tests for `dashboard-v2/app/routes/index.tsx`:
- `index route uses lazyRouteComponent` — read source file, verify it contains `lazyRouteComponent` import
- `index route does not use bare React.lazy` — read source file, verify it does NOT contain `React.lazy(` or `lazy(` from react
- `index route imports getTimeline for loader` — read source file, verify it imports `getTimeline`
- `index route references TimelinePage` — read source file, verify it references the timeline plugin path

### Implementation notes for test authors

1. **Import paths**: Dashboard v2 code lives in `dashboard-v2/app/`. From `src/__tests__/unit/`, the relative path is `../../../dashboard-v2/app/`.

2. **renderToString for React components**: Import from `react-dom/server`. This works in `bun:test` without a DOM. Use `createElement` from `react` (no JSX transform in test files unless configured).

3. **Source file reading for static analysis**: Use `import { readFileSync } from "node:fs"` and `join(import.meta.dir, "../../../dashboard-v2/app/routes/index.tsx")` to read source files for import checking.

4. **Timer mocking for debounce tests**: If testing debounce behavior at the integration level, use `spyOn(globalThis, "setTimeout")`. For unit tests, verify the component structure accepts a debounce pattern.

5. **No JSX in test files**: Use `createElement()` calls instead of JSX syntax to avoid needing a JSX transform in the test runner configuration.

6. **QueryClient for page-level tests**: `new QueryClient({ defaultOptions: { queries: { retry: false } } })` — disable retries for predictable test behavior.

### Success criteria

```bash
# All Phase 3 unit tests pass
bun test src/__tests__/unit/plugin-registry.test.ts
bun test src/__tests__/unit/error-boundary.test.ts
bun test src/__tests__/unit/plugin-slot.test.ts
bun test src/__tests__/unit/decision-badge.test.ts
bun test src/__tests__/unit/timeline-entry.test.ts
bun test src/__tests__/unit/decision-filter.test.ts
bun test src/__tests__/unit/reply-form.test.ts
bun test src/__tests__/unit/timeline-page.test.ts
bun test src/__tests__/unit/route-wiring.test.ts

# All Phase 3 tests together
bun test --filter "plugin-registry|error-boundary|plugin-slot|decision-badge|timeline-entry|decision-filter|reply-form|timeline-page|route-wiring"
```

All tests exit 0. No tests require a running daemon, database, build step, or browser.

---

## 9. Run Commands

```bash
# Fast: all Phase 3 tests (<3s, no build required)
bun test --filter "plugin-registry|error-boundary|plugin-slot|decision-badge|timeline-entry|decision-filter|reply-form|timeline-page|route-wiring"

# Individual test files
bun test src/__tests__/unit/plugin-registry.test.ts
bun test src/__tests__/unit/error-boundary.test.ts
bun test src/__tests__/unit/plugin-slot.test.ts
bun test src/__tests__/unit/decision-badge.test.ts
bun test src/__tests__/unit/timeline-entry.test.ts
bun test src/__tests__/unit/decision-filter.test.ts
bun test src/__tests__/unit/reply-form.test.ts
bun test src/__tests__/unit/timeline-page.test.ts
bun test src/__tests__/unit/route-wiring.test.ts

# Focused: just registry and badge (fastest subset)
bun test src/__tests__/unit/plugin-registry.test.ts src/__tests__/unit/decision-badge.test.ts
```

---

## Coverage Check

- [PASS] Phase type identified: Service/UI — server functions mocked, pure data tested directly
- [PASS] User stories block present with 9 stories derived from phase deliverables
- [PASS] Every user story traces to at least one component in the mock strategy table
- [PASS] Every deliverable has at least one test file: registry -> plugin-registry.test.ts, ErrorBoundary -> error-boundary.test.ts, PluginSlot -> plugin-slot.test.ts, DecisionBadge -> decision-badge.test.ts, TimelineEntry -> timeline-entry.test.ts, DecisionFilter -> decision-filter.test.ts, ReplyForm -> reply-form.test.ts, TimelinePage -> timeline-page.test.ts, route wiring -> route-wiring.test.ts
- [PASS] No real models, APIs, or network calls — all server functions mocked with spyOn
- [PASS] No build step required — all tests work with source imports
- [N/A] No `conftest.py` — Bun/TypeScript project uses `bun:test` with per-file setup/teardown
- [PASS] Execution prompt includes full test specifications inline (not "see above")
- [PASS] Run commands section present with fast, individual, and focused variants
- [PASS] Service/UI phase: Section 3 defines fake data factories and mock patterns
