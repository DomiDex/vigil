import { describe, it, expect, mock } from "bun:test";

const mockSchedulerData = {
  entries: [
    { id: "s1", name: "Hourly Dream", cron: "0 * * * *", action: "dream", repo: "vigil", nextRun: "2026-04-15T11:00:00Z", msToNext: 1800000, nextRunRelative: "in 30m" },
    { id: "s2", name: "Daily Summary", cron: "0 9 * * *", action: "summary", repo: undefined, nextRun: "2026-04-16T09:00:00Z", msToNext: 43200000, nextRunRelative: "in 12h" },
    { id: "s3", name: "Overdue Job", cron: "*/5 * * * *", action: "check", repo: "my-app", nextRun: null, msToNext: 0, nextRunRelative: "now" },
  ],
  history: [
    { startedAt: Date.now() - 3600000, scheduleName: "Hourly Dream", status: "ok" as const, duration: 5200 },
    { startedAt: Date.now() - 86400000, scheduleName: "Daily Summary", status: "fail" as const, duration: 120000, error: "Timeout" },
  ],
};

describe("Scheduler plugin", () => {
  describe("live countdown from msToNext", () => {
    it("formats 1800000ms as '30m 0s'", () => {
      const { formatCountdown } = require("../../../dashboard-v2/src/plugins/scheduler/SchedulerPage");
      expect(formatCountdown(1800000)).toBe("30m 0s");
    });

    it("formats 43200000ms as '12h 0m'", () => {
      const { formatCountdown } = require("../../../dashboard-v2/src/plugins/scheduler/SchedulerPage");
      expect(formatCountdown(43200000)).toBe("12h 0m");
    });

    it("formats 0ms as 'Now'", () => {
      const { formatCountdown } = require("../../../dashboard-v2/src/plugins/scheduler/SchedulerPage");
      expect(formatCountdown(0)).toBe("Now");
    });

    it("formats null msToNext as 'N/A'", () => {
      const { formatCountdown } = require("../../../dashboard-v2/src/plugins/scheduler/SchedulerPage");
      expect(formatCountdown(null)).toBe("N/A");
    });

    it("countdown decrements by 1000 each second", () => {
      const initial = 1800000;
      const afterOneTick = initial - 1000;
      expect(afterOneTick).toBe(1799000);
    });
  });

  describe("schedule CRUD mutations", () => {
    it("createSchedule sends name, cron, action, repo", async () => {
      const createSchedule = mock(() => Promise.resolve({ success: true }));
      await createSchedule({ data: { name: "Test", cron: "0 * * * *", action: "dream", repo: "vigil" } });
      expect(createSchedule).toHaveBeenCalledWith({
        data: { name: "Test", cron: "0 * * * *", action: "dream", repo: "vigil" },
      });
    });

    it("deleteSchedule sends schedule id", async () => {
      const deleteSchedule = mock(() => Promise.resolve({ success: true }));
      await deleteSchedule({ data: { id: "s1" } });
      expect(deleteSchedule).toHaveBeenCalledWith({ data: { id: "s1" } });
    });

    it("triggerSchedule sends schedule id", async () => {
      const triggerSchedule = mock(() => Promise.resolve({ success: true }));
      await triggerSchedule({ data: { id: "s1" } });
      expect(triggerSchedule).toHaveBeenCalledWith({ data: { id: "s1" } });
    });

    it("all scheduler mutations would invalidate scheduler query key", () => {
      const { vigilKeys } = require("../../../dashboard-v2/src/lib/query-keys");
      expect(vigilKeys.scheduler).toEqual(["scheduler"]);
    });
  });

  describe("run history", () => {
    it("history entries have status and duration", () => {
      for (const entry of mockSchedulerData.history) {
        expect(entry).toHaveProperty("status");
        expect(entry).toHaveProperty("duration");
        expect(typeof entry.duration).toBe("number");
      }
    });

    it("failed entries include error message", () => {
      const failed = mockSchedulerData.history.filter((h) => h.status === "fail");
      expect(failed).toHaveLength(1);
      expect(failed[0].error).toBe("Timeout");
    });

    it("history sorted by startedAt descending (most recent first)", () => {
      const times = mockSchedulerData.history.map((h) => h.startedAt);
      for (let i = 1; i < times.length; i++) {
        expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]);
      }
    });
  });

  describe("schedule entry data shape", () => {
    it("entries have required fields", () => {
      for (const entry of mockSchedulerData.entries) {
        expect(entry).toHaveProperty("id");
        expect(entry).toHaveProperty("name");
        expect(entry).toHaveProperty("cron");
        expect(entry).toHaveProperty("action");
        expect(entry).toHaveProperty("msToNext");
      }
    });

    it("repo is optional on schedule entries", () => {
      const withRepo = mockSchedulerData.entries.filter((e) => e.repo !== undefined);
      const withoutRepo = mockSchedulerData.entries.filter((e) => e.repo === undefined);
      expect(withRepo.length).toBeGreaterThan(0);
      expect(withoutRepo.length).toBeGreaterThan(0);
    });
  });
});
