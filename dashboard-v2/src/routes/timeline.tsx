import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/timeline")({
  component: lazyRouteComponent(
    () => import("../plugins/timeline/TimelinePage"),
    "default",
  ),
});
