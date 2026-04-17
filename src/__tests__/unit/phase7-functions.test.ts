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
      return new Response(JSON.stringify({ id: 1, success: true }), {
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

describe("Phase 7: createMemory wrapper", () => {
  test("sends POST to /api/memory with FormData body", async () => {
    const { createMemory } = await import("../../../dashboard-v2/src/server/functions.ts");
    const data = new FormData();
    data.set("content", "Test memory");
    data.set("repo", "vigil");

    await createMemory({ data });

    expect(calls).toHaveLength(1);
    const [url, init] = calls[0];
    expect(url).toContain("/api/memory");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
  });
});

describe("Phase 7: deleteMemory wrapper", () => {
  test("sends DELETE to /api/memory/:id", async () => {
    const { deleteMemory } = await import("../../../dashboard-v2/src/server/functions.ts");

    await deleteMemory({ id: 42 });

    expect(calls).toHaveLength(1);
    const [url, init] = calls[0];
    expect(url).toContain("/api/memory/42");
    expect(init?.method).toBe("DELETE");
  });
});

describe("Phase 7: updateMemoryRelevance wrapper", () => {
  test("sends PATCH to /api/memory/:id with JSON body", async () => {
    const { updateMemoryRelevance } = await import("../../../dashboard-v2/src/server/functions.ts");

    await updateMemoryRelevance({ id: 7, data: { relevant: true } });

    expect(calls).toHaveLength(1);
    const [url, init] = calls[0];
    expect(url).toContain("/api/memory/7");
    expect(init?.method).toBe("PATCH");
    expect(init?.headers).toEqual(expect.objectContaining({ "Content-Type": "application/json" }));

    const body = JSON.parse(init?.body as string);
    expect(body.relevant).toBe(true);
  });

  test("sends relevant=false for thumbs-down", async () => {
    const { updateMemoryRelevance } = await import("../../../dashboard-v2/src/server/functions.ts");

    await updateMemoryRelevance({ id: 7, data: { relevant: false } });

    const [, init] = calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.relevant).toBe(false);
  });
});
