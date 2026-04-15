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
      it(`exports Route with ${path} path`, async () => {
        const mod = await import(`../../../dashboard-v2/src/routes/${name}`);
        expect(mod.Route).toBeDefined();
        expect(mod.Route.path).toBe(path);
      });

      it("Route has loader function in options", async () => {
        const mod = await import(`../../../dashboard-v2/src/routes/${name}`);
        expect(mod.Route.options).toBeDefined();
        expect(typeof mod.Route.options.loader).toBe("function");
      });

      it("Route has lazy component", async () => {
        const mod = await import(`../../../dashboard-v2/src/routes/${name}`);
        // lazyRouteComponent sets up the component as a lazy wrapper
        expect(mod.Route.options.component).toBeDefined();
      });
    });
  }
});
