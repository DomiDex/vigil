import { createFileRoute } from "@tanstack/react-router";
import AgentsPage from "../plugins/agents/AgentsPage";

export const Route = createFileRoute("/agents")({
  component: AgentsPage,
});
