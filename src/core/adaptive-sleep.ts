/**
 * Adaptive sleep — dynamically adjusts tick intervals based on
 * repository activity. Quiet repos get longer intervals; active
 * repos get shorter ones.
 *
 * Kairos ref: SleepTool prompt — "balance accordingly" between
 * wake-up API cost and prompt cache expiry (5 min).
 */

export interface AdaptiveSleepConfig {
  /** Base tick interval (seconds) */
  baseTick: number;
  /** Minimum tick interval when highly active (seconds) */
  minTick: number;
  /** Maximum tick interval when idle (seconds) */
  maxTick: number;
  /** Prompt cache expiry — avoid sleeping longer than this */
  cacheExpiryMs: number;
}

const DEFAULT_SLEEP: AdaptiveSleepConfig = {
  baseTick: 60,
  minTick: 15,
  maxTick: 300,
  cacheExpiryMs: 5 * 60 * 1000, // 5 min (Kairos SleepTool prompt)
};

export class AdaptiveSleep {
  private config: AdaptiveSleepConfig;
  private activityHistory: number[] = []; // timestamps of recent events
  private readonly historyWindow = 10 * 60 * 1000; // 10 min window

  constructor(config: Partial<AdaptiveSleepConfig> = {}) {
    this.config = { ...DEFAULT_SLEEP, ...config };
  }

  recordActivity(): void {
    this.activityHistory.push(Date.now());
  }

  /**
   * Compute next sleep duration based on recent activity.
   *
   * Activity rate → interval mapping:
   * - High activity (5+ events/10min): minTick
   * - Normal (1-4 events/10min): linear interpolation
   * - Idle (0 events/10min): maxTick (capped at cache expiry)
   */
  getNextInterval(): number {
    const now = Date.now();
    const cutoff = now - this.historyWindow;

    // Prune old events
    this.activityHistory = this.activityHistory.filter((t) => t > cutoff);
    const eventCount = this.activityHistory.length;

    let intervalSec: number;
    if (eventCount >= 5) {
      intervalSec = this.config.minTick;
    } else if (eventCount >= 1) {
      // Linear interpolation between minTick and baseTick
      const ratio = eventCount / 5;
      intervalSec = this.config.baseTick - ratio * (this.config.baseTick - this.config.minTick);
    } else {
      intervalSec = this.config.maxTick;
    }

    // Cap at cache expiry to avoid cache misses (Kairos SleepTool insight)
    const maxFromCache = this.config.cacheExpiryMs / 1000;
    intervalSec = Math.min(intervalSec, maxFromCache);

    return Math.round(intervalSec);
  }

  /** Get current activity count within the window (for metrics/debugging) */
  get recentActivityCount(): number {
    const cutoff = Date.now() - this.historyWindow;
    return this.activityHistory.filter((t) => t > cutoff).length;
  }

  /**
   * Format a <tick> prompt for the LLM (Kairos pattern).
   * Includes context about why the tick fired and what's pending.
   */
  formatTickPrompt(context: {
    signals: Array<{ type: string; description: string }>;
    timeSinceLastTick: number;
    isHeartbeat: boolean;
  }): string {
    const lines = [`<tick timestamp="${new Date().toISOString()}">`];

    if (context.isHeartbeat) {
      lines.push(`  Heartbeat — ${Math.round(context.timeSinceLastTick / 1000)}s since last check.`);
      lines.push("  No new signals. Look for useful work or sleep.");
    } else {
      lines.push(`  ${context.signals.length} signal(s) since last tick:`);
      for (const s of context.signals) {
        lines.push(`  - [${s.type}] ${s.description}`);
      }
    }

    lines.push("</tick>");
    return lines.join("\n");
  }
}
