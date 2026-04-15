import { createFileRoute } from "@tanstack/react-router";
import ChannelsPage from "../plugins/channels/ChannelsPage";

export const Route = createFileRoute("/channels")({
  component: ChannelsPage,
});
