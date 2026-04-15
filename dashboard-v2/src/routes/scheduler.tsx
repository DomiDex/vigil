import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getScheduler } from "../server/functions";

export const Route = createFileRoute("/scheduler")({
  loader: () => getScheduler(),
  component: lazyRouteComponent(
    () => import("../plugins/scheduler/SchedulerPage"),
    "default",
  ),
});
