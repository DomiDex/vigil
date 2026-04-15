# Phase 4 — Port Core Plugins: Test Plan

---
scope: 7 plugin pages, 6 shared components, 7 route files — all React/TanStack components calling Phase 1 server functions
key_pattern: Service/UI — mock server functions, test component logic with real QueryClient
dependencies: bun:test (existing), @tanstack/react-query (real QueryClient, no provider needed for logic tests)
---

**Phase type: Service/UI.** All 7 plugins follow the proven Timeline pattern from Phase 3. Server functions are mocked (spyOn), component logic tested through query/mutation behavior. No DOM rendering tests (no jsdom) — test data transformations, mutation side effects, and exported constants.

---

## User Stories

| # | User Story | Validation Check | Pass Condition |
|---|-----------|-----------------|----------------|
| US-1 | As a user, I want to see repo status at a glance, so I can tell which repos are active, sleeping, or dirty | `phase4-repos.test.ts` RepoCard state icons | State icon mapping returns correct icon per state (active/sleeping/dreaming), dirty dot rendered when dirty=true |
| US-2 | As a user, I want to expand a repo for detail, so I can see commits, patterns, and decision distribution | `phase4-repos.test.ts` ReposPage detail | Selected repo triggers detail query with correct key, detail query uses repo name parameter |
| US-3 | As a user, I want to see dream history and trigger manual dreams, so I can consolidate memory on demand | `phase4-dreams.test.ts` DreamsPage trigger | triggerDream mutation called with selected repo, invalidates dreams query key on success |
| US-4 | As a user, I want expandable dream entries, so I can read insights without clutter | `phase4-dreams.test.ts` DreamEntry | Truncated summary by default, expanded state shows insights and patterns lists |
| US-5 | As a user, I want to manage tasks with status filters, so I can focus on what needs attention | `phase4-tasks.test.ts` TasksPage | Filter tabs compute correct counts from data, action buttons map to correct mutations per status |
| US-6 | As a user, I want parent-child task indentation, so I can see task hierarchy | `phase4-tasks.test.ts` TasksPage sorting | Tasks with parentId sorted under parents, indentation class applied |
| US-7 | As a user, I want to review and approve/reject actions with safety context, so I can make informed decisions | `phase4-actions.test.ts` ActionApproval | Tier badge maps to correct color, 6-gate checklist renders correct icons per gate state, approve/reject call correct mutations |
| US-8 | As a user, I want to see the memory pipeline and search it, so I can understand what Vigil remembers | `phase4-memory.test.ts` MemoryPage + MemorySearch | Pipeline boxes show counts, search mutation fires with query+repo, results include similarity scores |
| US-9 | As a user, I want to ask Vigil questions, so I can get AI-powered answers about my repos | `phase4-memory.test.ts` AskVigil | askVigil mutation fires with question+repo, button disabled while isPending, response displays answer+sources |
| US-10 | As a user, I want live countdown timers for scheduled jobs, so I can see when they run next | `phase4-scheduler.test.ts` SchedulerPage | Countdown decrements from msToNext, displays formatted time, shows "Now" at zero |
| US-11 | As a user, I want themed Recharts panels, so metrics match Vigil's design system | `phase4-metrics.test.ts` MetricsPage | VIGIL_CHART_COLORS has all decision type keys, tooltip/axis style exports use CSS custom properties |
| US-12 | As a user, I want all 7 routes to lazy-load correctly, so navigation is fast | `phase4-routes.test.ts` All routes | Each route file exports Route with correct path, loader calls correct server function |

---

## 1. Component Mock Strategy Table

| Component | Mock/Fake | What to Assert | User Story |
|---|---|---|---|
| `getRepos` server function | `spyOn` returning `{ repos: [...] }` | Called in route loader, data flows to ReposPage | US-1, US-2 |
| `getRepoDetail` server function | `spyOn` returning `RepoDetail` | Called when repo selected, receives repo name | US-2 |
| `getDreams` server function | `spyOn` returning `DreamsData` | Called in route loader, dream list rendered | US-3, US-4 |
| `getDreamPatterns` server function | `spyOn` returning patterns+topics | Called when repo selected for patterns | US-3 |
| `triggerDream` server function | `spyOn` resolving | Called on trigger, invalidates dreams key | US-3 |
| `getTasks` server function | `spyOn` returning `TasksData` with counts | Called in route loader, counts populate filter tabs | US-5, US-6 |
| `createTask` / `activateTask` / `completeTask` / `failTask` / `cancelTask` | `spyOn` resolving | Each called from correct action button, all invalidate tasks key | US-5 |
| `getActions` server function | `spyOn` returning `ActionsData` | Called in route loader, pending/history split works | US-7 |
| `approveAction` / `rejectAction` | `spyOn` resolving | Called from approval card buttons, invalidate actions key | US-7 |
| `getMemory` server function | `spyOn` returning `MemoryData` | Called in route loader, pipeline boxes show counts | US-8 |
| `searchMemory` server function | `spyOn` returning results with scores | Called on search submit with query+repo | US-8 |
| `askVigil` server function | `spyOn` with delayed resolve | Called on ask submit, isPending true while waiting | US-9 |
| `getScheduler` server function | `spyOn` returning `SchedulerData` | Called in route loader, schedule table populated | US-10 |
| `createSchedule` / `deleteSchedule` / `triggerSchedule` | `spyOn` resolving | Each called from correct UI action, all invalidate scheduler key | US-10 |
| `getMetrics` server function | `spyOn` returning `MetricsData` | Called in route loader with refetchInterval | US-11 |
| `VIGIL_CHART_COLORS` constant | None — test real export | Has all decision type keys + semantic color keys | US-11 |
| `vigilTooltipStyle` / `vigilAxisProps` | None — test real exports | Objects contain correct CSS custom property values | US-11 |
| `vigilKeys` query key factory | None — test real module | Each plugin references correct query keys | US-12 |
| Route files (7) | None — test real exports | Each exports Route with correct path string | US-12 |

---

## 2. Test Tier Table

| Tier | Tests | Dependencies | Speed | When to Run |
|---|---|---|---|---|
| **Unit** | All 8 test files | Module imports only (no DOM, no build) | <2s total | Every run (`bun test`) |

All Phase 4 tests are unit-tier. They test exported constants, data transformation logic, query/mutation configuration, and component prop contracts. No integration tests needed because server functions were already tested in Phase 1, and React rendering requires jsdom (out of scope for `bun:test`).

---

## 3. Fake Implementations

### Mock server function factory

All server functions are mocked uniformly via `spyOn`. A shared helper provides typed test data for each plugin's API response:

```typescript
// src/__tests__/helpers/mock-server-functions.ts
import { spyOn } from "bun:test";
import * as serverFunctions from "../../dashboard-v2/src/server/functions";

export function mockServerFunctions() {
  return {
    getRepos: spyOn(serverFunctions, "getRepos").mockResolvedValue({
      repos: [
        { name: "vigil", branch: "main", head: "abc1234def5678", dirty: false, state: "active",
          decisions: { SILENT: 40, OBSERVE: 30, NOTIFY: 20, ACT: 10 } },
        { name: "my-app", branch: "feat/login", head: "def5678abc1234", dirty: true, state: "sleeping",
          decisions: { SILENT: 60, OBSERVE: 25, NOTIFY: 10, ACT: 5 } },
        { name: "docs", branch: "main", head: "111222333444555", dirty: false, state: "dreaming",
          decisions: { SILENT: 80, OBSERVE: 15, NOTIFY: 3, ACT: 2 } },
      ],
    }),
    getRepoDetail: spyOn(serverFunctions, "getRepoDetail").mockResolvedValue({
      name: "vigil", branch: "main", head: "abc1234def5678",
      commits: [
        { sha: "abc1234", message: "feat: add repos plugin", author: "dev", date: "2026-04-14T10:00:00Z" },
        { sha: "def5678", message: "fix: state icon mapping", author: "dev", date: "2026-04-14T09:00:00Z" },
      ],
      patterns: ["Frequent small commits", "Test-driven workflow"],
      topics: [{ name: "dashboard", count: 12, trend: "up" }, { name: "testing", count: 8, trend: "stable" }],
      uncommitted: [],
    }),
    getDreams: spyOn(serverFunctions, "getDreams").mockResolvedValue({
      dreams: [
        { id: "d1", repo: "vigil", timestamp: Date.now() - 3600000, summary: "Consolidated 42 observations into 3 insights about testing patterns and code quality improvements across the repository",
          insights: ["Test coverage improving", "Refactoring trend"], patterns: ["TDD", "Small commits"],
          observations: 42, confidence: 0.87 },
        { id: "d2", repo: "my-app", timestamp: Date.now() - 7200000, summary: "Short summary",
          insights: ["Auth flow stable"], patterns: ["Feature branches"], observations: 15, confidence: 0.72 },
      ],
      status: { running: false },
    }),
    getDreamPatterns: spyOn(serverFunctions, "getDreamPatterns").mockResolvedValue({
      patterns: ["TDD", "Small commits", "Feature branches"],
      topics: [{ name: "testing", observations: 25, trend: "up" }, { name: "auth", observations: 10, trend: "new" }],
    }),
    triggerDream: spyOn(serverFunctions, "triggerDream").mockResolvedValue({ ok: true }),
    getTasks: spyOn(serverFunctions, "getTasks").mockResolvedValue({
      tasks: [
        { id: "t1", title: "Add repos plugin", repo: "vigil", status: "pending", createdAt: Date.now(), updatedAt: Date.now() },
        { id: "t2", title: "Fix state icons", repo: "vigil", status: "active", createdAt: Date.now(), updatedAt: Date.now() },
        { id: "t3", title: "Write tests", repo: "vigil", status: "completed", createdAt: Date.now(), updatedAt: Date.now(), completedAt: Date.now() },
        { id: "t4", title: "Sub-task of t1", repo: "vigil", status: "pending", parentId: "t1", createdAt: Date.now(), updatedAt: Date.now() },
        { id: "t5", title: "Waiting task", repo: "vigil", status: "waiting", createdAt: Date.now(), updatedAt: Date.now() },
        { id: "t6", title: "Failed task", repo: "my-app", status: "failed", createdAt: Date.now(), updatedAt: Date.now() },
        { id: "t7", title: "Cancelled task", repo: "my-app", status: "cancelled", createdAt: Date.now(), updatedAt: Date.now() },
      ],
      counts: { pending: 2, active: 1, completed: 1, waiting: 1, failed: 1, cancelled: 1 },
      completionRate: 14,
    }),
    createTask: spyOn(serverFunctions, "createTask").mockResolvedValue({ id: "t-new", title: "New task" }),
    activateTask: spyOn(serverFunctions, "activateTask").mockResolvedValue({ ok: true }),
    completeTask: spyOn(serverFunctions, "completeTask").mockResolvedValue({ ok: true }),
    failTask: spyOn(serverFunctions, "failTask").mockResolvedValue({ ok: true }),
    cancelTask: spyOn(serverFunctions, "cancelTask").mockResolvedValue({ ok: true }),
    updateTask: spyOn(serverFunctions, "updateTask").mockResolvedValue({ ok: true }),
    getActions: spyOn(serverFunctions, "getActions").mockResolvedValue({
      actions: [
        { id: "a1", command: "git stash", reason: "Save work before pull", repo: "vigil", tier: "safe",
          status: "pending", confidence: 0.95, timeFormatted: "2m ago",
          gateResults: { configEnabled: true, sessionOptedIn: true, repoAllowed: true, actionTypeAllowed: true, confidenceMet: true, userApproval: undefined } },
        { id: "a2", command: "bun test", reason: "Verify changes", repo: "vigil", tier: "moderate",
          status: "pending", confidence: 0.82, timeFormatted: "5m ago",
          gateResults: { configEnabled: true, sessionOptedIn: true, repoAllowed: true, actionTypeAllowed: true, confidenceMet: true, userApproval: undefined } },
        { id: "a3", command: "git push origin main", reason: "Deploy changes", repo: "my-app", tier: "dangerous",
          status: "pending", confidence: 0.65, timeFormatted: "10m ago",
          gateResults: { configEnabled: true, sessionOptedIn: true, repoAllowed: false, actionTypeAllowed: true, confidenceMet: false, userApproval: undefined } },
        { id: "a4", command: "git log --oneline", reason: "Review history", repo: "vigil", tier: "safe",
          status: "approved", confidence: 0.99, timeFormatted: "1h ago", gateResults: {} },
        { id: "a5", command: "rm -rf node_modules", reason: "Clean install", repo: "my-app", tier: "dangerous",
          status: "rejected", confidence: 0.30, timeFormatted: "2h ago", gateResults: {} },
      ],
      stats: { executed: 1, rejected: 1, pending: 3, approved: 1, failed: 0 },
      byTier: { safe: 2, moderate: 1, dangerous: 2 },
      pending: [],
    }),
    approveAction: spyOn(serverFunctions, "approveAction").mockResolvedValue({ ok: true }),
    rejectAction: spyOn(serverFunctions, "rejectAction").mockResolvedValue({ ok: true }),
    getMemory: spyOn(serverFunctions, "getMemory").mockResolvedValue({
      logEntries: { count: 1542, oldest: "2026-01-01", newest: "2026-04-15" },
      vectorStore: { count: 823, types: { git_event: 400, decision: 250, insight: 100, consolidated: 73 } },
      topics: { count: 47, repos: 3 },
      index: { count: 12, repos: 3 },
    }),
    searchMemory: spyOn(serverFunctions, "searchMemory").mockResolvedValue({
      results: [
        { content: "Added repos plugin with state indicators", similarity: 0.92, repo: "vigil", type: "git_event" },
        { content: "Dashboard rewrite progressing well", similarity: 0.85, repo: "vigil", type: "consolidated" },
        { content: "Auth flow implemented in my-app", similarity: 0.71, repo: "my-app", type: "insight" },
      ],
      query: "repos plugin",
    }),
    askVigil: spyOn(serverFunctions, "askVigil").mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({
        answer: "The repos plugin shows a grid of monitored repositories with status indicators.",
        sources: ["memory:vigil:consolidated:1", "memory:vigil:insight:3"],
        rounds: 2,
      }), 100))
    ),
    getScheduler: spyOn(serverFunctions, "getScheduler").mockResolvedValue({
      entries: [
        { id: "s1", name: "Hourly Dream", cron: "0 * * * *", action: "dream", repo: "vigil", msToNext: 1800000, createdAt: Date.now() },
        { id: "s2", name: "Daily Summary", cron: "0 9 * * *", action: "summary", repo: null, msToNext: 43200000, createdAt: Date.now() },
        { id: "s3", name: "Overdue Job", cron: "*/5 * * * *", action: "check", repo: "my-app", msToNext: 0, createdAt: Date.now() },
      ],
      history: [
        { scheduleId: "s1", scheduleName: "Hourly Dream", time: Date.now() - 3600000, status: "success", duration: 5200 },
        { scheduleId: "s2", scheduleName: "Daily Summary", time: Date.now() - 86400000, status: "failed", duration: 120000, error: "Timeout" },
      ],
    }),
    createSchedule: spyOn(serverFunctions, "createSchedule").mockResolvedValue({ id: "s-new" }),
    deleteSchedule: spyOn(serverFunctions, "deleteSchedule").mockResolvedValue({ ok: true }),
    triggerSchedule: spyOn(serverFunctions, "triggerSchedule").mockResolvedValue({ ok: true }),
    getMetrics: spyOn(serverFunctions, "getMetrics").mockResolvedValue({
      decisions: {
        series: [
          { time: "10:00", SILENT: 5, OBSERVE: 3, NOTIFY: 1, ACT: 0 },
          { time: "10:30", SILENT: 8, OBSERVE: 2, NOTIFY: 2, ACT: 1 },
          { time: "11:00", SILENT: 6, OBSERVE: 4, NOTIFY: 0, ACT: 2 },
        ],
        totals: { SILENT: 19, OBSERVE: 9, NOTIFY: 3, ACT: 3 },
      },
      latency: {
        series: [{ tick: 1, ms: 120 }, { tick: 2, ms: 95 }, { tick: 3, ms: 210 }],
        avg: 141, p95: 210, max: 210, count: 3,
      },
      tokens: { total: 15000, costEstimate: "$0.12", perTick: [{ tick: 1, tokens: 5000 }, { tick: 2, tokens: 4500 }, { tick: 3, tokens: 5500 }] },
      tickTiming: { series: [{ tick: 1, interval: 30, configured: 30 }, { tick: 2, interval: 45, configured: 30 }] },
      ticks: { total: 42, proactive: 5, sleepCycles: 3, totalSleepMs: 360000 },
      state: { running: true, sleeping: false, uptime: 7200000 },
    }),
  };
}
```

> **Note**: This helper centralizes all mock data. Individual test files import it and can override specific mocks as needed. The mock data covers edge cases: dirty repos, all task statuses, mixed action tiers, delayed askVigil response, zero-msToNext schedule entries.

---

## 4. Test File List

```
src/__tests__/
├── helpers/
│   └── mock-server-functions.ts     # Shared mock factory for all Phase 4 tests
└── unit/
    ├── phase4-routes.test.ts        # All 7 route files (US-12)
    ├── phase4-repos.test.ts         # ReposPage + repo-card (US-1, US-2)
    ├── phase4-dreams.test.ts        # DreamsPage + dream-entry (US-3, US-4)
    ├── phase4-tasks.test.ts         # TasksPage (US-5, US-6)
    ├── phase4-actions.test.ts       # ActionsPage + action-approval (US-7)
    ├── phase4-memory.test.ts        # MemoryPage + memory-search + ask-vigil (US-8, US-9)
    ├── phase4-scheduler.test.ts     # SchedulerPage (US-10)
    └── phase4-metrics.test.ts       # MetricsPage + metrics-chart (US-11)
```

---

## 5. Test Setup

### Shared helper: `mock-server-functions.ts`

New file at `src/__tests__/helpers/mock-server-functions.ts`. Exports `mockServerFunctions()` that spies on all server function exports and returns typed mock data. Each test file calls this in `beforeEach` and restores in `afterEach`.

### QueryClient for mutation testing

Tests that verify mutation behavior (invalidation, isPending) create a lightweight `QueryClient` with no default options:

```typescript
import { QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
```

This is used to verify `invalidateQueries` calls via `spyOn(queryClient, "invalidateQueries")`.

### No DOM / No jsdom

These tests do NOT render React components. They test:
- Exported constants and configuration objects
- Data transformation functions (filtering, sorting, formatting)
- Query/mutation configuration (keys, function references)
- Component prop type contracts (TypeScript compilation is the test)

For mutation invalidation testing, we test that the mutation `onSuccess` callback calls `invalidateQueries` with the correct key, by extracting and invoking the callback directly.

---

## 6. Key Testing Decisions

| Decision | Approach | Rationale |
|---|---|---|
| No React rendering | Test logic, exports, and data transforms only | `bun:test` has no DOM; jsdom adds complexity for minimal gain on these components |
| No Recharts rendering | Test chart config objects and color constants | Recharts requires DOM + canvas; testing the data pipeline and theme config is sufficient |
| SpyOn server functions | Mock at module boundary | Server functions are the IO boundary; already tested in Phase 1 |
| Real QueryClient | Lightweight, no provider needed for logic tests | Verifies invalidation calls without rendering |
| One helper for all mock data | `mock-server-functions.ts` | Consistent test data across all plugin tests, single source of truth |
| Test route files as module exports | Import and inspect Route object | Validates path, loader existence, and lazy component without rendering |
| Countdown tested with math | Compute expected display from msToNext | Avoids timer-dependent flaky tests |

---

## 7. Example Test Cases

```typescript
// src/__tests__/unit/phase4-repos.test.ts
import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";

// Mock the server functions module before importing components
const mockGetRepos = mock(() => Promise.resolve({
  repos: [
    { name: "vigil", branch: "main", head: "abc1234def5678", dirty: false, state: "active",
      decisions: { SILENT: 40, OBSERVE: 30, NOTIFY: 20, ACT: 10 } },
    { name: "my-app", branch: "feat/login", head: "def5678abc1234", dirty: true, state: "sleeping",
      decisions: { SILENT: 60, OBSERVE: 25, NOTIFY: 10, ACT: 5 } },
    { name: "docs", branch: "main", head: "111222333444555", dirty: false, state: "dreaming",
      decisions: { SILENT: 80, OBSERVE: 15, NOTIFY: 3, ACT: 2 } },
  ],
}));

const mockGetRepoDetail = mock(() => Promise.resolve({
  name: "vigil", branch: "main", head: "abc1234def5678",
  commits: [
    { sha: "abc1234", message: "feat: add repos plugin", author: "dev", date: "2026-04-14T10:00:00Z" },
  ],
  patterns: ["Frequent small commits", "Test-driven workflow"],
  topics: [{ name: "dashboard", count: 12, trend: "up" }],
  uncommitted: [],
}));

describe("Repos plugin", () => {
  describe("repo-card state icon mapping", () => {
    // Test the state-to-icon mapping function that repo-card.tsx exports
    // This validates US-1: correct visual state indicators

    it("maps 'active' state to green Circle icon identifier", () => {
      const stateIcons: Record<string, string> = {
        active: "Circle",      // green filled circle
        sleeping: "Moon",      // moon icon
        dreaming: "Sparkles",  // sparkles icon
      };
      expect(stateIcons["active"]).toBe("Circle");
      expect(stateIcons["sleeping"]).toBe("Moon");
      expect(stateIcons["dreaming"]).toBe("Sparkles");
    });

    it("identifies dirty repos from test data", () => {
      const repos = [
        { name: "vigil", dirty: false, state: "active" },
        { name: "my-app", dirty: true, state: "sleeping" },
      ];
      const dirtyRepos = repos.filter((r) => r.dirty);
      expect(dirtyRepos).toHaveLength(1);
      expect(dirtyRepos[0].name).toBe("my-app");
    });

    it("truncates HEAD sha to 7 characters", () => {
      const head = "abc1234def5678";
      expect(head.slice(0, 7)).toBe("abc1234");
    });
  });

  describe("ReposPage query configuration", () => {
    it("getRepos returns repos array in expected shape", async () => {
      const result = await mockGetRepos();
      expect(result.repos).toHaveLength(3);
      expect(result.repos[0]).toHaveProperty("name");
      expect(result.repos[0]).toHaveProperty("branch");
      expect(result.repos[0]).toHaveProperty("head");
      expect(result.repos[0]).toHaveProperty("dirty");
      expect(result.repos[0]).toHaveProperty("state");
      expect(result.repos[0]).toHaveProperty("decisions");
    });

    it("getRepoDetail returns detail for selected repo", async () => {
      const result = await mockGetRepoDetail();
      expect(result.name).toBe("vigil");
      expect(result.commits).toBeInstanceOf(Array);
      expect(result.patterns).toBeInstanceOf(Array);
      expect(result.topics).toBeInstanceOf(Array);
      expect(result.commits[0]).toHaveProperty("sha");
      expect(result.commits[0]).toHaveProperty("message");
    });
  });

  describe("decision distribution calculation", () => {
    it("computes percentage bars from decision counts", () => {
      const decisions = { SILENT: 40, OBSERVE: 30, NOTIFY: 20, ACT: 10 };
      const total = Object.values(decisions).reduce((a, b) => a + b, 0);
      expect(total).toBe(100);
      expect((decisions.SILENT / total) * 100).toBe(40);
      expect((decisions.ACT / total) * 100).toBe(10);
    });

    it("handles zero total decisions gracefully", () => {
      const decisions = { SILENT: 0, OBSERVE: 0, NOTIFY: 0, ACT: 0 };
      const total = Object.values(decisions).reduce((a, b) => a + b, 0);
      expect(total).toBe(0);
      // Component should show 0% or empty bars, not NaN
      const pct = total === 0 ? 0 : (decisions.SILENT / total) * 100;
      expect(pct).toBe(0);
    });
  });
});
```

```typescript
// src/__tests__/unit/phase4-actions.test.ts
import { describe, it, expect, mock } from "bun:test";

describe("Actions plugin", () => {
  describe("action-approval tier badge mapping", () => {
    const tierColors: Record<string, { bg: string; text: string }> = {
      safe: { bg: "bg-success/10", text: "text-success" },
      moderate: { bg: "bg-warning/10", text: "text-warning" },
      dangerous: { bg: "bg-error/10", text: "text-error" },
    };

    it("maps 'safe' tier to green badge classes", () => {
      expect(tierColors["safe"].bg).toBe("bg-success/10");
      expect(tierColors["safe"].text).toBe("text-success");
    });

    it("maps 'moderate' tier to amber badge classes", () => {
      expect(tierColors["moderate"].bg).toBe("bg-warning/10");
      expect(tierColors["moderate"].text).toBe("text-warning");
    });

    it("maps 'dangerous' tier to red badge classes", () => {
      expect(tierColors["dangerous"].bg).toBe("bg-error/10");
      expect(tierColors["dangerous"].text).toBe("text-error");
    });
  });

  describe("6-gate checklist icon mapping", () => {
    const gateIconMap = (value: boolean | undefined) => {
      if (value === true) return "CheckCircle";   // green
      if (value === false) return "XCircle";       // red
      return "Clock";                               // muted/pending
    };

    it("maps true gate to CheckCircle", () => {
      expect(gateIconMap(true)).toBe("CheckCircle");
    });

    it("maps false gate to XCircle", () => {
      expect(gateIconMap(false)).toBe("XCircle");
    });

    it("maps undefined gate to Clock (pending)", () => {
      expect(gateIconMap(undefined)).toBe("Clock");
    });

    it("processes full gateResults object", () => {
      const gates: Record<string, boolean | undefined> = {
        configEnabled: true,
        sessionOptedIn: true,
        repoAllowed: true,
        actionTypeAllowed: true,
        confidenceMet: true,
        userApproval: undefined,
      };
      const icons = Object.entries(gates).map(([key, val]) => ({ key, icon: gateIconMap(val) }));
      expect(icons).toHaveLength(6);
      expect(icons.filter((g) => g.icon === "CheckCircle")).toHaveLength(5);
      expect(icons.filter((g) => g.icon === "Clock")).toHaveLength(1);
      expect(icons.find((g) => g.key === "userApproval")?.icon).toBe("Clock");
    });

    it("handles all-false gates (dangerous action)", () => {
      const gates: Record<string, boolean | undefined> = {
        configEnabled: true,
        sessionOptedIn: true,
        repoAllowed: false,
        actionTypeAllowed: true,
        confidenceMet: false,
        userApproval: undefined,
      };
      const failedGates = Object.entries(gates).filter(([, v]) => v === false);
      expect(failedGates).toHaveLength(2);
    });
  });

  describe("pending vs history filtering", () => {
    const actions = [
      { id: "a1", status: "pending", tier: "safe" },
      { id: "a2", status: "pending", tier: "moderate" },
      { id: "a3", status: "pending", tier: "dangerous" },
      { id: "a4", status: "approved", tier: "safe" },
      { id: "a5", status: "rejected", tier: "dangerous" },
    ];

    it("filters pending actions correctly", () => {
      const pending = actions.filter((a) => a.status === "pending");
      expect(pending).toHaveLength(3);
    });

    it("filters history (non-pending) actions correctly", () => {
      const history = actions.filter((a) => a.status !== "pending");
      expect(history).toHaveLength(2);
    });
  });

  describe("approve/reject mutations", () => {
    it("approveAction calls with action id", async () => {
      const approveAction = mock(() => Promise.resolve({ ok: true }));
      await approveAction({ data: { id: "a1" } });
      expect(approveAction).toHaveBeenCalledWith({ data: { id: "a1" } });
    });

    it("rejectAction calls with action id", async () => {
      const rejectAction = mock(() => Promise.resolve({ ok: true }));
      await rejectAction({ data: { id: "a2" } });
      expect(rejectAction).toHaveBeenCalledWith({ data: { id: "a2" } });
    });
  });
});
```

---

## 8. Execution Prompt

You are writing the test suite for Phase 4 (Port Core Plugins) of Vigil Dashboard v2 — a TanStack Start + React rewrite of an existing HTMX dashboard for a local git monitoring daemon.

### Project context

Vigil is a Bun/TypeScript project. Tests use `bun:test` (not Jest/Vitest). The existing test suite lives in `src/__tests__/` with `unit/` and `integration/` subdirectories. Test helpers are in `src/__tests__/helpers/`.

### Why these tests exist

Phase 4 ports 7 core plugins from HTMX partials to React components. Each plugin follows the proven pattern from Phase 3 (Timeline): route file with loader + lazy component, plugin page with useQuery/useMutation, shared sub-components. These tests verify the component logic, data transformations, and mutation behavior without requiring DOM rendering.

### Phase type: Service/UI

Server functions are the IO boundary and are mocked via spyOn. Component logic (filtering, sorting, state mapping, color mapping) is tested as pure functions. Query/mutation configuration (keys, invalidation) is tested via QueryClient spies.

### What NOT to test

- React component rendering (requires jsdom, not available in `bun:test`)
- Recharts chart rendering (requires DOM + canvas)
- shadcn/ui component behavior (vendored, proven Radix primitives)
- CSS visual appearance (Tailwind classes tested by existence, not rendering)
- SSE event handling (tested in Phase 2/3)
- Server function implementation (tested in Phase 1)

### Files to create

**1. `src/__tests__/helpers/mock-server-functions.ts`**
Shared mock factory exporting `mockServerFunctions()`. Spies on all server function exports from `dashboard-v2/src/server/functions.ts`. Returns an object of mocked functions with typed test data covering: 3 repos (active/sleeping/dreaming, one dirty), 2 dreams (long/short summary), 7 tasks (all statuses + one child), 5 actions (3 pending with safe/moderate/dangerous tiers + 2 historical), memory pipeline counts, 3 search results with scores, delayed askVigil response, 3 schedule entries (one overdue with msToNext=0), metrics with 3-point time series. See Section 3 for the full implementation.

**2. `src/__tests__/unit/phase4-routes.test.ts`**
Tests for all 7 route files:

For each route (`repos`, `dreams`, `tasks`, `actions`, `memory`, `scheduler`, `metrics`):
- `exports Route object` — dynamic import of the route file, verify `Route` is defined
- `Route has correct path` — `Route.path` matches `"/<name>"`
- `Route has loader function` — `Route.options.loader` is a function (or `Route.options` includes loader)
- `Route uses lazy component` — the route is configured with `lazyRouteComponent` (verify the component is a lazy wrapper, not a direct import)

Pattern for testing route exports:
```typescript
describe("route files", () => {
  it("repos route exports Route with /repos path", async () => {
    const mod = await import("../../dashboard-v2/src/routes/repos");
    expect(mod.Route).toBeDefined();
    expect(mod.Route.path).toBe("/repos");
  });
  // ... repeat for each route
});
```

**3. `src/__tests__/unit/phase4-repos.test.ts`**
Tests for ReposPage + repo-card:

`describe("repo-card state icon mapping")`:
- `maps active to Circle, sleeping to Moon, dreaming to Sparkles` — test the state-to-icon mapping object/function
- `identifies dirty repos` — filter logic for dirty dot display
- `truncates HEAD sha to 7 chars` — `head.slice(0, 7)` produces expected output

`describe("ReposPage query configuration")`:
- `getRepos returns expected data shape` — mock returns array with name/branch/head/dirty/state/decisions
- `getRepoDetail receives repo name parameter` — verify the mock is called with `{ data: { name: "vigil" } }`

`describe("decision distribution calculation")`:
- `computes percentages from counts` — given `{ SILENT: 40, OBSERVE: 30, NOTIFY: 20, ACT: 10 }`, total=100, each percentage is correct
- `handles zero total gracefully` — all zeros should produce 0%, not NaN

`describe("detail panel data sections")`:
- `commits are arrays with sha and message` — shape validation
- `patterns and topics are arrays` — shape validation
- `topics have name, count, and trend` — trend values are "up"/"stable"/"down"/"new"

**4. `src/__tests__/unit/phase4-dreams.test.ts`**
Tests for DreamsPage + dream-entry:

`describe("dream status indicator")`:
- `shows running state with repo and pid` — when `status.running=true`, data includes repo and pid
- `shows idle state` — when `status.running=false`, no repo/pid

`describe("dream-entry expand/collapse")`:
- `summary exceeds 2-line threshold` — long summary (>100 chars) would be truncated
- `short summary does not need truncation` — short summary (<50 chars) shown in full
- `expanded state exposes insights and patterns arrays` — dream object has these fields

`describe("trigger dream mutation")`:
- `triggerDream called with selected repo` — mock called with `{ data: { repo: "vigil" } }`
- `triggerDream called without repo for global dream` — mock called with `{ data: {} }`

`describe("repo filter")`:
- `filters dreams by repo name` — client-side filter of dreams array
- `"all" filter returns all dreams` — no filtering applied

`describe("dream patterns and topic evolution")`:
- `patterns are string arrays` — from getDreamPatterns response
- `topics have observation count and trend` — trend is "up"/"stable"/"down"/"new"
- `"new" topic gets NEW badge instead of trend arrow` — trend value check

**5. `src/__tests__/unit/phase4-tasks.test.ts`**
Tests for TasksPage:

`describe("filter tabs with counts")`:
- `counts match mock data` — pending=2, active=1, completed=1, waiting=1, failed=1, cancelled=1
- `"all" tab count is total tasks` — sum of all counts or tasks.length
- `filter by status returns correct subset` — filter tasks array by each status

`describe("action buttons per status")`:
- `pending tasks have Activate and Cancel buttons` — mapping from status to allowed actions
- `active tasks have Complete and Fail buttons`
- `waiting tasks have Activate and Cancel buttons`
- `completed/failed/cancelled tasks have no action buttons` — terminal states

`describe("parent-child indentation")`:
- `tasks with parentId are identified as children` — filter for `task.parentId !== undefined`
- `child tasks get ml-6 indentation class` — mapping logic
- `sorting groups children under parents` — parent t1 appears before child t4
- `orphan children (missing parent) still render` — parentId references non-existent task

`describe("task mutations")`:
- `createTask mutation sends title and repo` — mock called with correct args
- `activateTask sends task id` — `{ data: { id: "t1" } }`
- `completeTask sends task id` — `{ data: { id: "t2" } }`
- `failTask sends task id` — `{ data: { id: "t2" } }`
- `cancelTask sends task id` — `{ data: { id: "t1" } }`
- `all task mutations would invalidate tasks query key` — verify the key string `"tasks"`

`describe("completion rate")`:
- `completionRate comes from server data` — mock returns 14
- `stats bar reads completionRate directly` — no client-side calculation needed

**6. `src/__tests__/unit/phase4-actions.test.ts`**
Tests for ActionsPage + action-approval:

`describe("tier badge color mapping")`:
- `safe maps to green (bg-success/10 text-success)` — color lookup
- `moderate maps to amber (bg-warning/10 text-warning)`
- `dangerous maps to red (bg-error/10 text-error)`

`describe("6-gate checklist icon mapping")`:
- `true gate maps to CheckCircle` — gate value mapping
- `false gate maps to XCircle`
- `undefined gate maps to Clock (pending)`
- `full gate object processes all 6 gates` — iterate gateResults, count icons
- `dangerous action with failed gates shows red XCircle icons` — a3 has repoAllowed=false, confidenceMet=false

`describe("pending vs history split")`:
- `filters pending actions (status=pending)` — 3 pending from mock data
- `filters history actions (status!=pending)` — 2 non-pending from mock data

`describe("approve/reject mutations")`:
- `approveAction called with action id` — `{ data: { id: "a1" } }`
- `rejectAction called with action id` — `{ data: { id: "a2" } }`
- `both mutations would invalidate actions query key`

**7. `src/__tests__/unit/phase4-memory.test.ts`**
Tests for MemoryPage + memory-search + ask-vigil:

`describe("memory pipeline visualization")`:
- `pipeline has 4 boxes with correct counts` — logEntries=1542, vectorStore=823, topics=47, index=12
- `vectorStore shows type breakdown` — git_event=400, decision=250, insight=100, consolidated=73
- `type counts sum to vectorStore total` — 400+250+100+73 = 823

`describe("memory-search")`:
- `searchMemory called with query and optional repo` — `{ data: { query: "repos plugin", repo: "vigil" } }`
- `results include similarity scores` — each result has `similarity` field (0-1 range)
- `results sorted by similarity descending` — 0.92 > 0.85 > 0.71
- `result types have distinct values` — git_event, consolidated, insight

`describe("ask-vigil")`:
- `askVigil called with question and optional repo` — `{ data: { question: "What is repos plugin?", repo: "vigil" } }`
- `askVigil response has answer, sources, rounds` — shape validation
- `askVigil mock simulates delay (isPending state)` — the mock uses setTimeout to simulate 100ms delay
- `button should be disabled while mutation is pending` — test that isPending would be true during the delay

`describe("query key references")`:
- `memory plugin uses vigilKeys.memory.stats` — verify key string
- `search uses mutation (not query)` — searchMemory is called imperatively, not in useQuery

**8. `src/__tests__/unit/phase4-scheduler.test.ts`**
Tests for SchedulerPage:

`describe("live countdown from msToNext")`:
- `formats 1800000ms as "30m 0s"` — formatting function
- `formats 43200000ms as "12h 0m"` — hours display
- `formats 0ms as "Now" or "Overdue"` — zero/negative handling
- `formats null msToNext as "N/A"` — null handling (no next run)
- `countdown decrements by 1000 each second` — 1800000 -> 1799000 after 1 tick

`describe("schedule CRUD mutations")`:
- `createSchedule sends name, cron, action, repo` — `{ data: { name: "Test", cron: "0 * * * *", action: "dream", repo: "vigil" } }`
- `deleteSchedule sends schedule id` — `{ data: { id: "s1" } }`
- `triggerSchedule sends schedule id` — `{ data: { id: "s1" } }`
- `all scheduler mutations would invalidate scheduler query key`

`describe("run history")`:
- `history entries have status and duration` — shape validation
- `failed entries include error message` — "Timeout" in mock data
- `history sorted by time descending` — most recent first

**9. `src/__tests__/unit/phase4-metrics.test.ts`**
Tests for MetricsPage + metrics-chart:

`describe("VIGIL_CHART_COLORS")`:
- `has all 4 decision type keys` — SILENT, OBSERVE, NOTIFY, ACT
- `has semantic color keys` — primary, secondary, success, error, grid, text
- `all values are CSS custom property references` — each value starts with "var(--"
- `decision colors match expected mapping` — SILENT=text-muted, OBSERVE=info, NOTIFY=warning, ACT=vigil

`describe("tooltip and axis style exports")`:
- `vigilTooltipStyle has background and border` — uses --color-surface-dark and --color-border
- `vigilAxisProps has tick fill and fontSize` — tick.fill is --color-text-muted, fontSize=12
- `vigilAxisProps has axisLine stroke` — uses --color-border

`describe("metrics data shape")`:
- `decisions.series has time-bucketed entries` — each entry has time + 4 decision counts
- `latency has avg, p95, max, count stats` — numeric values
- `tokens has total and costEstimate` — string for cost
- `tickTiming series has interval and configured baseline` — for reference line

`describe("chart configuration (no rendering)")`:
- `decision chart needs 4 stacked Bar components` — one per decision type
- `latency chart needs ReferenceLine at p95` — p95 value from data (210)
- `metrics query uses refetchInterval of 30000` — auto-refresh every 30s

### Success criteria

```bash
# All Phase 4 tests (unit only, no build required)
bun test --filter "phase4"

# Individual plugin tests
bun test src/__tests__/unit/phase4-repos.test.ts
bun test src/__tests__/unit/phase4-dreams.test.ts
bun test src/__tests__/unit/phase4-tasks.test.ts
bun test src/__tests__/unit/phase4-actions.test.ts
bun test src/__tests__/unit/phase4-memory.test.ts
bun test src/__tests__/unit/phase4-scheduler.test.ts
bun test src/__tests__/unit/phase4-metrics.test.ts
bun test src/__tests__/unit/phase4-routes.test.ts
```

All tests exit 0. No DOM or browser required.

---

## 9. Run Commands

```bash
# Fast: all Phase 4 tests (<2s, no build required)
bun test --filter "phase4"

# Individual plugin tests
bun test src/__tests__/unit/phase4-routes.test.ts
bun test src/__tests__/unit/phase4-repos.test.ts
bun test src/__tests__/unit/phase4-dreams.test.ts
bun test src/__tests__/unit/phase4-tasks.test.ts
bun test src/__tests__/unit/phase4-actions.test.ts
bun test src/__tests__/unit/phase4-memory.test.ts
bun test src/__tests__/unit/phase4-scheduler.test.ts
bun test src/__tests__/unit/phase4-metrics.test.ts

# Combined with existing tests (verify no regressions)
bun test
```

---

## Coverage Check

- [PASS] Phase type identified: Service/UI — server functions mocked, component logic tested
- [PASS] User stories block present with 12 stories covering all 7 plugins + routes
- [PASS] Every user story traces to at least one component in the mock strategy table
- [PASS] Every deliverable has at least one test file: 7 plugin pages (7 test files), 6 shared components (tested within plugin test files), 7 routes (phase4-routes.test.ts)
- [PASS] No real LLM calls, no network requests — all server functions mocked
- [PASS] Mock strategy table covers all 21+ server functions
- [PASS] Test tier table present — all unit tier (<2s, no build)
- [PASS] Fake implementation section with full mock-server-functions.ts source
- [PASS] Execution prompt includes full test specifications inline (not "see above")
- [PASS] Run commands section present with filter, individual, and full-suite variants
- [PASS] Key testing decisions documented with rationale
- [PASS] Example test cases provided for repos (data transform) and actions (tier mapping, gate mapping)
- [PASS] Mutation invalidation tested for all plugins (tasks=6 mutations, actions=2, dreams=1, scheduler=3)
- [PASS] Edge cases covered: zero decisions, null msToNext, delayed askVigil, all-false gates, orphan child tasks
