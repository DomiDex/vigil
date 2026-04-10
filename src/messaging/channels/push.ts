import type { DeliveryChannel, DeliveryResult } from "../router.ts";
import type { VigilMessage } from "../schema.ts";

/**
 * Push notification backend interface — each provider implements this.
 */
export interface PushBackend {
  name: string;
  send(notification: PushNotification): Promise<boolean>;
}

export interface PushNotification {
  title: string;
  body: string;
  priority: "low" | "default" | "high" | "urgent";
  url?: string;
  tags?: string[];
  actions?: Array<{ label: string; url: string }>;
}

export interface PushConfig {
  enabled: boolean;
  /** Only push messages at or above this severity */
  minSeverity: "info" | "warning" | "critical";
  /** Only push these status types */
  statuses: string[];
  /** Quiet hours — no push during these times */
  quietHours?: { start: string; end: string };
  /** Max pushes per hour (rate limit) */
  maxPerHour: number;
}

export const DEFAULT_PUSH_CONFIG: PushConfig = {
  enabled: false,
  minSeverity: "warning",
  statuses: ["alert", "proactive"],
  maxPerHour: 10,
};

const SEVERITY_ORDER: Record<string, number> = { info: 0, warning: 1, critical: 2 };
const SEVERITY_TO_PRIORITY: Record<string, PushNotification["priority"]> = {
  info: "default",
  warning: "high",
  critical: "urgent",
};

/**
 * Push notification delivery channel.
 * Supports multiple backends: ntfy.sh, native OS, custom.
 * Filters by severity, status, quiet hours, and rate limit.
 */
export class PushChannel implements DeliveryChannel {
  name = "push";
  private config: PushConfig;
  private backends: PushBackend[] = [];
  private sentTimestamps: number[] = [];
  private nowFn: () => Date;

  constructor(config: Partial<PushConfig> = {}, nowFn?: () => Date) {
    this.config = { ...DEFAULT_PUSH_CONFIG, ...config };
    this.nowFn = nowFn ?? (() => new Date());
  }

  addBackend(backend: PushBackend): void {
    this.backends.push(backend);
  }

  getBackends(): readonly PushBackend[] {
    return this.backends;
  }

  isEnabled(): boolean {
    return this.config.enabled && this.backends.length > 0;
  }

  accepts(message: VigilMessage): boolean {
    const msgSeverity = SEVERITY_ORDER[message.severity] ?? 0;
    const minSeverity = SEVERITY_ORDER[this.config.minSeverity] ?? 0;
    if (msgSeverity < minSeverity) return false;

    if (!this.config.statuses.includes(message.status)) return false;

    if (this.isQuietHours()) return false;

    if (this.isRateLimited()) return false;

    return true;
  }

  async deliver(message: VigilMessage): Promise<DeliveryResult> {
    const notification: PushNotification = {
      title: `Vigil — ${message.source.repo}`,
      body: stripMarkdown(message.message).slice(0, 256),
      priority: SEVERITY_TO_PRIORITY[message.severity] ?? "default",
      tags: [message.severity, message.status],
    };

    this.sentTimestamps.push(Date.now());

    const results = await Promise.allSettled(this.backends.map((b) => b.send(notification)));
    const anySuccess = results.some((r) => r.status === "fulfilled" && r.value);

    return {
      channel: this.name,
      success: anySuccess,
      error: anySuccess ? undefined : "All push backends failed",
    };
  }

  private isQuietHours(): boolean {
    if (!this.config.quietHours) return false;
    const now = this.nowFn();
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    const { start, end } = this.config.quietHours;

    if (start <= end) {
      return timeStr >= start && timeStr < end;
    }
    // Overnight range (e.g., 22:00 - 07:00)
    return timeStr >= start || timeStr < end;
  }

  private isRateLimited(): boolean {
    const oneHourAgo = Date.now() - 3_600_000;
    this.sentTimestamps = this.sentTimestamps.filter((t) => t > oneHourAgo);
    return this.sentTimestamps.length >= this.config.maxPerHour;
  }
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/[#`>]/g, "")
    .trim();
}
