import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const PROJECT_ROOT = join(import.meta.dir, "../../..");

async function readSource(relativePath: string): Promise<string> {
  const fullPath = join(PROJECT_ROOT, relativePath);
  const file = Bun.file(fullPath);
  if (!(await file.exists())) return "";
  return file.text();
}

describe("Phase 7: static file removal", () => {
  test("src/dashboard/static/ directory does not exist", () => {
    const staticDir = join(PROJECT_ROOT, "src/dashboard/static");
    expect(existsSync(staticDir)).toBe(false);
  });

  test("no vendor files remain (htmx, pico, chart)", () => {
    const vendorDir = join(PROJECT_ROOT, "src/dashboard/static/vendor");
    expect(existsSync(vendorDir)).toBe(false);
  });

  test("no legacy index.html remains", () => {
    const indexHtml = join(PROJECT_ROOT, "src/dashboard/static/index.html");
    expect(existsSync(indexHtml)).toBe(false);
  });
});

describe("Phase 7: fragment function removal", () => {
  const apiModules = [
    { file: "src/dashboard/api/overview.ts", forbidden: ["getOverviewFragment"] },
    { file: "src/dashboard/api/repos.ts", forbidden: ["getRepoFragment", "getRepoNavFragment"] },
    { file: "src/dashboard/api/timeline.ts", forbidden: ["getTimelineFragment", "getEntryFragment"] },
    { file: "src/dashboard/api/dreams.ts", forbidden: ["getDreamsFragment"] },
    { file: "src/dashboard/api/memory.ts", forbidden: ["getMemoryFragment", "getMemorySearchFragment"] },
    { file: "src/dashboard/api/tasks.ts", forbidden: ["getTasksFragment"] },
    { file: "src/dashboard/api/actions.ts", forbidden: ["getActionsFragment"] },
    { file: "src/dashboard/api/scheduler.ts", forbidden: ["getSchedulerFragment"] },
    { file: "src/dashboard/api/metrics.ts", forbidden: ["getMetricsFragment"] },
  ];

  for (const { file, forbidden } of apiModules) {
    for (const fn of forbidden) {
      test(`${file} does not export ${fn}`, async () => {
        const source = await readSource(file);
        expect(source).not.toContain(`export function ${fn}`);
        expect(source).not.toContain(`export async function ${fn}`);
      });
    }
  }
});

describe("Phase 7: server.ts cleanup", () => {
  test("no serveStatic function", async () => {
    const source = await readSource("src/dashboard/server.ts");
    expect(source).not.toContain("function serveStatic");
  });

  test("no html() helper", async () => {
    const source = await readSource("src/dashboard/server.ts");
    expect(source).not.toContain("function html(");
  });

  test("no MIME_TYPES map", async () => {
    const source = await readSource("src/dashboard/server.ts");
    expect(source).not.toContain("MIME_TYPES");
  });

  test("no getMime function", async () => {
    const source = await readSource("src/dashboard/server.ts");
    expect(source).not.toContain("function getMime");
  });

  test("no STATIC_DIR constant", async () => {
    const source = await readSource("src/dashboard/server.ts");
    expect(source).not.toContain("STATIC_DIR");
  });

  test("no V2_DIST_DIR constant", async () => {
    const source = await readSource("src/dashboard/server.ts");
    expect(source).not.toContain("V2_DIST_DIR");
  });

  test("no /dash redirect route", async () => {
    const source = await readSource("src/dashboard/server.ts");
    expect(source).not.toContain('"/dash"');
    expect(source).not.toContain("'/dash'");
  });

  test("json() helper still exists", async () => {
    const source = await readSource("src/dashboard/server.ts");
    expect(source).toContain("function json(");
  });

  test("no fragment route blocks remain", async () => {
    const source = await readSource("src/dashboard/server.ts");
    expect(source).not.toContain("/fragment");
  });

  test("no fragment imports remain", async () => {
    const source = await readSource("src/dashboard/server.ts");
    expect(source).not.toContain("Fragment");
  });
});

describe("Phase 7: codebase-wide grep for HTMX remnants", () => {
  test("no 'htmx' references in src/dashboard/", async () => {
    const { stdout } = Bun.spawnSync(["grep", "-ri", "htmx", join(PROJECT_ROOT, "src/dashboard/")]);
    const output = stdout.toString().trim();
    expect(output).toBe("");
  });

  test("no 'pico' references in src/dashboard/", async () => {
    const { stdout } = Bun.spawnSync(["grep", "-ri", "pico\\.min", join(PROJECT_ROOT, "src/dashboard/")]);
    const output = stdout.toString().trim();
    expect(output).toBe("");
  });

  test("no 'fragment' references in src/dashboard/ (excluding comments)", async () => {
    const { stdout } = Bun.spawnSync(["grep", "-ri", "fragment", join(PROJECT_ROOT, "src/dashboard/")]);
    const output = stdout.toString().trim();
    const lines = output.split("\n").filter((l: string) => l && !l.includes("Phase 7"));
    expect(lines).toHaveLength(0);
  });
});

describe("Phase 7: build script updates", () => {
  test("package.json has dashboard:build script", async () => {
    const pkg = JSON.parse(await readSource("package.json"));
    expect(pkg.scripts["dashboard:build"]).toBeDefined();
  });

  test("package.json has dashboard:dev script", async () => {
    const pkg = JSON.parse(await readSource("package.json"));
    expect(pkg.scripts["dashboard:dev"]).toBeDefined();
  });

  test("package.json has no css:build script", async () => {
    const pkg = JSON.parse(await readSource("package.json"));
    expect(pkg.scripts["css:build"]).toBeUndefined();
  });

  test("package.json has no css:watch script", async () => {
    const pkg = JSON.parse(await readSource("package.json"));
    expect(pkg.scripts["css:watch"]).toBeUndefined();
  });

  test("build script references dashboard:build", async () => {
    const pkg = JSON.parse(await readSource("package.json"));
    expect(pkg.scripts.build).toContain("dashboard:build");
    expect(pkg.scripts.build).not.toContain("css:build");
  });
});
