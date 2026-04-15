import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/health")({
  component: () => <div>Health -- Coming in Phase 4</div>,
});
