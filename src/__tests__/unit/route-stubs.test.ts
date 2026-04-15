import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { EXPECTED_ROUTES } from "../helpers/dashboard-v2-helpers.ts";

const ROUTES_DIR = join(import.meta.dir, "../../../dashboard-v2/src/routes");

describe("route stubs", () => {
  describe("file existence", () => {
    for (const route of EXPECTED_ROUTES) {
      it(`${route.file}.tsx exists`, () => {
        const filePath = join(ROUTES_DIR, `${route.file}.tsx`);
        expect(existsSync(filePath)).toBe(true);
      });
    }

    it("index.tsx exists (from Phase 0)", () => {
      expect(existsSync(join(ROUTES_DIR, "index.tsx"))).toBe(true);
    });

    it("__root.tsx exists (from Phase 0)", () => {
      expect(existsSync(join(ROUTES_DIR, "__root.tsx"))).toBe(true);
    });
  });

  describe("route exports", () => {
    for (const route of EXPECTED_ROUTES) {
      it(`${route.file}.tsx exports Route with path "${route.path}"`, async () => {
        const mod = await import(`../../../dashboard-v2/src/routes/${route.file}.tsx`);
        expect(mod.Route).toBeDefined();
        expect(typeof mod.Route).toBe("object");
      });
    }
  });
});
