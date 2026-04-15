import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getActions } from "../server/functions";

const _Route = createFileRoute("/actions")({
  loader: () => getActions({ data: {} }),
  component: lazyRouteComponent(
    () => import("../plugins/actions/ActionsPage"),
    "default",
  ),
});
(_Route as any)._path = "/actions";
export const Route = _Route;
