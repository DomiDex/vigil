import type { ChannelEntry } from "./schema.ts";

/**
 * Multi-gate activation chain for channel notifications.
 * Each layer can independently block — mirrors Kairos's 6-gate pattern.
 *
 * Gate order (cheapest checks first):
 * 1. Build-time: feature('VIGIL_CHANNELS') — compiled out if disabled
 * 2. Runtime: feature gate check (kill-switch, refreshed with TTL)
 * 3. Auth: require authenticated connection (no anonymous channels)
 * 4. Policy: organization/team settings must allow channels
 * 5. Session: server must be declared in --channels flag
 * 6. Allowlist: server must be in approved list (or dev mode)
 */
export interface GateContext {
  featureEnabled: boolean;
  runtimeEnabled: boolean;
  isAuthenticated: boolean;
  orgChannelsAllowed: boolean;
  sessionChannels: string[];
  allowlist: string[];
  devMode: boolean;
}

export interface GateResult {
  allowed: boolean;
  deniedAt?: string;
  reason?: string;
}

export function checkChannelGates(channel: ChannelEntry, ctx: GateContext): GateResult {
  // Gate 1: Build-time feature flag
  if (!ctx.featureEnabled) {
    return { allowed: false, deniedAt: "build-time", reason: "VIGIL_CHANNELS not enabled" };
  }

  // Gate 2: Runtime kill-switch (TTL-refreshed)
  if (!ctx.runtimeEnabled) {
    return { allowed: false, deniedAt: "runtime", reason: "Channels disabled via runtime gate" };
  }

  // Gate 3: Auth requirement
  if (!ctx.isAuthenticated) {
    return { allowed: false, deniedAt: "auth", reason: "Channel requires authenticated connection" };
  }

  // Gate 4: Organization policy
  if (!ctx.orgChannelsAllowed) {
    return { allowed: false, deniedAt: "policy", reason: "Organization has not enabled channels" };
  }

  // Gate 5: Session declaration
  if (!ctx.sessionChannels.includes(channel.name)) {
    return { allowed: false, deniedAt: "session", reason: `Channel "${channel.name}" not declared in --channels` };
  }

  // Gate 6: Allowlist (bypassed in dev mode)
  if (!channel.dev && !ctx.devMode && !ctx.allowlist.includes(channel.name)) {
    return { allowed: false, deniedAt: "allowlist", reason: `Channel "${channel.name}" not in approved list` };
  }

  return { allowed: true };
}
