import { describe, test, expect, beforeEach, mock } from "bun:test";

// Mock fetch before importing functions
const mockFetch = mock(() =>
  Promise.resolve(
    new Response(JSON.stringify({ id: 1, success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  )
);

beforeEach(() => {
  globalThis.fetch = mockFetch as any;
  mockFetch.mockClear();
});

describe("Phase 7: createMemory wrapper", () => {
  test("sends POST to /api/memory with FormData body", async () => {
    const { createMemory } = await import("../../../dashboard-v2/src/server/functions.ts");
    const data = new FormData();
    data.set("content", "Test memory");
    data.set("repo", "vigil");

    await createMemory({ data });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/memory");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
  });
});

describe("Phase 7: deleteMemory wrapper", () => {
  test("sends DELETE to /api/memory/:id", async () => {
    const { deleteMemory } = await import("../../../dashboard-v2/src/server/functions.ts");

    await deleteMemory({ id: 42 });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/memory/42");
    expect(init.method).toBe("DELETE");
  });
});

describe("Phase 7: updateMemoryRelevance wrapper", () => {
  test("sends PATCH to /api/memory/:id with JSON body", async () => {
    const { updateMemoryRelevance } = await import("../../../dashboard-v2/src/server/functions.ts");

    await updateMemoryRelevance({ id: 7, data: { relevant: true } });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/memory/7");
    expect(init.method).toBe("PATCH");
    expect(init.headers).toEqual(expect.objectContaining({ "Content-Type": "application/json" }));

    const body = JSON.parse(init.body as string);
    expect(body.relevant).toBe(true);
  });

  test("sends relevant=false for thumbs-down", async () => {
    const { updateMemoryRelevance } = await import("../../../dashboard-v2/src/server/functions.ts");

    await updateMemoryRelevance({ id: 7, data: { relevant: false } });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.relevant).toBe(false);
  });
});
