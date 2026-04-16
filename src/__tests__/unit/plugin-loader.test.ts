import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import * as os from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock corePlugins before importing plugin-loader
mock.module("../../../dashboard-v2/src/plugins/index", () => ({
  corePlugins: [
    { id: "overview", label: "Overview", slot: "tab", order: 0 },
    { id: "timeline", label: "Timeline", slot: "tab", order: 10 },
  ],
}));

import { getPluginApiRoutes, loadUserPlugins, PluginManifestSchema } from "../../dashboard/plugin-loader";

import { createTempPluginEnv, type TempPluginEnv, validWidgetSource } from "../helpers/temp-plugins";

describe("PluginManifestSchema", () => {
  const validManifest = {
    id: "my-plugin",
    label: "My Plugin",
    icon: "Puzzle",
    slot: "tab",
    order: 100,
    component: () => Promise.resolve({ default: () => null }),
  };

  it("accepts a valid manifest with required fields only", () => {
    const result = PluginManifestSchema.parse(validManifest);
    expect(result.id).toBe("my-plugin");
    expect(result.order).toBe(100);
  });

  it("accepts a valid manifest with optional apiRoutes", () => {
    const manifest = {
      ...validManifest,
      apiRoutes: [
        {
          method: "GET",
          path: "/data",
          handler: () => Response.json({ ok: true }),
        },
      ],
      sseEvents: ["tick"],
      queryKeys: [["plugin", "data"]],
    };
    const result = PluginManifestSchema.parse(manifest);
    expect(result.apiRoutes).toHaveLength(1);
  });

  it("rejects id with uppercase letters", () => {
    expect(() => PluginManifestSchema.parse({ ...validManifest, id: "MyPlugin" })).toThrow();
  });

  it("rejects id with spaces", () => {
    expect(() => PluginManifestSchema.parse({ ...validManifest, id: "my plugin" })).toThrow();
  });

  it("rejects id with special characters", () => {
    expect(() => PluginManifestSchema.parse({ ...validManifest, id: "my_plugin!" })).toThrow();
  });

  it("accepts id with hyphens and numbers", () => {
    const result = PluginManifestSchema.parse({
      ...validManifest,
      id: "my-plugin-2",
    });
    expect(result.id).toBe("my-plugin-2");
  });

  it("rejects order below 100", () => {
    expect(() => PluginManifestSchema.parse({ ...validManifest, order: 99 })).toThrow();
  });

  it("rejects order of 0", () => {
    expect(() => PluginManifestSchema.parse({ ...validManifest, order: 0 })).toThrow();
  });

  it("accepts order of exactly 100", () => {
    const result = PluginManifestSchema.parse({
      ...validManifest,
      order: 100,
    });
    expect(result.order).toBe(100);
  });

  it("accepts order above 100", () => {
    const result = PluginManifestSchema.parse({
      ...validManifest,
      order: 500,
    });
    expect(result.order).toBe(500);
  });

  it("rejects missing required field: id", () => {
    const { id, ...rest } = validManifest;
    expect(() => PluginManifestSchema.parse(rest)).toThrow();
  });

  it("rejects missing required field: label", () => {
    const { label, ...rest } = validManifest;
    expect(() => PluginManifestSchema.parse(rest)).toThrow();
  });

  it("rejects missing required field: component", () => {
    const { component, ...rest } = validManifest;
    expect(() => PluginManifestSchema.parse(rest)).toThrow();
  });

  it("rejects invalid slot value", () => {
    expect(() => PluginManifestSchema.parse({ ...validManifest, slot: "footer" })).toThrow();
  });

  it("accepts all valid slot values", () => {
    for (const slot of ["tab", "sidebar", "timeline-card", "overlay", "top-bar"]) {
      const result = PluginManifestSchema.parse({ ...validManifest, slot });
      expect(result.slot).toBe(slot);
    }
  });

  it("rejects non-function component", () => {
    expect(() => PluginManifestSchema.parse({ ...validManifest, component: "not-a-fn" })).toThrow();
  });

  it("rejects invalid apiRoute method", () => {
    expect(() =>
      PluginManifestSchema.parse({
        ...validManifest,
        apiRoutes: [{ method: "PATCH", path: "/data", handler: () => new Response() }],
      }),
    ).toThrow();
  });

  it("rejects apiRoute with missing handler", () => {
    expect(() =>
      PluginManifestSchema.parse({
        ...validManifest,
        apiRoutes: [{ method: "GET", path: "/data" }],
      }),
    ).toThrow();
  });

  it("accepts all valid HTTP methods in apiRoutes", () => {
    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      const result = PluginManifestSchema.parse({
        ...validManifest,
        apiRoutes: [{ method, path: "/test", handler: () => new Response() }],
      });
      expect(result.apiRoutes![0].method).toBe(method);
    }
  });
});

describe("loadUserPlugins", () => {
  let env: TempPluginEnv;
  let warnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    env = createTempPluginEnv();
    warnSpy = spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    env.cleanup();
  });

  it("returns empty array when plugins directory does not exist", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "vigil-no-plugins-"));
    spyOn(os, "homedir").mockReturnValue(emptyDir);

    const plugins = await loadUserPlugins();
    expect(plugins).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();

    rmSync(emptyDir, { recursive: true, force: true });
  });

  it("loads a valid plugin from widget.ts", async () => {
    env.addPlugin(
      "hello-world",
      validWidgetSource({
        id: '"hello-world"',
        label: '"Hello World"',
        order: "150",
      }),
    );

    const plugins = await loadUserPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].id).toBe("hello-world");
    expect(plugins[0].label).toBe("Hello World");
    expect(plugins[0].order).toBe(150);
    expect(plugins[0].slot).toBe("tab");
  });

  it("skips invalid manifest with warning and loads remaining plugins", async () => {
    env.addPlugin(
      "bad-plugin",
      validWidgetSource({
        id: '"bad-plugin"',
        order: "50",
      }),
    );
    env.addPlugin(
      "good-plugin",
      validWidgetSource({
        id: '"good-plugin"',
        order: "200",
      }),
    );

    const plugins = await loadUserPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].id).toBe("good-plugin");
    expect(warnSpy).toHaveBeenCalled();
    const warnMsg = warnSpy.mock.calls[0].join(" ");
    expect(warnMsg).toContain("bad-plugin");
  });

  it("skips plugin with ID colliding with core plugin", async () => {
    env.addPlugin(
      "overview",
      validWidgetSource({
        id: '"overview"',
        order: "100",
      }),
    );

    const plugins = await loadUserPlugins();
    expect(plugins).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    const warnMsg = warnSpy.mock.calls[0].join(" ");
    expect(warnMsg).toContain("collides with core plugin");
  });

  it("skips plugin with broken widget.ts (import error)", async () => {
    env.addPlugin("broken", "export default syntax error {{{");

    const plugins = await loadUserPlugins();
    expect(plugins).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("loads multiple valid plugins", async () => {
    env.addPlugin(
      "plugin-a",
      validWidgetSource({
        id: '"plugin-a"',
        order: "100",
      }),
    );
    env.addPlugin(
      "plugin-b",
      validWidgetSource({
        id: '"plugin-b"',
        order: "200",
      }),
    );
    env.addPlugin(
      "plugin-c",
      validWidgetSource({
        id: '"plugin-c"',
        order: "300",
      }),
    );

    const plugins = await loadUserPlugins();
    expect(plugins).toHaveLength(3);
    const ids = plugins.map((p) => p.id).sort();
    expect(ids).toEqual(["plugin-a", "plugin-b", "plugin-c"]);
  });

  it("silently skips directory without widget.ts", async () => {
    env.addPluginDir("empty-dir");
    env.addPlugin(
      "real-plugin",
      validWidgetSource({
        id: '"real-plugin"',
      }),
    );

    const plugins = await loadUserPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].id).toBe("real-plugin");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("populates apiRoutes accessible via getPluginApiRoutes()", async () => {
    const widgetWithRoutes = `
export default {
  id: "routed-plugin",
  label: "Routed",
  icon: "Route",
  slot: "tab" as const,
  order: 100,
  component: () => Promise.resolve({ default: () => null }),
  apiRoutes: [
    {
      method: "GET" as const,
      path: "/data",
      handler: () => Response.json({ hello: true }),
    },
    {
      method: "POST" as const,
      path: "/submit",
      handler: () => new Response("ok"),
    },
  ],
};
`;
    env.addPlugin("routed-plugin", widgetWithRoutes);

    await loadUserPlugins();
    const routes = getPluginApiRoutes();
    expect(routes.has("routed-plugin")).toBe(true);
    expect(routes.get("routed-plugin")).toHaveLength(2);
    expect(routes.get("routed-plugin")![0].method).toBe("GET");
    expect(routes.get("routed-plugin")![0].path).toBe("/data");
  });

  it("plugin without apiRoutes does not appear in getPluginApiRoutes()", async () => {
    env.addPlugin(
      "no-routes",
      validWidgetSource({
        id: '"no-routes"',
      }),
    );

    await loadUserPlugins();
    const routes = getPluginApiRoutes();
    expect(routes.has("no-routes")).toBe(false);
  });
});

describe("getPluginApiRoutes", () => {
  let env: TempPluginEnv;

  beforeEach(() => {
    env = createTempPluginEnv();
  });

  afterEach(() => {
    env.cleanup();
  });

  it("returns empty Map when no plugins are loaded", async () => {
    await loadUserPlugins();
    const routes = getPluginApiRoutes();
    expect(routes.size).toBe(0);
  });

  it("returns Map keyed by plugin ID", async () => {
    const widget = `
export default {
  id: "api-plugin",
  label: "API",
  icon: "Zap",
  slot: "tab" as const,
  order: 100,
  component: () => Promise.resolve({ default: () => null }),
  apiRoutes: [
    { method: "GET" as const, path: "/info", handler: () => Response.json({}) },
  ],
};
`;
    env.addPlugin("api-plugin", widget);
    await loadUserPlugins();

    const routes = getPluginApiRoutes();
    expect(routes.size).toBe(1);
    expect(routes.has("api-plugin")).toBe(true);
  });

  it("resets routes on each loadUserPlugins() call", async () => {
    const widget = `
export default {
  id: "ephemeral",
  label: "Ephemeral",
  icon: "X",
  slot: "tab" as const,
  order: 100,
  component: () => Promise.resolve({ default: () => null }),
  apiRoutes: [
    { method: "GET" as const, path: "/x", handler: () => new Response("x") },
  ],
};
`;
    env.addPlugin("ephemeral", widget);
    await loadUserPlugins();
    expect(getPluginApiRoutes().size).toBe(1);

    // Remove the plugin and reload
    rmSync(join(env.pluginsDir, "ephemeral"), { recursive: true });
    await loadUserPlugins();
    expect(getPluginApiRoutes().size).toBe(0);
  });
});
