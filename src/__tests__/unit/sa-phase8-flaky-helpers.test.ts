import { describe, test, expect } from "bun:test";

function getPassRateColor(rate: number): string {
  if (rate <= 0.5) return "text-red-400";
  if (rate <= 0.8) return "text-yellow-400";
  return "text-green-400";
}

interface FlakyTestItem {
  testName: string;
  testFile: string;
  repo: string;
  totalRuns: number;
  passRate: number;
  flakyCommits: number;
  isDefinitive: boolean;
  lastFlakyAt: string | null;
  status: "flaky" | "stable" | "insufficient_data";
}

function getStatusBadge(item: FlakyTestItem): { label: string; className: string } {
  if (item.status === "flaky" && item.isDefinitive) {
    return { label: "FLAKY (def.)", className: "text-red-400 bg-red-400/10 border-0" };
  }
  if (item.status === "flaky") {
    return { label: "FLAKY (stat.)", className: "text-yellow-400 bg-yellow-400/10 border-0" };
  }
  if (item.status === "stable") {
    return { label: "STABLE", className: "text-green-400 bg-green-400/10 border-0" };
  }
  return { label: "N/A", className: "text-muted-foreground" };
}

function makeFlakyItem(overrides: Partial<FlakyTestItem> = {}): FlakyTestItem {
  return {
    testName: "test-example",
    testFile: "example.test.ts",
    repo: "vigil",
    totalRuns: 20,
    passRate: 0.75,
    flakyCommits: 3,
    isDefinitive: false,
    lastFlakyAt: null,
    status: "flaky",
    ...overrides,
  };
}

describe("SA Phase 8: getPassRateColor", () => {
  test("0% returns red", () => {
    expect(getPassRateColor(0)).toBe("text-red-400");
  });

  test("50% (boundary) returns red", () => {
    expect(getPassRateColor(0.5)).toBe("text-red-400");
  });

  test("25% returns red", () => {
    expect(getPassRateColor(0.25)).toBe("text-red-400");
  });

  test("51% returns yellow", () => {
    expect(getPassRateColor(0.51)).toBe("text-yellow-400");
  });

  test("80% (boundary) returns yellow", () => {
    expect(getPassRateColor(0.8)).toBe("text-yellow-400");
  });

  test("65% returns yellow", () => {
    expect(getPassRateColor(0.65)).toBe("text-yellow-400");
  });

  test("81% returns green", () => {
    expect(getPassRateColor(0.81)).toBe("text-green-400");
  });

  test("100% returns green", () => {
    expect(getPassRateColor(1.0)).toBe("text-green-400");
  });

  test("95% returns green", () => {
    expect(getPassRateColor(0.95)).toBe("text-green-400");
  });
});

describe("SA Phase 8: getStatusBadge", () => {
  test("flaky + definitive returns red FLAKY (def.) badge", () => {
    const result = getStatusBadge(makeFlakyItem({ status: "flaky", isDefinitive: true }));
    expect(result.label).toBe("FLAKY (def.)");
    expect(result.className).toContain("text-red-400");
    expect(result.className).toContain("bg-red-400/10");
  });

  test("flaky + not definitive returns yellow FLAKY (stat.) badge", () => {
    const result = getStatusBadge(makeFlakyItem({ status: "flaky", isDefinitive: false }));
    expect(result.label).toBe("FLAKY (stat.)");
    expect(result.className).toContain("text-yellow-400");
    expect(result.className).toContain("bg-yellow-400/10");
  });

  test("stable returns green STABLE badge", () => {
    const result = getStatusBadge(makeFlakyItem({ status: "stable" }));
    expect(result.label).toBe("STABLE");
    expect(result.className).toContain("text-green-400");
    expect(result.className).toContain("bg-green-400/10");
  });

  test("insufficient_data returns muted N/A badge", () => {
    const result = getStatusBadge(makeFlakyItem({ status: "insufficient_data" }));
    expect(result.label).toBe("N/A");
    expect(result.className).toContain("text-muted-foreground");
  });

  test("all badges include border-0 except insufficient_data", () => {
    const flaky = getStatusBadge(makeFlakyItem({ status: "flaky", isDefinitive: true }));
    const stat = getStatusBadge(makeFlakyItem({ status: "flaky", isDefinitive: false }));
    const stable = getStatusBadge(makeFlakyItem({ status: "stable" }));
    const na = getStatusBadge(makeFlakyItem({ status: "insufficient_data" }));

    expect(flaky.className).toContain("border-0");
    expect(stat.className).toContain("border-0");
    expect(stable.className).toContain("border-0");
    expect(na.className).not.toContain("border-0");
  });
});
