import { describe, expect, it } from "bun:test";
import { SSE_EVENT_MAP } from "../../../dashboard-v2/src/hooks/use-sse";

describe("SSE_EVENT_MAP", () => {
  it("maps tick to overview, repos.all, and timeline", () => {
    const keys = SSE_EVENT_MAP.tick;
    expect(keys).toBeDefined();
    expect(keys.length).toBe(3);
    const flatKeys = keys.map((k) => k[0]);
    expect(flatKeys).toContain("overview");
    expect(flatKeys).toContain("repos");
    expect(flatKeys).toContain("timeline");
  });

  it("maps dream to dreams and memory.stats", () => {
    const keys = SSE_EVENT_MAP.dream;
    expect(keys).toBeDefined();
    const flatKeys = keys.map((k) => k[0]);
    expect(flatKeys).toContain("dreams");
    expect(flatKeys).toContain("memory");
  });

  it("maps dream_completed to dreams and memory.stats", () => {
    const keys = SSE_EVENT_MAP.dream_completed;
    expect(keys).toBeDefined();
    expect(keys.length).toBe(2);
  });

  it("maps dream_started to dreams only", () => {
    const keys = SSE_EVENT_MAP.dream_started;
    expect(keys).toBeDefined();
    expect(keys.length).toBe(1);
  });

  it("maps action_pending to actions.pending and actions.all", () => {
    const keys = SSE_EVENT_MAP.action_pending;
    expect(keys).toBeDefined();
    expect(keys.length).toBe(2);
  });

  it("maps action_resolved to actions.all and actions.pending", () => {
    const keys = SSE_EVENT_MAP.action_resolved;
    expect(keys).toBeDefined();
    expect(keys.length).toBe(2);
  });

  it("maps state_change to overview only", () => {
    const keys = SSE_EVENT_MAP.state_change;
    expect(keys).toBeDefined();
    expect(keys.length).toBe(1);
  });

  it("maps config_changed to config", () => {
    const keys = SSE_EVENT_MAP.config_changed;
    expect(keys).toBeDefined();
    expect(keys.length).toBe(1);
  });

  it("maps task_updated to tasks", () => {
    const keys = SSE_EVENT_MAP.task_updated;
    expect(keys).toBeDefined();
    expect(keys.length).toBe(1);
  });

  it("maps message to timeline", () => {
    const keys = SSE_EVENT_MAP.message;
    expect(keys).toBeDefined();
    expect(keys.length).toBe(1);
  });

  it("maps decision to timeline and metrics", () => {
    const keys = SSE_EVENT_MAP.decision;
    expect(keys).toBeDefined();
    expect(keys.length).toBe(2);
  });

  it("maps schedule_fired to scheduler", () => {
    const keys = SSE_EVENT_MAP.schedule_fired;
    expect(keys).toBeDefined();
    expect(keys.length).toBe(1);
  });

  it("contains all 19 expected event types", () => {
    const expectedEvents = [
      "tick",
      "message",
      "decision",
      "action",
      "action_pending",
      "action_resolved",
      "dream",
      "dream_started",
      "dream_completed",
      "state_change",
      "config_changed",
      "task_updated",
      "schedule_fired",
      "webhook",
      "channel",
      "health",
      "specialist_finding",
      "specialist_run",
      "flaky_update",
    ];
    for (const event of expectedEvents) {
      expect(SSE_EVENT_MAP[event as keyof typeof SSE_EVENT_MAP]).toBeDefined();
    }
    expect(Object.keys(SSE_EVENT_MAP).length).toBe(expectedEvents.length);
  });
});
