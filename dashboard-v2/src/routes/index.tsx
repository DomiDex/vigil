import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getTimeline } from "../server/functions";

export const Route = createFileRoute("/")({
  loader: () => getTimeline({ data: {} }),
  component: lazyRouteComponent(
    () =>
      import("../plugins/timeline/TimelinePage").then((m) => ({
        default: (props: Record<string, unknown>) => m.default({ activeRepo: null, queryClient: null as any, ...props }),
      })),
    "default"
  ),
});
