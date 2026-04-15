import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getTasks } from "../server/functions";

const _Route = createFileRoute("/tasks")({
  loader: () => getTasks({ data: {} }),
  component: lazyRouteComponent(
    () => import("../plugins/tasks/TasksPage"),
    "default",
  ),
});
(_Route as any)._path = "/tasks";
export const Route = _Route;
