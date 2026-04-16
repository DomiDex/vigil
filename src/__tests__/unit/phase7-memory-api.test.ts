import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VectorStore } from "../../memory/store.ts";
import type { MemoryEntry } from "../../memory/store.ts";
import { z } from "zod";

let tmpDir: string;
let store: VectorStore;

function makeEntry(overrides?: Partial<MemoryEntry>): MemoryEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    repo: "test-repo",
    type: "insight",
    content: "Test memory content about git patterns",
    metadata: {},
    confidence: 0.5,
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "vigil-p7-test-"));
  store = new VectorStore(join(tmpDir, "vigil.db"));
  store.init();
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// --- Zod schemas (same as will be used in API route) ---

const createMemorySchema = z.object({
  content: z.string().min(1).max(5000),
  repo: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const relevanceSchema = z.object({
  relevant: z.boolean(),
});

// --- VectorStore.delete() ---

describe("Phase 7: VectorStore.delete()", () => {
  test("deletes an entry by id", () => {
    const id = crypto.randomUUID();
    store.store(makeEntry({ id, content: "Temporary memory to delete" }));

    const before = store.getByRepo("test-repo");
    expect(before.length).toBe(1);

    const result = store.delete(id);
    expect(result).toBe(true);

    const after = store.getByRepo("test-repo");
    expect(after.length).toBe(0);
  });

  test("deleted entry is no longer searchable via FTS5", () => {
    const id = crypto.randomUUID();
    store.store(makeEntry({ id, content: "Searchable content that will be removed" }));

    expect(store.search("Searchable content").length).toBe(1);

    store.delete(id);

    expect(store.search("Searchable content").length).toBe(0);
  });

  test("returns false for non-existent id", () => {
    const result = store.delete("non-existent-id");
    expect(result).toBe(false);
  });

  test("double delete returns false on second call", () => {
    const id = crypto.randomUUID();
    store.store(makeEntry({ id }));

    expect(store.delete(id)).toBe(true);
    expect(store.delete(id)).toBe(false);
  });
});

// --- VectorStore.updateRelevance() ---

describe("Phase 7: VectorStore.updateRelevance()", () => {
  test("relevant=true boosts confidence score", () => {
    const id = crypto.randomUUID();
    store.store(makeEntry({ id, confidence: 0.5 }));

    store.updateRelevance(id, true);

    const results = store.getByRepo("test-repo");
    expect(results[0].confidence).toBeGreaterThan(0.5);
  });

  test("relevant=true caps confidence at 1.0", () => {
    const id = crypto.randomUUID();
    store.store(makeEntry({ id, confidence: 0.95 }));

    store.updateRelevance(id, true);

    const results = store.getByRepo("test-repo");
    expect(results[0].confidence).toBeLessThanOrEqual(1.0);
  });

  test("relevant=false deletes the entry", () => {
    const id = crypto.randomUUID();
    store.store(makeEntry({ id, content: "Outdated content to remove" }));

    store.updateRelevance(id, false);

    const results = store.getByRepo("test-repo");
    expect(results.length).toBe(0);
  });

  test("relevant=false removes entry from FTS5", () => {
    const id = crypto.randomUUID();
    store.store(makeEntry({ id, content: "Outdated searchable entry" }));

    store.updateRelevance(id, false);

    expect(store.search("Outdated searchable").length).toBe(0);
  });
});

// --- Zod validation: createMemorySchema ---

describe("Phase 7: Zod validation — createMemorySchema", () => {
  test("accepts valid content with repo and tags", () => {
    const result = createMemorySchema.safeParse({
      content: "Valid memory content",
      repo: "vigil",
      tags: ["git", "monitoring"],
    });
    expect(result.success).toBe(true);
  });

  test("accepts content-only (repo and tags optional)", () => {
    const result = createMemorySchema.safeParse({
      content: "Minimal memory",
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty content", () => {
    const result = createMemorySchema.safeParse({
      content: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects content exceeding 5000 chars", () => {
    const result = createMemorySchema.safeParse({
      content: "x".repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  test("rejects non-string tags", () => {
    const result = createMemorySchema.safeParse({
      content: "Valid content",
      tags: [123, true],
    });
    expect(result.success).toBe(false);
  });

  test("accepts empty tags array", () => {
    const result = createMemorySchema.safeParse({
      content: "Valid content",
      tags: [],
    });
    expect(result.success).toBe(true);
  });
});

// --- Zod validation: relevanceSchema ---

describe("Phase 7: Zod validation — relevanceSchema", () => {
  test("accepts { relevant: true }", () => {
    const result = relevanceSchema.safeParse({ relevant: true });
    expect(result.success).toBe(true);
  });

  test("accepts { relevant: false }", () => {
    const result = relevanceSchema.safeParse({ relevant: false });
    expect(result.success).toBe(true);
  });

  test("rejects non-boolean relevant", () => {
    const result = relevanceSchema.safeParse({ relevant: "yes" });
    expect(result.success).toBe(false);
  });

  test("rejects missing relevant field", () => {
    const result = relevanceSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
