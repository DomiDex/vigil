import type { QueryClient } from "@tanstack/react-query";
import type { ComponentType } from "react";

export type WidgetSlot = "tab" | "sidebar" | "timeline-card" | "overlay" | "top-bar";

export interface WidgetProps {
  activeRepo: string | null;
  queryClient: QueryClient;
}

export interface PluginWidget {
  id: string;
  label: string;
  icon: string;
  slot: WidgetSlot;
  order: number;
  component: () => Promise<{ default: ComponentType<WidgetProps> }>;
  path?: string;
  sseEvents?: string[];
  queryKeys?: readonly string[][];
  featureGate?: string;
}
