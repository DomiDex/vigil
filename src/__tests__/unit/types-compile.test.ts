import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const DASHBOARD_V2_DIR = join(import.meta.dir, "../../../dashboard-v2");

describe("TypeScript compilation", () => {
  it("dashboard-v2 compiles with zero errors", async () => {
    const proc = Bun.spawn(["bun", "run", "tsc", "--noEmit"], {
      cwd: DASHBOARD_V2_DIR,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    if (exitCode !== 0) {
      console.error("tsc errors:\n", stderr);
    }
    expect(exitCode).toBe(0);
  }, 30000);

  it("api.ts types are importable", async () => {
    const mod = await import("../../../dashboard-v2/src/types/api.ts");
    expect(mod).toBeDefined();
  });

  it("plugin.ts types are importable", async () => {
    const mod = await import("../../../dashboard-v2/src/types/plugin.ts");
    expect(mod).toBeDefined();
  });
});
