import { describe, test, expect } from "bun:test";
import { vigilKeys } from "../../lib/query-keys";

describe("vigilKeys.specialists", () => {
  test("all equals ['specialists']", () => {
    expect(vigilKeys.specialists.all).toEqual(["specialists"]);
  });

  test("detail returns ['specialists', name]", () => {
    expect(vigilKeys.specialists.detail("security")).toEqual([
      "specialists",
      "security",
    ]);
  });

  test("findings() returns ['specialists', 'findings', {}]", () => {
    expect(vigilKeys.specialists.findings()).toEqual([
      "specialists",
      "findings",
      {},
    ]);
  });

  test("findings(filters) includes the filter object", () => {
    const key = vigilKeys.specialists.findings({ specialist: "security" });
    expect(key[0]).toBe("specialists");
    expect(key[1]).toBe("findings");
    expect(key[2]).toEqual({ specialist: "security" });
  });

  test("findingDetail returns ['specialists', 'findings', id]", () => {
    expect(vigilKeys.specialists.findingDetail("f1")).toEqual([
      "specialists",
      "findings",
      "f1",
    ]);
  });

  test("flaky() returns ['specialists', 'flaky', undefined]", () => {
    expect(vigilKeys.specialists.flaky()).toEqual([
      "specialists",
      "flaky",
      undefined,
    ]);
  });

  test("flaky(repo) returns ['specialists', 'flaky', repo]", () => {
    expect(vigilKeys.specialists.flaky("vigil")).toEqual([
      "specialists",
      "flaky",
      "vigil",
    ]);
  });

  test("all specialist keys start with 'specialists' prefix", () => {
    expect(vigilKeys.specialists.all[0]).toBe("specialists");
    expect(vigilKeys.specialists.detail("x")[0]).toBe("specialists");
    expect(vigilKeys.specialists.findings()[0]).toBe("specialists");
    expect(vigilKeys.specialists.findingDetail("x")[0]).toBe("specialists");
    expect(vigilKeys.specialists.flaky()[0]).toBe("specialists");
  });

  test("'specialists' prefix does not collide with other top-level key groups", () => {
    const topLevelKeys = Object.keys(vigilKeys).filter(
      (k) => k !== "specialists",
    );
    for (const key of topLevelKeys) {
      expect(key).not.toBe("specialists");
    }
  });
});
