/**
 * Build-time feature flags for dead code elimination.
 *
 * Kairos ref: `import { feature } from 'bun:bundle'`
 *
 * In Kairos, `feature()` is a Bun bundler primitive that returns
 * a compile-time constant boolean. The bundler constant-folds
 * `feature('X') ? require('./module') : null` and eliminates
 * the unused branch + its transitive dependencies.
 *
 * Vigil equivalent: define flags that the bundler replaces at build time.
 * `bun build --define:FEATURE_VIGIL_CHANNELS=false` etc.
 *
 * At dev time (unbundled), all features default to enabled.
 */

// Declared globals — bundler replaces these with literal true/false
declare const FEATURE_VIGIL_CHANNELS: boolean;
declare const FEATURE_VIGIL_WEBHOOKS: boolean;
declare const FEATURE_VIGIL_PUSH: boolean;
declare const FEATURE_VIGIL_PROACTIVE: boolean;
declare const FEATURE_VIGIL_SESSIONS: boolean;
declare const FEATURE_VIGIL_AGENT: boolean;
declare const FEATURE_VIGIL_SPECIALISTS: boolean;

/**
 * Build-time feature check. Bundler replaces the global with a constant,
 * then dead-code-eliminates the unused branch.
 *
 * Usage (matches Kairos pattern):
 * ```ts
 * const mod = feature('VIGIL_CHANNELS')
 *   ? require('./channels/handler.ts')
 *   : null;
 * ```
 *
 * When unbundled (dev mode), all features return true.
 */
export function feature(name: string): boolean {
  switch (name) {
    case "VIGIL_CHANNELS":
      return typeof FEATURE_VIGIL_CHANNELS !== "undefined" ? FEATURE_VIGIL_CHANNELS : true;
    case "VIGIL_WEBHOOKS":
      return typeof FEATURE_VIGIL_WEBHOOKS !== "undefined" ? FEATURE_VIGIL_WEBHOOKS : true;
    case "VIGIL_PUSH":
      return typeof FEATURE_VIGIL_PUSH !== "undefined" ? FEATURE_VIGIL_PUSH : true;
    case "VIGIL_PROACTIVE":
      return typeof FEATURE_VIGIL_PROACTIVE !== "undefined" ? FEATURE_VIGIL_PROACTIVE : true;
    case "VIGIL_SESSIONS":
      return typeof FEATURE_VIGIL_SESSIONS !== "undefined" ? FEATURE_VIGIL_SESSIONS : true;
    case "VIGIL_AGENT":
      return typeof FEATURE_VIGIL_AGENT !== "undefined" ? FEATURE_VIGIL_AGENT : true;
    case "VIGIL_SPECIALISTS":
      return typeof FEATURE_VIGIL_SPECIALISTS !== "undefined" ? FEATURE_VIGIL_SPECIALISTS : true;
    default:
      return true;
  }
}

/** All known build-time feature names */
export const BUILD_FEATURES = [
  "VIGIL_CHANNELS",
  "VIGIL_WEBHOOKS",
  "VIGIL_PUSH",
  "VIGIL_PROACTIVE",
  "VIGIL_SESSIONS",
  "VIGIL_AGENT",
  "VIGIL_SPECIALISTS",
] as const;

export type BuildFeatureName = (typeof BUILD_FEATURES)[number];
