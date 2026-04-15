import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { vigilKeys } from "../lib/query-keys";
import { getChannels } from "../server/functions";

export const Route = createFileRoute("/channels")({
  loader: async ({ context }) => {
    const qc = (context as any).queryClient;
    await qc.ensureQueryData({ queryKey: vigilKeys.channels.all, queryFn: getChannels }).catch(() => {});
  },
  component: lazyRouteComponent(
    () => import("../plugins/channels/ChannelsPage"),
    "default",
  ),
});
