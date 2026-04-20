---
title: Actions Subsystem
type: subsystem
updated: 2026-04-19
sources:
  - src/action/executor.ts
  - src/dashboard/api/actions.ts
  - src/core/config.ts
---

# Actions

`src/action/executor.ts` is a single-file subsystem owning the write-side: any time an ACT decision or an auto-action from a specialist wants to touch the repo, it flows through `ActionExecutor`. The safety model is six gates — see [Action Gates](../concepts/action-gates.md).

## ActionExecutor

### Types

```ts
type ActionType = "git_stash" | "git_branch" | "git_commit"
                | "run_tests"  | "run_lint"   | "custom_script";

type ActionTier = "safe" | "moderate" | "dangerous";

type ActionStatus = "pending" | "approved" | "rejected"
                  | "executed" | "failed";
```

### Request shape

An `ActionRequest` carries:

- `type`, `command`, `args`, `cwd`.
- `tier` (derived from command classification).
- `source` — which subsystem proposed it (decision engine, specialist, user).
- `sourceFindingId` — if a specialist finding generated it.
- `confidence` from the decision result.
- `reason` — the LLM's justification.

### Classification

`classifyCommand(cmd, args)` (`src/action/executor.ts:37`) picks the tier:

| Tier | Contents |
|---|---|
| **safe** | `git log/diff/show/status/shortlog/describe/rev-parse/ls-*/cat-file/blame/reflog` |
| **moderate** | `git stash/branch/checkout/switch/commit/add/restore/reset/tag` |
| **dangerous** | `git push/merge/rebase/pull/remote/clean` |

`COMMAND_PATTERNS` (`:72`) is a regex per `ActionType` that rejects shell-metachar injection. `run_tests` / `run_lint` allow limited pass-through; `custom_script` is the broadest.

### Gate chain

`executeRequest(req)` runs through gates in order. Any false → reject with the gate name.

1. `config.actions.enabled`
2. Session opted in
3. `allowedRepos` contains `repo`
4. `allowedActions` contains `type`
5. `confidence ≥ confidenceThreshold`
6. User approved (or `autoApprove`)

After gate 6, the command runs via `Bun.spawn` with the repo as `cwd`. stdout/stderr are captured, exit code checked, `status` set to `executed` or `failed`, and the result is recorded.

## Auto-action from specialists

`config.specialists.autoAction` gates specialist-driven actions independently:

- `minSeverity` (default `critical`).
- `minConfidence` (default 0.8).
- `tierCap` (default `safe`) — hard ceiling.

The daemon only proposes an auto-action when **all of** these *and* all six gates pass.

## API surface

From `src/dashboard/api/actions.ts`:

| Route | Method | Purpose |
|---|---|---|
| `/api/actions` | GET | List with `status` filter |
| `/api/actions/pending` | GET | Approval queue |
| `/api/actions/{id}/preview` | GET | Dry-run (prints the command with env scrubbed) |
| `/api/actions/{id}/approve` | POST | Run it |
| `/api/actions/{id}/reject` | POST | Drop it |

SSE events `action` and `action_pending` invalidate the relevant query keys in the dashboard.

## Dashboard surface

[Actions plugin](../dashboard/plugins.md#actions):

- Sortable table: date / status / tier / command.
- Tier badges: safe / moderate / dangerous — color-coded.
- Status filter dropdown.
- Per-row approve/reject buttons for pending items.

The Overview plugin shows a compact "pending actions" card with the same approve/reject controls.

## See also

- [Action Gates concept](../concepts/action-gates.md) — the safety model in depth.
- [Specialists](specialists.md) — auto-action source.
- [Decision Engine](../concepts/decision-engine.md) — ACT decisions.
