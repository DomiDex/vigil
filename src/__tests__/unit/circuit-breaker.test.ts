import { describe, expect, it } from "bun:test";
import { CircuitBreaker } from "../../core/circuit-breaker.ts";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("CircuitBreaker", () => {
  describe("initial state", () => {
    it("starts CLOSED", () => {
      const cb = new CircuitBreaker();
      expect(cb.getState()).toBe("CLOSED");
    });

    it("allows calls when CLOSED", () => {
      const cb = new CircuitBreaker();
      expect(cb.canCall()).toBe(true);
    });

    it("starts with zero failure count", () => {
      const cb = new CircuitBreaker();
      expect(cb.getFailureCount()).toBe(0);
    });
  });

  describe("failure tracking", () => {
    it("increments failure count", () => {
      const cb = new CircuitBreaker({ failureThreshold: 5 });
      cb.recordFailure();
      expect(cb.getFailureCount()).toBe(1);
      cb.recordFailure();
      expect(cb.getFailureCount()).toBe(2);
    });

    it("opens after threshold failures", () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 });
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.canCall()).toBe(true);
      cb.recordFailure();
      expect(cb.getState()).toBe("OPEN");
      expect(cb.canCall()).toBe(false);
    });

    it("opens exactly at threshold", () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 });
      cb.recordFailure();
      expect(cb.getState()).toBe("OPEN");
    });

    it("resets failure count on success", () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 });
      cb.recordFailure();
      cb.recordFailure();
      cb.recordSuccess();
      expect(cb.getFailureCount()).toBe(0);
      cb.recordFailure();
      expect(cb.getState()).toBe("CLOSED");
    });
  });

  describe("OPEN → HALF_OPEN transition", () => {
    it("blocks calls while OPEN", () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 5000 });
      cb.recordFailure();
      expect(cb.canCall()).toBe(false);
    });

    it("transitions to HALF_OPEN after timeout", async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 50 });
      cb.recordFailure();
      expect(cb.canCall()).toBe(false);
      await wait(60);
      expect(cb.canCall()).toBe(true);
      expect(cb.getState()).toBe("HALF_OPEN");
    });

    it("stays OPEN before timeout expires", async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 200 });
      cb.recordFailure();
      await wait(50);
      expect(cb.canCall()).toBe(false);
      expect(cb.getState()).toBe("OPEN");
    });
  });

  describe("HALF_OPEN recovery", () => {
    it("closes on success after HALF_OPEN", async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 50 });
      cb.recordFailure();
      await wait(60);
      cb.canCall(); // triggers HALF_OPEN
      cb.recordSuccess();
      expect(cb.getState()).toBe("CLOSED");
      expect(cb.getFailureCount()).toBe(0);
    });

    it("reopens on failure during HALF_OPEN", async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 50 });
      cb.recordFailure();
      await wait(60);
      cb.canCall(); // triggers HALF_OPEN
      cb.recordFailure();
      expect(cb.getState()).toBe("OPEN");
    });
  });

  describe("reset", () => {
    it("resets to initial CLOSED state", () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 });
      cb.recordFailure();
      expect(cb.getState()).toBe("OPEN");
      cb.reset();
      expect(cb.getState()).toBe("CLOSED");
      expect(cb.getFailureCount()).toBe(0);
      expect(cb.canCall()).toBe(true);
    });
  });

  describe("custom config", () => {
    it("uses default config when none provided", () => {
      const cb = new CircuitBreaker();
      // Default threshold is 3
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe("CLOSED");
      cb.recordFailure();
      expect(cb.getState()).toBe("OPEN");
    });

    it("accepts partial config override", () => {
      const cb = new CircuitBreaker({ failureThreshold: 5 });
      for (let i = 0; i < 4; i++) cb.recordFailure();
      expect(cb.getState()).toBe("CLOSED");
      cb.recordFailure();
      expect(cb.getState()).toBe("OPEN");
    });
  });
});
