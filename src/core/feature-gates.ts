import { readFileSync } from "node:fs";

export interface FeatureGateConfig {
  /** Path to config file for layer 2 */
  configPath: string;
  /** URL for remote feature flags (layer 3) */
  remoteUrl?: string;
  /** TTL for remote flag refresh in ms (default 5 min) */
  remoteTTL: number;
}

interface RemoteFlagCache {
  flags: Record<string, boolean>;
  fetchedAt: number;
}

type GateLayer = "build" | "config" | "runtime" | "session";

/**
 * Multi-layer feature gating system.
 *
 * Layer 1: Build-time — compile out entire modules
 * Layer 2: Config-time — enabled in ~/.vigil/config.json
 * Layer 3: Runtime — TTL-refreshed remote kill-switch
 * Layer 4: Session — per-session opt-in state
 *
 * Each layer is independent. A feature requires ALL layers to pass.
 */
export class FeatureGates {
  private buildFlags: Record<string, boolean> = {};
  private configFlags: Record<string, boolean> = {};
  private remoteCache: RemoteFlagCache = { flags: {}, fetchedAt: 0 };
  private remoteTTL: number;
  private remoteUrl?: string;
  private sessionFlags: Record<string, boolean> = {};
  private configPath: string;

  constructor(config: FeatureGateConfig) {
    this.remoteTTL = config.remoteTTL;
    this.remoteUrl = config.remoteUrl;
    this.configPath = config.configPath;
  }

  /** Set a build-time flag (Layer 1). Called once at startup. */
  setBuildFlag(name: string, enabled: boolean): void {
    this.buildFlags[name] = enabled;
  }

  /** Load config flags from file (Layer 2). */
  loadConfigFlags(): void {
    try {
      const raw = readFileSync(this.configPath, "utf-8");
      const config = JSON.parse(raw);
      this.configFlags = config.features ?? {};
    } catch {
      this.configFlags = {};
    }
  }

  /** Set a session flag (Layer 4). */
  setSessionFlag(name: string, enabled: boolean): void {
    this.sessionFlags[name] = enabled;
  }

  /**
   * Check if a feature is enabled through ALL layers.
   * A feature defaults to enabled unless explicitly disabled at any layer.
   */
  async isEnabled(name: string): Promise<boolean> {
    if (this.buildFlags[name] === false) return false;
    if (this.configFlags[name] === false) return false;

    const remoteEnabled = await this.checkRemoteFlag(name);
    if (remoteEnabled === false) return false;

    if (this.sessionFlags[name] === false) return false;

    return true;
  }

  /**
   * Synchronous version — uses cached remote value.
   * Use for hot paths where async isn't viable. Value may be up to TTL-ms stale.
   */
  isEnabledCached(name: string): boolean {
    if (this.buildFlags[name] === false) return false;
    if (this.configFlags[name] === false) return false;
    if (this.remoteCache.flags[name] === false) return false;
    if (this.sessionFlags[name] === false) return false;
    return true;
  }

  /** Debug: which layer blocked a feature? */
  async diagnose(name: string): Promise<Record<GateLayer, boolean | undefined>> {
    return {
      build: this.buildFlags[name] ?? true,
      config: this.configFlags[name] ?? true,
      runtime: await this.checkRemoteFlag(name),
      session: this.sessionFlags[name] ?? true,
    };
  }

  /**
   * Check remote flag with TTL refresh.
   * Flipping the remote flag off mid-session disables the feature on the next refresh cycle.
   */
  private async checkRemoteFlag(name: string): Promise<boolean | undefined> {
    if (!this.remoteUrl) return undefined;

    const now = Date.now();
    if (now - this.remoteCache.fetchedAt < this.remoteTTL) {
      return this.remoteCache.flags[name];
    }

    try {
      const resp = await fetch(this.remoteUrl, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const data = (await resp.json()) as Record<string, boolean>;
        this.remoteCache = { flags: data, fetchedAt: now };
      }
    } catch {
      // Use stale cache on failure — never crash on flag fetch
      this.remoteCache.fetchedAt = now;
    }

    return this.remoteCache.flags[name];
  }
}
