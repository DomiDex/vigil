import { createFileRoute } from "@tanstack/react-router";
import ConfigPage from "../plugins/config/ConfigPage";

export const Route = createFileRoute("/config")({
  component: ConfigPage,
});
