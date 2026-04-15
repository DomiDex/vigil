import { z } from "zod";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DashboardContext } from "../types.ts";

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const notificationRulesSchema = z
  .object({
    enabled: z.boolean(),
    minSeverity: z.enum(["info", "warning", "critical"]),
    statuses: z.array(z.string()),
    maxPerHour: z.number().int().min(0),
    quietHours: z
      .object({
        start: z.string().regex(timeRegex, "Invalid time format (HH:MM)"),
        end: z.string().regex(timeRegex, "Invalid time format (HH:MM)"),
      })
      .optional(),
  })
  .partial()
  .strict();

export function getNotificationsJSON(ctx: DashboardContext) {
  const notifier = (ctx.daemon as any).pushNotifier;
  return notifier?.getHistory() ?? [];
}

export async function handleTestNotification(
  ctx: DashboardContext,
): Promise<{ success?: boolean; backend?: string; message?: string; error?: string }> {
  const notifier = (ctx.daemon as any).pushNotifier;
  if (!notifier) return { error: "Push notifier not available" };

  return notifier.sendTest();
}

export async function handleNotificationRulesUpdate(
  ctx: DashboardContext,
  body: any,
): Promise<{ success?: boolean; error?: string }> {
  const result = notificationRulesSchema.safeParse(body);
  if (!result.success) {
    return { error: result.error.issues.map((i) => i.message).join("; ") };
  }

  const notifier = (ctx.daemon as any).pushNotifier;
  if (!notifier) return { error: "Push notifier not available" };

  notifier.updateRules(result.data);

  // Persist rules to config
  const configDir = join(homedir(), ".vigil");
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
  const configPath = join(configDir, "config.json");
  let existing: Record<string, any> = {};
  try {
    existing = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {}
  existing.push = { ...existing.push, ...result.data };
  writeFileSync(configPath, JSON.stringify(existing, null, 2));

  return { success: true };
}
