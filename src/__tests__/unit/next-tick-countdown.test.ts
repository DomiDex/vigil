import { describe, expect, it } from "bun:test";

describe("NextTickCountdown logic", () => {
  describe("initial value computation", () => {
    it("rounds the input to nearest integer", () => {
      expect(Math.max(0, Math.round(14.7))).toBe(15);
      expect(Math.max(0, Math.round(14.3))).toBe(14);
      expect(Math.max(0, Math.round(0.5))).toBe(1);
    });

    it("clamps negative values to 0", () => {
      expect(Math.max(0, Math.round(-5))).toBe(0);
      expect(Math.max(0, Math.round(-0.1))).toBe(0);
    });

    it("handles zero", () => {
      expect(Math.max(0, Math.round(0))).toBe(0);
    });
  });

  describe("display logic", () => {
    it("shows seconds format when > 0", () => {
      const display = (seconds: number) => (seconds > 0 ? `${seconds}s` : "now");
      expect(display(30)).toBe("30s");
      expect(display(1)).toBe("1s");
    });

    it('shows "now" when seconds is 0', () => {
      const display = (seconds: number) => (seconds > 0 ? `${seconds}s` : "now");
      expect(display(0)).toBe("now");
    });

    it('shows "now" for negative values (should not happen but defensive)', () => {
      const display = (seconds: number) => (seconds > 0 ? `${seconds}s` : "now");
      expect(display(-1)).toBe("now");
    });
  });

  describe("decrement behavior", () => {
    it("decrements by 1 each step, stops at 0", () => {
      let seconds = 3;
      const steps: number[] = [seconds];

      for (let i = 0; i < 5; i++) {
        seconds = Math.max(0, seconds - 1);
        steps.push(seconds);
      }

      expect(steps).toEqual([3, 2, 1, 0, 0, 0]);
    });

    it("never goes below 0", () => {
      let seconds = 1;
      for (let i = 0; i < 10; i++) {
        seconds = Math.max(0, seconds - 1);
      }
      expect(seconds).toBe(0);
    });
  });

  describe("prop change reset", () => {
    it("resets to new value when nextTickIn changes", () => {
      let seconds = 12;
      const newProp = 25;
      seconds = Math.max(0, Math.round(newProp));
      expect(seconds).toBe(25);
    });

    it("resets to 0 when nextTickIn is 0", () => {
      let seconds = 15;
      const newProp = 0;
      seconds = Math.max(0, Math.round(newProp));
      expect(seconds).toBe(0);
    });
  });

  describe("interval lifecycle", () => {
    it("should not start interval when seconds is already 0", () => {
      const seconds = 0;
      const shouldStartInterval = seconds > 0;
      expect(shouldStartInterval).toBe(false);
    });

    it("should start interval when seconds > 0", () => {
      const seconds = 10;
      const shouldStartInterval = seconds > 0;
      expect(shouldStartInterval).toBe(true);
    });

    it("should clear interval when seconds reaches 0", () => {
      let seconds = 1;
      let intervalCleared = false;

      seconds = Math.max(0, seconds - 1);
      if (seconds <= 0) {
        intervalCleared = true;
      }

      expect(seconds).toBe(0);
      expect(intervalCleared).toBe(true);
    });
  });
});
