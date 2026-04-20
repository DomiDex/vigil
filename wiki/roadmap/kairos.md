---
title: Kairos Advanced Features Roadmap
type: roadmap
updated: 2026-04-19
sources:
  - plan/kairos-advanced-features-plan.md
---

# Kairos Advanced Features

Ten phases porting advanced capabilities from the Claude Code Kairos daemon into Vigil. Several are partially live behind feature flags; others are specced but not implemented.

## Phase-by-phase status

| # | Phase | What it delivers | Status |
|---|---|---|---|
| 8 | Agent definition loader | Per-repo `.claude/agents/vigil.md` with YAML frontmatter | **shipped** (`src/agent/agent-loader.ts`) |
| 9 | Brief mode / SendUserMessage tool | Terse output mode + LLM tool to emit user-facing messages | **partially shipped** — `briefMode` config + `VIGIL_BRIEF` flag, tool contract TBD |
| 10 | Proactive mode / tick-driven work cycles | `WorkDetector` + `AdaptiveSleep` | **shipped** (flag: `VIGIL_PROACTIVE`) |
| 11 | Channel notifications from MCP servers | MCP-style named channels | **shipped** (flag: `VIGIL_CHANNELS`) — see [Channels](../subsystems/channels.md) |
| 12 | GitHub webhooks / SubscribePR | Webhook receiver + per-repo subscriptions | **shipped** (flag: `VIGIL_WEBHOOKS`) |
| 13 | Push notifications | native + ntfy + rate limiting | **shipped** (flag: `VIGIL_PUSH`) |
| 14 | Session management | Per-run session state, crash detection, resume | **shipped** — `src/core/session.ts` |
| 15 | Multi-layer gating / kill switches | 4-layer feature gates incl. remote kill | **shipped** — see [Feature Gates](../concepts/feature-gates.md) |
| 16 | System prompt caching with TTL | Scoped section cache keyed by stable/session/ephemeral | **shipped** — see [Prompt Cache](../concepts/prompt-cache.md) |
| 17 | Dead code elimination (build-time) | `feature()` ternaries tree-shake disabled modules | **shipped** — `src/build/features.ts` + daemon imports |

## What still matters

Phases 10, 11, 14, 15, 16, 17 are the structural scaffolding that makes the rest of Vigil extensible without per-build reshuffling. They should be considered part of the core architecture, not optional extras.

Phase 9 (brief mode) landed but the **SendUserMessage** LLM-tool contract is still sketchy — today the "message to user" path is the decision engine returning `NOTIFY` with a `message` field. A dedicated tool would let the model send user messages from inside a longer chain of tool calls without having to round-trip through the decision schema.

## Open seams

- **Remote L3 runtime gating** is in place but no production URL is wired up. Ops task.
- **Session crash replay** — `getLastSession()` returns the previous `active`/`crashed` row, but the auto-resume flow doesn't yet rebuild all in-memory state on daemon restart.
- **Push rate limiting** — the `maxPerHour` config is honored but there's no queue backoff; bursts are dropped silently.

## See also

- [Feature Flags](../reference/feature-flags.md) — per-flag table.
- [Proactive Mode](../concepts/proactive-mode.md) — Phase 10 deep dive.
- [Prompt Cache](../concepts/prompt-cache.md) — Phase 16 deep dive.
