import type { PluginWidget } from "../types/plugin";

// Route modules export Route (TanStack Router convention), not default components.
// The component field is a placeholder for future plugin lazy-loading — routing is
// handled by TanStack Router, not the plugin system. Cast to satisfy the type.
const lazy = (loader: () => Promise<any>) => loader as PluginWidget["component"];

export const corePlugins: PluginWidget[] = [
  {
    id: "timeline",
    label: "Timeline",
    icon: "Clock",
    slot: "tab",
    order: 1,
    component: lazy(() => import("../routes/index")),
  },
  {
    id: "repos",
    label: "Repos",
    icon: "GitBranch",
    slot: "tab",
    order: 2,
    component: lazy(() => import("../routes/repos")),
  },
  {
    id: "dreams",
    label: "Dreams",
    icon: "Sparkles",
    slot: "tab",
    order: 3,
    component: lazy(() => import("../routes/dreams")),
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: "CheckSquare",
    slot: "tab",
    order: 4,
    component: lazy(() => import("../routes/tasks")),
  },
  {
    id: "actions",
    label: "Actions",
    icon: "Zap",
    slot: "tab",
    order: 5,
    component: lazy(() => import("../routes/actions")),
  },
  {
    id: "memory",
    label: "Memory",
    icon: "Brain",
    slot: "tab",
    order: 6,
    component: lazy(() => import("../routes/memory")),
  },
  {
    id: "metrics",
    label: "Metrics",
    icon: "BarChart3",
    slot: "tab",
    order: 7,
    component: lazy(() => import("../routes/metrics")),
  },
  {
    id: "scheduler",
    label: "Scheduler",
    icon: "Calendar",
    slot: "tab",
    order: 8,
    component: lazy(() => import("../routes/scheduler")),
  },
  {
    id: "config",
    label: "Config",
    icon: "Settings",
    slot: "tab",
    order: 9,
    component: lazy(() => import("../routes/config")),
  },
];
