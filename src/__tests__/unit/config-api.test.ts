import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context";
import { withTempHome } from "../helpers/temp-config";
import {
  getConfigJSON,
  handleConfigUpdate,
  getFeatureGatesJSON,
  handleFeatureToggle,
} from "../../dashboard/api/config";

describe("config API", () => {
  let ctx: ReturnType<typeof createFakeDashboardContext>;

  beforeEach(() => {
    ctx = createFakeDashboardContext();
  });

  describe("getConfigJSON", () => {
    it("returns all config fields from daemon", () => {
      const result = getConfigJSON(ctx);
      expect(result.tickInterval).toBe(30);
      expect(result.sleepAfter).toBe(900);
      expect(result.sleepTickInterval).toBe(300);
      expect(result.dreamAfter).toBe(1800);
      expect(result.blockingBudget).toBe(120);
      expect(result.maxEventWindow).toBe(100);
      expect(result.tickModel).toBe("claude-haiku-4-5-20251001");
      expect(result.escalationModel).toBe("claude-sonnet-4-6");
    });

    it("includes action gates from actionExecutor", () => {
      const result = getConfigJSON(ctx);
      expect(result.actionGates).toBeDefined();
      expect(result.actionGates.enabled).toBe(true);
      expect(result.actionGates.confidenceThreshold).toBe(0.8);
    });

    it("includes notification backends", () => {
      const result = getConfigJSON(ctx);
      expect(result.notificationBackends).toBeArray();
    });

    it("includes action allowlist", () => {
      const result = getConfigJSON(ctx);
      expect(result.actionAllowlist).toEqual(["git_stash", "run_tests", "run_lint"]);
    });
  });

  describe("handleConfigUpdate", () => {
    let home: ReturnType<typeof withTempHome>;

    beforeEach(() => {
      home = withTempHome();
    });

    afterEach(() => {
      home.cleanup();
    });

    it("accepts valid partial config update", async () => {
      const result = await handleConfigUpdate(ctx, { tickInterval: 60 });
      expect(result.success).toBe(true);
    });

    it("rejects invalid tickInterval (negative)", async () => {
      const result = await handleConfigUpdate(ctx, { tickInterval: -5 });
      expect(result.error).toBeDefined();
    });

    it("rejects invalid tickInterval (not a number)", async () => {
      const result = await handleConfigUpdate(ctx, { tickInterval: "fast" });
      expect(result.error).toBeDefined();
    });

    it("rejects unknown config keys", async () => {
      const result = await handleConfigUpdate(ctx, { unknownField: true });
      expect(result.error).toBeDefined();
    });

    it("persists config to file system", async () => {
      const { existsSync, readFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const os = await import("node:os");

      await handleConfigUpdate(ctx, { tickInterval: 45 });

      const configPath = join(os.homedir(), ".vigil", "config.json");
      expect(existsSync(configPath)).toBe(true);

      const saved = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(saved.tickInterval).toBe(45);
    });

    it("merges partial update with existing config", async () => {
      await handleConfigUpdate(ctx, { tickInterval: 45 });
      await handleConfigUpdate(ctx, { sleepAfter: 600 });

      const { readFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const os = await import("node:os");

      const configPath = join(os.homedir(), ".vigil", "config.json");
      const saved = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(saved.tickInterval).toBe(45);
      expect(saved.sleepAfter).toBe(600);
    });
  });

  describe("getFeatureGatesJSON", () => {
    it("returns array of feature gates", async () => {
      const result = await getFeatureGatesJSON(ctx);
      expect(result).toBeArray();
      expect(result.length).toBeGreaterThan(0);
    });

    it("each gate has key, enabled, and layers", async () => {
      const result = await getFeatureGatesJSON(ctx);
      for (const gate of result) {
        expect(gate.key).toBeString();
        expect(typeof gate.enabled).toBe("boolean");
        expect(gate.layers).toBeDefined();
        expect(typeof gate.layers.build).toBe("boolean");
        expect(typeof gate.layers.config).toBe("boolean");
        expect(typeof gate.layers.runtime).toBe("boolean");
        expect(typeof gate.layers.session).toBe("boolean");
      }
    });
  });

  describe("handleFeatureToggle", () => {
    let home: ReturnType<typeof withTempHome>;

    beforeEach(() => {
      home = withTempHome();
    });

    afterEach(() => {
      home.cleanup();
    });

    it("toggles a feature gate on", async () => {
      const result = await handleFeatureToggle(ctx, "VIGIL_A2A", true);
      expect(result.success).toBe(true);
      expect(result.enabled).toBe(true);
    });

    it("toggles a feature gate off", async () => {
      const result = await handleFeatureToggle(ctx, "VIGIL_WEBHOOKS", false);
      expect(result.success).toBe(true);
      expect(result.enabled).toBe(false);
    });

    it("persists toggle to config file", async () => {
      await handleFeatureToggle(ctx, "VIGIL_A2A", true);

      const { readFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const os = await import("node:os");

      const configPath = join(os.homedir(), ".vigil", "config.json");
      const saved = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(saved.features?.VIGIL_A2A).toBe(true);
    });
  });
});
