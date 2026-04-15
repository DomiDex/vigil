import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { vigilKeys } from "../lib/query-keys";
import { getNotifications } from "../server/functions";

export const Route = createFileRoute("/notifications")({
  loader: async ({ context }) => {
    const qc = (context as any).queryClient;
    await qc.ensureQueryData({ queryKey: vigilKeys.notifications, queryFn: getNotifications }).catch(() => {});
  },
  component: lazyRouteComponent(
    () => import("../plugins/notifications/NotificationsPage"),
    "default",
  ),
});
