import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getMemory } from "../server/functions";

const _Route = createFileRoute("/memory")({
  loader: () => getMemory(),
  component: lazyRouteComponent(
    () => import("../plugins/memory/MemoryPage"),
    "default",
  ),
});
(_Route as any)._path = "/memory";
export const Route = _Route;
