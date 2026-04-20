---
title: Feature Flags
type: reference
updated: 2026-04-19
sources:
  - src/build/features.ts
  - src/core/features.ts
  - src/core/feature-gates.ts
---

# Feature Flags

Every optional subsystem goes through four gate layers — see [Feature Gates concept](../concepts/feature-gates.md). The registry lives in two mirrored files:

- `src/build/features.ts` — build-time constants (for tree-shaking).
- `src/core/features.ts` — runtime registry.

## Known flags

| Flag | Phase | Layer-1 subsystems stripped when off | Shipped? |
|---|---|---|---|
| `VIGIL_WATCHER` | always on | `src/git/` | yes |
| `VIGIL_DECISION_ENGINE` | always on | `src/llm/decision-max.ts` | yes |
| `VIGIL_AGENT_IDENTITY` | 8 | `src/agent/` | yes |
| `VIGIL_BRIEF` | 9 | brief-mode output | yes |
| `VIGIL_PROACTIVE` | 10 | `WorkDetector`, `AdaptiveSleep` | yes (flag-gated) |
| `VIGIL_CHANNELS` | 11 | `src/channels/`, `src/messaging/channels/push.ts` | yes (flag-gated) |
| `VIGIL_WEBHOOKS` | 12 | `src/webhooks/` | yes (flag-gated) |
| `VIGIL_PUSH` | 13 | `src/messaging/channels/push.ts`, `src/messaging/backends/*` | yes (flag-gated) |
| `VIGIL_SESSIONS` | 14 | `src/core/session.ts` | yes |
| `VIGIL_SPECIALISTS` | sa-phase | `src/specialists/` | yes (phases 0–8) |
| `VIGIL_TASKS` | — | dashboard tasks plugin (gate) | yes |
| `VIGIL_SCHEDULER` | — | dashboard scheduler plugin (gate) | yes |
| `VIGIL_A2A` | — | `src/llm/a2a-server.ts`, dashboard a2a plugin | yes (flag-gated) |

## How the layers stack

| Layer | What it does |
|---|---|
| **L1 Build** | `feature("VIGIL_*")` in `src/build/features.ts` lets the bundler eliminate whole subsystems. `src/core/daemon.ts:30-70` wraps imports in `feature() ? require(...) : null`. |
| **L2 Config** | `config.features[name]` in `~/.vigil/config.json`. Togglable from the [Config plugin](../dashboard/plugins.md#config). |
| **L3 Runtime** | Optional remote URL polled every 5 min (stale-on-error). Used for kill switches and phased rollouts. |
| **L4 Session** | `setSessionFlag(name, enabled)` lets a single `vigil watch` invocation turn a feature on/off for that run. |

## Evaluation

From `src/core/feature-gates.ts`:

- `isEnabled(name)` — async, ANDs all four layers.
- `isEnabledCached(name)` — sync, uses last-seen remote value. For hot paths.
- `diagnose(name)` — returns `{build, config, runtime, session, effective}` per-layer. Powers the UI.

## Adding a flag

1. Add the constant to both `src/build/features.ts` and `src/core/features.ts`.
2. In `src/core/daemon.ts`, wrap the subsystem's top-level imports in `feature("VIGIL_NEW") ? require(...) : null` so L1 strips dead branches.
3. Add a default in the config (usually `true`) and any related config fields.
4. Use `isEnabledCached` in hot-path checks.
5. Document here.

## See also

- [Feature Gates concept](../concepts/feature-gates.md)
- [Config Schema](config-schema.md)
