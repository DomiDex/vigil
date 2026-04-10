import { describe, expect, it } from "bun:test";
import { BUILD_FEATURES, feature } from "../../build/features.ts";

describe("build-time feature()", () => {
  it("returns true for all known features in dev mode (unbundled)", () => {
    for (const name of BUILD_FEATURES) {
      expect(feature(name)).toBe(true);
    }
  });

  it("returns true for unknown feature names", () => {
    expect(feature("UNKNOWN_FEATURE")).toBe(true);
  });

  it("recognizes all expected feature names", () => {
    expect(BUILD_FEATURES).toContain("VIGIL_CHANNELS");
    expect(BUILD_FEATURES).toContain("VIGIL_WEBHOOKS");
    expect(BUILD_FEATURES).toContain("VIGIL_PUSH");
    expect(BUILD_FEATURES).toContain("VIGIL_PROACTIVE");
    expect(BUILD_FEATURES).toContain("VIGIL_SESSIONS");
    expect(BUILD_FEATURES).toContain("VIGIL_AGENT");
    expect(BUILD_FEATURES.length).toBe(6);
  });
});

describe("build.config.ts", () => {
  it("exists and is parseable", async () => {
    const file = Bun.file("build.config.ts");
    expect(await file.exists()).toBe(true);
    const text = await file.text();
    expect(text).toContain("Bun.build");
    expect(text).toContain("--lite");
    expect(text).toContain("FEATURE_VIGIL_");
  });
});
