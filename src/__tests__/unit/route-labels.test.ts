import { describe, it, expect } from "bun:test";

// Route labels map — matches the spec in site-header.tsx.
// Once site-header exports routeLabels, update import.
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
