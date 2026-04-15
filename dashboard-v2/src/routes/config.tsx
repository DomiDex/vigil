import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { vigilKeys } from "../lib/query-keys";
import { getConfig, getFeatureGates } from "../server/functions";

export const Route = createFileRoute("/config")({
  loader: async ({ context }) => {
    const qc = (context as any).queryClient;
    await Promise.all([
      qc.ensureQueryData({ queryKey: vigilKeys.config.all, queryFn: getConfig }),
      qc.ensureQueryData({ queryKey: vigilKeys.config.features, queryFn: getFeatureGates }),
    ]);
  },
  component: lazyRouteComponent(
    () => import("../plugins/config/ConfigPage"),
    "default",
  ),
});
