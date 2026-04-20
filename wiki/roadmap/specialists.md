---
title: Specialist Agents Roadmap
type: roadmap
updated: 2026-04-19
sources:
  - plan/specialized-agents-spec.md
  - plan/specialized-agents-big-plan.md
  - plan/workflow-agents-spec.md
  - plan/sa-phase-0.md … plan/sa-phase-8.md
---

# Specialist Agents Roadmap

Specialized sub-LLMs that run after the primary decision, each scoped to a narrow concern. All 9 phases (0–8) are shipped. Future workflow agents are specced but not implemented.

## Why specialists

Sub-LLMs with a tight prompt and tight watch patterns outperform the generalist:

- **5–10× detection improvement** on the dimension they cover.
- **Flaky tests** identified in hours instead of weeks.
- **Security shift-left** — secrets/vulns caught at commit, not in CI.
- LLM-call multiplier is ~2–4×, negligible on Max subscription (haiku).

## Shipped phases (0–8)

| Phase | Title | Artifact |
|---|---|---|
| 0 | Types, config, storage | `src/specialists/types.ts`, `schemas.ts`, `store.ts` + SQLite tables |
| 1 | Router + Runner | `router.ts`, `runner.ts` with parallel exec |
| 2 | Built-in agents | `agents/code-review.ts`, `security.ts`, `test-drift.ts` |
| 3 | Daemon integration | Post-decision hooks in `src/core/daemon.ts:handleTick` |
| 4 | Flaky test detector | `agents/flaky-test/*` — deterministic, no LLM |
| 5 | CLI extensions | `bun run src/cli/index.ts specialist …` subcommands |
| 6 | Backend API | `/api/specialists/*` + SSE events |
| 7 | Dashboard specialists tab | `src/plugins/agents/SpecialistsTab.tsx` + `FindingsTab.tsx` |
| 8 | Dashboard flaky tab + actions source filter | `src/plugins/agents/FlakyTestsTab.tsx`, Actions source filter |

See `sa-phase-*-status.json` for per-phase signoffs.

## Four built-in agents

| Agent | Class | Trigger |
|---|---|---|
| `code-review` | analytical | `new_commit` on `src/**/*.ts` excluding tests |
| `security` | analytical | `file_change`, `new_commit` |
| `test-drift` | analytical | `new_commit`, `file_change` |
| `flaky-test` | deterministic | after `run_tests` action |

Detail: [Subsystems → Specialists](../subsystems/specialists.md).

## Future workflow agents (aspirational)

From `plan/workflow-agents-spec.md`. These exploit Vigil's always-on position to detect temporal patterns:

1. **Merge Conflict Predictor** — warns before conflicts form on long-running branches. Target: 30–120 min saved per merge.
2. **Context Restoration** — reconstructs work-in-progress context after an interruption (branch switch, long break). Target: 15–45 min saved.
3. **Stale Test Observer** — detects tests that diverged from source (semantic drift, not just failing). Target: shift-left by days.
4. **Branch Hygiene Manager** — automated weekly cleanup of stale branches, with per-branch rationale. Target: 10 min/week + less confusion.
5. **Breaking Dependency Radar** — alerts on lockfile changes with version conflicts that will break downstream. Target: hours of debugging avoided.

Estimated cost: 5–15 haiku calls per day total — negligible.

Status: specification only. All five depend on the shipped specialist architecture (Phases 0–8) so the lift is mostly prompt + config + plugin wiring.

## See also

- [Subsystems → Specialists](../subsystems/specialists.md) — implementation detail.
- [Action Gates](../concepts/action-gates.md) — auto-action path specialists can invoke.
- Specification docs: `plan/specialized-agents-spec.md`, `plan/workflow-agents-spec.md`.
