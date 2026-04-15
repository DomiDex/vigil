import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = join(import.meta.dir, "../../dashboard/app");
const BUILD_DIR = join(APP_DIR, "dist");
const buildExists = existsSync(BUILD_DIR);

describe("tailwind theme source", () => {
  test("app.css contains @theme tokens", () => {
    const cssPath = join(APP_DIR, "app/app.css");
    expect(existsSync(cssPath)).toBe(true);

    const css = readFileSync(cssPath, "utf-8");
    expect(css).toContain("--color-vigil");
    expect(css).toContain("--color-background");
    expect(css).toContain("--color-surface");
  });
});

describe.skipIf(!buildExists)("tailwind theme build output", () => {
  test("compiled CSS output contains custom properties", () => {
    // Find compiled CSS in dist/client
    const glob = new Bun.Glob("**/*.css");
    const cssFiles = [...glob.scanSync(join(BUILD_DIR, "client"))];
    expect(cssFiles.length).toBeGreaterThan(0);

    // At least one CSS file should contain our Vigil theme tokens
    const hasVigilTokens = cssFiles.some((file) => {
      const content = readFileSync(join(BUILD_DIR, "client", file), "utf-8");
      return content.includes("--color-vigil") || content.includes("#FF8102") || content.includes("#ff8102");
    });
    expect(hasVigilTokens).toBe(true);
  });

  test("no external CDN imports in CSS", () => {
    const glob = new Bun.Glob("**/*.css");
    const cssFiles = [...glob.scanSync(join(BUILD_DIR, "client"))];

    for (const file of cssFiles) {
      const content = readFileSync(join(BUILD_DIR, "client", file), "utf-8");
      expect(content).not.toContain("url(http");
      expect(content).not.toMatch(/@import\s+url\(/);
    }
  });
});
