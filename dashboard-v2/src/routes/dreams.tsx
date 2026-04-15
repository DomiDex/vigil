import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getDreams } from "../server/functions";

const _Route = createFileRoute("/dreams")({
  loader: () => getDreams(),
  component: lazyRouteComponent(
    () => import("../plugins/dreams/DreamsPage"),
    "default",
  ),
});
(_Route as any)._path = "/dreams";
export const Route = _Route;
