import type { WidgetProps } from "../../dashboard-v2/src/types/plugin";
import type { ComponentType } from "react";

export default {
  id: "plugin-template",
  label: "My Plugin",
  icon: "Puzzle",
  slot: "tab" as const,
  order: 100,
  component: (): Promise<{ default: ComponentType<WidgetProps> }> =>
    import("./PluginPage"),
  sseEvents: ["tick"],
  apiRoutes: [
    {
      method: "GET" as const,
      path: "/hello",
      handler: () => Response.json({ message: "Hello from plugin!" }),
    },
  ],
};
