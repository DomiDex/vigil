import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ScheduleEntry, Scheduler } from "../../core/scheduler.ts";

describe("Scheduler", () => {
  let tmpDir: string;
  let scheduler: Scheduler;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "vigil-sched-test-"));
    scheduler = new Scheduler(join(tmpDir, "schedules.json"));
  });

  afterEach(() => {
    scheduler.stopAll();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("CRUD operations", () => {
    it("adds a schedule and lists it", () => {
      const entry = scheduler.add({ name: "Test Job", cron: "0 * * * *", action: "dream" });
      expect(entry.id).toBeTruthy();
      expect(entry.name).toBe("Test Job");
      expect(entry.cron).toBe("0 * * * *");
      expect(entry.createdAt).toBeGreaterThan(0);

      const list = scheduler.list();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(entry.id);
    });

    it("removes a schedule by id", () => {
      const entry = scheduler.add({ name: "Remove Me", cron: "0 2 * * *", action: "check" });
      expect(scheduler.list()).toHaveLength(1);

      const removed = scheduler.remove(entry.id);
      expect(removed).toBe(true);
      expect(scheduler.list()).toHaveLength(0);
    });

    it("returns false when removing non-existent id", () => {
      expect(scheduler.remove("nonexistent")).toBe(false);
    });

    it("persists schedules to file", () => {
      const dataPath = join(tmpDir, "schedules.json");
      scheduler.add({ name: "Persist Test", cron: "0 3 * * *", action: "summary" });

      // Create a new scheduler from the same file
      const scheduler2 = new Scheduler(dataPath);
      const list = scheduler2.list();
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe("Persist Test");
      scheduler2.stopAll();
    });

    it("handles multiple schedules", () => {
      scheduler.add({ name: "Job 1", cron: "0 * * * *", action: "dream" });
      scheduler.add({ name: "Job 2", cron: "0 2 * * *", action: "check", repo: "vigil" });
      scheduler.add({ name: "Job 3", cron: "0 9 * * 1", action: "summary" });

      expect(scheduler.list()).toHaveLength(3);
    });
  });

  describe("next-run calculation", () => {
    it("returns next run date for a schedule", () => {
      const entry = scheduler.add({ name: "Hourly", cron: "0 * * * *", action: "check" });
      const nextRun = scheduler.getNextRun(entry.id);
      expect(nextRun).toBeInstanceOf(Date);
      expect(nextRun!.getTime()).toBeGreaterThan(Date.now());
    });

    it("returns ms to next run", () => {
      const entry = scheduler.add({ name: "Hourly", cron: "0 * * * *", action: "check" });
      const ms = scheduler.getMsToNext(entry.id);
      expect(ms).toBeGreaterThan(0);
      // Should be less than 1 hour (3600000 ms)
      expect(ms!).toBeLessThanOrEqual(3600000);
    });

    it("returns null for non-existent schedule", () => {
      expect(scheduler.getNextRun("nonexistent")).toBeNull();
      expect(scheduler.getMsToNext("nonexistent")).toBeNull();
    });
  });

  describe("manual trigger", () => {
    it("triggers a schedule and records run history", async () => {
      let handlerCalled = false;
      scheduler.onSchedule(async (_entry: ScheduleEntry) => {
        handlerCalled = true;
      });

      const entry = scheduler.add({ name: "Trigger Test", cron: "0 2 * * *", action: "dream" });
      const run = await scheduler.trigger(entry.id);

      expect(handlerCalled).toBe(true);
      expect(run).not.toBeNull();
      expect(run!.status).toBe("ok");
      expect(run!.scheduleName).toBe("Trigger Test");
      expect(run!.duration).toBeGreaterThanOrEqual(0);
    });

    it("records failure when handler throws", async () => {
      scheduler.onSchedule(async () => {
        throw new Error("Test failure");
      });

      const entry = scheduler.add({ name: "Fail Test", cron: "0 2 * * *", action: "dream" });
      const run = await scheduler.trigger(entry.id);

      expect(run!.status).toBe("fail");
      expect(run!.error).toBe("Test failure");
    });

    it("returns null when triggering non-existent schedule", async () => {
      const run = await scheduler.trigger("nonexistent");
      expect(run).toBeNull();
    });
  });

  describe("run history", () => {
    it("records run history from manual triggers", async () => {
      scheduler.onSchedule(async () => {});
      const entry = scheduler.add({ name: "History Test", cron: "0 * * * *", action: "check" });

      await scheduler.trigger(entry.id);
      await scheduler.trigger(entry.id);

      const history = scheduler.getRunHistory();
      expect(history).toHaveLength(2);
      // Most recent first
      expect(history[0].startedAt).toBeGreaterThanOrEqual(history[1].startedAt);
    });

    it("persists run history to file", async () => {
      const dataPath = join(tmpDir, "schedules.json");
      scheduler.onSchedule(async () => {});
      const entry = scheduler.add({ name: "Persist History", cron: "0 * * * *", action: "check" });
      await scheduler.trigger(entry.id);

      const scheduler2 = new Scheduler(dataPath);
      const history = scheduler2.getRunHistory();
      expect(history).toHaveLength(1);
      expect(history[0].scheduleName).toBe("Persist History");
      scheduler2.stopAll();
    });

    it("limits run history to 200 entries", async () => {
      scheduler.onSchedule(async () => {});
      const entry = scheduler.add({ name: "Limit Test", cron: "0 * * * *", action: "check" });

      for (let i = 0; i < 210; i++) {
        await scheduler.trigger(entry.id);
      }

      // getRunHistory with default limit of 50
      const history = scheduler.getRunHistory(250);
      expect(history.length).toBeLessThanOrEqual(200);
    });

    it("records both success and failure in history", async () => {
      let shouldFail = false;
      scheduler.onSchedule(async () => {
        if (shouldFail) throw new Error("Boom");
      });

      const entry = scheduler.add({ name: "Mixed", cron: "0 * * * *", action: "check" });

      await scheduler.trigger(entry.id);
      shouldFail = true;
      await scheduler.trigger(entry.id);

      const history = scheduler.getRunHistory();
      expect(history).toHaveLength(2);
      expect(history[0].status).toBe("fail");
      expect(history[1].status).toBe("ok");
    });
  });

  describe("backward compatibility", () => {
    it("loads old array-format schedules.json", async () => {
      const dataPath = join(tmpDir, "schedules.json");
      // Old format was just an array of ScheduleEntry
      const oldData: ScheduleEntry[] = [
        { id: "abc123", name: "Old Job", cron: "0 * * * *", action: "dream", createdAt: Date.now() },
      ];
      await Bun.write(dataPath, JSON.stringify(oldData));

      const scheduler2 = new Scheduler(dataPath);
      const list = scheduler2.list();
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe("Old Job");
      expect(scheduler2.getRunHistory()).toHaveLength(0);
      scheduler2.stopAll();
    });
  });
});
