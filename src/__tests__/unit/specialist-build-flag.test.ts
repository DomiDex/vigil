import { describe, test, expect } from "bun:test";
import { BUILD_FEATURES, feature } from "../../build/features.ts";

describe("VIGIL_SPECIALISTS build flag", () => {
  test("feature('VIGIL_SPECIALISTS') returns true in dev mode", () => {
    expect(feature("VIGIL_SPECIALISTS")).toBe(true);
  });

  test("BUILD_FEATURES array contains VIGIL_SPECIALISTS", () => {
    expect(BUILD_FEATURES).toContain("VIGIL_SPECIALISTS");
  });

  test("BUILD_FEATURES has correct count after addition", () => {
    expect(BUILD_FEATURES.length).toBe(7);
  });
});
