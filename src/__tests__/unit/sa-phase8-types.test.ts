import { describe, test, expect } from "bun:test";
import type { ActionRequest, ActionsData } from "../../../dashboard-v2/src/types/api";
import type { ActionRequest as BackendActionRequest } from "../../action/executor";

function makeAction(overrides: Partial<ActionRequest> = {}): ActionRequest {
  return {
    id: "act-001",
    repo: "vigil",
    command: "bun test",
    args: [],
    tier: "safe",
    reason: "Run tests",
    confidence: 0.9,
    status: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("SA Phase 8: ActionRequest source fields (frontend)", () => {
  test("source field accepts 'llm'", () => {
    const action = makeAction({ source: "llm" });
    expect(action.source).toBe("llm");
  });

  test("source field accepts 'specialist'", () => {
    const action = makeAction({ source: "specialist" });
    expect(action.source).toBe("specialist");
  });

  test("source field accepts 'manual'", () => {
    const action = makeAction({ source: "manual" });
    expect(action.source).toBe("manual");
  });

  test("source field is optional (undefined)", () => {
    const action = makeAction();
    expect(action.source).toBeUndefined();
  });

  test("sourceSpecialist field holds specialist name", () => {
    const action = makeAction({ source: "specialist", sourceSpecialist: "security" });
    expect(action.sourceSpecialist).toBe("security");
  });

  test("sourceSpecialist field is optional (undefined)", () => {
    const action = makeAction();
    expect(action.sourceSpecialist).toBeUndefined();
  });

  test("sourceFindingId field holds finding ID", () => {
    const action = makeAction({ source: "specialist", sourceFindingId: "find-abc123" });
    expect(action.sourceFindingId).toBe("find-abc123");
  });

  test("sourceFindingId field is optional (undefined)", () => {
    const action = makeAction();
    expect(action.sourceFindingId).toBeUndefined();
  });

  test("backward compatibility: action without source fields is valid", () => {
    const action = makeAction();
    expect(action.id).toBe("act-001");
    expect(action.source).toBeUndefined();
    expect(action.sourceSpecialist).toBeUndefined();
    expect(action.sourceFindingId).toBeUndefined();
  });

  test("undefined source treated as 'llm' by UI convention", () => {
    const action = makeAction();
    const displaySource = action.source ?? "llm";
    expect(displaySource).toBe("llm");
  });
});

describe("SA Phase 8: ActionRequest source fields (backend executor)", () => {
  test("backend ActionRequest accepts source fields", () => {
    const action: BackendActionRequest = {
      id: "act-002",
      repo: "vigil",
      command: "bun test",
      args: [],
      tier: "safe",
      reason: "Run tests",
      confidence: 0.9,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: "specialist",
      sourceSpecialist: "code-review",
      sourceFindingId: "find-xyz",
    };
    expect(action.source).toBe("specialist");
    expect(action.sourceSpecialist).toBe("code-review");
    expect(action.sourceFindingId).toBe("find-xyz");
  });

  test("backend ActionRequest source fields are optional", () => {
    const action: BackendActionRequest = {
      id: "act-003",
      repo: "vigil",
      command: "ls",
      args: [],
      tier: "safe",
      reason: "list",
      confidence: 0.5,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(action.source).toBeUndefined();
    expect(action.sourceSpecialist).toBeUndefined();
    expect(action.sourceFindingId).toBeUndefined();
  });
});

describe("SA Phase 8: ActionsData bySource field", () => {
  test("bySource contains llm, specialist, and manual counts", () => {
    const data: ActionsData = {
      actions: [],
      pending: [],
      stats: { approved: 0, rejected: 0, executed: 0, failed: 0, pending: 0 },
      byTier: { safe: 0, moderate: 0, dangerous: 0 },
      gateConfig: {},
      isOptedIn: false,
      bySource: { llm: 10, specialist: 5, manual: 2 },
    };
    expect(data.bySource?.llm).toBe(10);
    expect(data.bySource?.specialist).toBe(5);
    expect(data.bySource?.manual).toBe(2);
  });

  test("bySource is optional (undefined)", () => {
    const data: ActionsData = {
      actions: [],
      pending: [],
      stats: { approved: 0, rejected: 0, executed: 0, failed: 0, pending: 0 },
      byTier: { safe: 0, moderate: 0, dangerous: 0 },
      gateConfig: {},
      isOptedIn: false,
    };
    expect(data.bySource).toBeUndefined();
  });
});
