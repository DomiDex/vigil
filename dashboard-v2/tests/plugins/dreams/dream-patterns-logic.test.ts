import { describe, test, expect } from "bun:test";
import { vigilKeys } from "../../../src/lib/query-keys";

describe("Dream patterns conditional query", () => {
  // Mirrors the `enabled: !!repoFilter` logic in DreamsPage
  function shouldFetchPatterns(repoFilter: string | null): boolean {
    return !!repoFilter;
  }

  test("enabled when repo filter is set", () => {
    expect(shouldFetchPatterns("vigil")).toBe(true);
  });

  test("disabled when repo filter is null", () => {
    expect(shouldFetchPatterns(null)).toBe(false);
  });

  test("disabled when repo filter is empty string", () => {
    expect(shouldFetchPatterns("")).toBe(false);
  });
});

describe("Dream patterns query key", () => {
  test("includes repo name for cache separation", () => {
    const key = vigilKeys.dreamPatterns("vigil");
    expect(key).toEqual(["dreams", "patterns", "vigil"]);
  });

  test("different repos produce different keys", () => {
    const keyA = vigilKeys.dreamPatterns("vigil");
    const keyB = vigilKeys.dreamPatterns("myapp");
    expect(keyA).not.toEqual(keyB);
    expect(keyA[2]).toBe("vigil");
    expect(keyB[2]).toBe("myapp");
  });
});
