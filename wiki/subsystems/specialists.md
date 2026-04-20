---
title: Specialists Subsystem
type: subsystem
updated: 2026-04-19
sources:
  - src/specialists/router.ts
  - src/specialists/runner.ts
  - src/specialists/store.ts
  - src/specialists/types.ts
  - src/specialists/schemas.ts
  - src/specialists/agents/index.ts
  - src/specialists/agents/code-review.ts
  - src/specialists/agents/security.ts
  - src/specialists/agents/test-drift.ts
  - src/specialists/agents/flaky-test/scorer.ts
  - plan/specialized-agents-spec.md
  - plan/specialized-agents-big-plan.md
---

# Specialists

`src/specialists/` implements the post-decision fan-out. After the primary [Decision Engine](../concepts/decision-engine.md) records its SILENT/OBSERVE/NOTIFY/ACT verdict, the router matches the current event against specialized sub-agents and runs the matches in parallel. Specialists can **only add findings** — they cannot change the primary decision.

Phases 0–8 are shipped (see `sa-phase-*-status.json` at repo root).

## Four built-in specialists

| Name | Class | Trigger | Notes |
|---|---|---|---|
| `code-review` | analytical (LLM) | `new_commit` on `src/**/*.ts` excluding tests | Flags logic/API/perf issues in the diff |
| `security` | analytical (LLM) | `file_change`, `new_commit` | Hardcoded secrets, OWASP patterns, bad deps |
| `test-drift` | analytical (LLM) | `new_commit`, `file_change` | Source changed, tests didn't |
| `flaky-test` | **deterministic** (no LLM) | after `run_tests` action | Statistical scoring from test history |

Registry: `BUILTIN_SPECIALISTS` array + `createFlakyTestAgent(store, config)` factory in `src/specialists/agents/index.ts:1-12`.

## types.ts

`src/specialists/types.ts:1-58`:

```ts
type SpecialistName = "code-review" | "security" | "test-drift" | "flaky-test";
type SpecialistClass = "deterministic" | "analytical";
type FindingSeverity  = "info" | "warning" | "critical";

interface SpecialistConfig {
  name, class, description, model?,
  triggerEvents, watchPatterns,
  buildPrompt?,    // analytical only
  execute?,        // deterministic only
}

interface SpecialistContext {
  repoName, repoPath, branch, diff,
  changedFiles, recentCommits, recentFindings,
  testRunResult?
}

interface Finding {
  id, specialist, severity, title, detail,
  file?, line?, suggestion?
}
```

## router.ts — matching

`src/specialists/router.ts:1-65`:

- **`match(eventType, changedFiles)`** (`:14`) filters all registered specialists by:
  - `config.specialists.enabled` is true and the agent is in `config.specialists.agents[]`.
  - `triggerEvents` includes the current event type.
  - `watchPatterns` matches via `minimatch` (with `!` prefix for negation).
  - Not on cooldown.
- **Cooldown** (`:42`) — per-specialist-per-repo, default 300s from `config.specialists.cooldownSeconds`. `recordRun(name, repo)` resets the timer.

## runner.ts — execution

`src/specialists/runner.ts:1-130+`:

- **`run(spec, context)`** (`:11`) — 10s timeout per specialist.
  - Deterministic: calls `spec.execute(context, store, config)`.
  - Analytical: calls `spec.buildPrompt(context)` → `callClaude` with model override → validates response against `SpecialistResponseSchema` in `schemas.ts`.
- **`runAll(specs, contextFactory)`** (`:68`) — parallel up to `config.specialists.maxParallel` (default 2). Accepts a factory so each specialist gets a freshly-merged context (e.g. its own `recentFindings` to dedupe).

## store.ts — persistence

`src/specialists/store.ts:1-350+`. SQLite tables (see [full schema](../reference/sqlite-schemas.md#specialists)):

| Table | Role |
|---|---|
| `findings` | Every finding ever emitted. Dedup key = `(specialist, repo, title, file, line)`. |
| `specialist_config` | User-defined agent overrides + built-in toggles. |
| `test_runs` | One row per test result per commit. |
| `flakiness` | Aggregate stats per `(repo, test_name)` — pass/fail counts, flaky-commit list. |

Key methods:

- `storeFinding(f)` — insert with dedup.
- `getRecentFindings(repo, specialist?, limit)` — for the Findings tab.
- `upsertSpecialistConfig(cfg)` / `toggleSpecialist(name)`.
- `storeTestRun(row)` — called by the flaky-test agent.
- `getFlakinessStats(repo)` — aggregates for the Flaky Tests tab.

## Agents

### code-review
`src/specialists/agents/code-review.ts:1-47`. Analytical. Reads the diff, looks for logic errors, API misuse, performance issues. Explicitly avoids style/formatting to keep signal high.

### security
`src/specialists/agents/security.ts`. Analytical. Hardcoded credentials, vulnerable dep patterns, OWASP-style sinks.

### test-drift
`src/specialists/agents/test-drift.ts`. Analytical. Correlates changed source files against test coverage to flag uncovered paths.

### flaky-test (deterministic)
`src/specialists/agents/flaky-test/`:

- `parser.ts` — parses JUnit XML, tap, Bun/Jest/Mocha console formats.
- `scorer.ts` — computes a flakiness score from `flakiness` row totals with recency weighting.
- Config: `config.specialists.flakyTest.{testCommand, runOnCommit, minRunsToJudge, flakyThreshold, maxTestHistory}`.

## Daemon integration

`Daemon.handleTick` runs specialists in two places (see `src/core/daemon.ts`):

1. **Post-decision** — after any event that might trigger specialists, call `SpecialistRouter.match` + `SpecialistRunner.runAll` with a context built from the current tick.
2. **Auto-action path** — when `config.specialists.autoAction.enabled` and a finding meets `minSeverity` + `minConfidence` and fits inside `tierCap`, automatically queue an action via the [ActionExecutor](actions.md).

## Dashboard surface

Under the [Agents plugin](../dashboard/plugins.md#agents):

- **Specialists tab** — grid of `SpecialistCard` with toggle, run-now, edit. Queries `getSpecialists()`.
- **Findings tab** — paginated table with filters (specialist / severity / repo). Opens `FindingDetailSheet` for detail, dismissal (optionally with an ignore pattern), and "Create action from finding".
- **Flaky Tests tab** — table with pass rate, status badge (FLAKY/STABLE), run-now and reset buttons.
- **Persona tab** — the per-repo agent identity (not specialists, but co-located under `/agents`).

API routes under `/api/specialists/*` — see [API Routes](../reference/api-routes.md#specialists).

## Roadmap

Phases 0–8 shipped. Future (aspirational) — see [Roadmap → Specialists](../roadmap/specialists.md):

- Merge Conflict Predictor
- Context Restoration
- Stale Test Observer
- Branch Hygiene Manager
- Breaking Dependency Radar

## See also

- [Action Gates](../concepts/action-gates.md) — the gate path auto-actions go through.
- [SQLite Schemas → Specialists](../reference/sqlite-schemas.md#specialists).
- [Dashboard Plugins → Agents](../dashboard/plugins.md#agents).
