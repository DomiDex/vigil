---
title: Feature Gates
type: concept
updated: 2026-04-19
sources:
  - src/core/feature-gates.ts
  - src/build/features.ts
  - src/core/features.ts
  - src/core/daemon.ts
---

# Feature Gates

Every optional subsystem in Vigil passes through **four gating layers** before it runs. Layers fail closed: if any one returns false, the feature is off.

| Layer | Source of truth | Purpose |
|---|---|---|
| L1 **Build** | `src/build/features.ts` + `feature("VIGIL_*")` checks | Let the bundler strip whole modules via dead-code elimination |
| L2 **Config** | `config.features[name]` in `~/.vigil/config.json` | User opt-in per installation |
| L3 **Runtime** | Optional remote URL with 5-min TTL | Emergency kill switch / rollout percentages |
| L4 **Session** | Per-daemon-run map | Finer-grained opt-in for a single watch session |

Implementation: `FeatureGates` class at `src/core/feature-gates.ts:17`.

## Registry

Central list of flags at `src/core/features.ts:5`. Known flags:

| Flag | Phase | Subsystem |
|---|---|---|
| `VIGIL_WATCHER` | always on | Git watcher |
| `VIGIL_DECISION_ENGINE` | always on | Decision engine |
| `VIGIL_AGENT_IDENTITY` | 8 | Per-repo agent files |
| `VIGIL_BRIEF` | 9 | Brief-mode output |
| `VIGIL_PROACTIVE` | 10 | WorkDetector + AdaptiveSleep |
| `VIGIL_CHANNELS` | 11 | MCP channel notifications |
| `VIGIL_WEBHOOKS` | 12 | GitHub webhook server |
| `VIGIL_PUSH` | 13 | Push notifications |
| `VIGIL_SESSIONS` | 14 | Session management |
| `VIGIL_SPECIALISTS` | sa-phase | Specialist agents |

See [Feature Flags reference](../reference/feature-flags.md) for the full table.

## L1 — Build-time elimination

Inside `src/core/daemon.ts:30-70` you'll see patterns like:

```ts
const specialistsMod = feature("VIGIL_SPECIALISTS")
  ? (require("../specialists/router.ts") as typeof import("..."))
  : null;
```

`feature()` from `src/build/features.ts` is a constant expression for the bundler. When the flag is off, the `require(...)` branch is dead — the entire subsystem's code and transitive deps get tree-shaken. This is what keeps the "lite" build thin (`build.config.ts --lite`).

Type-only imports below (`import type …`) remain zero-cost because they erase at compile time.

## L2 — Config

```json
// ~/.vigil/config.json
{
  "features": {
    "VIGIL_SPECIALISTS": true,
    "VIGIL_PROACTIVE": false
  }
}
```

Any flag not present in `features` defaults to `true` for flags shipped in the build. `FeatureGates.isEnabled` ANDs this with other layers.

## L3 — Runtime (remote)

If configured, `FeatureGates` polls a remote URL every 5 min. Returns stale-on-error, so a network blip doesn't flip features. This is the kill switch used by e.g. the [ClaudeClaw spec](../roadmap/claudeclaw.md) for Emergency Stop.

## L4 — Session

`setSessionFlag(name, enabled)` lets a `vigil watch` invocation turn a feature on/off just for that run. Useful for development (`--brief`, experimental specialists) without touching global config.

## Evaluation surface

- `isEnabled(name)` @ `src/core/feature-gates.ts:69` — async, consults all four layers.
- `isEnabledCached(name)` @ `src/core/feature-gates.ts:~85` — sync, uses last-seen remote value. For hot paths (every tick).
- `diagnose(name)` @ `src/core/feature-gates.ts:94` — returns per-layer status. Used by the [Config plugin](../dashboard/plugins.md#config) feature-gates tab.

## Dashboard exposure

`GET /api/config/features` returns the full diagnose output for every registered flag. The UI in `dashboard-v2/src/plugins/config/` renders a table with layer-colored badges so you can see exactly *why* a flag is off.

Toggle is done via `POST /api/config/features` → `toggleFeatureGate({name, enabled})` server function. This flips the config layer only (L1 is bundler-time, L3 is external, L4 is session).

## Rule of thumb

If you add a new subsystem:

1. Add a `VIGIL_<NAME>` constant to both `src/build/features.ts` and `src/core/features.ts`.
2. Wrap all top-level imports in the daemon with `feature("VIGIL_<NAME>") ? require(...) : null` for build-time elimination.
3. Add a config default (usually `true`).
4. Wire any hot-path check through `isEnabledCached` to avoid async overhead.

## See also

- [Architecture Overview](architecture.md#four-feature-gate-layers) — where gates fit in the big picture.
- [Reference → Feature Flags](../reference/feature-flags.md).
