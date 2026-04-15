import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getMetrics } from "../server/functions";

const _Route = createFileRoute("/metrics")({
  loader: () => getMetrics(),
  component: lazyRouteComponent(
    () => import("../plugins/metrics/MetricsPage"),
    "default",
  ),
});
(_Route as any)._path = "/metrics";
export const Route = _Route;
