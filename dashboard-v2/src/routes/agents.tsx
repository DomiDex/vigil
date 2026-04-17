import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { z } from "zod";
import { vigilKeys } from "../lib/query-keys";
import { getAgents, getCurrentAgent } from "../server/functions";

export const agentsSearchSchema = z.object({
  tab: z
    .enum(["persona", "specialists", "findings", "flaky"])
    .default("persona"),
  id: z.string().optional(),
});

export type AgentsSearch = z.infer<typeof agentsSearchSchema>;

export const Route = createFileRoute("/agents")({
  validateSearch: agentsSearchSchema,
  loader: async ({ context }) => {
    const qc = (context as any).queryClient;
    await Promise.allSettled([
      qc.ensureQueryData({ queryKey: vigilKeys.agents.all, queryFn: getAgents }),
      qc.ensureQueryData({
        queryKey: vigilKeys.agents.current,
        queryFn: getCurrentAgent,
      }),
    ]);
  },
  component: lazyRouteComponent(
    () => import("../plugins/agents/AgentsPage"),
    "default",
  ),
});
