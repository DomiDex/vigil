import { describe, it, expect } from "bun:test";

const ROUTE_NAMES = ["repos", "dreams", "tasks", "actions", "memory", "scheduler", "metrics"] as const;

describe("Phase 4 route files", () => {
  for (const name of ROUTE_NAMES) {
    describe(`${name} route`, () => {
      it("exports a Route object", async () => {
        const mod = await import(`../../../dashboard-v2/src/routes/${name}`);
        expect(mod.Route).toBeDefined();
      });

      it("Route has component in options", async () => {
        const mod = await import(`../../../dashboard-v2/src/routes/${name}`);
        expect(mod.Route.options).toBeDefined();
        expect(mod.Route.options.component).toBeDefined();
      });
    });
  }
});
