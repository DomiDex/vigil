import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { SpecialistStore } from "../../specialists/store.ts";
import { classifyFlakyStatus } from "../../specialists/agents/flaky-test/scorer.ts";

function seed(store: SpecialistStore) {
  // Definitive flaky on my-app: same commit, different result
  store.updateFlakiness("my-app", "test > login flow", "auth.test.ts", true, "abc");
  store.updateFlakiness("my-app", "test > login flow", "auth.test.ts", false, "abc");
  // Stable on my-app
  store.updateFlakiness("my-app", "test > renders ok", "ui.test.ts", true, "abc");
  // Stable on other-repo
  store.updateFlakiness("other-repo", "test > build step", "build.test.ts", true, "xyz");
}

describe("Phase 5: classifyFlakyStatus (CLI status logic)", () => {
  test("flaky_commits > 0 yields FLAKY (definitive)", () => {
    expect(classifyFlakyStatus({ flaky_commits: 3, total_runs: 20, total_passes: 18 })).toBe("FLAKY (definitive)");
  });

  test("pass rate < 50% with zero flaky_commits yields FLAKY (statistical)", () => {
    expect(classifyFlakyStatus({ flaky_commits: 0, total_runs: 10, total_passes: 3 })).toBe("FLAKY (statistical)");
  });

  test("pass rate >= 50% with zero flaky_commits yields STABLE", () => {
    expect(classifyFlakyStatus({ flaky_commits: 0, total_runs: 15, total_passes: 15 })).toBe("STABLE");
  });

  test("zero total_runs yields STABLE (no division by zero)", () => {
    expect(classifyFlakyStatus({ flaky_commits: 0, total_runs: 0, total_passes: 0 })).toBe("STABLE");
  });

  test("exactly 50% pass rate yields STABLE (boundary)", () => {
    expect(classifyFlakyStatus({ flaky_commits: 0, total_runs: 10, total_passes: 5 })).toBe("STABLE");
  });

  test("definitive takes priority over statistical", () => {
    expect(classifyFlakyStatus({ flaky_commits: 2, total_runs: 10, total_passes: 2 })).toBe("FLAKY (definitive)");
  });
});

describe("Phase 5: SpecialistStore.getFlakyTests()", () => {
  let store: SpecialistStore;

  beforeEach(() => {
    store = new SpecialistStore(new Database(":memory:"));
    seed(store);
  });

  test("returns only flaky-definitive rows when no repo filter", () => {
    const rows = store.getFlakyTests();
    expect(rows.length).toBe(1);
    expect(rows[0].test_name).toBe("test > login flow");
    expect(rows[0].flaky_commits).toBeGreaterThan(0);
  });

  test("filters by repo when provided", () => {
    const rows = store.getFlakyTests("my-app");
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.repo === "my-app")).toBe(true);
  });

  test("returns empty array for unknown repo", () => {
    expect(store.getFlakyTests("nonexistent")).toHaveLength(0);
  });
});

describe("Phase 5: SpecialistStore.resetFlakyTest()", () => {
  let store: SpecialistStore;

  beforeEach(() => {
    store = new SpecialistStore(new Database(":memory:"));
    seed(store);
  });

  test("returns true when a row was deleted", () => {
    expect(store.resetFlakyTest("my-app", "test > login flow")).toBe(true);
  });

  test("returns false for nonexistent test", () => {
    expect(store.resetFlakyTest("my-app", "test > does-not-exist")).toBe(false);
  });

  test("removes the targeted row from getTrackedTests", () => {
    store.resetFlakyTest("my-app", "test > login flow");
    const remaining = store.getTrackedTests("my-app").map((r) => r.test_name);
    expect(remaining).not.toContain("test > login flow");
    expect(remaining).toContain("test > renders ok");
  });

  test("does not affect other repos", () => {
    store.resetFlakyTest("my-app", "test > login flow");
    expect(store.getTrackedTests("other-repo")).toHaveLength(1);
  });
});

describe("Phase 5: flaky summary count", () => {
  test("counts definitive + statistical as flaky", () => {
    const tests = [
      { flaky_commits: 3, total_runs: 20, total_passes: 18 },
      { flaky_commits: 0, total_runs: 10, total_passes: 3 },
      { flaky_commits: 0, total_runs: 15, total_passes: 15 },
    ];
    const flakyCount = tests.filter(
      (t) => t.flaky_commits > 0 || (t.total_runs > 0 && t.total_passes / t.total_runs < 0.5),
    ).length;
    expect(flakyCount).toBe(2);
  });

  test("all stable yields zero flaky count", () => {
    const tests = [
      { flaky_commits: 0, total_runs: 10, total_passes: 10 },
      { flaky_commits: 0, total_runs: 5, total_passes: 5 },
    ];
    const flakyCount = tests.filter(
      (t) => t.flaky_commits > 0 || (t.total_runs > 0 && t.total_passes / t.total_runs < 0.5),
    ).length;
    expect(flakyCount).toBe(0);
  });
});

describe("Phase 5: flaky test name truncation", () => {
  test("names <= 48 chars are unchanged", () => {
    const name = "test > short name";
    const result = name.length > 48 ? `${name.slice(0, 45)}...` : name;
    expect(result).toBe("test > short name");
  });

  test("names > 48 chars are truncated with ellipsis", () => {
    const name = "test > this is a very long test name that exceeds the column width limit";
    const result = name.length > 48 ? `${name.slice(0, 45)}...` : name;
    expect(result).toHaveLength(48);
    expect(result.endsWith("...")).toBe(true);
  });
});

describe("Phase 5: pass rate formatting", () => {
  test("non-zero runs produce percentage string", () => {
    const rate = `${((18 / 20) * 100).toFixed(0)}%`;
    expect(rate).toBe("90%");
  });

  test("zero runs produce N/A", () => {
    const totalRuns = 0;
    const rate = totalRuns > 0 ? `${((0 / totalRuns) * 100).toFixed(0)}%` : "N/A";
    expect(rate).toBe("N/A");
  });
});
