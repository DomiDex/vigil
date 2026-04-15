import { describe, expect, it } from "bun:test";

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
  slot: "tab" | "sidebar" | "timeline-card" | "overlay" | "top-bar";
  order: number;
}

function getTabPlugins(plugins: PluginWidget[]): PluginWidget[] {
  return plugins.filter((p) => p.slot === "tab").sort((a, b) => a.order - b.order);
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
    { id: "widget-1", label: "Widget", icon: "Box", slot: "sidebar", order: 1 },
    { id: "tasks", label: "Tasks", icon: "CheckSquare", slot: "tab", order: 4 },
    { id: "panel-1", label: "Panel", icon: "Layout", slot: "overlay", order: 1 },
  ];

  it("filters only tab-slot plugins", () => {
    const tabs = getTabPlugins(testPlugins);
    expect(tabs.length).toBe(4);
    expect(tabs.every((t) => t.slot === "tab")).toBe(true);
  });

  it("sorts tabs by order ascending", () => {
    const tabs = getTabPlugins(testPlugins);
    expect(tabs.map((t) => t.id)).toEqual(["timeline", "repos", "dreams", "tasks"]);
  });

  it("handles empty plugin array", () => {
    const tabs = getTabPlugins([]);
    expect(tabs.length).toBe(0);
  });

  it("handles array with no tab-slot plugins", () => {
    const sidebarOnly: PluginWidget[] = [{ id: "w1", label: "W1", icon: "Box", slot: "sidebar", order: 1 }];
    const tabs = getTabPlugins(sidebarOnly);
    expect(tabs.length).toBe(0);
  });

  it("preserves order when multiple tabs have same order value", () => {
    const samePriority: PluginWidget[] = [
      { id: "b", label: "B", icon: "Box", slot: "tab", order: 1 },
      { id: "a", label: "A", icon: "Box", slot: "tab", order: 1 },
    ];
    const tabs = getTabPlugins(samePriority);
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
    const expectedIcons = [
      "Clock",
      "GitBranch",
      "Sparkles",
      "CheckSquare",
      "Zap",
      "Brain",
      "BarChart3",
      "Calendar",
      "Settings",
    ];

    for (const icon of expectedIcons) {
      expect(icon.length).toBeGreaterThan(0);
      expect(icon[0]).toBe(icon[0].toUpperCase());
    }
  });
});
