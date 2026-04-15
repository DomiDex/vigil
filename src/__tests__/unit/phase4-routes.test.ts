import { describe, it, expect } from "bun:test";

const ROUTE_CONFIGS = [
  { name: "repos", path: "/repos" },
  { name: "dreams", path: "/dreams" },
  { name: "tasks", path: "/tasks" },
  { name: "actions", path: "/actions" },
  { name: "memory", path: "/memory" },
  { name: "scheduler", path: "/scheduler" },
  { name: "metrics", path: "/metrics" },
] as const;

describe("Phase 4 route files", () => {
  for (const { name, path } of ROUTE_CONFIGS) {
    describe(`${name} route`, () => {
      it("exports a Route object", async () => {
        const mod = await import(`../../../dashboard-v2/src/routes/${name}`);
        expect(mod.Route).toBeDefined();
      });

      it("Route has options with loader and component", async () => {
        const mod = await import(`../../../dashboard-v2/src/routes/${name}`);
        expect(mod.Route.options).toBeDefined();
        expect(typeof mod.Route.options.loader).toBe("function");
        expect(mod.Route.options.component).toBeDefined();
      });
    });
  }
});
