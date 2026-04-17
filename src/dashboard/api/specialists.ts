import type { DashboardContext } from "../types.ts";

// ── Helpers ──

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

function firstRepoName(ctx: DashboardContext): string | undefined {
  const path = ctx.daemon.repoPaths?.[0];
  if (!path) return undefined;
  return path.split("/").filter(Boolean).pop();
}

function getCooldown(ctx: DashboardContext, name: string): number {
  const router = (ctx.daemon as any).specialistRouter;
  if (!router) return 0;
  const repo = firstRepoName(ctx) ?? "";
  try {
    return router.getCooldownRemaining(name, repo) ?? 0;
  } catch {
    return 0;
  }
}

function lastRunMeta(ctx: DashboardContext, name: string): { at: number | null; repo: string | null } {
  const store = ctx.daemon.specialistStore;
  if (!store) return { at: null, repo: null };
  try {
    const { findings } = store.getFindings({ specialist: name, limit: 1, offset: 0 });
    if (findings.length === 0) return { at: null, repo: null };
    const latest = findings[0] as any;
    return {
      at: latest.created_at ?? null,
      repo: latest.repo ?? null,
    };
  } catch {
    return { at: null, repo: null };
  }
}

// ── GET /api/specialists ──

export function getSpecialistsJSON(ctx: DashboardContext) {
  const store = ctx.daemon.specialistStore;
  const globalConfig = (ctx.daemon.config as any).specialists ?? {};
  if (!store) {
    return {
      specialists: [],
      globalConfig: {
        enabled: globalConfig.enabled ?? false,
        maxParallel: globalConfig.maxParallel ?? 2,
        cooldownSeconds: globalConfig.cooldownSeconds ?? 300,
        severityThreshold: globalConfig.severityThreshold ?? "info",
      },
    };
  }

  const rows = store.getSpecialistConfigs();
  const specialists = rows.map((row: any) => {
    const cfg = rowToConfig(row);
    const stats = store.getSpecialistStats(cfg.name);
    const last = lastRunMeta(ctx, cfg.name);
    return {
      name: cfg.name,
      class: cfg.class,
      description: cfg.description,
      enabled: cfg.enabled,
      triggerEvents: cfg.triggerEvents,
      watchPatterns: cfg.watchPatterns,
      isBuiltin: cfg.isBuiltin,
      findingCount: stats.total,
      lastRunAt: last.at,
      lastRunRepo: last.repo,
      cooldownRemaining: getCooldown(ctx, cfg.name),
    };
  });

  return {
    specialists,
    globalConfig: {
      enabled: globalConfig.enabled ?? false,
      maxParallel: globalConfig.maxParallel ?? 2,
      cooldownSeconds: globalConfig.cooldownSeconds ?? 300,
      severityThreshold: globalConfig.severityThreshold ?? "info",
    },
  };
}

// ── GET /api/specialists/:name ──

export function getSpecialistDetailJSON(ctx: DashboardContext, name: string) {
  const store = ctx.daemon.specialistStore;
  if (!store) return null;
  const row = store.getSpecialistConfig(name);
  if (!row) return null;
  const cfg = rowToConfig(row);
  const stats = store.getSpecialistStats(name);
  const repoName = firstRepoName(ctx) ?? "";
  const recentFindings = repoName ? store.getRecentFindings(repoName, name, 20) : [];
  const last = lastRunMeta(ctx, name);

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
      lastRunAt: last.at,
      lastRunRepo: last.repo,
      cooldownRemaining: getCooldown(ctx, name),
    },
    recentFindings,
    stats: {
      totalFindings: stats.total,
      bySeverity: stats.bySeverity,
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
  if (!store) {
    return { findings: [], total: 0, page, hasMore: false };
  }

  const { findings, total } = store.getFindings({ specialist, severity, repo, limit, offset });
  return {
    findings,
    total,
    page,
    hasMore: offset + findings.length < total,
  };
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
  if (body.class === "analytical" && !body.systemPrompt) {
    return { error: "Analytical specialists require a systemPrompt" };
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

export async function handleSpecialistRun(ctx: DashboardContext, name: string, body: any): Promise<any | null> {
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

export function handleFlakyTestReset(ctx: DashboardContext, testName: string, repo?: string): { success: true } {
  const store = ctx.daemon.specialistStore;
  if (store) {
    const targetRepo = repo ?? firstRepoName(ctx) ?? "";
    store.resetFlakyTest(targetRepo, testName);
  }
  return { success: true };
}
