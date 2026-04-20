---
title: Project Status
type: roadmap
updated: 2026-04-19
sources:
  - sa-phase-*-status.json
  - phase-*-status.json
  - plan/big-plan.md
  - plan/specialized-agents-big-plan.md
---

# Project Status

Snapshot as of **2026-04-19**, commit `616636d` on branch `feat/sa-phase-7-dashboard-specialists`.

## Subsystem status

| Subsystem | Status | Notes |
|---|---|---|
| Core daemon | **shipped** | Ticks, sleep, dream, tasks all live |
| LLM decision engine | **shipped** | `decision-max.ts` via `claude -p` |
| Memory (JSONL + FTS5) | **shipped** | 4 tiers + cross-repo |
| Git watcher | **shipped** | fs.watch + polling + dedup |
| Specialists | **shipped** — Phases 0–8 | code-review, security, test-drift, flaky-test |
| Messaging | **shipped** | Console, JSONL, push (native + ntfy) |
| Channels | **shipped (flag-gated)** | MCP-style; no Slack/Telegram backends yet |
| Webhooks | **shipped (flag-gated)** | GitHub only |
| Actions | **shipped** | 6-gate executor |
| Dashboard backend | **shipped** | Single-port Bun.serve + plugin loader |
| Dashboard frontend | **in-flight** | TanStack Start + 16 plugins; Phase 3 PR open |

## Dashboard v2 phases

From `plan/big-plan.md`:

| Phase | Title | Status |
|---|---|---|
| 0 | Validation spike | shipped (`phase-0-status.json`) |
| 1 | Scaffold | shipped |
| 2 | Shell layout | shipped |
| 3 | Plugin system + Timeline | **PR open** (`phase-3-status.json`) |
| 4 | Port core plugins | in-flight |
| 5 | New core plugins (Config/Webhooks/Channels/Notifications/A2A) | in-flight |
| 6 | User plugin support | aspirational |
| 7 | Remove HTMX legacy | aspirational |

## Specialist Agents phases (all shipped)

From `plan/specialized-agents-big-plan.md`:

| Phase | Title | Status |
|---|---|---|
| 0 | Types, config, storage | shipped |
| 1 | Router + Runner | shipped |
| 2 | Built-in agents | shipped |
| 3 | Daemon integration | shipped |
| 4 | Flaky test detector | shipped |
| 5 | CLI extensions | shipped |
| 6 | Backend API | shipped |
| 7 | Dashboard tab | shipped |
| 8 | Dashboard flaky tab + actions source filter | shipped |

## Aspirational tracks

These are documented as specs but have no code yet:

- **[ClaudeClaw features](claudeclaw.md)** — 10-feature security + coordination wave (auth, salience decay, embedding search, exfiltration guard, hive mind, cost tracking, priority tasks, briefing cards, extra channels, emergency stop).
- **[Kairos advanced features](kairos.md)** — continued port from the Claude Code Kairos daemon; Phases 10, 11, 14 partially live via existing flags.
- **[Workflow agents](specialists.md#future-workflow-agents)** — 5 proposed specialists (merge conflict predictor, context restoration, stale test observer, branch hygiene, breaking deps).

## What's moving right now

- Finishing Dashboard v2 Phase 4/5 (porting and new plugins).
- Reviewing `sa-phase-8` follow-up PR on the flaky tests tab.
- Config hot-reload UX (the feature-gates diagnose output is in place; the matching UI is landing with Phase 5).

## Recent commits (context)

```
616636d fix(sa-phase-8): address code review on FlakyTestsTab
1a84a38 feat(sa-phase-8): dashboard flaky tests tab & actions source filter
cd4e56e feat(sa-phase-7): dashboard specialists tab & findings
f706c08 fix(sa-phase-6): address code review
7393da7 feat(sa-phase-6): backend API for specialists subsystem
```

Pull with `git -C /home/domidex/projects/vigil log --oneline -10` for current.

## See also

- [Architecture Overview](../concepts/architecture.md)
- Individual roadmap pages: [dashboard-v2](dashboard-v2.md), [specialists](specialists.md), [claudeclaw](claudeclaw.md), [kairos](kairos.md).
