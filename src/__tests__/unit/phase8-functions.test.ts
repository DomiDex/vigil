import { describe, test, expect, beforeEach, mock } from "bun:test";

const mockFetch = mock(() =>
  Promise.resolve(
    new Response(JSON.stringify({ success: true, freedBytes: 4096, deletedCount: 15 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  )
);

beforeEach(() => {
  globalThis.fetch = mockFetch as any;
  mockFetch.mockClear();
});

describe("Phase 8: getMetrics wrapper with from/to params", () => {
  test("appends from and to as query params", async () => {
    const { getMetrics } = await import("../../../dashboard-v2/src/server/functions.ts");

    await getMetrics({ from: 1713225600000, to: 1713312000000 });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("/api/metrics?");
    expect(url).toContain("from=1713225600000");
    expect(url).toContain("to=1713312000000");
  });

  test("omits query params when from/to not provided", async () => {
    const { getMetrics } = await import("../../../dashboard-v2/src/server/functions.ts");

    await getMetrics();

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("/api/metrics");
    expect(url).not.toContain("?");
  });

  test("appends only from when to is omitted", async () => {
    const { getMetrics } = await import("../../../dashboard-v2/src/server/functions.ts");

    await getMetrics({ from: 1713225600000 });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("from=1713225600000");
    expect(url).not.toContain("to=");
  });
});

describe("Phase 8: vacuumDatabase wrapper", () => {
  test("sends POST to /api/health/vacuum", async () => {
    const { vacuumDatabase } = await import("../../../dashboard-v2/src/server/functions.ts");

    await vacuumDatabase();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/health/vacuum");
    expect(init.method).toBe("POST");
  });
});

describe("Phase 8: pruneEvents wrapper", () => {
  test("sends POST to /api/health/prune with JSON body", async () => {
    const { pruneEvents } = await import("../../../dashboard-v2/src/server/functions.ts");

    await pruneEvents({ data: { olderThanDays: 30 } });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/health/prune");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual(expect.objectContaining({ "Content-Type": "application/json" }));

    const body = JSON.parse(init.body as string);
    expect(body.olderThanDays).toBe(30);
  });
});
