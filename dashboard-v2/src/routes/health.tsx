import { createFileRoute } from "@tanstack/react-router";
import HealthPage from "../plugins/health/HealthPage";

export const Route = createFileRoute("/health")({
  component: HealthPage,
});
