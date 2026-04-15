import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getRepos } from "../server/functions";

const _Route = createFileRoute("/repos")({
  loader: () => getRepos(),
  component: lazyRouteComponent(
    () => import("../plugins/repos/ReposPage"),
    "default",
  ),
});
(_Route as any)._path = "/repos";
export const Route = _Route;
