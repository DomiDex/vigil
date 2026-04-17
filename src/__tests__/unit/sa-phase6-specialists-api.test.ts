import { beforeEach, describe, expect, it } from "bun:test";
import {
  getFlakyTestsJSON,
  getSpecialistDetailJSON,
  getSpecialistFindingDetailJSON,
  getSpecialistFindingsJSON,
  getSpecialistsJSON,
  handleFindingCreateAction,
  handleFindingDismiss,
  handleFlakyTestReset,
  handleFlakyTestRun,
  handleSpecialistCreate,
  handleSpecialistDelete,
  handleSpecialistRun,
  handleSpecialistToggle,
  handleSpecialistUpdate,
} from "../../dashboard/api/specialists.ts";
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context.ts";

// ── Factory: wrap createFakeDashboardContext with specialist stubs ──

function createSpecialistContext() {
  const base = createFakeDashboardContext();
  const daemon = base.daemon as any;

  const configs = new Map<string, any>();
  const findings = new Map<string, any>();
  const flakyTests: any[] = [];
  const lastRuns = new Map<string, { at: number; repo: string }>();

  configs.set("security", {
    name: "security",
    class: "deterministic",
    description: "Security scanner",
    enabled: 1,
    is_builtin: 1,
    trigger_events: JSON.stringify(["new_commit"]),
    watch_patterns: JSON.stringify([]),
    created_at: Date.now(),
    updated_at: Date.now(),
  });

  findings.set("f_001", {
    id: "f_001",
    specialist: "security",
    repo: "vigil",
    title: "Hardcoded secret in config.ts",
    detail: "Found a hardcoded token",
    severity: "critical",
    confidence: 0.95,
    suggestion: "Remove the hardcoded token",
    file: "src/core/config.ts",
    line: 42,
    commit_hash: null,
    dismissed: 0,
    dismissed_at: null,
    ignore_pattern: null,
    source_action_id: null,
    created_at: Date.now(),
  });

  daemon.specialistStore = {
    getSpecialistConfigs: () => Array.from(configs.values()),
    getSpecialistConfig: (name: string) => configs.get(name) ?? null,
    upsertSpecialistConfig: (input: any) => {
      const now = Date.now();
      const existing = configs.get(input.name);
      configs.set(input.name, {
        name: input.name,
        class: input.class,
        description: input.description,
        trigger_events: JSON.stringify(input.triggerEvents ?? []),
        watch_patterns: JSON.stringify(input.watchPatterns ?? []),
        enabled: existing?.enabled ?? 1,
        is_builtin: input.isBuiltin ? 1 : (existing?.is_builtin ?? 0),
        created_at: existing?.created_at ?? now,
        updated_at: now,
      });
    },
    deleteSpecialistConfig: (name: string) => {
      const row = configs.get(name);
      if (row && row.is_builtin === 0) configs.delete(name);
    },
    toggleSpecialist: (name: string, enabled: boolean) => {
      const row = configs.get(name);
      if (row) {
        row.enabled = enabled ? 1 : 0;
        row.updated_at = Date.now();
      }
    },
    getFindings: (opts?: any) => {
      let list = Array.from(findings.values());
      if (opts?.dismissed === undefined || opts?.dismissed === false) {
        list = list.filter((f: any) => f.dismissed === 0);
      }
      if (opts?.specialist) list = list.filter((f: any) => f.specialist === opts.specialist);
      if (opts?.severity) list = list.filter((f: any) => f.severity === opts.severity);
      if (opts?.repo) list = list.filter((f: any) => f.repo === opts.repo);
      const total = list.length;
      const offset = opts?.offset ?? 0;
      const limit = opts?.limit ?? 50;
      return { findings: list.slice(offset, offset + limit), total };
    },
    getFindingById: (id: string) => findings.get(id) ?? null,
    getRecentFindings: (_repo: string, specialist: string, limit = 10) =>
      Array.from(findings.values())
        .filter((f: any) => f.specialist === specialist && f.dismissed === 0)
        .slice(0, limit),
    dismissFinding: (id: string, ignorePattern?: string) => {
      const f = findings.get(id);
      if (f) {
        f.dismissed = 1;
        f.dismissed_at = Date.now();
        f.ignore_pattern = ignorePattern ?? null;
      }
    },
    getSpecialistStats: (name: string) => {
      const own = Array.from(findings.values()).filter((f: any) => f.specialist === name);
      const bySeverity: Record<string, number> = {};
      for (const f of own) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
      return {
        total: own.length,
        bySeverity: Object.entries(bySeverity).map(([severity, count]) => ({ severity, count })),
        avgConfidence: own.length > 0 ? own.reduce((a, f) => a + f.confidence, 0) / own.length : 0,
        lastWeek: own.length,
      };
    },
    getFlakyTests: (_repo?: string) => flakyTests,
    resetFlakyTest: (_repo: string, testName: string) => {
      const idx = flakyTests.findIndex((t: any) => t.test_name === testName);
      if (idx >= 0) {
        flakyTests.splice(idx, 1);
        return true;
      }
      // Default: pretend we reset it so `success: true` path stays exercised
      // by the happy-path test. The "not found" path uses a separate fake.
      return true;
    },
    getSpecialistSummaries: () => {
      const summaries = new Map<string, { total: number; lastAt: number | null; lastRepo: string | null }>();
      for (const f of findings.values() as Iterable<any>) {
        const cur = summaries.get(f.specialist) ?? { total: 0, lastAt: null, lastRepo: null };
        cur.total += 1;
        if (cur.lastAt === null || f.created_at > cur.lastAt) {
          cur.lastAt = f.created_at;
          cur.lastRepo = f.repo;
        }
        summaries.set(f.specialist, cur);
      }
      return summaries;
    },
  };

  daemon.specialistRouter = {
    getCooldownRemaining: (_name: string, _repo: string) => 0,
  };

  daemon.specialistRunner = {
    run: async (spec: any, _ctx: any) => ({
      specialist: spec.name,
      findings: [],
      confidence: 0.9,
    }),
  };

  daemon.runSpecialist = async (name: string, repo: string) => {
    lastRuns.set(name, { at: Date.now(), repo });
    return { specialist: name, repo, findings: [], confidence: 0.9, runId: "run_001" };
  };

  daemon.runFlakyCheck = async (repo: string) => ({ success: true, runId: "flaky_001", repo });

  daemon.getSpecialistLastRun = (name: string) => lastRuns.get(name) ?? null;

  daemon.actionExecutor.submit = async (command: string, reason: string, repo: string, _repoPath: string) => ({
    id: "action_001",
    repo,
    command,
    args: [command],
    tier: "safe",
    reason,
    confidence: 0.7,
    status: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  daemon.config.specialists = {
    enabled: true,
    maxParallel: 2,
    cooldownSeconds: 300,
    severityThreshold: "info",
    agents: ["security"],
  };

  return base;
}

let ctx: ReturnType<typeof createSpecialistContext>;

beforeEach(() => {
  ctx = createSpecialistContext();
});

// ── List + Detail ──

describe("getSpecialistsJSON", () => {
  it("returns specialists array and globalConfig", () => {
    const result = getSpecialistsJSON(ctx);
    expect(Array.isArray(result.specialists)).toBe(true);
    expect(result.specialists.length).toBeGreaterThan(0);
    expect(result.globalConfig).toBeDefined();
    expect(result.globalConfig.enabled).toBe(true);
  });

  it("includes findingCount and cooldownRemaining per specialist", () => {
    const result = getSpecialistsJSON(ctx);
    const security = result.specialists.find((s: any) => s.name === "security");
    expect(security).toBeDefined();
    expect(typeof security!.findingCount).toBe("number");
    expect(typeof security!.cooldownRemaining).toBe("number");
    expect(Array.isArray(security!.triggerEvents)).toBe(true);
  });
});

describe("getSpecialistDetailJSON", () => {
  it("returns config, recentFindings, stats for existing specialist", () => {
    const result = getSpecialistDetailJSON(ctx, "security");
    expect(result).not.toBeNull();
    expect(result!.config.name).toBe("security");
    expect(Array.isArray(result!.recentFindings)).toBe(true);
    expect(result!.stats).toBeDefined();
    expect(typeof result!.stats.totalFindings).toBe("number");
  });

  it("returns null for non-existent specialist", () => {
    const result = getSpecialistDetailJSON(ctx, "nonexistent");
    expect(result).toBeNull();
  });
});

// ── Findings ──

describe("getSpecialistFindingsJSON", () => {
  it("returns paginated findings with total, page, hasMore", () => {
    const url = new URL("http://localhost/api/specialists/findings");
    const result = getSpecialistFindingsJSON(ctx, url);
    expect(Array.isArray(result.findings)).toBe(true);
    expect(typeof result.total).toBe("number");
    expect(result.page).toBe(1);
    expect(typeof result.hasMore).toBe("boolean");
  });

  it("filters by severity param", () => {
    const url = new URL("http://localhost/api/specialists/findings?severity=critical");
    const result = getSpecialistFindingsJSON(ctx, url);
    for (const f of result.findings) {
      expect(f.severity).toBe("critical");
    }
  });

  it("filters by specialist param", () => {
    const url = new URL("http://localhost/api/specialists/findings?specialist=security");
    const result = getSpecialistFindingsJSON(ctx, url);
    for (const f of result.findings) {
      expect(f.specialist).toBe("security");
    }
  });

  it("respects page param for offset", () => {
    const url = new URL("http://localhost/api/specialists/findings?page=2");
    const result = getSpecialistFindingsJSON(ctx, url);
    expect(result.page).toBe(2);
  });
});

describe("getSpecialistFindingDetailJSON", () => {
  it("returns finding for valid ID", () => {
    const result = getSpecialistFindingDetailJSON(ctx, "f_001");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("f_001");
  });

  it("returns null for non-existent ID", () => {
    const result = getSpecialistFindingDetailJSON(ctx, "nonexistent");
    expect(result).toBeNull();
  });
});

// ── CRUD lifecycle ──

describe("specialist CRUD lifecycle", () => {
  it("create -> list -> update -> detail -> delete", () => {
    const createResult = handleSpecialistCreate(ctx, {
      name: "test-agent",
      class: "deterministic",
      description: "A test specialist",
      triggerEvents: ["new_commit"],
    });
    expect(createResult.success).toBe(true);
    expect(createResult.name).toBe("test-agent");

    const list = getSpecialistsJSON(ctx);
    const found = list.specialists.find((s: any) => s.name === "test-agent");
    expect(found).toBeDefined();

    const updateResult = handleSpecialistUpdate(ctx, "test-agent", { description: "Updated description" });
    expect(updateResult).not.toBeNull();
    expect(updateResult!.success).toBe(true);

    const detail = getSpecialistDetailJSON(ctx, "test-agent");
    expect(detail).not.toBeNull();

    const deleteResult = handleSpecialistDelete(ctx, "test-agent");
    expect(deleteResult.success).toBe(true);

    const listAfter = getSpecialistsJSON(ctx);
    const gone = listAfter.specialists.find((s: any) => s.name === "test-agent");
    expect(gone).toBeUndefined();
  });
});

// ── Create validation ──

describe("handleSpecialistCreate", () => {
  it("rejects missing required fields", () => {
    const result = handleSpecialistCreate(ctx, { name: "incomplete" });
    expect(result.error).toBeDefined();
  });

  it("rejects analytical specialists (Phase 3 gap)", () => {
    const result = handleSpecialistCreate(ctx, {
      name: "analytical-one",
      class: "analytical",
      description: "Would need a systemPrompt",
      triggerEvents: ["new_commit"],
    });
    expect(result.error).toContain("Analytical");
  });

  it("rejects duplicate name", () => {
    const result = handleSpecialistCreate(ctx, {
      name: "security",
      class: "deterministic",
      description: "Duplicate",
      triggerEvents: ["new_commit"],
    });
    expect(result.error).toContain("already exists");
  });

  it("rejects fields the backend cannot yet persist", () => {
    const result = handleSpecialistCreate(ctx, {
      name: "with-model",
      class: "deterministic",
      description: "Has an unsupported model override",
      triggerEvents: ["new_commit"],
      model: "claude-haiku-4-5-20251001",
    });
    expect(result.error).toContain("model");
  });
});

// ── Delete constraints ──

describe("handleSpecialistDelete", () => {
  it("blocks deletion of built-in specialist", () => {
    const result = handleSpecialistDelete(ctx, "security");
    expect(result.error).toContain("built-in");
  });

  it("returns error for non-existent specialist", () => {
    const result = handleSpecialistDelete(ctx, "nonexistent");
    expect(result.error).toBeDefined();
  });
});

// ── Update + Toggle ──

describe("handleSpecialistUpdate", () => {
  it("returns null for non-existent specialist", () => {
    const result = handleSpecialistUpdate(ctx, "nonexistent", { description: "x" });
    expect(result).toBeNull();
  });
});

describe("handleSpecialistToggle", () => {
  it("toggles enabled state", () => {
    const result = handleSpecialistToggle(ctx, "security", { enabled: false });
    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
  });

  it("returns null for non-existent specialist", () => {
    const result = handleSpecialistToggle(ctx, "nonexistent", {});
    expect(result).toBeNull();
  });
});

// ── Run ──

describe("handleSpecialistRun", () => {
  it("runs specialist and returns result", async () => {
    const result = await handleSpecialistRun(ctx, "security", {});
    expect(result).not.toBeNull();
    expect(result!.runId).toBeDefined();
  });

  it("returns null for non-existent specialist", async () => {
    const result = await handleSpecialistRun(ctx, "nonexistent", {});
    expect(result).toBeNull();
  });

  it("returns error for disabled specialist", async () => {
    (ctx.daemon as any).specialistStore.toggleSpecialist("security", false);
    const result = await handleSpecialistRun(ctx, "security", {});
    expect(result).not.toBeNull();
    expect((result as any).error).toContain("disabled");
  });
});

// ── Findings mutations ──

describe("handleFindingDismiss", () => {
  it("dismisses existing finding", () => {
    const result = handleFindingDismiss(ctx, "f_001", {});
    expect(result.success).toBe(true);
  });

  it("returns error for non-existent finding", () => {
    const result = handleFindingDismiss(ctx, "nonexistent", {});
    expect(result.error).toBeDefined();
  });
});

describe("handleFindingCreateAction", () => {
  it("creates action from finding and returns actionId", async () => {
    const result = await handleFindingCreateAction(ctx, "f_001", {});
    expect(result.success).toBe(true);
    expect(result.actionId).toBe("action_001");
  });

  it("returns error for non-existent finding", async () => {
    const result = await handleFindingCreateAction(ctx, "nonexistent", {});
    expect(result.error).toBeDefined();
  });
});

// ── Flaky tests ──

describe("getFlakyTestsJSON", () => {
  it("returns flaky test data", () => {
    const url = new URL("http://localhost/api/specialists/flaky");
    const result = getFlakyTestsJSON(ctx, url);
    expect(result).toBeDefined();
  });
});

describe("handleFlakyTestRun", () => {
  it("requires repo field", async () => {
    const result = await handleFlakyTestRun(ctx, {});
    expect(result.error).toContain("repo");
  });

  it("runs with valid repo", async () => {
    const result = await handleFlakyTestRun(ctx, { repo: "/tmp/test-repo" });
    expect(result.success).toBe(true);
    expect(result.runId).toBeDefined();
  });
});

describe("handleFlakyTestReset", () => {
  it("returns success on happy path (falls back to first watched repo)", () => {
    const result = handleFlakyTestReset(ctx, "some-test");
    expect(result.success).toBe(true);
  });

  it("returns error when nothing was deleted", () => {
    (ctx.daemon as any).specialistStore.resetFlakyTest = () => false;
    const result = handleFlakyTestReset(ctx, "missing-test");
    expect(result.error).toContain("not found");
  });

  it("returns error when no repo query param and no watched repos", () => {
    (ctx.daemon as any).repoPaths = [];
    const result = handleFlakyTestReset(ctx, "some-test");
    expect(result.error).toContain("repo");
  });
});

// ── SSE wiring (source scan) ──

describe("SSE wiring", () => {
  it("sse.ts contains specialist_finding event", async () => {
    const source = await Bun.file(new URL("../../dashboard/api/sse.ts", import.meta.url).pathname).text();
    expect(source).toContain("specialist_finding");
  });

  it("sse.ts contains specialist_run event", async () => {
    const source = await Bun.file(new URL("../../dashboard/api/sse.ts", import.meta.url).pathname).text();
    expect(source).toContain("specialist_run");
  });

  it("sse.ts contains flaky_update event", async () => {
    const source = await Bun.file(new URL("../../dashboard/api/sse.ts", import.meta.url).pathname).text();
    expect(source).toContain("flaky_update");
  });
});
