import { z } from "zod";
import type { DashboardContext } from "../types.ts";

const channelRegisterSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional().default({}),
});

export function getChannelsJSON(ctx: DashboardContext) {
  const manager = (ctx.daemon as any).channelManager;
  return manager?.getChannels() ?? [];
}

export async function handleChannelRegister(
  ctx: DashboardContext,
  body: any,
): Promise<{ id?: string; error?: string }> {
  const result = channelRegisterSchema.safeParse(body);
  if (!result.success) {
    return { error: result.error.issues.map((i) => i.message).join("; ") };
  }

  const manager = (ctx.daemon as any).channelManager;
  if (!manager) return { error: "Channel manager not available" };

  const id = manager.register(result.data);
  return { id };
}

export async function handleChannelDelete(
  ctx: DashboardContext,
  id: string,
): Promise<{ success?: boolean; error?: string }> {
  const manager = (ctx.daemon as any).channelManager;
  if (!manager) return { error: "Channel manager not available" };

  const removed = manager.unregister(id);
  if (!removed) return { error: `Channel ${id} not found` };

  return { success: true };
}

export function getChannelPermissionsJSON(ctx: DashboardContext, channelId: string) {
  const manager = (ctx.daemon as any).channelManager;
  return manager?.getPermissions(channelId) ?? { read: false, write: false, execute: false, admin: false, subscribe: false };
}

export function getChannelQueueJSON(ctx: DashboardContext, channelId: string) {
  const manager = (ctx.daemon as any).channelManager;
  return manager?.getQueue(channelId) ?? [];
}
