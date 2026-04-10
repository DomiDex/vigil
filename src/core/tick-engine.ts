import { AdaptiveSleep, type AdaptiveSleepConfig } from "./adaptive-sleep.ts";
import type { VigilConfig } from "./config.ts";
import { type AnalysisResult, WorkDetector, type WorkDetectorConfig } from "./work-detector.ts";

export type TickHandler = (tickNumber: number, isSleeping: boolean) => Promise<void>;
export type ProactiveTickHandler = (tickNumber: number, analysis: AnalysisResult, tickPrompt: string) => Promise<void>;
export type TickErrorHandler = (tickNumber: number, error: Error) => void;

/** Git event passed to onGitEvent for work detection */
export interface TickGitEvent {
  type: string;
  detail: string;
  branch?: string;
}

/**
 * Deterministic jitter based on repo name (Kairos cronScheduler.ts pattern).
 * Prevents thundering herd when watching multiple repos.
 */
export function computeJitter(repoName: string, baseIntervalSec: number): number {
  let hash = 0;
  for (let i = 0; i < repoName.length; i++) {
    hash = (hash << 5) - hash + repoName.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  // Jitter: 0-10% of base interval, capped at 15 seconds
  const maxJitter = Math.min(baseIntervalSec * 0.1, 15);
  const jitter = (Math.abs(hash % 1000) / 1000) * maxJitter;
  return jitter * 1000; // Return milliseconds
}

/** Weight mapping for git event types */
const EVENT_WEIGHTS: Record<string, number> = {
  new_commit: 0.7,
  branch_switch: 0.5,
  rebase_detected: 0.9, // Critical — cache invalidation
  uncommitted_drift: 0.3,
  file_change: 0.2,
};

function computeEventWeight(eventType: string): number {
  return EVENT_WEIGHTS[eventType] ?? 0.1;
}

function describeEvent(event: TickGitEvent): string {
  switch (event.type) {
    case "new_commit":
      return `New commit on ${event.branch ?? "unknown"}: ${event.detail}`;
    case "branch_switch":
      return `Branch switch: ${event.detail}`;
    case "rebase_detected":
      return `Rebase/reset detected on ${event.branch ?? "unknown"}`;
    case "uncommitted_drift":
      return `Uncommitted changes for ${event.detail}`;
    default:
      return event.detail ?? event.type;
  }
}

export interface ProactiveConfig {
  workDetection?: Partial<WorkDetectorConfig>;
  sleep?: Partial<AdaptiveSleepConfig>;
}

export class TickEngine {
  private config: VigilConfig;
  private handlers: TickHandler[] = [];
  private proactiveHandlers: ProactiveTickHandler[] = [];
  private errorHandlers: TickErrorHandler[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private lastActivity = Date.now();
  private lastTickAt = Date.now();
  private sleeping = false;
  private paused = false;
  private repoName: string | null = null;

  /** Proactive mode components */
  private workDetector: WorkDetector;
  private adaptiveSleep: AdaptiveSleep;
  private proactiveEnabled: boolean;

  constructor(config: VigilConfig, repoName?: string, proactive?: ProactiveConfig) {
    this.config = config;
    this.repoName = repoName ?? null;
    this.workDetector = new WorkDetector(proactive?.workDetection);
    this.adaptiveSleep = new AdaptiveSleep(proactive?.sleep);
    this.proactiveEnabled = false;
  }

  onTick(handler: TickHandler): void {
    this.handlers.push(handler);
  }

  /** Register a proactive tick handler — called only when WorkDetector triggers */
  onProactiveTick(handler: ProactiveTickHandler): void {
    this.proactiveHandlers.push(handler);
    this.proactiveEnabled = true;
  }

  onError(handler: TickErrorHandler): void {
    this.errorHandlers.push(handler);
  }

  start(): void {
    if (this.timer) return;
    this.lastActivity = Date.now();
    this.lastTickAt = Date.now();
    this.scheduleNext();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Feed git events into the work detector as signals.
   * This enables proactive mode — the tick engine will only invoke
   * LLM analysis when there's useful work to do.
   */
  onGitEvent(event: TickGitEvent): void {
    const weight = computeEventWeight(event.type);
    this.workDetector.addSignal({
      type: event.type,
      weight,
      description: describeEvent(event),
      timestamp: Date.now(),
    });
    this.adaptiveSleep.recordActivity();
    this.reportActivity();
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

  /** Expose work detector for direct signal injection */
  get detector(): WorkDetector {
    return this.workDetector;
  }

  /** Expose adaptive sleep for interval queries */
  get sleep(): AdaptiveSleep {
    return this.adaptiveSleep;
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

    let intervalMs: number;
    if (this.proactiveEnabled && !this.sleeping) {
      // Use adaptive sleep intervals when proactive mode is active
      const adaptiveInterval = this.adaptiveSleep.getNextInterval();
      intervalMs = adaptiveInterval * 1000;
    } else {
      const baseIntervalSec = this.sleeping ? this.config.sleepTickInterval : this.config.tickInterval;
      intervalMs = baseIntervalSec * 1000;
    }

    const jitterMs = this.repoName ? computeJitter(this.repoName, intervalMs / 1000) : 0;
    intervalMs += jitterMs;

    this.timer = setTimeout(async () => {
      this.tickCount++;
      const budget = this.config.blockingBudget * 1000;

      // Proactive mode: check if there's useful work before calling handlers
      if (this.proactiveEnabled && !this.sleeping) {
        const analysis = this.workDetector.shouldAnalyze();

        if (analysis) {
          // Format <tick> prompt for LLM
          const tickPrompt = this.adaptiveSleep.formatTickPrompt({
            signals: analysis.signals.map((s) => ({
              type: s.type,
              description: s.description,
            })),
            timeSinceLastTick: Date.now() - this.lastTickAt,
            isHeartbeat: analysis.reason === "heartbeat",
          });

          // Call proactive handlers with analysis context
          for (const handler of this.proactiveHandlers) {
            try {
              await Promise.race([
                handler(this.tickCount, analysis, tickPrompt),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error("Tick handler exceeded blocking budget")), budget),
                ),
              ]);
            } catch (err) {
              const error = err instanceof Error ? err : new Error(String(err));
              if (error.message.includes("blocking budget")) {
                console.error(
                  `[tick ${this.tickCount}] Proactive handler exceeded ${this.config.blockingBudget}s budget`,
                );
              }
              for (const eh of this.errorHandlers) eh(this.tickCount, error);
            }
          }

          this.lastTickAt = Date.now();
        }
        // If no analysis needed, still call regular handlers (for sleep checks, consolidation, etc.)
      }

      // Always call regular handlers
      for (const handler of this.handlers) {
        try {
          await Promise.race([
            handler(this.tickCount, this.sleeping),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Tick handler exceeded blocking budget")), budget),
            ),
          ]);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          if (error.message.includes("blocking budget")) {
            console.error(`[tick ${this.tickCount}] Handler exceeded ${this.config.blockingBudget}s budget`);
          }
          for (const eh of this.errorHandlers) eh(this.tickCount, error);
        }
      }

      this.scheduleNext();
    }, intervalMs);
  }
}
