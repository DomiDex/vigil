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

export class Scheduler {
  private schedules: ScheduleEntry[] = [];
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
      if (this.handler) {
        try {
          await this.handler(entry);
        } catch {
          // Schedule handler errors are non-fatal
        }
      }
    });
    this.jobs.set(entry.id, job);
  }

  private load(): void {
    if (existsSync(this.dataPath)) {
      try {
        this.schedules = JSON.parse(readFileSync(this.dataPath, "utf-8"));
      } catch {
        this.schedules = [];
      }
    }
  }

  private persist(): void {
    writeFileSync(this.dataPath, JSON.stringify(this.schedules, null, 2));
  }
}
