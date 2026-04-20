import { describe, expect, it } from "bun:test";
import { SSEManager, wireSSE } from "../../dashboard/api/sse.ts";
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context.ts";

/**
 * Phase 6 introduced three specialist SSE broadcasts:
 *   specialist_finding  → broadcast "specialist_finding"
 *   specialist_run      → broadcast "specialist_run"
 *   specialist_flaky_update → broadcast "flaky_update"
 *
 * Today's sa-phase6-specialists-api test only source-scans sse.ts for the
 * literal strings. This test calls wireSSE with a mock emitter and verifies
 * that firing each daemon event produces the correct SSE broadcast name +
 * payload, so a refactor that drops a listener is caught by CI.
 */
describe("wireSSE specialist events", () => {
  function setup() {
    const ctx = createFakeDashboardContext();
    const listeners = new Map<string, (data: unknown) => void>();
    (ctx.daemon as any).on = (event: string, cb: (data: unknown) => void) => {
      listeners.set(event, cb);
    };

    const sse = new SSEManager();
    const broadcasts: Array<{ event: string; data: unknown }> = [];
    sse.broadcast = (event: string, data: unknown) => {
      broadcasts.push({ event, data });
    };

    wireSSE(sse, ctx);

    return { listeners, broadcasts };
  }

  it("registers specialist_finding / specialist_run / specialist_flaky_update listeners", () => {
    const { listeners } = setup();
    expect(listeners.has("specialist_finding")).toBe(true);
    expect(listeners.has("specialist_run")).toBe(true);
    expect(listeners.has("specialist_flaky_update")).toBe(true);
  });

  it("rebroadcasts specialist_finding with same payload", () => {
    const { listeners, broadcasts } = setup();
    const payload = { id: "f_001", severity: "critical" };
    listeners.get("specialist_finding")!(payload);
    const hit = broadcasts.find((b) => b.event === "specialist_finding");
    expect(hit).toBeDefined();
    expect(hit!.data).toEqual(payload);
  });

  it("rebroadcasts specialist_run as 'specialist_run'", () => {
    const { listeners, broadcasts } = setup();
    const payload = { runId: "r_001", specialist: "security" };
    listeners.get("specialist_run")!(payload);
    expect(broadcasts.some((b) => b.event === "specialist_run" && b.data === payload)).toBe(true);
  });

  it("rebroadcasts specialist_flaky_update under the 'flaky_update' event name", () => {
    const { listeners, broadcasts } = setup();
    const payload = { repo: "vigil", testName: "foo" };
    listeners.get("specialist_flaky_update")!(payload);
    const hit = broadcasts.find((b) => b.event === "flaky_update");
    expect(hit).toBeDefined();
    expect(hit!.data).toEqual(payload);
  });

  it("does not throw when daemon has no .on() (Phase 3 gap guard)", () => {
    const ctx = createFakeDashboardContext();
    // No .on() on daemon.
    expect((ctx.daemon as any).on).toBeUndefined();
    const sse = new SSEManager();
    expect(() => wireSSE(sse, ctx)).not.toThrow();
  });
});
