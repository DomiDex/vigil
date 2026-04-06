export type WakeTrigger = "git_event" | "time" | "user_input";

export type GitEventType = "file_change" | "new_commit" | "branch_switch" | "uncommitted_drift";

export interface EventSubscription {
  eventType: GitEventType;
  /** Optional glob/substring filter on event detail (e.g. "src/" to match file changes in src) */
  filter?: string;
}

export interface SleepRequest {
  type: "duration" | "condition";
  durationMs?: number;
  wakeOn?: WakeTrigger[];
  wakeAt?: number;
  reason: string;
}

export class SleepController {
  private activeSleep: SleepRequest | null = null;
  private sleepStarted = 0;
  private subscriptions: EventSubscription[] = [];

  /** Request agent-controlled sleep — returns true if accepted */
  requestSleep(req: SleepRequest): boolean {
    this.activeSleep = req;
    this.sleepStarted = Date.now();
    return true;
  }

  /** Subscribe to a specific git event type. Subscriptions persist across sleep cycles. */
  subscribe(sub: EventSubscription): void {
    // Deduplicate
    const exists = this.subscriptions.some(
      (s) => s.eventType === sub.eventType && s.filter === sub.filter,
    );
    if (!exists) {
      this.subscriptions.push(sub);
    }
  }

  /** Get active subscriptions */
  getSubscriptions(): EventSubscription[] {
    return [...this.subscriptions];
  }

  /** Clear all subscriptions */
  clearSubscriptions(): void {
    this.subscriptions = [];
  }

  /** Check if a git event matches any subscription */
  matchesSubscription(eventType: GitEventType, detail: string): boolean {
    if (this.subscriptions.length === 0) return true; // no subscriptions = match all
    return this.subscriptions.some(
      (s) => s.eventType === eventType && (!s.filter || detail.includes(s.filter)),
    );
  }

  /** Check if a wake condition is met */
  shouldWake(trigger: WakeTrigger, eventType?: GitEventType, detail?: string): boolean {
    if (!this.activeSleep) return false;

    if (this.activeSleep.type === "duration") {
      const elapsed = Date.now() - this.sleepStarted;
      if (elapsed >= (this.activeSleep.durationMs ?? 0)) {
        this.activeSleep = null;
        return true;
      }
      return false;
    }

    // Condition-based: check trigger match
    if (this.activeSleep.wakeOn?.includes(trigger)) {
      // If git_event trigger with subscriptions, check subscription match
      if (trigger === "git_event" && eventType && this.subscriptions.length > 0) {
        if (!this.matchesSubscription(eventType, detail ?? "")) {
          return false; // event doesn't match any subscription
        }
      }
      this.activeSleep = null;
      return true;
    }

    // Check time-based wake
    if (this.activeSleep.wakeAt && Date.now() >= this.activeSleep.wakeAt) {
      this.activeSleep = null;
      return true;
    }

    return false;
  }

  get isAgentSleeping(): boolean {
    return this.activeSleep !== null;
  }

  get currentSleep(): SleepRequest | null {
    return this.activeSleep;
  }

  wake(): void {
    this.activeSleep = null;
  }
}
