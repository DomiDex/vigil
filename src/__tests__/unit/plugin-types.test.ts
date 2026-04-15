import { describe, expect, it } from "bun:test";
import type {
  PluginWidget,
  WidgetProps,
  WidgetSlot,
} from "../../../dashboard-v2/src/types/plugin.ts";

describe("plugin types", () => {
  it("WidgetSlot accepts all valid slot values", () => {
    const slots: WidgetSlot[] = [
      "tab",
      "sidebar",
      "timeline-card",
      "overlay",
      "top-bar",
    ];
    expect(slots).toHaveLength(5);
  });

  it("PluginWidget has required fields", () => {
    const widget: PluginWidget = {
      id: "test-widget",
      label: "Test",
      icon: "Activity",
      slot: "tab",
      order: 1,
      component: () => import("../../../dashboard-v2/src/routes/index.tsx"),
    };
    expect(widget.id).toBe("test-widget");
    expect(widget.slot).toBe("tab");
    expect(typeof widget.component).toBe("function");
  });

  it("PluginWidget accepts optional fields", () => {
    const widget: PluginWidget = {
      id: "optional-test",
      label: "Optional",
      icon: "Bell",
      slot: "sidebar",
      order: 2,
      component: () => import("../../../dashboard-v2/src/routes/index.tsx"),
      sseEvents: ["dream:complete"],
      queryKeys: [["dreams"]],
      featureGate: "premium",
    };
    expect(widget.sseEvents).toEqual(["dream:complete"]);
    expect(widget.featureGate).toBe("premium");
  });

  it("WidgetProps has activeRepo and queryClient fields", () => {
    const props: WidgetProps = {
      activeRepo: "vigil",
      queryClient: {} as any,
    };
    expect(props.activeRepo).toBe("vigil");
    expect(props.queryClient).toBeDefined();
  });
});
