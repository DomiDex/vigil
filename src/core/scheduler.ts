import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Cron } from "croner";
import { getDataDir } from "./config.ts";

export interface ScheduleEntry {
  id: string;
  name: string;
  cron: string;
  action: string;
  repo?: string;
  createdAt: number;
}

export interface RunHistoryEntry {
  id: string;
  scheduleId: string;
  scheduleName: string;
  startedAt: number;
  duration: number;
  status: "ok" | "fail";
  error?: string;
}

interface PersistedData {
  schedules: ScheduleEntry[];
  runHistory: RunHistoryEntry[];
}

export class Scheduler {
  private schedules: ScheduleEntry[] = [];
  private runHistory: RunHistoryEntry[] = [];
  private jobs: Map<string, Cron> = new Map();
  private handler: ((entry: ScheduleEntry) => Promise<void>) | null = null;
  private dataPath: string;

  constructor(dataPath?: string) {
    this.dataPath = dataPath ?? join(getDataDir(), "schedules.json");
    this.load();
  }

  onSchedule(handler: (entry: ScheduleEntry) => Promise<void>): void {
    this.handler = handler;
  }

  add(entry: Omit<ScheduleEntry, "id" | "createdAt">): ScheduleEntry {
    const full: ScheduleEntry = {
      ...entry,
      id: crypto.randomUUID().slice(0, 8),
      createdAt: Date.now(),
    };
    this.schedules.push(full);
    this.startJob(full);
    this.persist();
    return full;
  }

  remove(id: string): boolean {
    const job = this.jobs.get(id);
    if (job) {
      job.stop();
      this.jobs.delete(id);
    }
    const had = this.schedules.some((s) => s.id === id);
    this.schedules = this.schedules.filter((s) => s.id !== id);
    this.persist();
    return had;
  }

  list(): ScheduleEntry[] {
    return [...this.schedules];
  }

  /** Get the next run time for a schedule entry */
  getNextRun(id: string): Date | null {
    const job = this.jobs.get(id);
    if (!job) return null;
    return job.nextRun() ?? null;
  }

  /** Get ms until next run for a schedule entry */
  getMsToNext(id: string): number | null {
    const job = this.jobs.get(id);
    if (!job) return null;
    return job.msToNext() ?? null;
  }

  /** Manually trigger a schedule entry immediately */
  async trigger(id: string): Promise<RunHistoryEntry | null> {
    const entry = this.schedules.find((s) => s.id === id);
    if (!entry) return null;

    const startedAt = Date.now();
    let status: "ok" | "fail" = "ok";
    let error: string | undefined;

    try {
      if (this.handler) {
        await this.handler(entry);
      }
    } catch (e) {
      status = "fail";
      error = e instanceof Error ? e.message : String(e);
    }

    const duration = Date.now() - startedAt;
    const run: RunHistoryEntry = {
      id: crypto.randomUUID().slice(0, 8),
      scheduleId: entry.id,
      scheduleName: entry.name,
      startedAt,
      duration,
      status,
      error,
    };
    this.addRunHistory(run);
    return run;
  }

  /** Get run history, most recent first */
  getRunHistory(limit = 50): RunHistoryEntry[] {
    return this.runHistory.slice(-limit).reverse();
  }

  /** Record a run in history */
  addRunHistory(run: RunHistoryEntry): void {
    this.runHistory.push(run);
    // Keep last 200 entries
    if (this.runHistory.length > 200) {
      this.runHistory = this.runHistory.slice(-200);
    }
    this.persist();
  }

  startAll(): void {
    for (const entry of this.schedules) {
      this.startJob(entry);
    }
  }

  stopAll(): void {
    for (const job of this.jobs.values()) {
      job.stop();
    }
    this.jobs.clear();
  }

  private startJob(entry: ScheduleEntry): void {
    const job = new Cron(entry.cron, async () => {
      const startedAt = Date.now();
      let status: "ok" | "fail" = "ok";
      let error: string | undefined;

      if (this.handler) {
        try {
          await this.handler(entry);
        } catch (e) {
          status = "fail";
          error = e instanceof Error ? e.message : String(e);
        }
      }

      const duration = Date.now() - startedAt;
      this.addRunHistory({
        id: crypto.randomUUID().slice(0, 8),
        scheduleId: entry.id,
        scheduleName: entry.name,
        startedAt,
        duration,
        status,
        error,
      });
    });
    this.jobs.set(entry.id, job);
  }

  private load(): void {
    if (existsSync(this.dataPath)) {
      try {
        const raw = JSON.parse(readFileSync(this.dataPath, "utf-8"));
        // Support both old format (array) and new format (object with schedules + runHistory)
        if (Array.isArray(raw)) {
          this.schedules = raw;
          this.runHistory = [];
        } else {
          this.schedules = raw.schedules ?? [];
          this.runHistory = raw.runHistory ?? [];
        }
      } catch {
        this.schedules = [];
        this.runHistory = [];
      }
    }
  }

  private persist(): void {
    const data: PersistedData = {
      schedules: this.schedules,
      runHistory: this.runHistory,
    };
    writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
  }
}
