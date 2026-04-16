import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { loadConfig } from "../../core/config.ts";
import { FEATURES } from "../../core/features.ts";
import type { DashboardContext } from "../types.ts";

const configUpdateSchema = z
  .object({
    tickInterval: z.number().int().min(5).max(300),
    sleepAfter: z.number().int().min(60).max(3600),
    sleepTickInterval: z.number().int().min(30).max(600),
    dreamAfter: z.number().int().min(300).max(7200),
    blockingBudget: z.number().int().min(1).max(30),
    maxEventWindow: z.number().int().min(10).max(200),
    tickModel: z.string(),
    escalationModel: z.string(),
  })
  .partial()
  .strict();

export function getConfigJSON(ctx: DashboardContext) {
  const { config } = ctx.daemon;
  return {
    tickInterval: config.tickInterval,
    sleepAfter: config.sleepAfter,
    sleepTickInterval: config.sleepTickInterval,
    dreamAfter: config.dreamAfter,
    blockingBudget: config.blockingBudget,
    maxEventWindow: config.maxEventWindow,
    tickModel: config.tickModel,
    escalationModel: config.escalationModel,
    actionGates: (ctx.daemon as any).actionExecutor?.getGateConfig() ?? null,
    notificationBackends: config.notifyBackends ?? [],
    actionAllowlist: config.actions?.allowedActions ?? [],
  };
}

function getConfigPath(): string {
  const dir = join(homedir(), ".vigil");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "config.json");
}

function readPersistedConfig(): Record<string, any> {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return {};
  }
}

function writePersistedConfig(data: Record<string, any>): void {
  writeFileSync(getConfigPath(), JSON.stringify(data, null, 2));
}

export async function handleConfigUpdate(
  ctx: DashboardContext,
  body: any,
): Promise<{ success?: boolean; error?: string }> {
  const result = configUpdateSchema.safeParse(body);
  if (!result.success) {
    return { error: result.error.issues.map((i) => i.message).join("; ") };
  }

  const existing = readPersistedConfig();
  const merged = { ...existing, ...result.data };
  writePersistedConfig(merged);

  // Reload full config to pick up defaults + merge, then update daemon in-memory
  const reloaded = loadConfig();
  Object.assign(ctx.daemon.config, reloaded);

  return { success: true };
}

export async function getFeatureGatesJSON(ctx: DashboardContext) {
  const gates = (ctx.daemon as any).featureGates;
  if (!gates) return [];

  const results = [];
  for (const [key, _value] of Object.entries(FEATURES)) {
    // Use sync isEnabledCached if available, otherwise await async isEnabled
    const enabled =
      typeof gates.isEnabledCached === "function"
        ? gates.isEnabledCached(key)
        : typeof gates.isEnabled === "function"
          ? await gates.isEnabled(key)
          : false;

    // diagnose is async in real FeatureGates
    let layers = { build: true, config: true, runtime: true, session: true };
    if (typeof gates.diagnose === "function") {
      try {
        layers = await gates.diagnose(key);
      } catch {}
    }

    results.push({ key, name: key, enabled, layers });
  }
  return results;
}

export async function handleFeatureToggle(
  ctx: DashboardContext,
  featureName: string,
  enabled: boolean,
): Promise<{ success?: boolean; enabled?: boolean; error?: string }> {
  const gates = (ctx.daemon as any).featureGates;
  if (!gates) return { error: "Feature gates not available" };

  gates.setConfigLayer(featureName, enabled);

  // Persist to config file
  const existing = readPersistedConfig();
  existing.features = existing.features ?? {};
  existing.features[featureName] = enabled;
  writePersistedConfig(existing);

  return { success: true, enabled };
}
