/**
 * Central feature registry — all Vigil features declared in one place.
 * Prevents magic strings and makes feature audit trivial.
 */
export const FEATURES = {
  // Core
  VIGIL_WATCHER: "vigil.watcher",
  VIGIL_DECISION_ENGINE: "vigil.decision_engine",

  // Phase 8
  VIGIL_AGENT_IDENTITY: "vigil.agent_identity",

  // Phase 9
  VIGIL_BRIEF: "vigil.brief",

  // Phase 10
  VIGIL_PROACTIVE: "vigil.proactive",

  // Phase 11
  VIGIL_CHANNELS: "vigil.channels",

  // Phase 12
  VIGIL_WEBHOOKS: "vigil.webhooks",

  // Phase 13
  VIGIL_PUSH: "vigil.push_notifications",

  // Phase 14
  VIGIL_SESSIONS: "vigil.sessions",
} as const;

export type FeatureName = (typeof FEATURES)[keyof typeof FEATURES];
