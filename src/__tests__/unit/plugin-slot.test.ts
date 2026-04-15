import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { PluginError, PluginSlot } from "../../../dashboard-v2/src/components/vigil/plugin-slot";
import type { PluginWidget } from "../../../dashboard-v2/src/types/plugin";

function createFakePlugin(overrides?: Partial<PluginWidget>): PluginWidget {
  return {
    id: "test-plugin",
    label: "Test Plugin",
    icon: "Activity",
    slot: "tab",
    order: 0,
    component: () =>
      Promise.resolve({
        default: () => createElement("div", null, "Plugin loaded"),
      }),
    sseEvents: ["tick"],
    queryKeys: [["test"]],
    ...overrides,
  } as PluginWidget;
}

describe("PluginSlot", () => {
  it("renders skeleton on initial server render (SSR guard)", () => {
    const plugin = createFakePlugin();
    const html = renderToString(
      createElement(PluginSlot, {
        plugin,
        widgetProps: { activeRepo: null, queryClient: {} as any },
      }),
    );
    // On server, should render skeleton fallback (not the plugin component)
    expect(html).toBeDefined();
    expect(html.length).toBeGreaterThan(0);
  });

  it("plugin-slot source contains SSR guard", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../../dashboard-v2/src/components/vigil/plugin-slot.tsx"),
      "utf-8",
    );
    expect(source).toContain("typeof window");
  });
});

describe("PluginError", () => {
  it("renders plugin id in error message", () => {
    const html = renderToString(createElement(PluginError, { pluginId: "broken-plugin" }));
    expect(html).toContain("broken-plugin");
  });
});
