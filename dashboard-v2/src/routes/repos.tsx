import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/repos")({
  component: lazyRouteComponent(
    () => import("../plugins/repos/ReposPage"),
    "default",
  ),
});
