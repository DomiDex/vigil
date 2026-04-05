import type { VigilConfig } from "./config.ts";

export type TickHandler = (tickNumber: number, isSleeping: boolean) => Promise<void>;

export class TickEngine {
  private config: VigilConfig;
  private handlers: TickHandler[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private lastActivity = Date.now();
  private sleeping = false;
  private paused = false;

  constructor(config: VigilConfig) {
    this.config = config;
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

  private scheduleNext(): void {
    if (this.paused) return;

    const idleMs = Date.now() - this.lastActivity;
    const shouldSleep = idleMs > this.config.sleepAfter * 1000;

    if (shouldSleep && !this.sleeping) {
      this.sleeping = true;
    }

    const interval = this.sleeping
      ? this.config.sleepTickInterval * 1000
      : this.config.tickInterval * 1000;

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
