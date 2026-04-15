import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routeSource = readFileSync(join(import.meta.dir, "../../../dashboard-v2/src/routes/index.tsx"), "utf-8");

describe("Index route wiring", () => {
  it("uses lazyRouteComponent", () => {
    expect(routeSource).toContain("lazyRouteComponent");
  });

  it("does not use bare React.lazy", () => {
    // Should not have React.lazy( or import lazy from react
    expect(routeSource).not.toMatch(/React\.lazy\s*\(/);
    // Allow lazy from tanstack router, but not from react
    const reactLazyImport = /import\s+.*\blazy\b.*from\s+["']react["']/;
    expect(routeSource).not.toMatch(reactLazyImport);
  });

  it("does not use server-side loaders (no getVigilContext in client)", () => {
    expect(routeSource).not.toContain("getVigilContext");
  });

  it("references TimelinePage plugin path", () => {
    expect(routeSource).toContain("TimelinePage");
  });
});
