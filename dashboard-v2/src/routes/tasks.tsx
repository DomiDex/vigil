import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getTasks } from "../server/functions";

export const Route = createFileRoute("/tasks")({
  loader: () => getTasks({ data: {} }),
  component: lazyRouteComponent(
    () => import("../plugins/tasks/TasksPage"),
    "default",
  ),
});
