import { afterEach, beforeEach, describe, expect, test, spyOn } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("VigilConfig specialist defaults", () => {
  let tmpDir: string;
  let homedirSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "vigil-sa-config-test-"));
    homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpDir);
  });

  afterEach(() => {
    homedirSpy.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("loadConfig returns specialists field with all defaults", async () => {
    const { loadConfig } = await import("../../core/config.ts");
    const config = loadConfig();

    expect(config.specialists).toBeDefined();
    expect(config.specialists.enabled).toBe(true);
    expect(config.specialists.agents).toEqual(["code-review", "security", "test-drift", "flaky-test"]);
    expect(config.specialists.maxParallel).toBe(2);
    expect(config.specialists.cooldownSeconds).toBe(300);
    expect(config.specialists.severityThreshold).toBe("info");
  });

  test("specialists.flakyTest has correct defaults", async () => {
    const { loadConfig } = await import("../../core/config.ts");
    const config = loadConfig();

    expect(config.specialists.flakyTest.testCommand).toBe("bun test");
    expect(config.specialists.flakyTest.runOnCommit).toBe(true);
    expect(config.specialists.flakyTest.minRunsToJudge).toBe(3);
    expect(config.specialists.flakyTest.flakyThreshold).toBe(0.5);
    expect(config.specialists.flakyTest.maxTestHistory).toBe(100);
  });

  test("specialists.autoAction has correct defaults", async () => {
    const { loadConfig } = await import("../../core/config.ts");
    const config = loadConfig();

    expect(config.specialists.autoAction.enabled).toBe(false);
    expect(config.specialists.autoAction.minSeverity).toBe("critical");
    expect(config.specialists.autoAction.minConfidence).toBe(0.8);
    expect(config.specialists.autoAction.tierCap).toBe("safe");
  });

  test("partial specialist config merges with defaults", async () => {
    const { getConfigDir, loadConfig } = await import("../../core/config.ts");
    const dir = getConfigDir();
    writeFileSync(
      join(dir, "config.json"),
      JSON.stringify({
        specialists: { enabled: false, maxParallel: 4 },
      })
    );
    const config = loadConfig();

    expect(config.specialists.enabled).toBe(false);
    expect(config.specialists.maxParallel).toBe(4);
  });
});
