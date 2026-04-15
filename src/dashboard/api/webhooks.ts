import { z } from "zod";
import type { DashboardContext } from "../types.ts";

const subscriptionCreateSchema = z.object({
  repo: z.string().min(1),
  eventTypes: z.array(z.string()).min(1),
  expiry: z.number().optional(),
});

export function getWebhookEventsJSON(ctx: DashboardContext) {
  const processor = (ctx.daemon as any).webhookProcessor;
  return processor?.getEvents() ?? [];
}

export function getWebhookSubscriptionsJSON(ctx: DashboardContext) {
  const processor = (ctx.daemon as any).webhookProcessor;
  return processor?.getSubscriptions() ?? [];
}

export async function handleSubscriptionCreate(
  ctx: DashboardContext,
  body: any,
): Promise<{ id?: string; error?: string }> {
  const result = subscriptionCreateSchema.safeParse(body);
  if (!result.success) {
    return { error: result.error.issues.map((i) => i.message).join("; ") };
  }

  const processor = (ctx.daemon as any).webhookProcessor;
  if (!processor) return { error: "Webhook processor not available" };

  const id = processor.addSubscription(result.data);
  return { id };
}

export async function handleSubscriptionDelete(
  ctx: DashboardContext,
  id: string,
): Promise<{ success?: boolean; error?: string }> {
  const processor = (ctx.daemon as any).webhookProcessor;
  if (!processor) return { error: "Webhook processor not available" };

  const removed = processor.removeSubscription(id);
  if (!removed) return { error: `Subscription ${id} not found` };

  return { success: true };
}

export function getWebhookStatusJSON(ctx: DashboardContext) {
  const processor = (ctx.daemon as any).webhookProcessor;
  return processor?.getStatus() ?? { running: false, port: 0, eventsReceived: 0, errors: 0 };
}
