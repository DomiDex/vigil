/**
 * Build configuration for feature-gated Vigil builds.
 *
 * Full build: all features enabled (default)
 * Lite build: core only (watcher + decision engine + console output)
 * Custom: pick features via env vars
 *
 * Examples:
 *   bun run build                                    # Full build
 *   bun run build:lite                               # Lite (no webhooks, push, channels)
 *   FEATURE_VIGIL_WEBHOOKS=false bun run build       # Custom: disable webhooks only
 */

import { BUILD_FEATURES } from "./src/build/features.ts";

const isLite = process.argv.includes("--lite");

const featureDefines: Record<string, string> = {};
for (const name of BUILD_FEATURES) {
  const envKey = `FEATURE_${name}`;
  const envVal = process.env[envKey];
  // --lite disables everything; otherwise check env, default to true
  const enabled = isLite ? false : envVal !== "false";
  featureDefines[envKey] = String(enabled);
}

const result = await Bun.build({
  entrypoints: ["./src/cli/index.ts"],
  outdir: "./dist",
  target: "bun",
  define: featureDefines,
  minify: true,
  sourcemap: "external",
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log("Build complete. Features:");
for (const [key, val] of Object.entries(featureDefines)) {
  const status = val === "true" ? "enabled" : "DISABLED";
  console.log(`  ${key.replace("FEATURE_VIGIL_", "").toLowerCase()}: ${status}`);
}
