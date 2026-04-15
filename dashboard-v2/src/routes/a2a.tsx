import { createFileRoute } from "@tanstack/react-router";
import A2APage from "../plugins/a2a/A2APage";

export const Route = createFileRoute("/a2a")({
  component: A2APage,
});
