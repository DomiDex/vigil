import { createFileRoute } from "@tanstack/react-router";
import NotificationsPage from "../plugins/notifications/NotificationsPage";

export const Route = createFileRoute("/notifications")({
  component: NotificationsPage,
});
