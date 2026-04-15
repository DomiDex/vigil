import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/actions")({
  component: lazyRouteComponent(
    () => import("../plugins/actions/ActionsPage"),
    "default",
  ),
});
