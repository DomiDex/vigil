import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { vigilKeys } from "../lib/query-keys";
import { getA2AStatus, getA2ASkills, getA2AHistory } from "../server/functions";

export const Route = createFileRoute("/a2a")({
  loader: async ({ context }) => {
    const qc = (context as any).queryClient;
    await Promise.all([
      qc.ensureQueryData({ queryKey: vigilKeys.a2a.status, queryFn: getA2AStatus }),
      qc.ensureQueryData({ queryKey: vigilKeys.a2a.skills, queryFn: getA2ASkills }),
      qc.ensureQueryData({ queryKey: vigilKeys.a2a.history, queryFn: getA2AHistory }),
    ]);
  },
  component: lazyRouteComponent(
    () => import("../plugins/a2a/A2APage"),
    "default",
  ),
});
