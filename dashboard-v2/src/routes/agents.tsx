import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { vigilKeys } from "../lib/query-keys";
import { getAgents, getCurrentAgent } from "../server/functions";

export const Route = createFileRoute("/agents")({
  loader: async ({ context }) => {
    const qc = (context as any).queryClient;
    await Promise.all([
      qc.ensureQueryData({ queryKey: vigilKeys.agents.all, queryFn: getAgents }),
      qc.ensureQueryData({ queryKey: vigilKeys.agents.current, queryFn: getCurrentAgent }),
    ]);
  },
  component: lazyRouteComponent(
    () => import("../plugins/agents/AgentsPage"),
    "default",
  ),
});
