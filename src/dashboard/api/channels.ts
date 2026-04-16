import { z } from "zod";
import type { DashboardContext } from "../types.ts";

const channelRegisterSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional().default({}),
});

function getManager(ctx: DashboardContext) {
  try {
    const m = (ctx.daemon as any).channelManager;
    return m && typeof m.getChannels === "function" ? m : null;
  } catch {
    return null;
  }
}

export function getChannelsJSON(ctx: DashboardContext) {
  return getManager(ctx)?.getChannels() ?? [];
}

export async function handleChannelRegister(
  ctx: DashboardContext,
  body: any,
): Promise<{ id?: string; error?: string }> {
  const result = channelRegisterSchema.safeParse(body);
  if (!result.success) {
    return { error: result.error.issues.map((i) => i.message).join("; ") };
  }

  const manager = getManager(ctx);
  if (!manager) return { error: "Channel manager not available" };

  const id = manager.register(result.data);
  return { id };
}

export async function handleChannelDelete(
  ctx: DashboardContext,
  id: string,
): Promise<{ success?: boolean; error?: string }> {
  const manager = getManager(ctx);
  if (!manager) return { error: "Channel manager not available" };

  const removed = manager.unregister(id);
  if (!removed) return { error: `Channel ${id} not found` };

  return { success: true };
}

export function getChannelPermissionsJSON(ctx: DashboardContext, channelId: string) {
  return (
    getManager(ctx)?.getPermissions(channelId) ?? {
      read: false,
      write: false,
      execute: false,
      admin: false,
      subscribe: false,
    }
  );
}

export function getChannelQueueJSON(ctx: DashboardContext, channelId: string) {
  return getManager(ctx)?.getQueue(channelId) ?? [];
}

export function handleChannelTest(
  ctx: DashboardContext,
  channelId: string,
): { success?: boolean; message?: string; channelId?: string; error?: string } | null {
  const manager = getManager(ctx);
  if (!manager) return { error: "Channel manager not available" };

  const result = manager.testChannel?.(channelId);
  if (!result) return null;

  return result;
}

const permissionsUpdateSchema = z.object({
  read: z.boolean(),
  write: z.boolean(),
  execute: z.boolean(),
  admin: z.boolean(),
  subscribe: z.boolean(),
}).strict();

export function handleChannelPermissionsUpdate(
  ctx: DashboardContext,
  channelId: string,
  body: unknown,
): { channelId?: string; error?: string; read?: boolean; write?: boolean; execute?: boolean; admin?: boolean; subscribe?: boolean } | null {
  const parsed = permissionsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  const manager = getManager(ctx);
  if (!manager) return { error: "Channel manager not available" };

  const result = manager.updatePermissions?.(channelId, parsed.data);
  if (!result) return null;

  return result;
}
