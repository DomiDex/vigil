import { z } from "zod";
import type { DashboardContext } from "../types.ts";

const subscriptionCreateSchema = z.object({
  repo: z.string().min(1),
  eventTypes: z.array(z.string()).min(1),
  expiry: z.number().optional(),
});

function getProcessor(ctx: DashboardContext) {
  try {
    const p = (ctx.daemon as any).webhookProcessor;
    return p && typeof p.getEvents === "function" ? p : null;
  } catch {
    return null;
  }
}

export function getWebhookEventsJSON(ctx: DashboardContext) {
  return getProcessor(ctx)?.getEvents() ?? [];
}

export function getWebhookSubscriptionsJSON(ctx: DashboardContext) {
  return getProcessor(ctx)?.getSubscriptions() ?? [];
}

export async function handleSubscriptionCreate(
  ctx: DashboardContext,
  body: any,
): Promise<{ id?: string; error?: string }> {
  const result = subscriptionCreateSchema.safeParse(body);
  if (!result.success) {
    return { error: result.error.issues.map((i) => i.message).join("; ") };
  }

  const processor = getProcessor(ctx);
  if (!processor) return { error: "Webhook processor not available" };

  const id = processor.addSubscription(result.data);
  return { id };
}

export async function handleSubscriptionDelete(
  ctx: DashboardContext,
  id: string,
): Promise<{ success?: boolean; error?: string }> {
  const processor = getProcessor(ctx);
  if (!processor) return { error: "Webhook processor not available" };

  const removed = processor.removeSubscription(id);
  if (!removed) return { error: `Subscription ${id} not found` };

  return { success: true };
}

export function getWebhookStatusJSON(ctx: DashboardContext) {
  return getProcessor(ctx)?.getStatus() ?? { running: false, port: 0, eventsReceived: 0, errors: 0 };
}

export function getWebhookEventDetailJSON(ctx: DashboardContext, eventId: string) {
  const processor = getProcessor(ctx);
  if (!processor) return null;

  const detail = processor.getEventDetail?.(eventId);
  return detail ?? null;
}
