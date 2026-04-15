import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { vigilKeys } from "../lib/query-keys";
import { getWebhookStatus, getWebhookSubscriptions, getWebhookEvents } from "../server/functions";

export const Route = createFileRoute("/webhooks")({
  loader: async ({ context }) => {
    const qc = (context as any).queryClient;
    await Promise.all([
      qc.ensureQueryData({ queryKey: vigilKeys.webhooks.status, queryFn: getWebhookStatus }),
      qc.ensureQueryData({ queryKey: vigilKeys.webhooks.subscriptions, queryFn: getWebhookSubscriptions }),
      qc.ensureQueryData({ queryKey: vigilKeys.webhooks.events, queryFn: getWebhookEvents }),
    ]);
  },
  component: lazyRouteComponent(
    () => import("../plugins/webhooks/WebhooksPage"),
    "default",
  ),
});
