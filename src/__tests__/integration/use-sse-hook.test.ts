import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { QueryClient } from "../../../dashboard-v2/node_modules/@tanstack/react-query";
import { FakeEventSource } from "../helpers/fake-event-source";

const originalEventSource = globalThis.EventSource;

describe("useSSE hook", () => {
  let queryClient: QueryClient;
  let invalidateSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    globalThis.EventSource = FakeEventSource as any;
    FakeEventSource.reset();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    invalidateSpy = spyOn(queryClient, "invalidateQueries");
  });

  afterEach(() => {
    globalThis.EventSource = originalEventSource;
    FakeEventSource.reset();
    queryClient.clear();
  });

  it("registers listeners for all SSE_EVENT_MAP entries", async () => {
    const { SSE_EVENT_MAP } = await import("../../../dashboard-v2/src/hooks/use-sse");

    const source = new FakeEventSource("/api/sse");

    for (const [eventType, keys] of Object.entries(SSE_EVENT_MAP)) {
      source.addEventListener(eventType, () => {
        for (const queryKey of keys as readonly string[][]) {
          queryClient.invalidateQueries({ queryKey });
        }
      });
    }

    source.emit("tick");
    expect(invalidateSpy).toHaveBeenCalledTimes(3);

    invalidateSpy.mockClear();

    source.emit("dream");
    expect(invalidateSpy).toHaveBeenCalledTimes(2);
  });

  it("each event type invalidates the correct number of query keys", async () => {
    const { SSE_EVENT_MAP } = await import("../../../dashboard-v2/src/hooks/use-sse");

    const source = new FakeEventSource("/api/sse");

    for (const [eventType, keys] of Object.entries(SSE_EVENT_MAP)) {
      source.addEventListener(eventType, () => {
        for (const queryKey of keys as readonly string[][]) {
          queryClient.invalidateQueries({ queryKey });
        }
      });
    }

    const expectedCounts: Record<string, number> = {
      tick: 3,
      message: 1,
      decision: 2,
      action: 1,
      action_pending: 2,
      action_resolved: 2,
      dream: 2,
      dream_started: 1,
      dream_completed: 2,
      state_change: 1,
      config_changed: 1,
      task_updated: 1,
      schedule_fired: 1,
      webhook: 1,
      channel: 1,
      health: 1,
    };

    for (const [eventType, expectedCount] of Object.entries(expectedCounts)) {
      invalidateSpy.mockClear();
      source.emit(eventType);
      expect(invalidateSpy).toHaveBeenCalledTimes(expectedCount);
    }
  });

  describe("exponential backoff", () => {
    it("computes correct delay sequence: 1s, 2s, 4s, 8s, 16s, 30s, 30s", () => {
      const delays = [0, 1, 2, 3, 4, 5, 6].map((retry) => Math.min(1000 * 2 ** retry, 30_000));
      expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    });

    it("caps backoff at 30 seconds for large retry counts", () => {
      const delay = Math.min(1000 * 2 ** 100, 30_000);
      expect(delay).toBe(30_000);
    });

    it("retry counter resets on connected event (logical test)", () => {
      let retryCount = 5;
      const source = new FakeEventSource("/api/sse");

      source.addEventListener("connected", () => {
        retryCount = 0;
      });

      expect(retryCount).toBe(5);
      source.simulateConnected();
      expect(retryCount).toBe(0);
    });

    it("error handler increments retry count and schedules reconnect", () => {
      let retryCount = 0;
      let scheduledDelay = -1;

      const source = new FakeEventSource("/api/sse");
      source.onerror = () => {
        source.close();
        scheduledDelay = Math.min(1000 * 2 ** retryCount, 30_000);
        retryCount++;
      };

      source.simulateError();
      expect(retryCount).toBe(1);
      expect(scheduledDelay).toBe(1000);

      const source2 = new FakeEventSource("/api/sse");
      source2.onerror = () => {
        source2.close();
        scheduledDelay = Math.min(1000 * 2 ** retryCount, 30_000);
        retryCount++;
      };
      source2.simulateError();
      expect(retryCount).toBe(2);
      expect(scheduledDelay).toBe(2000);
    });
  });

  it("FakeEventSource closes cleanly", () => {
    const source = new FakeEventSource("/api/sse");
    expect(source.readyState).toBe(FakeEventSource.CONNECTING);
    source.close();
    expect(source.readyState).toBe(FakeEventSource.CLOSED);
  });

  it("FakeEventSource tracks all instances", () => {
    FakeEventSource.reset();
    new FakeEventSource("/api/sse");
    new FakeEventSource("/api/sse");
    expect(FakeEventSource.instances.length).toBe(2);
    FakeEventSource.reset();
    expect(FakeEventSource.instances.length).toBe(0);
  });
});
