import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type FeatureGateConfig, FeatureGates } from "../../core/feature-gates.ts";
import { FEATURES } from "../../core/features.ts";

describe("FeatureGates", () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "vigil-gates-test-"));
    configPath = join(tmpDir, "config.json");
    writeFileSync(configPath, JSON.stringify({ features: {} }));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeGates(overrides?: Partial<FeatureGateConfig>): FeatureGates {
    return new FeatureGates({
      configPath,
      remoteTTL: 300_000,
      ...overrides,
    });
  }

  describe("Layer 1: Build-time flags", () => {
    it("defaults to enabled when no build flag set", async () => {
      const gates = makeGates();
      expect(await gates.isEnabled("some.feature")).toBe(true);
    });

    it("disables feature when build flag is false", async () => {
      const gates = makeGates();
      gates.setBuildFlag("some.feature", false);
      expect(await gates.isEnabled("some.feature")).toBe(false);
    });

    it("allows feature when build flag is true", async () => {
      const gates = makeGates();
      gates.setBuildFlag("some.feature", true);
      expect(await gates.isEnabled("some.feature")).toBe(true);
    });
  });

  describe("Layer 2: Config-time flags", () => {
    it("loads features from config file", async () => {
      writeFileSync(
        configPath,
        JSON.stringify({
          features: { [FEATURES.VIGIL_BRIEF]: false },
        }),
      );
      const gates = makeGates();
      gates.loadConfigFlags();
      expect(await gates.isEnabled(FEATURES.VIGIL_BRIEF)).toBe(false);
    });

    it("defaults to enabled when feature not in config", async () => {
      const gates = makeGates();
      gates.loadConfigFlags();
      expect(await gates.isEnabled(FEATURES.VIGIL_WATCHER)).toBe(true);
    });

    it("handles missing config file gracefully", async () => {
      const gates = new FeatureGates({
        configPath: join(tmpDir, "nonexistent.json"),
        remoteTTL: 300_000,
      });
      gates.loadConfigFlags();
      expect(await gates.isEnabled("any.feature")).toBe(true);
    });

    it("handles malformed config file gracefully", async () => {
      writeFileSync(configPath, "not json");
      const gates = makeGates();
      gates.loadConfigFlags();
      expect(await gates.isEnabled("any.feature")).toBe(true);
    });
  });

  describe("Layer 4: Session flags", () => {
    it("disables feature when session flag is false", async () => {
      const gates = makeGates();
      gates.setSessionFlag("some.feature", false);
      expect(await gates.isEnabled("some.feature")).toBe(false);
    });

    it("allows feature when session flag is true", async () => {
      const gates = makeGates();
      gates.setSessionFlag("some.feature", true);
      expect(await gates.isEnabled("some.feature")).toBe(true);
    });
  });

  describe("Multi-layer interaction", () => {
    it("requires all layers to pass", async () => {
      const gates = makeGates();
      gates.setBuildFlag("feat", true);
      gates.setSessionFlag("feat", true);
      expect(await gates.isEnabled("feat")).toBe(true);

      // Disable at config layer
      writeFileSync(configPath, JSON.stringify({ features: { feat: false } }));
      gates.loadConfigFlags();
      expect(await gates.isEnabled("feat")).toBe(false);
    });

    it("build-time block takes priority (short-circuits)", async () => {
      const gates = makeGates();
      gates.setBuildFlag("feat", false);
      // Even if config and session say yes, build says no
      gates.setSessionFlag("feat", true);
      expect(await gates.isEnabled("feat")).toBe(false);
    });
  });

  describe("isEnabledCached (synchronous)", () => {
    it("returns true when no flags set", () => {
      const gates = makeGates();
      expect(gates.isEnabledCached("feat")).toBe(true);
    });

    it("returns false when any layer disables", () => {
      const gates = makeGates();
      gates.setSessionFlag("feat", false);
      expect(gates.isEnabledCached("feat")).toBe(false);
    });

    it("checks build flags", () => {
      const gates = makeGates();
      gates.setBuildFlag("feat", false);
      expect(gates.isEnabledCached("feat")).toBe(false);
    });

    it("checks config flags", () => {
      writeFileSync(configPath, JSON.stringify({ features: { feat: false } }));
      const gates = makeGates();
      gates.loadConfigFlags();
      expect(gates.isEnabledCached("feat")).toBe(false);
    });
  });

  describe("diagnose", () => {
    it("reports per-layer status", async () => {
      const gates = makeGates();
      gates.setBuildFlag("feat", true);
      gates.setSessionFlag("feat", false);

      const result = await gates.diagnose("feat");
      expect(result.build).toBe(true);
      expect(result.config).toBe(true); // not set = defaults to true
      expect(result.runtime).toBeUndefined(); // no remote URL
      expect(result.session).toBe(false);
    });

    it("shows build block", async () => {
      const gates = makeGates();
      gates.setBuildFlag("feat", false);
      const result = await gates.diagnose("feat");
      expect(result.build).toBe(false);
    });
  });

  describe("FEATURES registry", () => {
    it("has expected feature keys", () => {
      expect(FEATURES.VIGIL_WATCHER).toBe("vigil.watcher");
      expect(FEATURES.VIGIL_DECISION_ENGINE).toBe("vigil.decision_engine");
      expect(FEATURES.VIGIL_BRIEF).toBe("vigil.brief");
      expect(FEATURES.VIGIL_PUSH).toBe("vigil.push_notifications");
      expect(FEATURES.VIGIL_SESSIONS).toBe("vigil.sessions");
    });

    it("all values are strings", () => {
      for (const val of Object.values(FEATURES)) {
        expect(typeof val).toBe("string");
      }
    });
  });
});
