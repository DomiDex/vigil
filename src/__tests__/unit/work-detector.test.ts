import { describe, expect, it } from "bun:test";
import { WorkDetector, type WorkSignal } from "../../core/work-detector.ts";

function makeSignal(overrides: Partial<WorkSignal> = {}): WorkSignal {
  return {
    type: "new_commit",
    weight: 0.5,
    description: "test signal",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("WorkDetector", () => {
  describe("shouldAnalyze", () => {
    it("returns null when no signals and silence not exceeded", () => {
      const detector = new WorkDetector({ maxSilenceMs: 60_000 });
      expect(detector.shouldAnalyze()).toBeNull();
    });

    it("triggers on critical signal (weight >= 0.9)", () => {
      const detector = new WorkDetector();
      detector.addSignal(makeSignal({ type: "rebase_detected", weight: 0.95 }));

      const result = detector.shouldAnalyze();
      expect(result).not.toBeNull();
      expect(result!.reason).toBe("critical_signal");
      expect(result!.signals.length).toBe(1);
    });

    it("triggers when accumulated weight exceeds threshold", () => {
      const detector = new WorkDetector({ triggerThreshold: 0.5 });
      detector.addSignal(makeSignal({ weight: 0.3 }));
      detector.addSignal(makeSignal({ weight: 0.3 }));

      const result = detector.shouldAnalyze();
      expect(result).not.toBeNull();
      expect(result!.reason).toBe("threshold_exceeded");
    });

    it("does not trigger when weight is below threshold", () => {
      const detector = new WorkDetector({ triggerThreshold: 0.5, maxSilenceMs: 999_999 });
      detector.addSignal(makeSignal({ weight: 0.2 }));

      expect(detector.shouldAnalyze()).toBeNull();
    });

    it("triggers heartbeat after max silence", () => {
      const detector = new WorkDetector({ maxSilenceMs: 10 });
      // Backdate the lastLLMCallAt so silence is exceeded
      (detector as any).lastLLMCallAt = Date.now() - 50;

      const result = detector.shouldAnalyze();
      expect(result).not.toBeNull();
      expect(result!.reason).toBe("heartbeat");
    });

    it("consumes signals after triggering", () => {
      const detector = new WorkDetector({ triggerThreshold: 0.5, maxSilenceMs: 999_999 });
      detector.addSignal(makeSignal({ weight: 0.6 }));

      expect(detector.shouldAnalyze()).not.toBeNull();
      // After consuming, no signals left — should return null
      expect(detector.shouldAnalyze()).toBeNull();
    });

    it("applies time decay to old signals", () => {
      const detector = new WorkDetector({
        triggerThreshold: 0.5,
        decayRatePerSec: 10, // Very aggressive decay
        maxSilenceMs: 999_999,
      });
      // Signal from 1 second ago with moderate weight
      detector.addSignal(makeSignal({ weight: 0.6, timestamp: Date.now() - 1000 }));

      // With aggressive decay, the signal should have decayed below threshold
      expect(detector.shouldAnalyze()).toBeNull();
    });

    it("prunes negligible signals (weight < 0.01)", () => {
      const detector = new WorkDetector({
        triggerThreshold: 0.001,
        decayRatePerSec: 100,
        maxSilenceMs: 999_999,
      });
      // Very old signal that should decay to near zero
      detector.addSignal(makeSignal({ weight: 0.1, timestamp: Date.now() - 5000 }));

      expect(detector.shouldAnalyze()).toBeNull();
    });

    it("heartbeat returns accumulated signals", () => {
      const detector = new WorkDetector({
        triggerThreshold: 999, // Won't hit threshold
        maxSilenceMs: 10,
      });
      (detector as any).lastLLMCallAt = Date.now() - 50;
      detector.addSignal(makeSignal({ weight: 0.3 }));

      const result = detector.shouldAnalyze();
      expect(result).not.toBeNull();
      expect(result!.reason).toBe("heartbeat");
      expect(result!.signals.length).toBeGreaterThan(0);
    });

    it("heartbeat with no signals returns empty array", () => {
      const detector = new WorkDetector({ maxSilenceMs: 10 });
      (detector as any).lastLLMCallAt = Date.now() - 50;

      const result = detector.shouldAnalyze();
      expect(result).not.toBeNull();
      expect(result!.reason).toBe("heartbeat");
      expect(result!.signals).toEqual([]);
    });
  });

  describe("addSignal", () => {
    it("increments pending signal count", () => {
      const detector = new WorkDetector();
      expect(detector.pendingSignals).toBe(0);
      detector.addSignal(makeSignal());
      expect(detector.pendingSignals).toBe(1);
      detector.addSignal(makeSignal());
      expect(detector.pendingSignals).toBe(2);
    });
  });

  describe("recordLLMCall", () => {
    it("resets the silence timer", () => {
      const detector = new WorkDetector({ maxSilenceMs: 50 });
      // Record an LLM call to reset the timer
      detector.recordLLMCall();
      // Should not trigger heartbeat yet
      expect(detector.shouldAnalyze()).toBeNull();
    });
  });

  describe("critical signal priority", () => {
    it("critical signal triggers even with low total weight", () => {
      const detector = new WorkDetector({
        triggerThreshold: 10, // Very high threshold
        maxSilenceMs: 999_999,
      });
      detector.addSignal(makeSignal({ weight: 0.95 })); // Critical

      const result = detector.shouldAnalyze();
      expect(result).not.toBeNull();
      expect(result!.reason).toBe("critical_signal");
    });

    it("returns only critical signals in critical_signal result", () => {
      const detector = new WorkDetector({
        triggerThreshold: 10,
        maxSilenceMs: 999_999,
      });
      detector.addSignal(makeSignal({ weight: 0.3, description: "minor" }));
      detector.addSignal(makeSignal({ weight: 0.95, description: "critical" }));

      const result = detector.shouldAnalyze();
      expect(result!.reason).toBe("critical_signal");
      expect(result!.signals.every((s) => s.weight >= 0.9)).toBe(true);
    });
  });
});
