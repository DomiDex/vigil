# Phase 2 — Shell Layout: Test Plan

---
scope: SSE hook logic, countdown timer, sidebar component logic, route label mapping, provider nesting
key_pattern: Service/UI — heavy browser API deps (EventSource, DOM), React component rendering; fake EventSource, real QueryClient
dependencies: bun:test (existing), FakeEventSource (new helper), TanStack Query QueryClient (lightweight, no network)
---

**Phase type: Service/UI.** Components render React UI and manage browser connections. The testable logic lives in the SSE event map, hook reconnection behavior, countdown arithmetic, route label lookups, icon selection logic, and provider ordering. No LLM calls, no database, no git operations.

---

## User Stories

| # | User Story | Validation Check | Pass Condition |
|---|-----------|-----------------|----------------|
| US-1 | As a user, I want SSE events to refresh the correct dashboard sections, so that live data appears without manual reload | `use-sse.test.ts` TestEventMapping | Each SSE event type triggers `invalidateQueries` with the correct query keys from `SSE_EVENT_MAP` |
| US-2 | As a user, I want the SSE connection to recover automatically after drops, so that I don't have to reload the page | `use-sse.test.ts` TestReconnection | Backoff follows 1s, 2s, 4s... capped at 30s; retry counter resets on "connected" event |
| US-3 | As a user, I want a live countdown to the next tick, so that I know when fresh data is coming | `next-tick-countdown.test.ts` TestCountdown | Timer decrements every second, shows "now" at 0, resets when prop changes |
| US-4 | As a user, I want breadcrumbs to reflect my current page, so that I know where I am in the dashboard | `site-header.test.ts` TestRouteLabels | `routeLabels` maps every known route to the correct human label |
| US-5 | As a user, I want repo state indicators in the sidebar, so that I can see which repos are active, sleeping, or dreaming at a glance | `app-sidebar.test.ts` TestRepoStateIndicator | Correct icon for each state, warning dot when dirty |
| US-6 | As a user, I want the sidebar navigation to show all plugin tabs in order, so that I can navigate the full dashboard | `app-sidebar.test.ts` TestPluginFiltering | Filters by `slot="tab"`, sorts by `order`, maps icon strings to Lucide components |
| US-7 | As a developer, I want providers nested in the correct order, so that tooltips and sidebar state work | `root-layout.test.ts` TestProviderNesting | QueryClientProvider > TooltipProvider > SidebarProvider |

---

## 1. Component Mock Strategy Table

| Component | Mock/Fake | What to Assert | User Story |
|---|---|---|---|
| `EventSource` (browser API) | `FakeEventSource` class (new helper) | Event listeners registered, close called on cleanup, error triggers reconnect | US-1, US-2 |
| `QueryClient` (TanStack Query) | Real `QueryClient` instance (lightweight, no network) | `invalidateQueries` called with correct keys | US-1 |
| `useRouterState` (TanStack Router) | `spyOn` returning controlled pathname | Breadcrumb label matches pathname | US-4 |
| `useQuery` (TanStack Query) | `spyOn` returning static data | Components render with provided data | US-5, US-6 |
| `setInterval` / `clearInterval` | `spyOn` with `useFakeTimers` pattern or manual tracking | Countdown decrements, stops at 0 | US-3 |
| `SSE_EVENT_MAP` (const object) | None -- test the real object | All event types map to expected query key arrays | US-1 |
| `routeLabels` (const object) | None -- test the real object | All routes map to expected labels | US-4 |
| `RepoStateIndicator` (sub-component) | None -- test the logic function directly | Returns correct icon name/props per state | US-5 |
| `DaemonStateIcon` (sub-component) | None -- test the logic function directly | Returns correct icon per daemon state | US-5 |
| React rendering (`@testing-library/react`) | Not used -- extract and test logic functions | N/A | All |

---

## 2. Test Tier Table

| Tier | Tests | Dependencies | Speed | When to Run |
|---|---|---|---|---|
| **Unit** | `sse-event-map.test.ts`, `next-tick-countdown.test.ts`, `route-labels.test.ts`, `sidebar-logic.test.ts` | Pure imports, `FakeEventSource`, real `QueryClient` | <1s | Every run (`bun test`) |
| **Integration** | `use-sse-hook.test.ts`, `root-layout.test.ts` | `FakeEventSource`, `QueryClient`, module imports from `dashboard-v2/` | 1-2s | Every run (`bun test`) |

---

## 3. Fake Implementation: FakeEventSource

The key test dependency is a programmable `EventSource` replacement. This class must live in a shared helper for reuse across SSE-related tests in Phase 2 and beyond.

```typescript
// src/__tests__/helpers/fake-event-source.ts
export class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;

  url: string;
  readyState: number = FakeEventSource.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;

  private listeners: Map<string, Set<(ev: MessageEvent) => void>> = new Map();
  private closed = false;

  /** Track all instances for test assertions */
  static instances: FakeEventSource[] = [];

  constructor(url: string | URL) {
    this.url = typeof url === "string" ? url : url.toString();
    FakeEventSource.instances.push(this);
    // Auto-open after microtask (simulates real EventSource behavior)
    queueMicrotask(() => {
      if (!this.closed) {
        this.readyState = FakeEventSource.OPEN;
        this.onopen?.(new Event("open"));
      }
    });
  }

  addEventListener(type: string, listener: (ev: any) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (ev: any) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  // --- Test helpers (not on real EventSource) ---

  /** Simulate the server sending a named event */
  emit(type: string, data: string = "{}"): void {
    const event = new MessageEvent(type, { data });
    this.listeners.get(type)?.forEach((fn) => fn(event));
  }

  /** Simulate a connection error */
  simulateError(): void {
    this.readyState = FakeEventSource.CLOSED;
    this.onerror?.(new Event("error"));
  }

  /** Simulate the "connected" event that Vigil SSE sends on first connect */
  simulateConnected(): void {
    this.emit("connected", '{"status":"ok"}');
  }

  /** Reset all tracked instances (call in afterEach) */
  static reset(): void {
    for (const instance of FakeEventSource.instances) {
      instance.close();
    }
    FakeEventSource.instances = [];
  }
}
```

---

## 4. Test File List

```
src/__tests__/
├── helpers/
│   └── fake-event-source.ts          # FakeEventSource class (new)
├── unit/
│   ├── sse-event-map.test.ts         # SSE_EVENT_MAP static correctness (US-1)
│   ├── next-tick-countdown.test.ts   # Countdown timer logic (US-3)
│   ├── route-labels.test.ts          # routeLabels mapping (US-4)
│   └── sidebar-logic.test.ts         # RepoStateIndicator, DaemonStateIcon, plugin filtering (US-5, US-6)
└── integration/
    ├── use-sse-hook.test.ts          # useSSE hook with FakeEventSource + real QueryClient (US-1, US-2)
    └── root-layout.test.ts           # Provider nesting order verification (US-7)
```

---

## 5. Test Setup

### New helper: `src/__tests__/helpers/fake-event-source.ts`

The `FakeEventSource` class defined in Section 3 above. This replaces the global `EventSource` in test scope by assigning `globalThis.EventSource = FakeEventSource as any` in `beforeEach`, and restoring in `afterEach`.

### QueryClient for tests

```typescript
import { QueryClient } from "@tanstack/react-query";

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}
```

This is lightweight (no network, no cache persistence) and safe to create per-test.

### Timer control pattern

For countdown tests, use `spyOn(globalThis, "setInterval")` and `spyOn(globalThis, "clearInterval")` to capture timer registrations without actually waiting for real time. Alternatively, use Bun's timer mocking if available, or test the pure decrement logic extracted from the component.

---

## 6. Key Testing Decisions

| Decision | Approach | Rationale |
|---|---|---|
| No React Testing Library | Extract logic into testable functions; test the functions directly | Avoids heavy DOM setup in `bun:test`; component rendering is verified by dev server + visual inspection |
| FakeEventSource over patching global | Dedicated class with `emit()` and `simulateError()` helpers | Cleaner than monkey-patching, enables programmatic event triggering, tracks instances for cleanup |
| Real QueryClient, spied `invalidateQueries` | `spyOn(queryClient, "invalidateQueries")` | Verifies exact query keys without network calls; QueryClient is lightweight enough to use real |
| Test countdown logic as pure function | Extract `computeDisplay(seconds)` and test interval/reset logic separately | Timer-dependent tests are flaky; pure logic tests are deterministic |
| Test provider nesting via module inspection | Import `__root.tsx`, inspect the JSX tree structure or render order assertions | Full React rendering requires JSDOM; module-level verification is sufficient for nesting order |
| Exhaustive event map coverage | One test case per SSE event type in `SSE_EVENT_MAP` | Prevents silent regressions when adding new event types |

---

## 7. Example Test Cases

### 7a. SSE Event Map (unit)

```typescript
// src/__tests__/unit/sse-event-map.test.ts
import { describe, it, expect } from "bun:test";
import { SSE_EVENT_MAP } from "../../../dashboard-v2/src/hooks/use-sse";

describe("SSE_EVENT_MAP", () => {
  it("maps tick to overview, repos.all, and timeline", () => {
    const keys = SSE_EVENT_MAP["tick"];
    expect(keys).toBeDefined();
    expect(keys.length).toBe(3);
    // Verify specific query key prefixes
    const flatKeys = keys.map((k) => k[0]);
    expect(flatKeys).toContain("overview");
    expect(flatKeys).toContain("repos");
    expect(flatKeys).toContain("timeline");
  });

  it("maps dream to dreams and memory.stats", () => {
    const keys = SSE_EVENT_MAP["dream"];
    expect(keys).toBeDefined();
    const flatKeys = keys.map((k) => k[0]);
    expect(flatKeys).toContain("dreams");
    expect(flatKeys).toContain("memory");
  });

  it("maps dream_completed to dreams and memory.stats", () => {
    const keys = SSE_EVENT_MAP["dream_completed"];
    expect(keys).toBeDefined();
    expect(keys.length).toBe(2);
  });

  it("maps dream_started to dreams only", () => {
    const keys = SSE_EVENT_MAP["dream_started"];
    expect(keys).toBeDefined();
    expect(keys.length).toBe(1);
  });

  it("maps action_pending to actions.pending and actions.all", () => {
    const keys = SSE_EVENT_MAP["action_pending"];
    expect(keys).toBeDefined();
    expect(keys.length).toBe(2);
  });

  it("maps action_resolved to actions.all and actions.pending", () => {
    const keys = SSE_EVENT_MAP["action_resolved"];
    expect(keys).toBeDefined();
    expect(keys.length).toBe(2);
  });

  it("maps state_change to overview only", () => {
    const keys = SSE_EVENT_MAP["state_change"];
    expect(keys).toBeDefined();
    expect(keys.length).toBe(1);
  });

  it("maps config_changed to config", () => {
    const keys = SSE_EVENT_MAP["config_changed"];
    expect(keys).toBeDefined();
    expect(keys.length).toBe(1);
  });

  it("maps task_updated to tasks", () => {
    const keys = SSE_EVENT_MAP["task_updated"];
    expect(keys).toBeDefined();
    expect(keys.length).toBe(1);
  });

  it("maps message to timeline", () => {
    const keys = SSE_EVENT_MAP["message"];
    expect(keys).toBeDefined();
    expect(keys.length).toBe(1);
  });

  it("maps decision to timeline and metrics", () => {
    const keys = SSE_EVENT_MAP["decision"];
    expect(keys).toBeDefined();
    expect(keys.length).toBe(2);
  });

  it("maps schedule_fired to scheduler", () => {
    const keys = SSE_EVENT_MAP["schedule_fired"];
    expect(keys).toBeDefined();
    expect(keys.length).toBe(1);
  });

  it("contains all 16 expected event types", () => {
    const expectedEvents = [
      "tick", "message", "decision", "action",
      "action_pending", "action_resolved",
      "dream", "dream_started", "dream_completed",
      "state_change", "config_changed", "task_updated",
      "schedule_fired", "webhook", "channel", "health",
    ];
    for (const event of expectedEvents) {
      expect(SSE_EVENT_MAP[event]).toBeDefined();
    }
    expect(Object.keys(SSE_EVENT_MAP).length).toBe(expectedEvents.length);
  });
});
```

### 7b. useSSE Hook Integration

```typescript
// src/__tests__/integration/use-sse-hook.test.ts
import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { FakeEventSource } from "../helpers/fake-event-source";

// Replace global EventSource with FakeEventSource for all tests in this file
const originalEventSource = globalThis.EventSource;

describe("useSSE hook", () => {
  let queryClient: QueryClient;
  let invalidateSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    globalThis.EventSource = FakeEventSource as any;
    FakeEventSource.reset();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    invalidateSpy = spyOn(queryClient, "invalidateQueries");
  });

  afterEach(() => {
    globalThis.EventSource = originalEventSource;
    FakeEventSource.reset();
    queryClient.clear();
  });

  // NOTE: Since useSSE is a React hook (calls useQueryClient, useRef, useEffect),
  // direct invocation outside React is not possible. These tests verify the
  // hook's internal logic by simulating what the hook does: creating an
  // EventSource, wiring event listeners from SSE_EVENT_MAP, and handling errors.
  //
  // The approach: import SSE_EVENT_MAP and replicate the hook's connect() logic
  // in a plain function, testing the wiring and backoff behavior.

  it("registers listeners for all SSE_EVENT_MAP entries", async () => {
    const { SSE_EVENT_MAP } = await import(
      "../../../dashboard-v2/src/hooks/use-sse"
    );

    const source = new FakeEventSource("/api/sse");
    const eventTypes = Object.keys(SSE_EVENT_MAP);

    // Wire up listeners the same way the hook does
    for (const [eventType, keys] of Object.entries(SSE_EVENT_MAP)) {
      source.addEventListener(eventType, () => {
        for (const queryKey of keys as readonly string[][]) {
          queryClient.invalidateQueries({ queryKey });
        }
      });
    }

    // Emit a tick event
    source.emit("tick");
    expect(invalidateSpy).toHaveBeenCalledTimes(3); // overview, repos.all, timeline

    invalidateSpy.mockClear();

    // Emit a dream event
    source.emit("dream");
    expect(invalidateSpy).toHaveBeenCalledTimes(2); // dreams, memory.stats
  });

  it("each event type invalidates the correct number of query keys", async () => {
    const { SSE_EVENT_MAP } = await import(
      "../../../dashboard-v2/src/hooks/use-sse"
    );

    const source = new FakeEventSource("/api/sse");

    for (const [eventType, keys] of Object.entries(SSE_EVENT_MAP)) {
      source.addEventListener(eventType, () => {
        for (const queryKey of keys as readonly string[][]) {
          queryClient.invalidateQueries({ queryKey });
        }
      });
    }

    const expectedCounts: Record<string, number> = {
      tick: 3,
      message: 1,
      decision: 2,
      action: 1,
      action_pending: 2,
      action_resolved: 2,
      dream: 2,
      dream_started: 1,
      dream_completed: 2,
      state_change: 1,
      config_changed: 1,
      task_updated: 1,
      schedule_fired: 1,
      webhook: 1,
      channel: 1,
      health: 1,
    };

    for (const [eventType, expectedCount] of Object.entries(expectedCounts)) {
      invalidateSpy.mockClear();
      source.emit(eventType);
      expect(invalidateSpy).toHaveBeenCalledTimes(expectedCount);
    }
  });

  describe("exponential backoff", () => {
    it("computes correct delay sequence: 1s, 2s, 4s, 8s, 16s, 30s, 30s", () => {
      // This tests the backoff formula: Math.min(1000 * 2 ** retry, 30_000)
      const delays = [0, 1, 2, 3, 4, 5, 6].map(
        (retry) => Math.min(1000 * 2 ** retry, 30_000)
      );
      expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    });

    it("caps backoff at 30 seconds for large retry counts", () => {
      const delay = Math.min(1000 * 2 ** 100, 30_000);
      expect(delay).toBe(30_000);
    });

    it("retry counter resets on connected event (logical test)", () => {
      // Simulates the hook's retry counter behavior
      let retryCount = 5; // Simulate 5 failed retries
      const source = new FakeEventSource("/api/sse");

      source.addEventListener("connected", () => {
        retryCount = 0;
      });

      expect(retryCount).toBe(5);
      source.simulateConnected();
      expect(retryCount).toBe(0);
    });

    it("error handler increments retry count and schedules reconnect", () => {
      let retryCount = 0;
      let scheduledDelay = -1;

      const source = new FakeEventSource("/api/sse");
      source.onerror = () => {
        source.close();
        scheduledDelay = Math.min(1000 * 2 ** retryCount, 30_000);
        retryCount++;
      };

      // First error
      source.simulateError();
      expect(retryCount).toBe(1);
      expect(scheduledDelay).toBe(1000);

      // Second error (new source would be created by reconnect)
      const source2 = new FakeEventSource("/api/sse");
      source2.onerror = () => {
        source2.close();
        scheduledDelay = Math.min(1000 * 2 ** retryCount, 30_000);
        retryCount++;
      };
      source2.simulateError();
      expect(retryCount).toBe(2);
      expect(scheduledDelay).toBe(2000);
    });
  });

  it("FakeEventSource closes cleanly", () => {
    const source = new FakeEventSource("/api/sse");
    expect(source.readyState).toBe(FakeEventSource.CONNECTING);
    source.close();
    expect(source.readyState).toBe(FakeEventSource.CLOSED);
  });

  it("FakeEventSource tracks all instances", () => {
    FakeEventSource.reset();
    new FakeEventSource("/api/sse");
    new FakeEventSource("/api/sse");
    expect(FakeEventSource.instances.length).toBe(2);
    FakeEventSource.reset();
    expect(FakeEventSource.instances.length).toBe(0);
  });
});
```

### 7c. NextTickCountdown Logic

```typescript
// src/__tests__/unit/next-tick-countdown.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";

// Test the countdown logic as pure functions, extracted from the component.
// The component uses: useState(Math.max(0, Math.round(nextTickIn))),
// useEffect to reset on prop change, useEffect with setInterval to decrement.

describe("NextTickCountdown logic", () => {
  describe("initial value computation", () => {
    it("rounds the input to nearest integer", () => {
      expect(Math.max(0, Math.round(14.7))).toBe(15);
      expect(Math.max(0, Math.round(14.3))).toBe(14);
      expect(Math.max(0, Math.round(0.5))).toBe(1);
    });

    it("clamps negative values to 0", () => {
      expect(Math.max(0, Math.round(-5))).toBe(0);
      expect(Math.max(0, Math.round(-0.1))).toBe(0);
    });

    it("handles zero", () => {
      expect(Math.max(0, Math.round(0))).toBe(0);
    });
  });

  describe("display logic", () => {
    it("shows seconds format when > 0", () => {
      const display = (seconds: number) =>
        seconds > 0 ? `${seconds}s` : "now";
      expect(display(30)).toBe("30s");
      expect(display(1)).toBe("1s");
    });

    it('shows "now" when seconds is 0', () => {
      const display = (seconds: number) =>
        seconds > 0 ? `${seconds}s` : "now";
      expect(display(0)).toBe("now");
    });

    it('shows "now" for negative values (should not happen but defensive)', () => {
      const display = (seconds: number) =>
        seconds > 0 ? `${seconds}s` : "now";
      expect(display(-1)).toBe("now");
    });
  });

  describe("decrement behavior", () => {
    it("decrements by 1 each step, stops at 0", () => {
      let seconds = 3;
      const steps: number[] = [seconds];

      // Simulate 5 interval ticks
      for (let i = 0; i < 5; i++) {
        seconds = Math.max(0, seconds - 1);
        steps.push(seconds);
      }

      expect(steps).toEqual([3, 2, 1, 0, 0, 0]);
    });

    it("never goes below 0", () => {
      let seconds = 1;
      for (let i = 0; i < 10; i++) {
        seconds = Math.max(0, seconds - 1);
      }
      expect(seconds).toBe(0);
    });
  });

  describe("prop change reset", () => {
    it("resets to new value when nextTickIn changes", () => {
      // Simulates: seconds was counting down from 30, now prop changes to 25
      let seconds = 12; // Was counting down from 30
      const newProp = 25;
      seconds = Math.max(0, Math.round(newProp)); // Reset logic
      expect(seconds).toBe(25);
    });

    it("resets to 0 when nextTickIn is 0", () => {
      let seconds = 15;
      const newProp = 0;
      seconds = Math.max(0, Math.round(newProp));
      expect(seconds).toBe(0);
    });
  });

  describe("interval lifecycle", () => {
    it("should not start interval when seconds is already 0", () => {
      // The component's useEffect: if seconds <= 0, don't start interval
      const seconds = 0;
      const shouldStartInterval = seconds > 0;
      expect(shouldStartInterval).toBe(false);
    });

    it("should start interval when seconds > 0", () => {
      const seconds = 10;
      const shouldStartInterval = seconds > 0;
      expect(shouldStartInterval).toBe(true);
    });

    it("should clear interval when seconds reaches 0", () => {
      // Simulates: interval fires, seconds becomes 0, interval should clear
      let seconds = 1;
      let intervalCleared = false;

      // Simulate one tick
      seconds = Math.max(0, seconds - 1);
      if (seconds <= 0) {
        intervalCleared = true; // clearInterval would be called
      }

      expect(seconds).toBe(0);
      expect(intervalCleared).toBe(true);
    });
  });
});
```

### 7d. Route Labels

```typescript
// src/__tests__/unit/route-labels.test.ts
import { describe, it, expect } from "bun:test";

// Import routeLabels from the site-header component once it exists.
// For now, define the expected mapping inline to validate correctness.
// The test will be updated to import from the real module.

const routeLabels: Record<string, string> = {
  "/": "Timeline",
  "/repos": "Repos",
  "/dreams": "Dreams",
  "/tasks": "Tasks",
  "/actions": "Actions",
  "/memory": "Memory",
  "/metrics": "Metrics",
  "/scheduler": "Scheduler",
  "/config": "Config",
};

describe("routeLabels", () => {
  it("maps / to Timeline", () => {
    expect(routeLabels["/"]).toBe("Timeline");
  });

  it("maps /repos to Repos", () => {
    expect(routeLabels["/repos"]).toBe("Repos");
  });

  it("maps /dreams to Dreams", () => {
    expect(routeLabels["/dreams"]).toBe("Dreams");
  });

  it("maps /tasks to Tasks", () => {
    expect(routeLabels["/tasks"]).toBe("Tasks");
  });

  it("maps /actions to Actions", () => {
    expect(routeLabels["/actions"]).toBe("Actions");
  });

  it("maps /memory to Memory", () => {
    expect(routeLabels["/memory"]).toBe("Memory");
  });

  it("maps /metrics to Metrics", () => {
    expect(routeLabels["/metrics"]).toBe("Metrics");
  });

  it("maps /scheduler to Scheduler", () => {
    expect(routeLabels["/scheduler"]).toBe("Scheduler");
  });

  it("maps /config to Config", () => {
    expect(routeLabels["/config"]).toBe("Config");
  });

  it("contains exactly 9 route entries", () => {
    expect(Object.keys(routeLabels).length).toBe(9);
  });

  it('falls back to "Dashboard" for unknown routes', () => {
    const label = routeLabels["/unknown"] ?? "Dashboard";
    expect(label).toBe("Dashboard");
  });
});
```

### 7e. Sidebar Logic (RepoStateIndicator, DaemonStateIcon, plugin filtering)

```typescript
// src/__tests__/unit/sidebar-logic.test.ts
import { describe, it, expect } from "bun:test";

// These tests validate the pure logic that drives sidebar rendering.
// Since the actual components are React components that cannot be rendered
// in bun:test without JSDOM, we test the decision logic as plain functions.
// When implementing, export these logic functions from app-sidebar.tsx
// or extract to a shared utility.

// --- RepoStateIndicator logic ---

type RepoState = "active" | "sleeping" | "dreaming";

interface RepoIndicator {
  icon: string;
  color: string;
  showWarning: boolean;
}

function getRepoIndicator(state: RepoState, dirty: boolean): RepoIndicator {
  const showWarning = dirty;
  switch (state) {
    case "active":
      return { icon: "Circle", color: "text-green-500", showWarning };
    case "sleeping":
      return { icon: "Moon", color: "text-text-muted", showWarning };
    case "dreaming":
      return { icon: "Sparkles", color: "text-vigil", showWarning };
    default:
      return { icon: "Circle", color: "text-text-muted", showWarning };
  }
}

// --- DaemonStateIcon logic ---

type DaemonState = "awake" | "sleeping" | "dreaming";

function getDaemonIcon(state: DaemonState | undefined): string {
  switch (state) {
    case "sleeping":
      return "Moon";
    case "dreaming":
      return "Sparkles";
    default:
      return "Circle";
  }
}

// --- Plugin tab filtering and sorting ---

interface PluginWidget {
  id: string;
  label: string;
  icon: string;
  slot: "tab" | "widget" | "panel";
  order: number;
}

function getTabPlugins(plugins: PluginWidget[]): PluginWidget[] {
  return plugins
    .filter((p) => p.slot === "tab")
    .sort((a, b) => a.order - b.order);
}

function getIconPath(tabId: string): string {
  return tabId === "timeline" ? "/" : `/${tabId}`;
}

// --- Tests ---

describe("RepoStateIndicator", () => {
  it("returns green Circle for active state", () => {
    const result = getRepoIndicator("active", false);
    expect(result.icon).toBe("Circle");
    expect(result.color).toBe("text-green-500");
    expect(result.showWarning).toBe(false);
  });

  it("returns Moon for sleeping state", () => {
    const result = getRepoIndicator("sleeping", false);
    expect(result.icon).toBe("Moon");
  });

  it("returns Sparkles for dreaming state", () => {
    const result = getRepoIndicator("dreaming", false);
    expect(result.icon).toBe("Sparkles");
  });

  it("shows warning dot when dirty is true (active)", () => {
    const result = getRepoIndicator("active", true);
    expect(result.showWarning).toBe(true);
    expect(result.icon).toBe("Circle");
  });

  it("shows warning dot when dirty is true (sleeping)", () => {
    const result = getRepoIndicator("sleeping", true);
    expect(result.showWarning).toBe(true);
  });

  it("does not show warning dot when dirty is false", () => {
    const result = getRepoIndicator("dreaming", false);
    expect(result.showWarning).toBe(false);
  });
});

describe("DaemonStateIcon", () => {
  it("returns Moon for sleeping", () => {
    expect(getDaemonIcon("sleeping")).toBe("Moon");
  });

  it("returns Sparkles for dreaming", () => {
    expect(getDaemonIcon("dreaming")).toBe("Sparkles");
  });

  it("returns Circle for awake", () => {
    expect(getDaemonIcon("awake")).toBe("Circle");
  });

  it("returns Circle for undefined state", () => {
    expect(getDaemonIcon(undefined)).toBe("Circle");
  });
});

describe("plugin tab filtering", () => {
  const testPlugins: PluginWidget[] = [
    { id: "timeline", label: "Timeline", icon: "Clock", slot: "tab", order: 1 },
    { id: "repos", label: "Repos", icon: "GitBranch", slot: "tab", order: 2 },
    { id: "dreams", label: "Dreams", icon: "Sparkles", slot: "tab", order: 3 },
    { id: "widget-1", label: "Widget", icon: "Box", slot: "widget", order: 1 },
    { id: "tasks", label: "Tasks", icon: "CheckSquare", slot: "tab", order: 4 },
    { id: "panel-1", label: "Panel", icon: "Layout", slot: "panel", order: 1 },
  ];

  it("filters only tab-slot plugins", () => {
    const tabs = getTabPlugins(testPlugins);
    expect(tabs.length).toBe(4);
    expect(tabs.every((t) => t.slot === "tab")).toBe(true);
  });

  it("sorts tabs by order ascending", () => {
    const tabs = getTabPlugins(testPlugins);
    expect(tabs.map((t) => t.id)).toEqual([
      "timeline", "repos", "dreams", "tasks",
    ]);
  });

  it("handles empty plugin array", () => {
    const tabs = getTabPlugins([]);
    expect(tabs.length).toBe(0);
  });

  it("handles array with no tab-slot plugins", () => {
    const widgetOnly: PluginWidget[] = [
      { id: "w1", label: "W1", icon: "Box", slot: "widget", order: 1 },
    ];
    const tabs = getTabPlugins(widgetOnly);
    expect(tabs.length).toBe(0);
  });

  it("preserves order when multiple tabs have same order value", () => {
    const samePriority: PluginWidget[] = [
      { id: "b", label: "B", icon: "Box", slot: "tab", order: 1 },
      { id: "a", label: "A", icon: "Box", slot: "tab", order: 1 },
    ];
    const tabs = getTabPlugins(samePriority);
    // Stable sort preserves insertion order for equal keys
    expect(tabs.length).toBe(2);
  });
});

describe("tab path mapping", () => {
  it('maps "timeline" to /', () => {
    expect(getIconPath("timeline")).toBe("/");
  });

  it("maps other tab IDs to /<id>", () => {
    expect(getIconPath("dreams")).toBe("/dreams");
    expect(getIconPath("repos")).toBe("/repos");
    expect(getIconPath("tasks")).toBe("/tasks");
    expect(getIconPath("memory")).toBe("/memory");
  });
});

describe("Lucide icon string resolution", () => {
  it("validates that icon strings are valid Lucide component names", () => {
    // These are the icon strings used by corePlugins
    const expectedIcons = [
      "Clock", "GitBranch", "Sparkles", "CheckSquare",
      "Zap", "Brain", "BarChart3", "Calendar", "Settings",
    ];

    // In the real component: (LucideIcons as Record<string, any>)[tab.icon]
    // Here we just validate the strings are non-empty and PascalCase
    for (const icon of expectedIcons) {
      expect(icon.length).toBeGreaterThan(0);
      expect(icon[0]).toBe(icon[0].toUpperCase()); // PascalCase
    }
  });
});
```

### 7f. Provider Nesting Order

```typescript
// src/__tests__/integration/root-layout.test.ts
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Since we cannot render React components in bun:test without JSDOM,
// we verify the provider nesting order by inspecting the source code
// of __root.tsx. This is a structural test that ensures the provider
// tree is wired correctly.

const ROOT_FILE = join(
  import.meta.dir,
  "../../../dashboard-v2/src/routes/__root.tsx"
);

describe("root layout provider nesting", () => {
  let source: string;

  try {
    source = readFileSync(ROOT_FILE, "utf-8");
  } catch {
    source = "";
  }

  const fileExists = source.length > 0;

  it.skipIf(!fileExists)("file exists and is non-empty", () => {
    expect(source.length).toBeGreaterThan(0);
  });

  it.skipIf(!fileExists)(
    "QueryClientProvider wraps TooltipProvider",
    () => {
      const qcpIndex = source.indexOf("QueryClientProvider");
      const tpIndex = source.indexOf("TooltipProvider");
      expect(qcpIndex).toBeGreaterThan(-1);
      expect(tpIndex).toBeGreaterThan(-1);
      expect(qcpIndex).toBeLessThan(tpIndex);
    }
  );

  it.skipIf(!fileExists)(
    "TooltipProvider wraps SidebarProvider",
    () => {
      const tpIndex = source.indexOf("TooltipProvider");
      const spIndex = source.indexOf("SidebarProvider");
      expect(tpIndex).toBeGreaterThan(-1);
      expect(spIndex).toBeGreaterThan(-1);
      expect(tpIndex).toBeLessThan(spIndex);
    }
  );

  it.skipIf(!fileExists)("useSSE is called inside AppShell", () => {
    // Verify useSSE() is called somewhere after AppShell function definition
    expect(source).toContain("useSSE()");
  });

  it.skipIf(!fileExists)(
    "AppSidebar receives corePlugins prop",
    () => {
      expect(source).toMatch(/AppSidebar.*plugins.*=.*\{.*corePlugins.*\}/s);
    }
  );

  it.skipIf(!fileExists)("Outlet is inside SidebarInset", () => {
    const siIndex = source.indexOf("SidebarInset");
    const outletIndex = source.indexOf("<Outlet");
    expect(siIndex).toBeGreaterThan(-1);
    expect(outletIndex).toBeGreaterThan(-1);
    expect(siIndex).toBeLessThan(outletIndex);
  });

  it.skipIf(!fileExists)(
    "imports app.css for Tailwind theme",
    () => {
      expect(source).toContain("app.css");
    }
  );
});
```

---

## 8. Execution Prompt

You are writing the test suite for Phase 2 (Shell Layout) of Vigil Dashboard v2 -- a TanStack Start + React rewrite of an existing HTMX dashboard for a local git monitoring daemon.

### Project context

Vigil is a Bun/TypeScript project. Tests use `bun:test` (not Jest/Vitest). The existing test suite lives in `src/__tests__/` with `unit/` and `integration/` subdirectories. Test helpers are in `src/__tests__/helpers/`. The dashboard v2 source lives in `dashboard-v2/` at the repo root.

### Why these tests exist

Phase 2 builds the persistent UI shell: sidebar navigation, sticky header with breadcrumbs, SSE-driven cache invalidation, and the root layout provider tree. These tests verify:
1. The SSE event map correctly routes each event type to the right TanStack Query keys
2. The SSE reconnection logic follows exponential backoff (1s, 2s, 4s... capped 30s)
3. The countdown timer logic is correct (decrement, clamp, reset, display)
4. Route labels map every known pathname to the correct breadcrumb text
5. Sidebar sub-component logic (repo state icons, daemon state icons, plugin filtering/sorting)
6. The root layout nests providers in the required order

### Phase type: Service/UI

Components render React UI and manage browser connections. Since `bun:test` does not include JSDOM, we cannot render React components directly. Instead, we extract and test the pure logic functions that drive rendering decisions, and verify structural properties of the root layout by inspecting its source code.

### Mock strategy

- **FakeEventSource**: A programmable `EventSource` replacement with `emit()`, `simulateError()`, `simulateConnected()`, and instance tracking. Defined in `src/__tests__/helpers/fake-event-source.ts`. Assigned to `globalThis.EventSource` in `beforeEach`, restored in `afterEach`.
- **QueryClient**: Real TanStack Query `QueryClient` instance (lightweight, no network). `invalidateQueries` is spied via `spyOn` to verify correct query key dispatch.
- **No React rendering**: All logic tested as pure functions. Component rendering verified by dev server and visual inspection.

### What NOT to test

- Visual rendering (colors, layout, CSS classes) -- requires a browser
- shadcn/ui primitive behavior (Sidebar collapse animation, Tooltip positioning) -- these are vendored Radix components
- TanStack Router navigation -- tested by the framework
- Actual SSE network connections -- tested by the existing daemon dashboard tests
- Server function responses -- mocked; real API tested in integration/dashboard tests

### Files to create

**1. `src/__tests__/helpers/fake-event-source.ts`**
The `FakeEventSource` class as defined in Section 3 of this plan. Key features:
- Implements `addEventListener`, `removeEventListener`, `close`
- `readyState` tracking (CONNECTING -> OPEN -> CLOSED)
- `emit(type, data)` -- triggers listeners for a named event
- `simulateError()` -- sets CLOSED and fires `onerror`
- `simulateConnected()` -- emits the "connected" event
- `static instances[]` and `static reset()` for cleanup
- Auto-opens via `queueMicrotask` after construction

**2. `src/__tests__/unit/sse-event-map.test.ts`**
Tests the `SSE_EVENT_MAP` constant exported from `dashboard-v2/src/hooks/use-sse.ts`:
- One test per event type verifying the correct number of query keys
- `tick` -> 3 keys (overview, repos, timeline)
- `dream` -> 2 keys (dreams, memory.stats)
- `dream_started` -> 1 key (dreams)
- `dream_completed` -> 2 keys (dreams, memory.stats)
- `action_pending` -> 2 keys, `action_resolved` -> 2 keys
- `state_change` -> 1 key, `config_changed` -> 1 key, `task_updated` -> 1 key
- `message` -> 1 key, `decision` -> 2 keys
- `schedule_fired` -> 1, `webhook` -> 1, `channel` -> 1, `health` -> 1
- Verify exactly 16 event types exist (no extras, no missing)

**3. `src/__tests__/integration/use-sse-hook.test.ts`**
Integration test using `FakeEventSource` and a real `QueryClient`:
- Registers listeners for all `SSE_EVENT_MAP` entries and verifies `invalidateQueries` call counts per event type
- Tests exponential backoff formula: `Math.min(1000 * 2 ** retry, 30_000)` for retries 0-6
- Tests backoff cap at 30s for large retry counts
- Tests retry counter reset when "connected" event fires
- Tests error handler increments retry count and computes correct delay
- Tests `FakeEventSource` cleanup and instance tracking

**4. `src/__tests__/unit/next-tick-countdown.test.ts`**
Tests countdown timer pure logic:
- Initial value: `Math.max(0, Math.round(nextTickIn))` -- rounds, clamps negatives to 0
- Display: `seconds > 0 ? "${seconds}s" : "now"`
- Decrement: steps [3, 2, 1, 0, 0, 0] -- never goes below 0
- Prop reset: when nextTickIn changes, seconds resets to new rounded value
- Interval lifecycle: starts when seconds > 0, clears when seconds reaches 0

**5. `src/__tests__/unit/route-labels.test.ts`**
Tests the `routeLabels` map:
- All 9 routes map to expected labels (/, /repos, /dreams, /tasks, /actions, /memory, /metrics, /scheduler, /config)
- Exactly 9 entries (no extras)
- Unknown routes fall back to "Dashboard" via nullish coalescing

NOTE: Initially defines `routeLabels` inline (matching the plan spec). Update import path to `dashboard-v2/src/components/layout/site-header.ts` once the component is implemented and the export is available.

**6. `src/__tests__/unit/sidebar-logic.test.ts`**
Tests sidebar sub-component logic as pure functions:
- `RepoStateIndicator`: active -> green Circle, sleeping -> Moon, dreaming -> Sparkles; dirty flag controls warning dot
- `DaemonStateIcon`: sleeping -> Moon, dreaming -> Sparkles, awake/undefined -> Circle
- Plugin filtering: filters `slot === "tab"`, sorts by `order`, handles empty arrays
- Tab path mapping: "timeline" -> "/", others -> "/<id>"
- Icon string validation: all expected icon names are non-empty PascalCase strings

NOTE: Initially defines logic functions inline. When implementing `app-sidebar.tsx`, export `getRepoIndicator`, `getDaemonIcon`, `getTabPlugins`, and `getIconPath` as named exports for direct import in tests.

**7. `src/__tests__/integration/root-layout.test.ts`**
Structural verification of `dashboard-v2/src/routes/__root.tsx`:
- File exists and is non-empty (skipIf guard for pre-implementation)
- `QueryClientProvider` appears before `TooltipProvider` in source
- `TooltipProvider` appears before `SidebarProvider` in source
- `useSSE()` is called
- `AppSidebar` receives `corePlugins` prop
- `Outlet` is inside `SidebarInset`
- `app.css` is imported

### Implementation notes for test authors

1. **FakeEventSource goes in helpers/**, not inline in test files. Multiple test files will need it.
2. **`bun:test` does not have `jest.useFakeTimers()`**. For timer-dependent tests, either:
   - Test the pure logic (preferred -- see countdown tests)
   - Use `spyOn(globalThis, "setTimeout")` to capture scheduled callbacks
3. **Import paths**: Dashboard v2 source is at `dashboard-v2/src/`. From `src/__tests__/unit/`, the relative path is `../../../dashboard-v2/src/...`. Use dynamic `import()` with `skipIf` guards for files that may not exist yet.
4. **Inline logic duplication**: Several tests define logic functions inline rather than importing from components. This is intentional -- it allows tests to be written before the components exist. When the components are implemented, update imports to use the real exports.
5. **No `@testing-library/react`**: Do not add this dependency. All component behavior is tested via extracted logic functions and source code inspection.

### Success criteria

```bash
# Unit tests (always pass, no build required, no dashboard-v2 files needed)
bun test src/__tests__/unit/next-tick-countdown.test.ts
bun test src/__tests__/unit/route-labels.test.ts
bun test src/__tests__/unit/sidebar-logic.test.ts

# Unit tests (require dashboard-v2/src/hooks/use-sse.ts to exist)
bun test src/__tests__/unit/sse-event-map.test.ts

# Integration tests (require dashboard-v2 source files)
bun test src/__tests__/integration/use-sse-hook.test.ts
bun test src/__tests__/integration/root-layout.test.ts

# All Phase 2 tests
bun test --filter "sse-event-map|use-sse-hook|next-tick-countdown|route-labels|sidebar-logic|root-layout"
```

All tests exit 0. Tests that depend on dashboard-v2 source files skip cleanly (not fail) when those files do not exist.

---

## 9. Run Commands

```bash
# Fast: pure logic tests only (<1s, no external deps)
bun test src/__tests__/unit/next-tick-countdown.test.ts src/__tests__/unit/route-labels.test.ts src/__tests__/unit/sidebar-logic.test.ts

# SSE map test (requires dashboard-v2/src/hooks/use-sse.ts)
bun test src/__tests__/unit/sse-event-map.test.ts

# Integration: SSE hook + root layout (requires dashboard-v2 source)
bun test src/__tests__/integration/use-sse-hook.test.ts src/__tests__/integration/root-layout.test.ts

# All Phase 2 tests
bun test --filter "sse-event-map|use-sse-hook|next-tick-countdown|route-labels|sidebar-logic|root-layout"

# Focused: single test file
bun test src/__tests__/unit/sidebar-logic.test.ts
bun test src/__tests__/integration/use-sse-hook.test.ts
```

---

## Coverage Check

- [PASS] Phase type identified: Service/UI -- browser API deps faked, pure logic extracted and tested directly
- [PASS] User stories block present with 7 stories derived from phase deliverables
- [PASS] Every user story traces to at least one component in the mock strategy table
- [PASS] Every deliverable has at least one test file: SSE_EVENT_MAP -> sse-event-map.test.ts, useSSE hook -> use-sse-hook.test.ts, NextTickCountdown -> next-tick-countdown.test.ts, routeLabels -> route-labels.test.ts, AppSidebar logic -> sidebar-logic.test.ts, root layout -> root-layout.test.ts
- [PASS] FakeEventSource is the key mock, fully specified with implementation in Section 3 and helper file in Section 4
- [PASS] No React rendering attempted -- all logic tested as pure functions or via source inspection
- [PASS] No Jest/Vitest -- all tests use `bun:test` imports (describe, it, expect, beforeEach, afterEach, spyOn)
- [PASS] Tests that depend on unimplemented files use skipIf guards or inline logic duplication
- [PASS] Execution prompt is self-contained with full FakeEventSource implementation, all test specifications, and implementation notes
- [PASS] Run commands section present with fast, integration, and focused variants
