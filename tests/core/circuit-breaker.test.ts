import { describe, test, expect } from "bun:test";
import { CircuitBreaker } from "../../src/core/circuit-breaker.ts";

describe("CircuitBreaker", () => {
  test("starts in CLOSED state", () => {
    const cb = new CircuitBreaker();
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.getFailureCount()).toBe(0);
    expect(cb.canCall()).toBe(true);
  });

  test("stays CLOSED below failure threshold", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.canCall()).toBe(true);
  });

  test("opens after reaching failure threshold", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("OPEN");
    expect(cb.canCall()).toBe(false);
  });

  test("success resets failure count", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    expect(cb.getFailureCount()).toBe(0);
    expect(cb.getState()).toBe("CLOSED");
  });

  test("transitions to HALF_OPEN after reset timeout", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 50,
    });
    cb.recordFailure();
    expect(cb.getState()).toBe("OPEN");
    expect(cb.canCall()).toBe(false);

    await Bun.sleep(60);
    expect(cb.canCall()).toBe(true);
    expect(cb.getState()).toBe("HALF_OPEN");
  });

  test("HALF_OPEN returns to CLOSED on success", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 50,
    });
    cb.recordFailure();
    await Bun.sleep(60);
    cb.canCall(); // triggers HALF_OPEN
    cb.recordSuccess();
    expect(cb.getState()).toBe("CLOSED");
  });

  test("HALF_OPEN returns to OPEN on failure", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 50,
    });
    cb.recordFailure();
    await Bun.sleep(60);
    cb.canCall(); // triggers HALF_OPEN
    cb.recordFailure();
    expect(cb.getState()).toBe("OPEN");
  });

  test("reset returns to initial state", () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    cb.recordFailure();
    expect(cb.getState()).toBe("OPEN");
    cb.reset();
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.getFailureCount()).toBe(0);
  });

  test("uses default config when none provided", () => {
    const cb = new CircuitBreaker();
    // Default threshold is 3
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("CLOSED");
    cb.recordFailure();
    expect(cb.getState()).toBe("OPEN");
  });

  test("partial config merges with defaults", () => {
    const cb = new CircuitBreaker({ failureThreshold: 5 });
    for (let i = 0; i < 4; i++) cb.recordFailure();
    expect(cb.getState()).toBe("CLOSED");
    cb.recordFailure();
    expect(cb.getState()).toBe("OPEN");
  });
});
