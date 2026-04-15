import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getRepos } from "../server/functions";

export const Route = createFileRoute("/repos")({
  loader: () => getRepos(),
  component: lazyRouteComponent(
    () => import("../plugins/repos/ReposPage"),
    "default",
  ),
});
