import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getActions } from "../server/functions";

export const Route = createFileRoute("/actions")({
  loader: () => getActions({ data: {} }),
  component: lazyRouteComponent(
    () => import("../plugins/actions/ActionsPage"),
    "default",
  ),
});
