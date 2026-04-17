import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { startDashboard } from "../../dashboard/server.ts";
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context.ts";

// Build the same extended daemon context as the unit tests, but feed it into
// startDashboard() as if it were a real Daemon instance.
function createSpecialistDaemon() {
  const base = createFakeDashboardContext();
  const daemon = base.daemon as any;

  const configs = new Map<string, any>();
  const findings = new Map<string, any>();
  const flakyTests: any[] = [];

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
      if (row) row.enabled = enabled ? 1 : 0;
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
    getSpecialistStats: (name: string) => ({
      total: Array.from(findings.values()).filter((f: any) => f.specialist === name).length,
      bySeverity: [],
      avgConfidence: 0,
      lastWeek: 0,
    }),
    getFlakyTests: (_repo?: string) => flakyTests,
    resetFlakyTest: (_repo: string, _testName: string) => true,
  };

  daemon.specialistRouter = {
    getCooldownRemaining: (_name: string, _repo: string) => 0,
  };

  daemon.runSpecialist = async (name: string, repo: string) => ({
    specialist: name,
    repo,
    findings: [],
    confidence: 0.9,
    runId: "run_001",
  });

  daemon.runFlakyCheck = async (repo: string) => ({ success: true, runId: "flaky_001", repo });

  daemon.actionExecutor.submit = async (command: string, reason: string, repo: string) => ({
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

  return daemon;
}

let server: Awaited<ReturnType<typeof startDashboard>> | undefined;
let base: string;

beforeEach(async () => {
  const port = 40000 + Math.floor(Math.random() * 10000);
  base = `http://localhost:${port}`;
  const daemon = createSpecialistDaemon();
  server = await startDashboard(daemon as any, port);
});

afterEach(() => {
  server?.stop(true);
});

describe("Route order: specific paths before /:name", () => {
  it("GET /api/specialists/findings returns findings list", async () => {
    const res = await fetch(`${base}/api/specialists/findings`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.findings)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect(body.config).toBeUndefined();
  });

  it("GET /api/specialists/flaky returns flaky data, not specialist detail", async () => {
    const res = await fetch(`${base}/api/specialists/flaky`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.config).toBeUndefined();
  });

  it("GET /api/specialists/findings/f_001 returns finding detail", async () => {
    const res = await fetch(`${base}/api/specialists/findings/f_001`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.id).toBe("f_001");
  });

  it("POST /api/specialists/findings/f_001/dismiss hits dismiss route", async () => {
    const res = await fetch(`${base}/api/specialists/findings/f_001/dismiss`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
  });

  it("POST /api/specialists/findings/f_001/action hits action route", async () => {
    const res = await fetch(`${base}/api/specialists/findings/f_001/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.actionId).toBeDefined();
  });

  it("POST /api/specialists/flaky/run hits flaky run route", async () => {
    const res = await fetch(`${base}/api/specialists/flaky/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: "/tmp/test-repo" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.runId).toBeDefined();
  });
});

describe("Route matching: collection and single-resource endpoints", () => {
  it("GET /api/specialists returns specialist list", async () => {
    const res = await fetch(`${base}/api/specialists`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.specialists)).toBe(true);
    expect(body.globalConfig).toBeDefined();
  });

  it("GET /api/specialists/security returns specialist detail", async () => {
    const res = await fetch(`${base}/api/specialists/security`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.config).toBeDefined();
    expect(body.config.name).toBe("security");
  });

  it("GET /api/specialists/nonexistent returns 404", async () => {
    const res = await fetch(`${base}/api/specialists/nonexistent`);
    expect(res.status).toBe(404);
  });

  it("POST /api/specialists creates specialist", async () => {
    const res = await fetch(`${base}/api/specialists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "test-agent",
        class: "analytical",
        description: "Test",
        triggerEvents: ["new_commit"],
        systemPrompt: "Analyze",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
  });

  it("POST /api/specialists with bad body returns 400", async () => {
    const res = await fetch(`${base}/api/specialists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "incomplete" }),
    });
    expect(res.status).toBe(400);
  });

  it("PUT /api/specialists/security updates specialist", async () => {
    const res = await fetch(`${base}/api/specialists/security`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Updated" }),
    });
    expect(res.status).toBe(200);
  });

  it("PUT /api/specialists/nonexistent returns 404", async () => {
    const res = await fetch(`${base}/api/specialists/nonexistent`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "x" }),
    });
    expect(res.status).toBe(404);
  });

  it("DELETE /api/specialists/security returns 400 for builtin", async () => {
    const res = await fetch(`${base}/api/specialists/security`, { method: "DELETE" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toContain("built-in");
  });

  it("POST /api/specialists/security/toggle toggles state", async () => {
    const res = await fetch(`${base}/api/specialists/security/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(200);
  });

  it("POST /api/specialists/security/run forces run", async () => {
    const res = await fetch(`${base}/api/specialists/security/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
  });

  it("DELETE /api/specialists/flaky/some-test resets flaky test", async () => {
    const res = await fetch(`${base}/api/specialists/flaky/some-test?repo=vigil`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
  });

  it("GET /api/specialists/findings/nonexistent returns 404", async () => {
    const res = await fetch(`${base}/api/specialists/findings/nonexistent`);
    expect(res.status).toBe(404);
  });

  it("GET /api/specialists/findings?severity=critical filters results", async () => {
    const res = await fetch(`${base}/api/specialists/findings?severity=critical`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.findings)).toBe(true);
  });
});
