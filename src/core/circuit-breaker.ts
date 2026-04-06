/**
 * Circuit breaker for LLM calls.
 *
 * States: CLOSED (normal) → OPEN (failing, skip calls) → HALF_OPEN (test one call)
 *
 * Inspired by Kairos kill-switch pattern (tengu_kairos_brief TTL gate),
 * adapted for local use without a remote feature flag service.
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
}

const DEFAULTS: CircuitBreakerConfig = {
  failureThreshold: 3,
  resetTimeoutMs: 60_000,
  halfOpenMaxAttempts: 1,
};

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULTS, ...config };
  }

  canCall(): boolean {
    if (this.state === "CLOSED") return true;

    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs) {
        this.state = "HALF_OPEN";
        return true;
      }
      return false;
    }

    // HALF_OPEN: allow one test call
    return true;
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = "CLOSED";
  }

  recordFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.state = "OPEN";
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailureCount(): number {
    return this.consecutiveFailures;
  }

  /** Reset to initial state (for testing or manual recovery) */
  reset(): void {
    this.state = "CLOSED";
    this.consecutiveFailures = 0;
    this.lastFailureTime = 0;
  }
}
