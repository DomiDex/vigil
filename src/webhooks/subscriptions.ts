import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const SubscriptionSchema = z.object({
  id: z.string(),
  repo: z.string(), // "owner/repo"
  prNumber: z.number(),
  events: z.array(z.string()), // ["opened", "review_submitted", "merged"]
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  active: z.boolean().default(true),
});
export type Subscription = z.infer<typeof SubscriptionSchema>;

/**
 * PR subscription manager — tracks which PRs Vigil is watching
 * and what events to react to.
 *
 * File-backed for persistence across restarts.
 */
export class SubscriptionManager {
  private subscriptions = new Map<string, Subscription>();
  private filePath: string;

  constructor(configDir: string) {
    this.filePath = join(configDir, "pr_subscriptions.json");
  }

  load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const item of data) {
          const parsed = SubscriptionSchema.safeParse(item);
          if (parsed.success) {
            this.subscriptions.set(parsed.data.id, parsed.data);
          }
          // Silently drop invalid entries (graceful degradation)
        }
      }
    } catch {
      // No file or corrupt — not an error
    }
  }

  save(): void {
    const data = Array.from(this.subscriptions.values());
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  subscribe(repo: string, prNumber: number, events: string[]): Subscription {
    const sub: Subscription = {
      id: crypto.randomUUID().slice(0, 8),
      repo,
      prNumber,
      events,
      createdAt: new Date().toISOString(),
      active: true,
    };
    this.subscriptions.set(sub.id, sub);
    this.save();
    return sub;
  }

  unsubscribe(id: string): boolean {
    const deleted = this.subscriptions.delete(id);
    if (deleted) this.save();
    return deleted;
  }

  /**
   * Match a webhook event against active subscriptions.
   */
  match(repo: string, prNumber: number, action: string): Subscription[] {
    return Array.from(this.subscriptions.values()).filter(
      (s) => s.active && s.repo === repo && s.prNumber === prNumber && s.events.includes(action),
    );
  }

  list(filter?: { repo?: string; active?: boolean }): Subscription[] {
    let subs = Array.from(this.subscriptions.values());
    if (filter?.repo) subs = subs.filter((s) => s.repo === filter.repo);
    if (filter?.active !== undefined) subs = subs.filter((s) => s.active === filter.active);
    return subs;
  }

  get(id: string): Subscription | undefined {
    return this.subscriptions.get(id);
  }

  size(): number {
    return this.subscriptions.size;
  }
}
