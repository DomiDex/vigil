import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getScheduler } from "../server/functions";

const _Route = createFileRoute("/scheduler")({
  loader: () => getScheduler(),
  component: lazyRouteComponent(
    () => import("../plugins/scheduler/SchedulerPage"),
    "default",
  ),
});
(_Route as any)._path = "/scheduler";
export const Route = _Route;
