import { describe, test, expect, beforeEach, mock } from "bun:test";
import { z } from "zod";

// Client-side Zod schema (same as API route — shared validation)
const createMemorySchema = z.object({
  content: z.string().min(1).max(5000),
  repo: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// Mock fetch for wrapper tests
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

describe("Phase 7: Client-side form validation", () => {
  test("rejects empty content (form submit disabled)", () => {
    const result = createMemorySchema.safeParse({ content: "" });
    expect(result.success).toBe(false);
  });

  test("accepts valid form data shape", () => {
    const result = createMemorySchema.safeParse({
      content: "New memory about deploy patterns",
      repo: "vigil",
      tags: ["deploy", "pattern"],
    });
    expect(result.success).toBe(true);
  });

  test("tags parsed as string array", () => {
    const result = createMemorySchema.safeParse({
      content: "Test",
      tags: ["a", "b", "c"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual(["a", "b", "c"]);
    }
  });
});

describe("Phase 7: Delete confirmation flow", () => {
  test("deleteMemory calls correct endpoint", async () => {
    const { deleteMemory } = await import("../../../dashboard-v2/src/server/functions.ts");

    await deleteMemory({ id: 99 });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/memory/99");
    expect(init.method).toBe("DELETE");
  });
});

describe("Phase 7: Relevance mutation calls", () => {
  test("thumbs-up calls updateMemoryRelevance with relevant=true", async () => {
    const { updateMemoryRelevance } = await import("../../../dashboard-v2/src/server/functions.ts");

    await updateMemoryRelevance({ id: 5, data: { relevant: true } });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/memory/5");
    const body = JSON.parse(init.body as string);
    expect(body.relevant).toBe(true);
  });

  test("thumbs-down calls updateMemoryRelevance with relevant=false", async () => {
    const { updateMemoryRelevance } = await import("../../../dashboard-v2/src/server/functions.ts");

    await updateMemoryRelevance({ id: 5, data: { relevant: false } });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/memory/5");
    const body = JSON.parse(init.body as string);
    expect(body.relevant).toBe(false);
  });
});

describe("Phase 7: Query key structure for invalidation", () => {
  test("vigilKeys.memory.stats is correct key", async () => {
    const { vigilKeys } = await import("../../../dashboard-v2/src/lib/query-keys.ts");
    expect(vigilKeys.memory.stats).toEqual(["memory"]);
  });

  test("vigilKeys.memory.search returns parameterized key", async () => {
    const { vigilKeys } = await import("../../../dashboard-v2/src/lib/query-keys.ts");
    expect(vigilKeys.memory.search("test query")).toEqual(["memory", "search", "test query"]);
  });

  test("vigilKeys.notifications is correct key", async () => {
    const { vigilKeys } = await import("../../../dashboard-v2/src/lib/query-keys.ts");
    expect(vigilKeys.notifications).toEqual(["notifications"]);
  });
});
