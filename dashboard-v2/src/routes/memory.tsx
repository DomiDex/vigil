import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getMemory } from "../server/functions";

export const Route = createFileRoute("/memory")({
  loader: () => getMemory(),
  component: lazyRouteComponent(
    () => import("../plugins/memory/MemoryPage"),
    "default",
  ),
});
