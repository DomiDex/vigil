import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getMetrics } from "../server/functions";

export const Route = createFileRoute("/metrics")({
  loader: () => getMetrics(),
  component: lazyRouteComponent(
    () => import("../plugins/metrics/MetricsPage"),
    "default",
  ),
});
