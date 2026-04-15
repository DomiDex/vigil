import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getDreams } from "../server/functions";

export const Route = createFileRoute("/dreams")({
  loader: () => getDreams(),
  component: lazyRouteComponent(
    () => import("../plugins/dreams/DreamsPage"),
    "default",
  ),
});
