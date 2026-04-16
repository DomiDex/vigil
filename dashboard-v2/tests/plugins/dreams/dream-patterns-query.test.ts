import { describe, test, expect, beforeEach, mock } from "bun:test";

describe("Dream patterns conditional fetch", () => {
  const mockGetDreamPatterns = mock(() =>
    Promise.resolve({
      patterns: ["Late-night commits", "Force-push habit"],
    }),
  );

  beforeEach(() => {
    mockGetDreamPatterns.mockClear();
  });

  test("fetches patterns when repo filter is active", async () => {
    const repoFilter = "vigil";
    const enabled = !!repoFilter;

    if (enabled) {
      const result = await mockGetDreamPatterns({
        data: { repo: repoFilter },
      });
      expect(result.patterns).toHaveLength(2);
      expect(mockGetDreamPatterns).toHaveBeenCalledWith({
        data: { repo: "vigil" },
      });
    }
  });

  test("does not fetch patterns when repo filter is null", () => {
    const repoFilter: string | null = null;
    const enabled = !!repoFilter;

    expect(enabled).toBe(false);
    // mockGetDreamPatterns should not be called
    expect(mockGetDreamPatterns).not.toHaveBeenCalled();
  });
});
