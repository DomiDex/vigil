import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/memory")({
  component: lazyRouteComponent(
    () => import("../plugins/memory/MemoryPage"),
    "default",
  ),
});
