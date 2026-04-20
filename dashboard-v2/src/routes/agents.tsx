import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { z } from "zod";
import { vigilKeys } from "../lib/query-keys";
import { getAgents, getCurrentAgent } from "../server/functions";

export const AGENT_TABS = [
  "persona",
  "specialists",
  "findings",
  "flaky",
] as const;
export type AgentTab = (typeof AGENT_TABS)[number];

export const agentsSearchSchema = z.object({
  tab: z.enum(AGENT_TABS).default("persona"),
  id: z.string().optional(),
});

// Input shape before parse — tab may be absent in the URL. This matches
// what TanStack Router's ParamsReducerFn hands the updater as `prev`.
export type AgentsSearchInput = {
  tab?: AgentTab;
  id?: string;
};
// Output shape after parse — default applied, tab guaranteed present.
export type AgentsSearch = {
  tab: AgentTab;
  id?: string;
};

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
