import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/dreams")({
  component: lazyRouteComponent(
    () => import("../plugins/dreams/DreamsPage"),
    "default",
  ),
});
