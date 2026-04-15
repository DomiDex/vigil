import { createFileRoute } from "@tanstack/react-router";
import WebhooksPage from "../plugins/webhooks/WebhooksPage";

export const Route = createFileRoute("/webhooks")({
  component: WebhooksPage,
});
