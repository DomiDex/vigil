/**
 * Work detector — decides if a tick should trigger LLM analysis or
 * be skipped. Prevents wasting tokens on "nothing happened" ticks.
 *
 * Kairos ref: constants/prompts.ts PROACTIVE_SECTION
 * "Investigate, reduce risk, verify assumptions" — but only when
 * there's actually something to investigate.
 */

import type { GitEventType } from "../git/watcher.ts";

export interface WorkSignal {
  type: GitEventType | string;
  weight: number; // 0.0–1.0 importance score
  description: string;
  timestamp: number;
}

export interface WorkDetectorConfig {
  /** Minimum accumulated weight to trigger LLM call */
  triggerThreshold: number;
  /** Maximum time (ms) without any LLM call — forces a heartbeat check */
  maxSilenceMs: number;
  /** Weight decay rate per second — old signals lose relevance */
  decayRatePerSec: number;
}

const DEFAULT_CONFIG: WorkDetectorConfig = {
  triggerThreshold: 0.5,
  maxSilenceMs: 30 * 60 * 1000, // 30 min max silence
  decayRatePerSec: 0.001,
};

export interface AnalysisResult {
  reason: "critical_signal" | "threshold_exceeded" | "heartbeat";
  signals: WorkSignal[];
}

export class WorkDetector {
  private signals: WorkSignal[] = [];
  private lastLLMCallAt: number = Date.now();
  private config: WorkDetectorConfig;

  constructor(config: Partial<WorkDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  addSignal(signal: WorkSignal): void {
    this.signals.push(signal);
  }

  /**
   * Should the current tick trigger an LLM analysis?
   * Returns the signals that justify the call, or null if no work needed.
   *
   * Three triggers:
   * 1. Critical signal (weight >= 0.9) — immediate
   * 2. Accumulated signal weight exceeds threshold
   * 3. Max silence timer expired (heartbeat)
   */
  shouldAnalyze(): AnalysisResult | null {
    const now = Date.now();

    // Apply time decay to signals
    const activeSignals = this.signals
      .map((s) => ({
        ...s,
        weight: s.weight * Math.exp(-this.config.decayRatePerSec * ((now - s.timestamp) / 1000)),
      }))
      .filter((s) => s.weight > 0.01); // Prune negligible signals

    // Check for critical signals (immediate trigger)
    const critical = activeSignals.filter((s) => s.weight >= 0.9);
    if (critical.length > 0) {
      this.consumeSignals();
      return { reason: "critical_signal", signals: critical };
    }

    // Check accumulated weight
    const totalWeight = activeSignals.reduce((sum, s) => sum + s.weight, 0);
    if (totalWeight >= this.config.triggerThreshold) {
      this.consumeSignals();
      return { reason: "threshold_exceeded", signals: activeSignals };
    }

    // Check max silence (heartbeat)
    const silenceMs = now - this.lastLLMCallAt;
    if (silenceMs >= this.config.maxSilenceMs) {
      this.consumeSignals();
      return {
        reason: "heartbeat",
        signals: activeSignals.length > 0 ? activeSignals : [],
      };
    }

    return null; // No useful work — skip this tick
  }

  /** Get pending signal count (for metrics/debugging) */
  get pendingSignals(): number {
    return this.signals.length;
  }

  /** Check if accumulated weight exceeds threshold (non-consuming, for scheduling) */
  hasUrgentWork(): boolean {
    const now = Date.now();
    const activeSignals = this.signals
      .map((s) => ({
        ...s,
        weight: s.weight * Math.exp(-this.config.decayRatePerSec * ((now - s.timestamp) / 1000)),
      }))
      .filter((s) => s.weight > 0.01);

    if (activeSignals.some((s) => s.weight >= 0.9)) return true;
    const totalWeight = activeSignals.reduce((sum, s) => sum + s.weight, 0);
    return totalWeight >= this.config.triggerThreshold;
  }

  /** Reset last LLM call timestamp (e.g. after external LLM call) */
  recordLLMCall(): void {
    this.lastLLMCallAt = Date.now();
  }

  private consumeSignals(): void {
    this.signals = [];
    this.lastLLMCallAt = Date.now();
  }
}
