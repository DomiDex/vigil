import type { MessageStatus, VigilMessage } from "./schema.ts";

export interface DisplayFilterConfig {
  /** Show only these statuses in primary output */
  showStatuses: MessageStatus[];
  /** Minimum severity for primary output */
  minSeverity: "info" | "warning" | "critical";
  /** Suppress duplicate messages within this window (ms) */
  dedupeWindowMs: number;
}

const DEFAULT_FILTER: DisplayFilterConfig = {
  showStatuses: ["proactive", "alert", "scheduled"],
  minSeverity: "info",
  dedupeWindowMs: 60_000,
};

const SEVERITY_ORDER = { info: 0, warning: 1, critical: 2 } as const;

/**
 * Display filter — decides which messages the user sees in primary output.
 *
 * Kairos ref: components/Spinner.tsx filters on isBriefOnly.
 * Vigil equivalent: filter messages before routing to "primary"
 * channels (console, push) vs "detail" channels (jsonl, file log).
 */
export class DisplayFilter {
  private config: DisplayFilterConfig;
  private recentHashes = new Map<string, number>();

  constructor(config: Partial<DisplayFilterConfig> = {}) {
    this.config = { ...DEFAULT_FILTER, ...config };
  }

  /**
   * Returns true if this message should be shown in primary display.
   * Messages that fail still go to detail/log channels.
   */
  shouldDisplay(message: VigilMessage): boolean {
    if (!this.config.showStatuses.includes(message.status)) {
      return false;
    }

    if (SEVERITY_ORDER[message.severity] < SEVERITY_ORDER[this.config.minSeverity]) {
      return false;
    }

    const hash = this.hashMessage(message);
    const lastSeen = this.recentHashes.get(hash);
    const now = Date.now();

    if (lastSeen && now - lastSeen < this.config.dedupeWindowMs) {
      return false;
    }

    this.recentHashes.set(hash, now);
    this.pruneHashes(now);
    return true;
  }

  private hashMessage(msg: VigilMessage): string {
    const key = `${msg.source.repo}:${msg.source.event}:${msg.message.slice(0, 100)}`;
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    }
    return hash.toString(36);
  }

  private pruneHashes(now: number): void {
    for (const [hash, ts] of this.recentHashes) {
      if (now - ts > this.config.dedupeWindowMs) {
        this.recentHashes.delete(hash);
      }
    }
  }
}
