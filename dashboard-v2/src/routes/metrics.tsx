import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/metrics")({
  component: lazyRouteComponent(
    () => import("../plugins/metrics/MetricsPage"),
    "default",
  ),
});
