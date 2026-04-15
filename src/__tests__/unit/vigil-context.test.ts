import { describe, test, expect, beforeEach } from "bun:test";
import {
  setVigilContext,
  getVigilContext,
} from "../../../dashboard-v2/src/server/vigil-context";

describe("vigil-context singleton", () => {
  beforeEach(() => {
    // Reset via globalThis directly — no test hook in production code
    globalThis.__vigil_ctx__ = null;
  });

  test("throws when context not initialized", () => {
    expect(() => getVigilContext()).toThrow("Vigil context not initialized");
  });

  test("returns context after initialization", () => {
    const mockCtx = {
      daemon: {
        repoPaths: ["/tmp/test-repo"],
        tickEngine: { currentTick: 42, isSleeping: false },
      },
      sse: { broadcast: () => {}, clientCount: 0, connect: () => new Response() },
    } as any;

    setVigilContext(mockCtx);
    const result = getVigilContext();

    expect(result).toBe(mockCtx);
    expect(result.daemon.repoPaths).toHaveLength(1);
    expect(result.daemon.tickEngine.currentTick).toBe(42);
  });

  test("overwrites previous context on re-set", () => {
    const ctx1 = { daemon: { repoPaths: ["/a"] }, sse: {} } as any;
    const ctx2 = { daemon: { repoPaths: ["/b", "/c"] }, sse: {} } as any;

    setVigilContext(ctx1);
    expect(getVigilContext().daemon.repoPaths).toHaveLength(1);

    setVigilContext(ctx2);
    expect(getVigilContext().daemon.repoPaths).toHaveLength(2);
    expect(getVigilContext()).toBe(ctx2);
  });
});
