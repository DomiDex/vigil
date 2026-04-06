import type { VigilConfig } from "./config.ts";

export type TickHandler = (tickNumber: number, isSleeping: boolean) => Promise<void>;

/**
 * Deterministic jitter based on repo name (Kairos cronScheduler.ts pattern).
 * Prevents thundering herd when watching multiple repos.
 */
export function computeJitter(repoName: string, baseIntervalSec: number): number {
  let hash = 0;
  for (let i = 0; i < repoName.length; i++) {
    hash = ((hash << 5) - hash) + repoName.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  // Jitter: 0-10% of base interval, capped at 15 seconds
  const maxJitter = Math.min(baseIntervalSec * 0.1, 15);
  const jitter = (Math.abs(hash % 1000) / 1000) * maxJitter;
  return jitter * 1000; // Return milliseconds
}

export class TickEngine {
  private config: VigilConfig;
  private handlers: TickHandler[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private lastActivity = Date.now();
  private sleeping = false;
  private paused = false;
  private repoName: string | null = null;

  constructor(config: VigilConfig, repoName?: string) {
    this.config = config;
    this.repoName = repoName ?? null;
  }

  onTick(handler: TickHandler): void {
    this.handlers.push(handler);
  }

  start(): void {
    if (this.timer) return;
    this.lastActivity = Date.now();
    this.scheduleNext();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  reportActivity(): void {
    this.lastActivity = Date.now();
    if (this.sleeping) {
      this.sleeping = false;
      this.stop();
      this.scheduleNext();
    }
  }

  pause(): void {
    this.paused = true;
    this.stop();
  }

  resume(): void {
    this.paused = false;
    this.scheduleNext();
  }

  get isSleeping(): boolean {
    return this.sleeping;
  }

  get currentTick(): number {
    return this.tickCount;
  }

  updateConfig(config: VigilConfig): void {
    this.config = config;
  }

  private scheduleNext(): void {
    if (this.paused) return;

    const idleMs = Date.now() - this.lastActivity;
    const shouldSleep = idleMs > this.config.sleepAfter * 1000;

    if (shouldSleep && !this.sleeping) {
      this.sleeping = true;
    }

    const baseIntervalSec = this.sleeping
      ? this.config.sleepTickInterval
      : this.config.tickInterval;

    const jitterMs = this.repoName
      ? computeJitter(this.repoName, baseIntervalSec)
      : 0;

    const interval = (baseIntervalSec * 1000) + jitterMs;

    this.timer = setTimeout(async () => {
      this.tickCount++;
      const budget = this.config.blockingBudget * 1000;

      for (const handler of this.handlers) {
        try {
          await Promise.race([
            handler(this.tickCount, this.sleeping),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Tick handler exceeded blocking budget")), budget)
            ),
          ]);
        } catch (err) {
          if (err instanceof Error && err.message.includes("blocking budget")) {
            console.error(`[tick ${this.tickCount}] Handler exceeded ${this.config.blockingBudget}s budget`);
          }
        }
      }

      this.scheduleNext();
    }, interval);
  }
}
