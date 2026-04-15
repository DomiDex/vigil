import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { vigilKeys } from "../lib/query-keys";
import { getHealth } from "../server/functions";

export const Route = createFileRoute("/health")({
  loader: async ({ context }) => {
    const qc = (context as any).queryClient;
    await qc.ensureQueryData({ queryKey: vigilKeys.health, queryFn: getHealth });
  },
  component: lazyRouteComponent(
    () => import("../plugins/health/HealthPage"),
    "default",
  ),
});
