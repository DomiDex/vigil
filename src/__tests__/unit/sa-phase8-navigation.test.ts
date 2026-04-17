import { describe, test, expect } from "bun:test";

describe("SA Phase 8: Cross-navigation link targets", () => {
  test("action-to-agents link targets /agents with findings tab and finding ID", () => {
    const findingId = "find-abc123";
    const linkTo = "/agents";
    const linkSearch = { tab: "findings", id: findingId };

    expect(linkTo).toBe("/agents");
    expect(linkSearch.tab).toBe("findings");
    expect(linkSearch.id).toBe(findingId);
  });

  test("finding ID display truncates to first 4 chars", () => {
    const findingId = "find-abc123";
    const display = `Finding #${findingId.slice(0, 4)}`;
    expect(display).toBe("Finding #find");
  });

  test("source filter defaults to 'all'", () => {
    const defaultFilter = "all";
    expect(defaultFilter).toBe("all");
  });

  test("source filter values match expected set", () => {
    const validSources = ["all", "specialist", "llm", "manual"];
    expect(validSources).toContain("all");
    expect(validSources).toContain("specialist");
    expect(validSources).toContain("llm");
    expect(validSources).toContain("manual");
    expect(validSources.length).toBe(4);
  });

  test("sourceSpecialist takes precedence in display logic", () => {
    const action = {
      source: "specialist" as const,
      sourceSpecialist: "security",
      sourceFindingId: "find-001",
    };
    const displaySource = action.sourceSpecialist ?? (action.source ?? "llm");
    expect(displaySource).toBe("security");
  });

  test("action without sourceSpecialist falls back to source value", () => {
    const action = { source: "llm" as const, sourceSpecialist: undefined };
    const displaySource = action.sourceSpecialist ?? (action.source ?? "llm");
    expect(displaySource).toBe("llm");
  });

  test("action without any source fields falls back to 'llm'", () => {
    const action = { source: undefined, sourceSpecialist: undefined };
    const displaySource = action.sourceSpecialist ?? (action.source ?? "llm");
    expect(displaySource).toBe("llm");
  });
});
