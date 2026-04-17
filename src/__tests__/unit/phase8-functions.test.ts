import { afterEach, beforeEach, describe, expect, test } from "bun:test";

// Intercept only localhost:7480 API calls, letting real fetch pass through.
const origFetch = globalThis.fetch;
let calls: [string, RequestInit | undefined][];

beforeEach(() => {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.startsWith("http://localhost:7480/")) {
      calls.push([url, init]);
      return new Response(JSON.stringify({ success: true, freedBytes: 4096, deletedCount: 15 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return origFetch(input, init);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = origFetch;
});

describe("Phase 8: getMetrics wrapper with from/to params", () => {
  test("appends from and to as query params", async () => {
    const { getMetrics } = await import("../../../dashboard-v2/src/server/functions.ts");

    await getMetrics({ from: 1713225600000, to: 1713312000000 });

    expect(calls).toHaveLength(1);
    const [url] = calls[0];
    expect(url).toContain("/api/metrics?");
    expect(url).toContain("from=1713225600000");
    expect(url).toContain("to=1713312000000");
  });

  test("omits query params when from/to not provided", async () => {
    const { getMetrics } = await import("../../../dashboard-v2/src/server/functions.ts");

    await getMetrics();

    const [url] = calls[0];
    expect(url).toContain("/api/metrics");
    expect(url).not.toContain("?");
  });

  test("appends only from when to is omitted", async () => {
    const { getMetrics } = await import("../../../dashboard-v2/src/server/functions.ts");

    await getMetrics({ from: 1713225600000 });

    const [url] = calls[0];
    expect(url).toContain("from=1713225600000");
    expect(url).not.toContain("to=");
  });
});

describe("Phase 8: vacuumDatabase wrapper", () => {
  test("sends POST to /api/health/vacuum", async () => {
    const { vacuumDatabase } = await import("../../../dashboard-v2/src/server/functions.ts");

    await vacuumDatabase();

    expect(calls).toHaveLength(1);
    const [url, init] = calls[0];
    expect(url).toContain("/api/health/vacuum");
    expect(init?.method).toBe("POST");
  });
});

describe("Phase 8: pruneEvents wrapper", () => {
  test("sends POST to /api/health/prune with JSON body", async () => {
    const { pruneEvents } = await import("../../../dashboard-v2/src/server/functions.ts");

    await pruneEvents({ data: { olderThanDays: 30 } });

    expect(calls).toHaveLength(1);
    const [url, init] = calls[0];
    expect(url).toContain("/api/health/prune");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual(expect.objectContaining({ "Content-Type": "application/json" }));

    const body = JSON.parse(init?.body as string);
    expect(body.olderThanDays).toBe(30);
  });
});
