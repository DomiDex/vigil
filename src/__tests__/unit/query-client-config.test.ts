import { describe, expect, it } from "bun:test";

describe("QueryClient configuration", () => {
  it("exports queryClient with correct staleTime", async () => {
    const { queryClient } = await import(
      "../../../dashboard-v2/src/router.tsx"
    );
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(10_000);
  });

  it("exports queryClient with correct gcTime", async () => {
    const { queryClient } = await import(
      "../../../dashboard-v2/src/router.tsx"
    );
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.gcTime).toBe(5 * 60_000);
  });

  it("has refetchOnWindowFocus disabled", async () => {
    const { queryClient } = await import(
      "../../../dashboard-v2/src/router.tsx"
    );
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
  });

  it("queryClient is a QueryClient instance", async () => {
    const { queryClient } = await import(
      "../../../dashboard-v2/src/router.tsx"
    );
    expect(queryClient).toBeDefined();
    expect(typeof queryClient.getDefaultOptions).toBe("function");
    expect(typeof queryClient.invalidateQueries).toBe("function");
  });
});
