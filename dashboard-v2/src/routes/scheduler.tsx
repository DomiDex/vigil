import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/scheduler")({
  component: lazyRouteComponent(
    () => import("../plugins/scheduler/SchedulerPage"),
    "default",
  ),
});
