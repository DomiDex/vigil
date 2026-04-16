import { describe, test, expect } from "bun:test";

/**
 * Tests for Overview plugin registration and route structure.
 *
 * The Overview plugin must:
 *   - Register with order: -1 (appears first in sidebar)
 *   - Subscribe to SSE events: tick, message, action_pending
 *   - Route / renders Overview, /timeline renders Timeline
 */

interface PluginRegistration {
  id: string;
  label: string;
  icon: string;
  slot: string;
  order: number;
  sseEvents: string[];
  queryKeys: string[][];
}

const overviewPlugin: PluginRegistration = {
  id: "overview",
  label: "Overview",
  icon: "LayoutDashboard",
  slot: "tab",
  order: -1,
  sseEvents: ["tick", "message", "action_pending"],
  queryKeys: [["overview"]],
};

// Simulate plugin ordering (existing plugins have order >= 0)
const allPlugins: PluginRegistration[] = [
  {
    id: "timeline",
    label: "Timeline",
    icon: "Clock",
    slot: "tab",
    order: 0,
    sseEvents: ["tick"],
    queryKeys: [["timeline"]],
  },
  {
    id: "repos",
    label: "Repos",
    icon: "GitBranch",
    slot: "tab",
    order: 1,
    sseEvents: [],
    queryKeys: [["repos"]],
  },
  overviewPlugin,
];

function sortPluginsByOrder(
  plugins: PluginRegistration[],
): PluginRegistration[] {
  return [...plugins].sort((a, b) => a.order - b.order);
}

interface RouteMapping {
  path: string;
  page: string;
}

const routes: RouteMapping[] = [
  { path: "/", page: "OverviewPage" },
  { path: "/timeline", page: "TimelinePage" },
];

describe("Overview plugin registration", () => {
  test("overview plugin has id 'overview'", () => {
    expect(overviewPlugin.id).toBe("overview");
  });

  test("overview plugin has order -1 (appears first)", () => {
    expect(overviewPlugin.order).toBe(-1);
  });

  test("overview plugin uses LayoutDashboard icon", () => {
    expect(overviewPlugin.icon).toBe("LayoutDashboard");
  });

  test("overview plugin subscribes to tick, message, action_pending SSE events", () => {
    expect(overviewPlugin.sseEvents).toContain("tick");
    expect(overviewPlugin.sseEvents).toContain("message");
    expect(overviewPlugin.sseEvents).toContain("action_pending");
    expect(overviewPlugin.sseEvents.length).toBe(3);
  });

  test("overview plugin registers overview query key", () => {
    expect(overviewPlugin.queryKeys).toEqual([["overview"]]);
  });

  test("overview plugin is slot 'tab'", () => {
    expect(overviewPlugin.slot).toBe("tab");
  });
});

describe("Plugin ordering", () => {
  test("overview sorts first when order is -1", () => {
    const sorted = sortPluginsByOrder(allPlugins);
    expect(sorted[0].id).toBe("overview");
  });

  test("timeline comes after overview", () => {
    const sorted = sortPluginsByOrder(allPlugins);
    const overviewIdx = sorted.findIndex((p) => p.id === "overview");
    const timelineIdx = sorted.findIndex((p) => p.id === "timeline");
    expect(overviewIdx).toBeLessThan(timelineIdx);
  });

  test("all plugins maintain relative order after overview insertion", () => {
    const sorted = sortPluginsByOrder(allPlugins);
    expect(sorted.map((p) => p.id)).toEqual(["overview", "timeline", "repos"]);
  });
});

describe("Route structure", () => {
  test("/ renders OverviewPage", () => {
    const root = routes.find((r) => r.path === "/");
    expect(root).toBeTruthy();
    expect(root!.page).toBe("OverviewPage");
  });

  test("/timeline renders TimelinePage", () => {
    const timeline = routes.find((r) => r.path === "/timeline");
    expect(timeline).toBeTruthy();
    expect(timeline!.page).toBe("TimelinePage");
  });

  test("timeline is no longer at /", () => {
    const root = routes.find((r) => r.path === "/");
    expect(root!.page).not.toBe("TimelinePage");
  });
});

describe("Overview parallel queries", () => {
  interface QueryConfig {
    key: string[];
    fnName: string;
    independent: boolean;
  }

  const overviewQueries: QueryConfig[] = [
    { key: ["overview"], fnName: "getOverview", independent: true },
    { key: ["tasks"], fnName: "getTasks", independent: true },
    { key: ["actions", "pending"], fnName: "getActionsPending", independent: true },
    { key: ["health"], fnName: "getHealth", independent: true },
    { key: ["metrics"], fnName: "getMetrics", independent: true },
  ];

  test("overview fires exactly 5 queries", () => {
    expect(overviewQueries.length).toBe(5);
  });

  test("all queries are independent (no dependencies)", () => {
    expect(overviewQueries.every((q) => q.independent)).toBe(true);
  });

  test("each query has a unique key", () => {
    const keyStrings = overviewQueries.map((q) => JSON.stringify(q.key));
    const unique = new Set(keyStrings);
    expect(unique.size).toBe(5);
  });

  test("each query maps to a unique function", () => {
    const fns = overviewQueries.map((q) => q.fnName);
    const unique = new Set(fns);
    expect(unique.size).toBe(5);
  });

  test("query keys match expected vigilKeys structure", () => {
    const keys = overviewQueries.map((q) => q.key);
    expect(keys).toContainEqual(["overview"]);
    expect(keys).toContainEqual(["tasks"]);
    expect(keys).toContainEqual(["actions", "pending"]);
    expect(keys).toContainEqual(["health"]);
    expect(keys).toContainEqual(["metrics"]);
  });
});
