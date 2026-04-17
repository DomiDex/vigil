import { minimatch } from "minimatch";
import type { VigilConfig } from "../core/config.ts";
import type { SpecialistConfig } from "./types.ts";

export class SpecialistRouter {
  private cooldowns = new Map<string, number>(); // "${specialist}:${repo}" -> lastRunTimestamp

  constructor(
    private config: VigilConfig,
    private specialists: SpecialistConfig[],
  ) {}

  /** Return specialists that should fire for this event + changed files */
  match(eventType: string, changedFiles: string[]): SpecialistConfig[] {
    if (!this.config.specialists?.enabled) return [];

    const enabledNames = new Set(this.config.specialists.agents);
    return this.specialists.filter((s) => {
      // Must be in the enabled agents list
      if (!enabledNames.has(s.name)) return false;
      // Must trigger on this event type
      if (!s.triggerEvents.includes(eventType)) return false;
      // If watch patterns defined, at least one file must match after exclusions
      if (s.watchPatterns && s.watchPatterns.length > 0) {
        const positivePatterns = s.watchPatterns.filter(
          (p) => !p.startsWith("!"),
        );
        const negativePatterns = s.watchPatterns
          .filter((p) => p.startsWith("!"))
          .map((p) => p.slice(1));

        const matchedFiles = changedFiles.filter((f) => {
          const included =
            positivePatterns.length === 0 ||
            positivePatterns.some((p) => minimatch(f, p));
          if (!included) return false;
          const excluded = negativePatterns.some((p) => minimatch(f, p));
          return !excluded;
        });

        if (matchedFiles.length === 0) return false;
      }
      return true;
    });
  }

  /** Check if specialist is on cooldown for a repo */
  isOnCooldown(specialist: string, repo: string): boolean {
    const key = `${specialist}:${repo}`;
    const lastRun = this.cooldowns.get(key);
    if (!lastRun) return false;
    const cooldownMs = (this.config.specialists?.cooldownSeconds ?? 300) * 1000;
    return Date.now() - lastRun < cooldownMs;
  }

  /** Record that a specialist ran (for cooldown tracking) */
  recordRun(specialist: string, repo: string): void {
    this.cooldowns.set(`${specialist}:${repo}`, Date.now());
  }

  /** Get remaining cooldown in seconds (0 = ready) */
  getCooldownRemaining(specialist: string, repo: string): number {
    const key = `${specialist}:${repo}`;
    const lastRun = this.cooldowns.get(key);
    if (!lastRun) return 0;
    const cooldownMs = (this.config.specialists?.cooldownSeconds ?? 300) * 1000;
    const remaining = cooldownMs - (Date.now() - lastRun);
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }
}
