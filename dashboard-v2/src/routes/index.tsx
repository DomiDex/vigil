import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getTimeline } from "../server/functions";

export const Route = createFileRoute("/")({
  loader: () => getTimeline({ data: {} }),
  component: lazyRouteComponent(
    () => import("../plugins/timeline/TimelinePage"),
    "default"
  ),
});
