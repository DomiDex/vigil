/**
 * System prompt caching with TTL and scope-aware invalidation.
 *
 * Kairos ref: constants/systemPromptSections.ts
 * - systemPromptSection(): stable, cacheable across turns
 * - DANGEROUS_uncachedSystemPromptSection(): recomputed every turn
 *
 * Vigil equivalent: cache prompt sections with TTL. Static sections
 * (agent identity, base instructions) are cached long. Dynamic sections
 * (repo state, recent events) are short-lived or uncached.
 */

export type CacheScope = "stable" | "session" | "ephemeral";

interface CachedSection {
  content: string;
  scope: CacheScope;
  computedAt: number;
  ttlMs: number;
}

const SCOPE_TTL: Record<CacheScope, number> = {
  stable: 60 * 60 * 1000, // 1 hour — agent identity, base instructions
  session: 5 * 60 * 1000, // 5 min — matches Kairos cache expiry
  ephemeral: 0, // Never cached — recomputed every call
};

export class PromptCache {
  private cache = new Map<string, CachedSection>();

  /**
   * Get or compute a prompt section with caching.
   */
  async getSection(key: string, scope: CacheScope, compute: () => string | Promise<string>): Promise<string> {
    const cached = this.cache.get(key);
    const now = Date.now();

    if (cached && scope !== "ephemeral") {
      const age = now - cached.computedAt;
      if (age < cached.ttlMs) {
        return cached.content;
      }
    }

    const content = await compute();
    const ttlMs = SCOPE_TTL[scope];

    if (scope !== "ephemeral") {
      this.cache.set(key, { content, scope, computedAt: now, ttlMs });
    }

    return content;
  }

  /** Invalidate a specific section (e.g., after config change). */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /** Invalidate all sections of a given scope. */
  invalidateScope(scope: CacheScope): void {
    for (const [key, entry] of this.cache) {
      if (entry.scope === scope) {
        this.cache.delete(key);
      }
    }
  }

  /** Invalidate everything — nuclear option for rebase/reset. */
  invalidateAll(): void {
    this.cache.clear();
  }

  /** Get cache stats for observability. */
  getStats(): { size: number; byScope: Record<CacheScope, number> } {
    const byScope: Record<CacheScope, number> = { stable: 0, session: 0, ephemeral: 0 };
    for (const entry of this.cache.values()) {
      byScope[entry.scope]++;
    }
    return { size: this.cache.size, byScope };
  }
}
