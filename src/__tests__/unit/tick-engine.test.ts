import { afterEach, describe, expect, it, spyOn } from "bun:test";
import type { VigilConfig } from "../../core/config.ts";
import { TickEngine } from "../../core/tick-engine.ts";

function testConfig(overrides?: Partial<VigilConfig>): VigilConfig {
  return {
    tickInterval: 0.05,
    blockingBudget: 0.1,
    sleepAfter: 0.1,
    sleepTickInterval: 0.1,
    dreamAfter: 300,
    tickModel: "test",
    escalationModel: "test",
    maxEventWindow: 100,
    notifyBackends: ["file"],
    webhookUrl: "",
    desktopNotify: true,
    allowModerateActions: false,
    ...overrides,
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("TickEngine", () => {
  let engine: TickEngine;

  afterEach(() => {
    engine?.stop();
  });

  describe("tick scheduling", () => {
    it("fires handler at configured interval", async () => {
      engine = new TickEngine(testConfig({ tickInterval: 0.05 }));
      let called = 0;
      engine.onTick(async () => {
        called++;
      });
      engine.start();
      await wait(80);
      expect(called).toBeGreaterThanOrEqual(1);
    });

    it("passes incrementing tick number", async () => {
      engine = new TickEngine(testConfig({ tickInterval: 0.03 }));
      const ticks: number[] = [];
      engine.onTick(async (n) => {
        ticks.push(n);
      });
      engine.start();
      await wait(150);
      engine.stop();
      expect(ticks.length).toBeGreaterThanOrEqual(3);
      expect(ticks[0]).toBe(1);
      expect(ticks[1]).toBe(2);
      expect(ticks[2]).toBe(3);
    });

    it("passes isSleeping=false when awake", async () => {
      engine = new TickEngine(testConfig({ sleepAfter: 999 }));
      let sleeping: boolean | undefined;
      engine.onTick(async (_n, s) => {
        sleeping = s;
      });
      engine.start();
      await wait(80);
      expect(sleeping).toBe(false);
    });

    it("stop() prevents future ticks", async () => {
      engine = new TickEngine(testConfig({ tickInterval: 0.03 }));
      let called = 0;
      engine.onTick(async () => {
        called++;
      });
      engine.start();
      await wait(50);
      engine.stop();
      const count = called;
      await wait(100);
      expect(called).toBe(count);
    });

    it("start() is idempotent", async () => {
      engine = new TickEngine(testConfig({ tickInterval: 0.05 }));
      let called = 0;
      engine.onTick(async () => {
        called++;
      });
      engine.start();
      engine.start(); // second call should be noop
      await wait(80);
      engine.stop();
      // Should not have double-speed ticks
      expect(called).toBeLessThanOrEqual(3);
    });
  });

  describe("sleep/wake transitions", () => {
    it("enters sleep after idle threshold", async () => {
      engine = new TickEngine(testConfig({ sleepAfter: 0.05, tickInterval: 0.03 }));
      let _sleepFlag: boolean | undefined;
      engine.onTick(async (_n, s) => {
        _sleepFlag = s;
      });
      engine.start();
      // Wait enough for idle threshold to pass
      await wait(150);
      expect(engine.isSleeping).toBe(true);
    });

    it("uses sleepTickInterval when sleeping", async () => {
      engine = new TickEngine(
        testConfig({
          sleepAfter: 0.01,
          tickInterval: 0.02,
          sleepTickInterval: 0.08,
        }),
      );
      const tickTimes: number[] = [];
      engine.onTick(async () => {
        tickTimes.push(Date.now());
      });
      engine.start();
      await wait(300);
      engine.stop();
      // After entering sleep, gaps between ticks should be larger
      if (tickTimes.length >= 3) {
        const lastGap = tickTimes[tickTimes.length - 1] - tickTimes[tickTimes.length - 2];
        expect(lastGap).toBeGreaterThanOrEqual(50);
      }
    });

    it("reportActivity() wakes from sleep", async () => {
      engine = new TickEngine(testConfig({ sleepAfter: 0.01, tickInterval: 0.03 }));
      engine.onTick(async () => {});
      engine.start();
      await wait(100);
      expect(engine.isSleeping).toBe(true);
      engine.reportActivity();
      expect(engine.isSleeping).toBe(false);
    });

    it("reportActivity() updates lastActivity", async () => {
      engine = new TickEngine(testConfig({ sleepAfter: 0.5, tickInterval: 0.03 }));
      engine.onTick(async () => {});
      engine.start();
      await wait(50);
      engine.reportActivity();
      // Engine should not be sleeping since we just reported activity
      await wait(50);
      expect(engine.isSleeping).toBe(false);
    });

    it("multiple rapid reportActivity() calls cause no crash", async () => {
      engine = new TickEngine(testConfig({ sleepAfter: 0.01, tickInterval: 0.03 }));
      engine.onTick(async () => {});
      engine.start();
      await wait(80);
      for (let i = 0; i < 5; i++) {
        engine.reportActivity();
      }
      expect(engine.isSleeping).toBe(false);
      await wait(50);
      // Engine still runs fine
      expect(engine.currentTick).toBeGreaterThanOrEqual(1);
    });

    it("sleep flag set only once when crossing threshold twice", async () => {
      engine = new TickEngine(testConfig({ sleepAfter: 0.01, tickInterval: 0.03 }));
      let sleepCount = 0;
      let wasSleeping = false;
      engine.onTick(async (_n, s) => {
        if (s && !wasSleeping) sleepCount++;
        wasSleeping = s;
      });
      engine.start();
      await wait(200);
      engine.stop();
      expect(sleepCount).toBe(1);
    });
  });

  describe("blocking budget", () => {
    it("handler within budget completes normally", async () => {
      engine = new TickEngine(testConfig({ blockingBudget: 0.2, tickInterval: 0.05 }));
      let completed = false;
      engine.onTick(async () => {
        await wait(5);
        completed = true;
      });
      engine.start();
      await wait(100);
      expect(completed).toBe(true);
    });

    it("handler exceeding budget times out", async () => {
      engine = new TickEngine(testConfig({ blockingBudget: 0.03, tickInterval: 0.05 }));
      let errorFired = false;
      engine.onError((_tickNum, err) => {
        if (err.message.includes("blocking budget")) errorFired = true;
      });
      engine.onTick(async () => {
        await wait(200); // exceeds 30ms budget
      });
      engine.start();
      await wait(150);
      expect(errorFired).toBe(true);
    });

    it("handler rejection is caught", async () => {
      engine = new TickEngine(testConfig({ tickInterval: 0.05 }));
      const _secondCalled = false;
      engine.onTick(async () => {
        throw new Error("handler failure");
      });
      engine.start();
      await wait(80);
      // Engine should still be running (next tick fires)
      expect(engine.currentTick).toBeGreaterThanOrEqual(1);
    });

    it("slow handler does not block next tick", async () => {
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
      engine = new TickEngine(testConfig({ blockingBudget: 0.02, tickInterval: 0.04 }));
      const ticks: number[] = [];
      engine.onTick(async (n) => {
        ticks.push(n);
        if (n === 1) await wait(200); // only first tick is slow
      });
      engine.start();
      await wait(300);
      engine.stop();
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      consoleSpy.mockRestore();
    });
  });

  describe("pause/resume", () => {
    it("pause() stops ticks", async () => {
      engine = new TickEngine(testConfig({ tickInterval: 0.03 }));
      let called = 0;
      engine.onTick(async () => {
        called++;
      });
      engine.start();
      await wait(50);
      engine.pause();
      const count = called;
      await wait(100);
      expect(called).toBe(count);
    });

    it("resume() restarts ticks", async () => {
      engine = new TickEngine(testConfig({ tickInterval: 0.03 }));
      let called = 0;
      engine.onTick(async () => {
        called++;
      });
      engine.start();
      await wait(50);
      engine.pause();
      const count = called;
      engine.resume();
      await wait(100);
      expect(called).toBeGreaterThan(count);
    });

    it("pause() during sleep clears timer", async () => {
      engine = new TickEngine(testConfig({ sleepAfter: 0.01, tickInterval: 0.03 }));
      engine.onTick(async () => {});
      engine.start();
      await wait(80);
      expect(engine.isSleeping).toBe(true);
      engine.pause();
      const tick = engine.currentTick;
      await wait(100);
      expect(engine.currentTick).toBe(tick);
    });

    it("resume() after pause during sleep", async () => {
      engine = new TickEngine(testConfig({ sleepAfter: 0.01, tickInterval: 0.03 }));
      engine.onTick(async () => {});
      engine.start();
      await wait(80);
      engine.pause();
      engine.resume();
      const tick = engine.currentTick;
      await wait(100);
      expect(engine.currentTick).toBeGreaterThan(tick);
    });
  });
});
