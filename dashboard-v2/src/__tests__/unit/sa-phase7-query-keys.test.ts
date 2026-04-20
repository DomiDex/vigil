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

  test("findings.root equals ['specialists', 'findings']", () => {
    expect(vigilKeys.specialists.findings.root).toEqual([
      "specialists",
      "findings",
    ]);
  });

  test("findings.list() returns ['specialists', 'findings', 'list', {}]", () => {
    expect(vigilKeys.specialists.findings.list()).toEqual([
      "specialists",
      "findings",
      "list",
      {},
    ]);
  });

  test("findings.list(filters) includes the filter object", () => {
    const key = vigilKeys.specialists.findings.list({ specialist: "security" });
    expect(key[0]).toBe("specialists");
    expect(key[1]).toBe("findings");
    expect(key[2]).toBe("list");
    expect(key[3]).toEqual({ specialist: "security" });
  });

  test("findings.detail returns ['specialists', 'findings', 'detail', id]", () => {
    expect(vigilKeys.specialists.findings.detail("f1")).toEqual([
      "specialists",
      "findings",
      "detail",
      "f1",
    ]);
  });

  test("findings.list and findings.detail share root prefix but not keys", () => {
    const list = vigilKeys.specialists.findings.list();
    const detail = vigilKeys.specialists.findings.detail("f1");
    expect(list[2]).toBe("list");
    expect(detail[2]).toBe("detail");
    expect(list[2]).not.toBe(detail[2]);
  });

  test("flaky.root equals ['specialists', 'flaky']", () => {
    expect(vigilKeys.specialists.flaky.root).toEqual(["specialists", "flaky"]);
  });

  test("flaky.list(repo) returns ['specialists', 'flaky', 'list', repo]", () => {
    expect(vigilKeys.specialists.flaky.list("vigil")).toEqual([
      "specialists",
      "flaky",
      "list",
      "vigil",
    ]);
  });

  test("all specialist keys start with 'specialists' prefix", () => {
    expect(vigilKeys.specialists.all[0]).toBe("specialists");
    expect(vigilKeys.specialists.detail("x")[0]).toBe("specialists");
    expect(vigilKeys.specialists.findings.root[0]).toBe("specialists");
    expect(vigilKeys.specialists.findings.list()[0]).toBe("specialists");
    expect(vigilKeys.specialists.findings.detail("x")[0]).toBe("specialists");
    expect(vigilKeys.specialists.flaky.root[0]).toBe("specialists");
    expect(vigilKeys.specialists.flaky.list()[0]).toBe("specialists");
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
