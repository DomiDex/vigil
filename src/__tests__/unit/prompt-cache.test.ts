import { describe, expect, it } from "bun:test";
import { PromptCache } from "../../prompts/cache.ts";

describe("PromptCache", () => {
  it("returns cached content within TTL", async () => {
    const cache = new PromptCache();
    let callCount = 0;
    const compute = () => {
      callCount++;
      return "result";
    };

    const first = await cache.getSection("key", "stable", compute);
    const second = await cache.getSection("key", "stable", compute);

    expect(first).toBe("result");
    expect(second).toBe("result");
    expect(callCount).toBe(1); // compute called only once
  });

  it("never caches ephemeral sections", async () => {
    const cache = new PromptCache();
    let callCount = 0;
    const compute = () => {
      callCount++;
      return `call-${callCount}`;
    };

    const first = await cache.getSection("key", "ephemeral", compute);
    const second = await cache.getSection("key", "ephemeral", compute);

    expect(first).toBe("call-1");
    expect(second).toBe("call-2");
    expect(callCount).toBe(2);
  });

  it("invalidates a specific key", async () => {
    const cache = new PromptCache();
    let callCount = 0;

    await cache.getSection("a", "stable", () => {
      callCount++;
      return `v${callCount}`;
    });
    expect(callCount).toBe(1);

    cache.invalidate("a");

    const result = await cache.getSection("a", "stable", () => {
      callCount++;
      return `v${callCount}`;
    });
    expect(result).toBe("v2");
    expect(callCount).toBe(2);
  });

  it("invalidates all sections of a scope", async () => {
    const cache = new PromptCache();
    await cache.getSection("s1", "session", () => "session1");
    await cache.getSection("s2", "session", () => "session2");
    await cache.getSection("st", "stable", () => "stable1");

    cache.invalidateScope("session");

    const stats = cache.getStats();
    expect(stats.size).toBe(1);
    expect(stats.byScope.session).toBe(0);
    expect(stats.byScope.stable).toBe(1);
  });

  it("invalidateAll clears everything", async () => {
    const cache = new PromptCache();
    await cache.getSection("a", "stable", () => "a");
    await cache.getSection("b", "session", () => "b");

    cache.invalidateAll();

    const stats = cache.getStats();
    expect(stats.size).toBe(0);
  });

  it("handles async compute functions", async () => {
    const cache = new PromptCache();
    const result = await cache.getSection("async", "stable", async () => {
      return "async-result";
    });
    expect(result).toBe("async-result");
  });

  it("reports accurate stats", async () => {
    const cache = new PromptCache();
    await cache.getSection("a", "stable", () => "a");
    await cache.getSection("b", "session", () => "b");
    await cache.getSection("c", "ephemeral", () => "c"); // not cached

    const stats = cache.getStats();
    expect(stats.size).toBe(2);
    expect(stats.byScope.stable).toBe(1);
    expect(stats.byScope.session).toBe(1);
    expect(stats.byScope.ephemeral).toBe(0);
  });
});
