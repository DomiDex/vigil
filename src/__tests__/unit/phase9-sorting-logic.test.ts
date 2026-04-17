// src/__tests__/unit/phase9-sorting-logic.test.ts
import { describe, expect, test } from "bun:test";

// ---- Test data ----

interface MockAction {
  id: string;
  command: string;
  status: "approved" | "rejected" | "executed" | "failed";
  tier: "safe" | "moderate" | "dangerous";
  createdAt: number;
  confidence: number;
  reason: string;
}

const MOCK_ACTIONS: MockAction[] = [
  {
    id: "a1",
    command: "run_tests",
    status: "approved",
    tier: "safe",
    createdAt: 1000,
    confidence: 0.9,
    reason: "Tests needed",
  },
  {
    id: "a2",
    command: "git_stash",
    status: "rejected",
    tier: "moderate",
    createdAt: 3000,
    confidence: 0.85,
    reason: "Stash changes",
  },
  {
    id: "a3",
    command: "deploy",
    status: "executed",
    tier: "dangerous",
    createdAt: 2000,
    confidence: 0.95,
    reason: "Deploy",
  },
  {
    id: "a4",
    command: "run_lint",
    status: "failed",
    tier: "safe",
    createdAt: 4000,
    confidence: 0.7,
    reason: "Lint fix",
  },
  {
    id: "a5",
    command: "backup_db",
    status: "approved",
    tier: "moderate",
    createdAt: 5000,
    confidence: 0.88,
    reason: "Backup",
  },
];

// ---- Pure sorting functions (mirroring ActionsPage logic) ----

const TIER_ORDER: Record<string, number> = { safe: 0, moderate: 1, dangerous: 2 };

function sortActions(
  actions: MockAction[],
  sortBy: "date" | "status" | "tier" | "command",
  sortDir: "asc" | "desc",
): MockAction[] {
  const sorted = [...actions].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "date":
        cmp = a.createdAt - b.createdAt;
        break;
      case "status":
        cmp = a.status.localeCompare(b.status);
        break;
      case "tier":
        cmp = (TIER_ORDER[a.tier] ?? 0) - (TIER_ORDER[b.tier] ?? 0);
        break;
      case "command":
        cmp = a.command.localeCompare(b.command);
        break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

function filterByStatus(actions: MockAction[], status: string): MockAction[] {
  if (status === "all") return actions;
  return actions.filter((a) => a.status === status);
}

function paginate<T>(
  items: T[],
  page: number,
  perPage: number,
): { data: T[]; hasNext: boolean; hasPrev: boolean; total: number } {
  const start = page * perPage;
  const end = Math.min(start + perPage, items.length);
  return {
    data: items.slice(start, end),
    hasNext: end < items.length,
    hasPrev: page > 0,
    total: items.length,
  };
}

// ---- Tests ----

describe("Phase 9: history sorting — by date", () => {
  test("ascending sorts oldest first", () => {
    const sorted = sortActions(MOCK_ACTIONS, "date", "asc");
    expect(sorted[0].id).toBe("a1");
    expect(sorted[4].id).toBe("a5");
  });

  test("descending sorts newest first", () => {
    const sorted = sortActions(MOCK_ACTIONS, "date", "desc");
    expect(sorted[0].id).toBe("a5");
    expect(sorted[4].id).toBe("a1");
  });
});

describe("Phase 9: history sorting — by status", () => {
  test("ascending sorts alphabetically (approved < executed < failed < rejected)", () => {
    const sorted = sortActions(MOCK_ACTIONS, "status", "asc");
    expect(sorted[0].status).toBe("approved");
    expect(sorted[sorted.length - 1].status).toBe("rejected");
  });

  test("descending reverses alphabetical order", () => {
    const sorted = sortActions(MOCK_ACTIONS, "status", "desc");
    expect(sorted[0].status).toBe("rejected");
    expect(sorted[sorted.length - 1].status).toBe("approved");
  });
});

describe("Phase 9: history sorting — by tier", () => {
  test("ascending sorts safe < moderate < dangerous", () => {
    const sorted = sortActions(MOCK_ACTIONS, "tier", "asc");
    expect(sorted[0].tier).toBe("safe");
    expect(sorted[sorted.length - 1].tier).toBe("dangerous");
  });

  test("descending sorts dangerous first", () => {
    const sorted = sortActions(MOCK_ACTIONS, "tier", "desc");
    expect(sorted[0].tier).toBe("dangerous");
  });
});

describe("Phase 9: history sorting — by command", () => {
  test("ascending sorts alphabetically", () => {
    const sorted = sortActions(MOCK_ACTIONS, "command", "asc");
    expect(sorted[0].command).toBe("backup_db");
    expect(sorted[sorted.length - 1].command).toBe("run_tests");
  });

  test("descending reverses alphabetical order", () => {
    const sorted = sortActions(MOCK_ACTIONS, "command", "desc");
    expect(sorted[0].command).toBe("run_tests");
    expect(sorted[sorted.length - 1].command).toBe("backup_db");
  });
});

describe("Phase 9: history status filtering", () => {
  test("'all' returns all actions", () => {
    const filtered = filterByStatus(MOCK_ACTIONS, "all");
    expect(filtered).toHaveLength(5);
  });

  test("'approved' returns only approved actions", () => {
    const filtered = filterByStatus(MOCK_ACTIONS, "approved");
    expect(filtered).toHaveLength(2);
    for (const a of filtered) {
      expect(a.status).toBe("approved");
    }
  });

  test("'rejected' returns only rejected actions", () => {
    const filtered = filterByStatus(MOCK_ACTIONS, "rejected");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].status).toBe("rejected");
  });

  test("'executed' returns only executed actions", () => {
    const filtered = filterByStatus(MOCK_ACTIONS, "executed");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].status).toBe("executed");
  });

  test("'failed' returns only failed actions", () => {
    const filtered = filterByStatus(MOCK_ACTIONS, "failed");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].status).toBe("failed");
  });

  test("unknown status returns empty array", () => {
    const filtered = filterByStatus(MOCK_ACTIONS, "unknown");
    expect(filtered).toHaveLength(0);
  });
});

describe("Phase 9: client-side pagination", () => {
  const manyActions: MockAction[] = Array.from({ length: 60 }, (_, i) => ({
    id: `act_${i}`,
    command: `cmd_${i}`,
    status: "approved" as const,
    tier: "safe" as const,
    createdAt: i * 1000,
    confidence: 0.9,
    reason: `Reason ${i}`,
  }));

  test("page 0 returns first 25 items", () => {
    const result = paginate(manyActions, 0, 25);
    expect(result.data).toHaveLength(25);
    expect(result.data[0].id).toBe("act_0");
    expect(result.data[24].id).toBe("act_24");
  });

  test("page 1 returns next 25 items", () => {
    const result = paginate(manyActions, 1, 25);
    expect(result.data).toHaveLength(25);
    expect(result.data[0].id).toBe("act_25");
    expect(result.data[24].id).toBe("act_49");
  });

  test("last page returns remaining items (partial page)", () => {
    const result = paginate(manyActions, 2, 25);
    expect(result.data).toHaveLength(10);
    expect(result.data[0].id).toBe("act_50");
  });

  test("hasNext is true when more pages exist", () => {
    const result = paginate(manyActions, 0, 25);
    expect(result.hasNext).toBe(true);
  });

  test("hasNext is false on last page", () => {
    const result = paginate(manyActions, 2, 25);
    expect(result.hasNext).toBe(false);
  });

  test("hasPrev is false on first page", () => {
    const result = paginate(manyActions, 0, 25);
    expect(result.hasPrev).toBe(false);
  });

  test("hasPrev is true on second page", () => {
    const result = paginate(manyActions, 1, 25);
    expect(result.hasPrev).toBe(true);
  });

  test("empty array returns empty data with no navigation", () => {
    const result = paginate([], 0, 25);
    expect(result.data).toHaveLength(0);
    expect(result.hasNext).toBe(false);
    expect(result.hasPrev).toBe(false);
    expect(result.total).toBe(0);
  });

  test("exact page boundary (25 items, 25 per page)", () => {
    const exactPage = manyActions.slice(0, 25);
    const result = paginate(exactPage, 0, 25);
    expect(result.data).toHaveLength(25);
    expect(result.hasNext).toBe(false);
    expect(result.hasPrev).toBe(false);
  });

  test("total reflects full item count regardless of page", () => {
    const page0 = paginate(manyActions, 0, 25);
    const page1 = paginate(manyActions, 1, 25);
    expect(page0.total).toBe(60);
    expect(page1.total).toBe(60);
  });
});

describe("Phase 9: combined sort + filter + paginate", () => {
  const actions = MOCK_ACTIONS;

  test("filter then sort produces correct subset in order", () => {
    const filtered = filterByStatus(actions, "approved");
    const sorted = sortActions(filtered, "date", "asc");
    expect(sorted).toHaveLength(2);
    expect(sorted[0].createdAt).toBeLessThan(sorted[1].createdAt);
  });

  test("filter then sort then paginate works end-to-end", () => {
    const filtered = filterByStatus(actions, "all");
    const sorted = sortActions(filtered, "date", "desc");
    const page = paginate(sorted, 0, 3);
    expect(page.data).toHaveLength(3);
    expect(page.data[0].createdAt).toBeGreaterThan(page.data[1].createdAt);
    expect(page.hasNext).toBe(true);
  });
});
