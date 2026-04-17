import type { DashboardContext } from "../types.ts";

// ── Helpers ──

// Fields the client may send in create/update that the backend can't yet
// persist (Phase 3 gap). Reject rather than silently drop.
const UNSUPPORTED_CONFIG_FIELDS = ["systemPrompt", "model", "cooldownSeconds", "severityThreshold"] as const;

type BySeverity = { critical: number; warning: number; info: number };

function parseJsonArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rowToConfig(row: any): {
  name: string;
  class: string;
  description: string;
  enabled: boolean;
  triggerEvents: string[];
  watchPatterns: string[];
  isBuiltin: boolean;
  createdAt: number;
  updatedAt: number;
} {
  return {
    name: row.name,
    class: row.class,
    description: row.description,
    enabled: row.enabled === 1 || row.enabled === true,
    triggerEvents: parseJsonArray(row.trigger_events ?? row.triggerEvents),
    watchPatterns: parseJsonArray(row.watch_patterns ?? row.watchPatterns),
    isBuiltin: row.is_builtin === 1 || row.is_builtin === true || row.isBuiltin === true,
    createdAt: row.created_at ?? row.createdAt ?? 0,
    updatedAt: row.updated_at ?? row.updatedAt ?? 0,
  };
}

function repoNames(ctx: DashboardContext): string[] {
  return (ctx.daemon.repoPaths ?? [])
    .map((p) => p.split("/").filter(Boolean).pop() ?? "")
    .filter((n): n is string => n.length > 0);
}

function firstRepoName(ctx: DashboardContext): string | undefined {
  return repoNames(ctx)[0];
}

/** Per-repo cooldown map. 0 = ready. */
function cooldownsByRepo(ctx: DashboardContext, name: string): Record<string, number> {
  const router = (ctx.daemon as any).specialistRouter;
  if (!router) return {};
  const out: Record<string, number> = {};
  for (const repo of repoNames(ctx)) {
    try {
      out[repo] = router.getCooldownRemaining(name, repo) ?? 0;
    } catch {
      out[repo] = 0;
    }
  }
  return out;
}

/** Minimum cooldown across all watched repos (0 = ready on at least one). */
function minCooldown(cooldowns: Record<string, number>): number {
  const vals = Object.values(cooldowns);
  return vals.length === 0 ? 0 : Math.min(...vals);
}

function normalizeBySeverity(bySeverityRows: unknown): BySeverity {
  const out: BySeverity = { critical: 0, warning: 0, info: 0 };
  if (!Array.isArray(bySeverityRows)) return out;
  for (const row of bySeverityRows) {
    const severity = (row as { severity?: string })?.severity;
    const count = (row as { count?: number })?.count ?? 0;
    if (severity === "critical" || severity === "warning" || severity === "info") {
      out[severity] = count;
    }
  }
  return out;
}

function globalConfig(ctx: DashboardContext) {
  const g = (ctx.daemon.config as any).specialists ?? {};
  return {
    enabled: g.enabled ?? false,
    maxParallel: g.maxParallel ?? 2,
    cooldownSeconds: g.cooldownSeconds ?? 300,
    severityThreshold: g.severityThreshold ?? "info",
  };
}

// ── GET /api/specialists ──

export function getSpecialistsJSON(ctx: DashboardContext) {
  const store = ctx.daemon.specialistStore;
  if (!store) return { specialists: [], globalConfig: globalConfig(ctx) };

  const rows = store.getSpecialistConfigs();
  // Batched: one SQL call for counts + lastAt + lastRepo across all specialists.
  const summaries =
    typeof (store as any).getSpecialistSummaries === "function"
      ? (store as any).getSpecialistSummaries()
      : new Map<string, { total: number; lastAt: number | null; lastRepo: string | null }>();

  const specialists = rows.map((row: any) => {
    const cfg = rowToConfig(row);
    const s = summaries.get(cfg.name) ?? { total: 0, lastAt: null, lastRepo: null };
    const cooldowns = cooldownsByRepo(ctx, cfg.name);
    return {
      name: cfg.name,
      class: cfg.class,
      description: cfg.description,
      enabled: cfg.enabled,
      triggerEvents: cfg.triggerEvents,
      watchPatterns: cfg.watchPatterns,
      isBuiltin: cfg.isBuiltin,
      findingCount: s.total,
      lastRunAt: s.lastAt,
      lastRunRepo: s.lastRepo,
      cooldownRemaining: minCooldown(cooldowns),
      cooldowns,
    };
  });

  return { specialists, globalConfig: globalConfig(ctx) };
}

// ── GET /api/specialists/:name ──

export function getSpecialistDetailJSON(ctx: DashboardContext, name: string) {
  const store = ctx.daemon.specialistStore;
  if (!store) return null;
  const row = store.getSpecialistConfig(name);
  if (!row) return null;
  const cfg = rowToConfig(row);
  const stats = store.getSpecialistStats(name);
  // Repo-agnostic: show findings from every watched repo, not just the first.
  const { findings: recentFindings } = store.getFindings({ specialist: name, limit: 20, offset: 0 });
  const summaries =
    typeof (store as any).getSpecialistSummaries === "function"
      ? (store as any).getSpecialistSummaries()
      : new Map<string, { total: number; lastAt: number | null; lastRepo: string | null }>();
  const summary = summaries.get(name) ?? { total: stats.total, lastAt: null, lastRepo: null };
  const cooldowns = cooldownsByRepo(ctx, name);

  return {
    config: {
      name: cfg.name,
      class: cfg.class,
      description: cfg.description,
      enabled: cfg.enabled,
      triggerEvents: cfg.triggerEvents,
      watchPatterns: cfg.watchPatterns,
      isBuiltin: cfg.isBuiltin,
      findingCount: stats.total,
      lastRunAt: summary.lastAt,
      lastRunRepo: summary.lastRepo,
      cooldownRemaining: minCooldown(cooldowns),
      cooldowns,
    },
    recentFindings,
    stats: {
      totalFindings: stats.total,
      bySeverity: normalizeBySeverity(stats.bySeverity),
      avgConfidence: stats.avgConfidence,
      lastWeekFindings: stats.lastWeek,
    },
  };
}

// ── GET /api/specialists/findings ──

export function getSpecialistFindingsJSON(ctx: DashboardContext, url: URL) {
  const specialist = url.searchParams.get("specialist") || undefined;
  const severity = url.searchParams.get("severity") || undefined;
  const repo = url.searchParams.get("repo") || undefined;
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const limit = 25;
  const offset = (page - 1) * limit;

  const store = ctx.daemon.specialistStore;
  if (!store) return { findings: [], total: 0, page, hasMore: false };

  const { findings, total } = store.getFindings({ specialist, severity, repo, limit, offset });
  return { findings, total, page, hasMore: offset + findings.length < total };
}

// ── GET /api/specialists/findings/:id ──

export function getSpecialistFindingDetailJSON(ctx: DashboardContext, id: string) {
  const store = ctx.daemon.specialistStore;
  if (!store) return null;
  return store.getFindingById(id) ?? null;
}

// ── POST /api/specialists ──

export function handleSpecialistCreate(
  ctx: DashboardContext,
  body: any,
): { success?: true; name?: string; error?: string } {
  if (!body || typeof body !== "object") return { error: "Invalid JSON body" };
  if (!body.name || !body.class || !body.description || !Array.isArray(body.triggerEvents)) {
    return { error: "Missing required fields: name, class, description, triggerEvents" };
  }
  if (body.class !== "deterministic" && body.class !== "analytical") {
    return { error: "class must be 'deterministic' or 'analytical'" };
  }

  // Analytical specialists need systemPrompt/model wiring that the backend
  // can't yet persist — reject rather than store a half-configured row.
  if (body.class === "analytical") {
    return {
      error:
        "Analytical specialists are not yet supported by the backend (Phase 3 gap). " +
        "Only deterministic specialists can be created for now.",
    };
  }

  // Reject fields the backend can't yet persist — silently dropping them
  // would hand callers a false success.
  const dropped = UNSUPPORTED_CONFIG_FIELDS.filter((k) => body[k] !== undefined);
  if (dropped.length > 0) {
    return {
      error: `Unsupported fields (Phase 3 gap): ${dropped.join(", ")}. Remove them and retry.`,
    };
  }

  const store = ctx.daemon.specialistStore;
  if (!store) return { error: "Specialists subsystem is not enabled" };
  if (store.getSpecialistConfig(body.name)) {
    return { error: `Specialist '${body.name}' already exists` };
  }

  store.upsertSpecialistConfig({
    name: body.name,
    class: body.class,
    description: body.description,
    triggerEvents: body.triggerEvents,
    watchPatterns: body.watchPatterns ?? [],
    isBuiltin: false,
  });

  return { success: true, name: body.name };
}

// ── PUT /api/specialists/:name ──

export function handleSpecialistUpdate(ctx: DashboardContext, name: string, body: any): { success: true } | null {
  const store = ctx.daemon.specialistStore;
  if (!store) return null;
  const row = store.getSpecialistConfig(name);
  if (!row) return null;
  const existing = rowToConfig(row);

  store.upsertSpecialistConfig({
    name,
    class: body?.class ?? existing.class,
    description: body?.description ?? existing.description,
    triggerEvents: Array.isArray(body?.triggerEvents) ? body.triggerEvents : existing.triggerEvents,
    watchPatterns: Array.isArray(body?.watchPatterns) ? body.watchPatterns : existing.watchPatterns,
    isBuiltin: existing.isBuiltin,
  });

  return { success: true };
}

// ── DELETE /api/specialists/:name ──

export function handleSpecialistDelete(ctx: DashboardContext, name: string): { success?: true; error?: string } {
  const store = ctx.daemon.specialistStore;
  if (!store) return { error: "Specialists subsystem is not enabled" };
  const row = store.getSpecialistConfig(name);
  if (!row) return { error: "Specialist not found" };
  if (rowToConfig(row).isBuiltin) {
    return { error: "Cannot delete built-in specialist. Use toggle to disable." };
  }
  store.deleteSpecialistConfig(name);
  return { success: true };
}

// ── POST /api/specialists/:name/toggle ──

export function handleSpecialistToggle(ctx: DashboardContext, name: string, body: any): { success: true } | null {
  const store = ctx.daemon.specialistStore;
  if (!store) return null;
  const row = store.getSpecialistConfig(name);
  if (!row) return null;
  const current = rowToConfig(row).enabled;
  const enabled = typeof body?.enabled === "boolean" ? body.enabled : !current;
  store.toggleSpecialist(name, enabled);
  return { success: true };
}

// ── POST /api/specialists/:name/run ──

export type SpecialistRunResponse =
  | { error: string; runId?: undefined; findings?: undefined }
  | {
      runId?: string;
      findings?: unknown[];
      confidence?: number;
      specialist?: string;
      repo?: string;
      error?: undefined;
    };

export async function handleSpecialistRun(
  ctx: DashboardContext,
  name: string,
  body: any,
): Promise<SpecialistRunResponse | null> {
  const store = ctx.daemon.specialistStore;
  if (!store) return null;
  const row = store.getSpecialistConfig(name);
  if (!row) return null;
  if (!rowToConfig(row).enabled) return { error: "Specialist is disabled" };

  const repo = body?.repo || ctx.daemon.repoPaths?.[0];
  if (!repo) return { error: "No repo specified and no watched repos available" };

  const daemon = ctx.daemon as any;
  if (typeof daemon.runSpecialist !== "function") {
    return { error: "Manual specialist runs are not supported by this daemon" };
  }

  return await daemon.runSpecialist(name, repo);
}

// ── POST /api/specialists/findings/:id/dismiss ──

export function handleFindingDismiss(ctx: DashboardContext, id: string, body: any): { success?: true; error?: string } {
  const store = ctx.daemon.specialistStore;
  if (!store) return { error: "Specialists subsystem is not enabled" };
  const finding = store.getFindingById(id);
  if (!finding) return { error: "Finding not found" };
  store.dismissFinding(id, body?.ignorePattern);
  return { success: true };
}

// ── POST /api/specialists/findings/:id/action ──

export async function handleFindingCreateAction(
  ctx: DashboardContext,
  id: string,
  body: any,
): Promise<{ success?: true; actionId?: string; error?: string }> {
  const store = ctx.daemon.specialistStore;
  if (!store) return { error: "Specialists subsystem is not enabled" };
  const finding = store.getFindingById(id);
  if (!finding) return { error: "Finding not found" };

  const executor = ctx.daemon.actionExecutor as any;
  if (!executor?.submit) return { error: "Action executor not available" };

  const command = (body?.command ?? (finding as any).suggestion ?? "").toString();
  if (!command.trim()) return { error: "No command available to execute" };
  const reason = (body?.reason ?? `Fix: ${(finding as any).title}`).toString();

  const repoName = (finding as any).repo as string;
  const repoPath = ctx.daemon.repoPaths?.find((p) => p.endsWith(`/${repoName}`)) ?? ctx.daemon.repoPaths?.[0] ?? "";

  const action = await executor.submit(command, reason, repoName, repoPath, {
    confidence: (finding as any).confidence ?? 0.7,
  });

  return { success: true, actionId: action.id };
}

// ── GET /api/specialists/flaky ──

export function getFlakyTestsJSON(ctx: DashboardContext, url: URL) {
  const repo = url.searchParams.get("repo") || undefined;
  const store = ctx.daemon.specialistStore;
  if (!store) return { flakyTests: [] };
  return { flakyTests: store.getFlakyTests(repo) };
}

// ── POST /api/specialists/flaky/run ──

export async function handleFlakyTestRun(
  ctx: DashboardContext,
  body: any,
): Promise<{ success?: true; runId?: string; error?: string }> {
  if (!body?.repo || typeof body.repo !== "string") {
    return { error: "Missing required field: repo" };
  }
  const daemon = ctx.daemon as any;
  if (typeof daemon.runFlakyCheck !== "function") {
    return { error: "Flaky-test manual runs are not supported by this daemon" };
  }
  return await daemon.runFlakyCheck(body.repo);
}

// ── DELETE /api/specialists/flaky/:testName ──

export function handleFlakyTestReset(
  ctx: DashboardContext,
  testName: string,
  repo?: string,
): { success?: true; error?: string } {
  const targetRepo = repo ?? firstRepoName(ctx);
  if (!targetRepo) {
    return { error: "repo query param is required (no watched repos to fall back to)" };
  }
  const store = ctx.daemon.specialistStore;
  if (!store) return { error: "Specialists subsystem is not enabled" };
  const deleted = store.resetFlakyTest(targetRepo, testName);
  if (!deleted) return { error: "Flaky test not found" };
  return { success: true };
}
