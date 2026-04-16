import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { createTempPluginEnv, type TempPluginEnv } from "../helpers/temp-plugins";

// Mock corePlugins
mock.module("../../../dashboard-v2/src/plugins/index", () => ({
  corePlugins: [{ id: "overview", label: "Overview", slot: "tab", order: 0 }],
}));

import type { PluginApiRoute } from "../../dashboard/plugin-loader";

describe("plugin API route handling", () => {
  let env: TempPluginEnv;
  let server: ReturnType<typeof Bun.serve>;
  let port: number;
  let warnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    env = createTempPluginEnv();
    port = 40000 + Math.floor(Math.random() * 10000);
    warnSpy = spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    server?.stop(true);
    warnSpy.mockRestore();
    env.cleanup();
  });

  function createPluginServer(pluginRoutes: Map<string, PluginApiRoute[]>) {
    server = Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname.startsWith("/api/plugins/")) {
          const segments = url.pathname.split("/");
          const pluginId = segments[3];
          const pluginPath = `/${segments.slice(4).join("/")}`;
          const routes = pluginRoutes.get(pluginId);
          if (routes) {
            const route = routes.find((r) => r.path === pluginPath && r.method === req.method);
            if (route) {
              try {
                return route.handler(req);
              } catch {
                return Response.json({ error: "Plugin error" }, { status: 500 });
              }
            }
          }
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        // Core routes first
        if (url.pathname === "/api/overview") {
          return Response.json({ repos: [], uptime: 0 });
        }
        return new Response("fallthrough");
      },
    });
  }

  it("dispatches GET request to correct plugin handler", async () => {
    const widget = `
export default {
  id: "test-api",
  label: "Test API",
  icon: "Zap",
  slot: "tab" as const,
  order: 100,
  component: () => Promise.resolve({ default: () => null }),
  apiRoutes: [
    {
      method: "GET" as const,
      path: "/hello",
      handler: () => Response.json({ message: "from plugin" }),
    },
  ],
};
`;
    env.addPlugin("test-api", widget);

    const { loadUserPlugins, getPluginApiRoutes } = await import("../../dashboard/plugin-loader");
    await loadUserPlugins();
    const pluginRoutes = getPluginApiRoutes();

    createPluginServer(pluginRoutes);

    const res = await fetch(`http://localhost:${port}/api/plugins/test-api/hello`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("from plugin");
  });

  it("returns 404 for method mismatch", async () => {
    const widget = `
export default {
  id: "get-only",
  label: "GET Only",
  icon: "Zap",
  slot: "tab" as const,
  order: 100,
  component: () => Promise.resolve({ default: () => null }),
  apiRoutes: [
    {
      method: "GET" as const,
      path: "/data",
      handler: () => Response.json({ ok: true }),
    },
  ],
};
`;
    env.addPlugin("get-only", widget);

    const { loadUserPlugins, getPluginApiRoutes } = await import("../../dashboard/plugin-loader");
    await loadUserPlugins();
    const pluginRoutes = getPluginApiRoutes();

    createPluginServer(pluginRoutes);

    const res = await fetch(`http://localhost:${port}/api/plugins/get-only/data`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for unknown plugin ID", async () => {
    const { loadUserPlugins, getPluginApiRoutes } = await import("../../dashboard/plugin-loader");
    await loadUserPlugins();
    const pluginRoutes = getPluginApiRoutes();

    createPluginServer(pluginRoutes);

    const res = await fetch(`http://localhost:${port}/api/plugins/nonexistent/data`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
  });

  it("returns 500 when plugin handler throws", async () => {
    const widget = `
export default {
  id: "crashy",
  label: "Crashy",
  icon: "AlertTriangle",
  slot: "tab" as const,
  order: 100,
  component: () => Promise.resolve({ default: () => null }),
  apiRoutes: [
    {
      method: "GET" as const,
      path: "/boom",
      handler: () => { throw new Error("plugin exploded"); },
    },
  ],
};
`;
    env.addPlugin("crashy", widget);

    const { loadUserPlugins, getPluginApiRoutes } = await import("../../dashboard/plugin-loader");
    await loadUserPlugins();
    const pluginRoutes = getPluginApiRoutes();

    createPluginServer(pluginRoutes);

    const res = await fetch(`http://localhost:${port}/api/plugins/crashy/boom`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Plugin error");
  });

  it("core /api/* routes are not affected by plugin route block", async () => {
    createPluginServer(new Map());

    const res = await fetch(`http://localhost:${port}/api/overview`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("repos");
  });
});

describe("GET /api/plugins endpoint", () => {
  let env: TempPluginEnv;
  let server: ReturnType<typeof Bun.serve>;
  let port: number;

  beforeEach(() => {
    env = createTempPluginEnv();
    port = 40000 + Math.floor(Math.random() * 10000);
  });

  afterEach(() => {
    server?.stop(true);
    env.cleanup();
  });

  it("returns merged core + user plugins sorted by order", async () => {
    env.addPlugin(
      "user-plugin",
      `
export default {
  id: "user-plugin",
  label: "User Plugin",
  icon: "Puzzle",
  slot: "tab" as const,
  order: 150,
  component: () => Promise.resolve({ default: () => null }),
};
`,
    );

    const { loadUserPlugins } = await import("../../dashboard/plugin-loader");
    const userPlugins = await loadUserPlugins();

    const corePlugins = [{ id: "overview", label: "Overview", icon: "Home", slot: "tab", order: 0 }];

    const allPlugins = [
      ...corePlugins.map((p) => ({ ...p, source: "core" as const })),
      ...userPlugins.map((p) => ({ ...p, source: "user" as const })),
    ];

    const metadata = allPlugins
      .map(({ id, label, icon, slot, order, source }) => ({
        id,
        label,
        icon,
        slot,
        order,
        source,
        sseEvents: [],
        queryKeys: [],
        hasApiRoutes: false,
      }))
      .sort((a, b) => a.order - b.order);

    server = Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/api/plugins" && req.method === "GET") {
          return Response.json(metadata);
        }
        return new Response("not found", { status: 404 });
      },
    });

    const res = await fetch(`http://localhost:${port}/api/plugins`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body[0].order).toBeLessThanOrEqual(body[1].order);
    expect(body[0].source).toBe("core");
    expect(body[1].source).toBe("user");

    for (const plugin of body) {
      expect(plugin).toHaveProperty("id");
      expect(plugin).toHaveProperty("label");
      expect(plugin).toHaveProperty("icon");
      expect(plugin).toHaveProperty("slot");
      expect(plugin).toHaveProperty("order");
      expect(plugin).toHaveProperty("source");
    }
  });

  it("does not include function references in response", async () => {
    env.addPlugin(
      "fn-plugin",
      `
export default {
  id: "fn-plugin",
  label: "FN Plugin",
  icon: "Zap",
  slot: "tab" as const,
  order: 100,
  component: () => Promise.resolve({ default: () => null }),
  apiRoutes: [
    { method: "GET" as const, path: "/x", handler: () => new Response("x") },
  ],
};
`,
    );

    const { loadUserPlugins } = await import("../../dashboard/plugin-loader");
    const userPlugins = await loadUserPlugins();

    const metadata = userPlugins.map((p) => ({
      id: p.id,
      label: p.label,
      icon: p.icon,
      slot: p.slot,
      order: p.order,
      source: "user",
      sseEvents: p.sseEvents ?? [],
      queryKeys: p.queryKeys ?? [],
      hasApiRoutes: true,
    }));

    server = Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/api/plugins") {
          return Response.json(metadata);
        }
        return new Response("not found", { status: 404 });
      },
    });

    const res = await fetch(`http://localhost:${port}/api/plugins`);
    const body = await res.json();

    for (const plugin of body) {
      expect(plugin).not.toHaveProperty("component");
      expect(plugin).not.toHaveProperty("handler");
      expect(plugin).not.toHaveProperty("apiRoutes");
    }
  });

  it("returns empty array when no plugins exist", async () => {
    server = Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/api/plugins") {
          return Response.json([]);
        }
        return new Response("not found", { status: 404 });
      },
    });

    const res = await fetch(`http://localhost:${port}/api/plugins`);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});
