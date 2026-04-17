import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { SpecialistStore } from "./store.ts";

function makeFinding(overrides?: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    specialist: "security" as const,
    severity: "warning" as const,
    title: "Test finding",
    detail: "Test detail",
    repo: "vigil",
    confidence: 0.8,
    ...overrides,
  };
}

describe("SpecialistStore", () => {
  let store: SpecialistStore;

  beforeEach(() => {
    store = new SpecialistStore(new Database(":memory:"));
  });

  test("storeFinding + getFindings roundtrip", () => {
    const finding = makeFinding({
      id: "f1",
      specialist: "security",
      severity: "critical",
      title: "Hardcoded key",
      detail: "Found API key in config.ts",
      file: "config.ts",
      line: 42,
    });
    store.storeFinding(finding);

    const { findings, total } = store.getFindings();
    expect(total).toBe(1);
    expect(findings[0].title).toBe("Hardcoded key");
    expect(findings[0].specialist).toBe("security");
    expect(findings[0].severity).toBe("critical");
    expect(findings[0].file).toBe("config.ts");
    expect(findings[0].line).toBe(42);
  });

  test("dismissFinding marks dismissed and excludes from default query", () => {
    store.storeFinding(makeFinding({ id: "f1" }));
    store.dismissFinding("f1", "*.test.ts");

    const { findings } = store.getFindings();
    expect(findings.length).toBe(0);

    const patterns = store.getIgnorePatterns("security");
    expect(patterns).toContain("*.test.ts");
  });

  test("getFindings filters by specialist", () => {
    store.storeFinding(makeFinding({ id: "f1", specialist: "security", severity: "critical" }));
    store.storeFinding(makeFinding({ id: "f2", specialist: "code-review", severity: "info" }));

    const { findings } = store.getFindings({ specialist: "security" });
    expect(findings.length).toBe(1);
    expect(findings[0].specialist).toBe("security");
  });

  test("specialist config CRUD", () => {
    store.upsertSpecialistConfig({
      name: "test-agent",
      class: "analytical",
      description: "Test agent",
      triggerEvents: ["new_commit"],
      isBuiltin: false,
    });
    const config = store.getSpecialistConfig("test-agent");
    expect(config).not.toBeNull();
    expect(config!.description).toBe("Test agent");

    store.toggleSpecialist("test-agent", false);
    const updated = store.getSpecialistConfig("test-agent");
    expect(updated!.enabled).toBe(0);

    store.deleteSpecialistConfig("test-agent");
    expect(store.getSpecialistConfig("test-agent")).toBeNull();
  });

  test("flakiness tracking detects same-commit variance", () => {
    store.storeTestRun({
      id: "r1",
      repo: "vigil",
      commitHash: "abc",
      branch: "main",
      testName: "test > foo",
      testFile: "foo.test.ts",
      passed: true,
    });
    store.updateFlakiness("vigil", "test > foo", "foo.test.ts", true, "abc");

    store.storeTestRun({
      id: "r2",
      repo: "vigil",
      commitHash: "abc",
      branch: "main",
      testName: "test > foo",
      testFile: "foo.test.ts",
      passed: false,
    });
    store.updateFlakiness("vigil", "test > foo", "foo.test.ts", false, "abc");

    const flaky = store.getFlakyTests("vigil");
    expect(flaky.length).toBe(1);
    expect(flaky[0].test_name).toBe("test > foo");
    expect(flaky[0].flaky_commits).toBeGreaterThan(0);
  });
});
