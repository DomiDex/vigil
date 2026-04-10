import { describe, expect, it } from "bun:test";
import { AdaptiveSleep } from "../../core/adaptive-sleep.ts";

describe("AdaptiveSleep", () => {
  describe("getNextInterval", () => {
    it("returns maxTick when idle (no recent activity)", () => {
      const sleep = new AdaptiveSleep({
        baseTick: 60,
        minTick: 15,
        maxTick: 300,
        cacheExpiryMs: 5 * 60 * 1000,
      });

      // maxTick (300) is capped by cacheExpiry (300s) — returns 300
      expect(sleep.getNextInterval()).toBe(300);
    });

    it("returns minTick when highly active (5+ events)", () => {
      const sleep = new AdaptiveSleep({
        baseTick: 60,
        minTick: 15,
        maxTick: 300,
        cacheExpiryMs: 5 * 60 * 1000,
      });

      for (let i = 0; i < 6; i++) sleep.recordActivity();
      expect(sleep.getNextInterval()).toBe(15);
    });

    it("returns baseTick for 1 event", () => {
      const sleep = new AdaptiveSleep({
        baseTick: 60,
        minTick: 15,
        maxTick: 300,
        cacheExpiryMs: 5 * 60 * 1000,
      });

      sleep.recordActivity();
      // ratio = 1/5 = 0.2, interval = 60 - 0.2 * (60 - 15) = 60 - 9 = 51
      expect(sleep.getNextInterval()).toBe(51);
    });

    it("interpolates linearly for moderate activity", () => {
      const sleep = new AdaptiveSleep({
        baseTick: 60,
        minTick: 10,
        maxTick: 300,
        cacheExpiryMs: 5 * 60 * 1000,
      });

      // 3 events: ratio = 3/5 = 0.6, interval = 60 - 0.6 * (60 - 10) = 60 - 30 = 30
      for (let i = 0; i < 3; i++) sleep.recordActivity();
      expect(sleep.getNextInterval()).toBe(30);
    });

    it("caps interval at cache expiry", () => {
      const sleep = new AdaptiveSleep({
        baseTick: 60,
        minTick: 15,
        maxTick: 600, // 10 min — exceeds cache expiry
        cacheExpiryMs: 2 * 60 * 1000, // 2 min cache
      });

      // Idle → maxTick=600s but capped at cacheExpiry=120s
      expect(sleep.getNextInterval()).toBe(120);
    });

    it("prunes old events outside history window", () => {
      const sleep = new AdaptiveSleep({
        baseTick: 60,
        minTick: 15,
        maxTick: 300,
        cacheExpiryMs: 5 * 60 * 1000,
      });

      // Manually inject old timestamps by accessing internals
      // (historyWindow is 10 min = 600_000ms)
      const oldTime = Date.now() - 15 * 60 * 1000; // 15 min ago
      (sleep as any).activityHistory = [oldTime, oldTime, oldTime, oldTime, oldTime];

      // Old events should be pruned → idle → maxTick
      expect(sleep.getNextInterval()).toBe(300);
    });
  });

  describe("recordActivity", () => {
    it("increments recent activity count", () => {
      const sleep = new AdaptiveSleep();
      expect(sleep.recentActivityCount).toBe(0);
      sleep.recordActivity();
      expect(sleep.recentActivityCount).toBe(1);
      sleep.recordActivity();
      expect(sleep.recentActivityCount).toBe(2);
    });
  });

  describe("formatTickPrompt", () => {
    it("formats heartbeat prompt", () => {
      const sleep = new AdaptiveSleep();
      const prompt = sleep.formatTickPrompt({
        signals: [],
        timeSinceLastTick: 60_000,
        isHeartbeat: true,
      });

      expect(prompt).toContain("<tick timestamp=");
      expect(prompt).toContain("Heartbeat");
      expect(prompt).toContain("60s since last check");
      expect(prompt).toContain("No new signals");
      expect(prompt).toContain("</tick>");
    });

    it("formats signal-driven prompt", () => {
      const sleep = new AdaptiveSleep();
      const prompt = sleep.formatTickPrompt({
        signals: [
          { type: "new_commit", description: "Commit abc on main" },
          { type: "file_change", description: "Modified README.md" },
        ],
        timeSinceLastTick: 30_000,
        isHeartbeat: false,
      });

      expect(prompt).toContain("<tick timestamp=");
      expect(prompt).toContain("2 signal(s) since last tick:");
      expect(prompt).toContain("[new_commit] Commit abc on main");
      expect(prompt).toContain("[file_change] Modified README.md");
      expect(prompt).toContain("</tick>");
    });

    it("handles empty signals in non-heartbeat mode", () => {
      const sleep = new AdaptiveSleep();
      const prompt = sleep.formatTickPrompt({
        signals: [],
        timeSinceLastTick: 5_000,
        isHeartbeat: false,
      });

      expect(prompt).toContain("0 signal(s) since last tick:");
    });
  });

  describe("default config", () => {
    it("uses sensible defaults", () => {
      const sleep = new AdaptiveSleep();
      // Idle interval should be 300s (maxTick) capped at 300s (cacheExpiry)
      expect(sleep.getNextInterval()).toBe(300);

      // After 5+ events → minTick of 15s
      for (let i = 0; i < 5; i++) sleep.recordActivity();
      expect(sleep.getNextInterval()).toBe(15);
    });
  });
});
