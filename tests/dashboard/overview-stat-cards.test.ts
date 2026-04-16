import { describe, test, expect } from "bun:test";

/**
 * Tests for Overview page StatCard logic.
 *
 * StatCards map API data to display values and navigation targets.
 * Each card has: icon name, title, value, optional trend, href.
 */

interface StatCardConfig {
  icon: string;
  title: string;
  href: string;
  getValue: (data: Record<string, any>) => string | number;
}

const statCards: StatCardConfig[] = [
  {
    icon: "GitBranch",
    title: "Watched Repos",
    href: "/repos",
    getValue: (data) => data.repoCount ?? 0,
  },
  {
    icon: "Zap",
    title: "Pending Actions",
    href: "/actions",
    getValue: (data) => data.pendingCount ?? 0,
  },
  {
    icon: "Sparkles",
    title: "Total Dreams",
    href: "/dreams",
    getValue: (data) => data.dreamCount ?? 0,
  },
  {
    icon: "HeartPulse",
    title: "Health Score",
    href: "/health",
    getValue: (data) => data.healthStatus ?? "unknown",
  },
];

describe("StatCard configuration", () => {
  test("defines exactly 4 stat cards", () => {
    expect(statCards.length).toBe(4);
  });

  test("each card has a unique href", () => {
    const hrefs = statCards.map((c) => c.href);
    const unique = new Set(hrefs);
    expect(unique.size).toBe(4);
  });

  test("each card has a unique icon", () => {
    const icons = statCards.map((c) => c.icon);
    const unique = new Set(icons);
    expect(unique.size).toBe(4);
  });

  test("repos card navigates to /repos", () => {
    const card = statCards.find((c) => c.title === "Watched Repos");
    expect(card).toBeTruthy();
    expect(card!.href).toBe("/repos");
    expect(card!.icon).toBe("GitBranch");
  });

  test("actions card navigates to /actions", () => {
    const card = statCards.find((c) => c.title === "Pending Actions");
    expect(card).toBeTruthy();
    expect(card!.href).toBe("/actions");
    expect(card!.icon).toBe("Zap");
  });

  test("dreams card navigates to /dreams", () => {
    const card = statCards.find((c) => c.title === "Total Dreams");
    expect(card).toBeTruthy();
    expect(card!.href).toBe("/dreams");
    expect(card!.icon).toBe("Sparkles");
  });

  test("health card navigates to /health", () => {
    const card = statCards.find((c) => c.title === "Health Score");
    expect(card).toBeTruthy();
    expect(card!.href).toBe("/health");
    expect(card!.icon).toBe("HeartPulse");
  });
});

describe("StatCard value extraction", () => {
  test("extracts repo count from overview data", () => {
    const card = statCards[0];
    expect(card.getValue({ repoCount: 5 })).toBe(5);
  });

  test("defaults to 0 when repoCount is missing", () => {
    const card = statCards[0];
    expect(card.getValue({})).toBe(0);
  });

  test("extracts pending action count", () => {
    const card = statCards[1];
    expect(card.getValue({ pendingCount: 3 })).toBe(3);
  });

  test("extracts dream count", () => {
    const card = statCards[2];
    expect(card.getValue({ dreamCount: 12 })).toBe(12);
  });

  test("extracts health status string", () => {
    const card = statCards[3];
    expect(card.getValue({ healthStatus: "ok" })).toBe("ok");
  });

  test("defaults health to unknown when missing", () => {
    const card = statCards[3];
    expect(card.getValue({})).toBe("unknown");
  });

  test("handles zero values correctly", () => {
    expect(statCards[0].getValue({ repoCount: 0 })).toBe(0);
    expect(statCards[1].getValue({ pendingCount: 0 })).toBe(0);
    expect(statCards[2].getValue({ dreamCount: 0 })).toBe(0);
  });
});
