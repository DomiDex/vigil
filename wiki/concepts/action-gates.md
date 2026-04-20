---
title: Action Gates
type: concept
updated: 2026-04-19
sources:
  - src/action/executor.ts
  - src/core/config.ts
---

# Action Gates

Before Vigil executes any proposed action on a repo, the request passes through six gates. Gates fail closed and are evaluated in order — first failure aborts.

## The six gates

From `ActionExecutor` (`src/action/executor.ts:94`):

1. **L1 — Global enable.** `config.actions.enabled` must be true.
2. **L2 — Session opt-in.** The current `vigil watch` session must have opted into action execution (CLI flag or dashboard toggle).
3. **L3 — Repo allowlist.** The target repo name must be in `config.actions.allowedRepos`.
4. **L4 — Action-type allowlist.** The `ActionType` (`git_stash`, `git_branch`, `git_commit`, `run_tests`, `run_lint`, `custom_script`) must be in `config.actions.allowedActions`.
5. **L5 — Confidence floor.** The decision's `confidence` must be ≥ `config.actions.confidenceThreshold` (default 0.8).
6. **L6 — User confirmation.** Unless `config.actions.autoApprove` is true, the request sits in `pending` until approved via `POST /api/actions/{id}/approve` or the dashboard [Actions plugin](../dashboard/plugins.md#actions).

## Tiers

`ActionExecutor` classifies commands into three tiers (`src/action/executor.ts:37`):

| Tier | Contents | When allowed |
|---|---|---|
| **safe** | `git log`, `diff`, `show`, `status`, `shortlog`, `describe`, `rev-parse`, `ls-files`, `cat-file`, `blame`, `reflog` | Always, subject to gates |
| **moderate** | `git stash`, `branch`, `checkout`, `switch`, `commit`, `add`, `restore`, `reset`, `tag` | Only when `config.allowModerateActions` or the action's declared tier ≥ moderate |
| **dangerous** | `git push`, `merge`, `rebase`, `pull`, `remote`, `clean` | Requires explicit `tierCap: "dangerous"` **and** passes everything else |

Plus non-git tiers: `run_tests`, `run_lint`, `git_stash`, `git_branch`, `git_commit`, `custom_script` — each with its own `COMMAND_PATTERNS` regex to reject injected arguments.

## Auto-action

`config.specialists.autoAction` exists for specialist-driven actions only. It has its own gates layered on top of these:

- `minSeverity` (default `critical`) — specialist finding must be at least this severe.
- `minConfidence` (default 0.8).
- `tierCap` (default `safe`) — hard ceiling even if a specialist proposes something more aggressive.

## Lifecycle

`ActionRequest.status` transitions:

```
pending → approved → executed
   |         ↘
   ↓           rejected
rejected
```

Failures during execution → `failed`. History is retained in the specialist store for the [Actions plugin](../dashboard/plugins.md#actions).

## Dashboard exposure

- `GET /api/actions?status=pending` → approval queue.
- `GET /api/actions/{id}/preview` → dry-run of the command with env scrubbed.
- `POST /api/actions/{id}/approve` / `…/reject`.
- SSE event `action_pending` fires when a new request hits the queue.

## Why six gates

Every gate traded latency for safety. In practice:

- Gates 1–4 are instant config lookups.
- Gate 5 is a numeric compare.
- Gate 6 is the only one with a real wait — and only when `autoApprove` is off. That's the point.

See [Subsystems → Actions](../subsystems/actions.md) for code-level detail.
