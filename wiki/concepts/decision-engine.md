---
title: Decision Engine
type: concept
updated: 2026-04-19
sources:
  - src/llm/decision-max.ts
  - src/core/daemon.ts
  - src/specialists/router.ts
---

# Decision Engine

The Decision Engine is the LLM call and the small state machine around it. Given recent git events + memory context, it returns one of four decisions that drive the rest of the tick.

## The four decisions

| Decision | Meaning | Daemon response |
|---|---|---|
| **SILENT** | Nothing worth saying | Record the decision; no user-visible output |
| **OBSERVE** | Quiet observation (logs only) | Emit a low-severity VigilMessage to `/api/timeline` |
| **NOTIFY** | Surface to the user | Emit + route to notification backends (desktop, webhook, ntfy) |
| **ACT** | Propose a concrete action | Create a pending ActionRequest for the [6-gate executor](action-gates.md) |

Response shape is a Zod-validated JSON object (`src/llm/decision-max.ts:34`):

```ts
{
  decision: "SILENT" | "OBSERVE" | "NOTIFY" | "ACT",
  reasoning: string,
  severity?: "info" | "warning" | "critical",
  message?: string,        // user-facing when NOTIFY
  action?: {               // required when ACT
    type: ActionType,
    command: string,
    args?: string[],
    confidence: number
  }
}
```

## Call path

`Daemon.handleTick` (`src/core/daemon.ts:556`) builds a `DecisionContext`:

1. Collect recent git events from the `GitWatcher` state.
2. Pull the last N `MemoryEntry` rows for this repo from `VectorStore`.
3. Fetch the repo profile (if any).
4. Hand the context to `DecisionEngine.decide()` (`src/llm/decision-max.ts:257`).

`decide()` composes its prompt through `PromptBuilder` (`src/prompts/builder.ts:16`) so the stable bits (agent identity, tool docs, dream-mode section) hit the [prompt cache](prompt-cache.md). Then it calls `callClaude()` (`src/llm/decision-max.ts:140`).

## `callClaude` specifics

This is where the Max-subscription billing trick lives:

```ts
const env = { ...process.env };
delete env.ANTHROPIC_API_KEY;           // force claude CLI to Max auth
const child = Bun.spawn(
  ["bun", "claude", "-p", "--output-format", "text", "--model", model],
  { env, stdin: "pipe", stdout: "pipe" }
);
```

- **Timeout**: 5s default via `AbortSignal`.
- **Circuit breaker**: 3 consecutive failures → open for 60s (`src/llm/decision-max.ts:130`). `resetCircuitBreaker()` exists for CLI force-unblocks.
- **JSON extraction** (`src/llm/decision-max.ts:59`): scans for balanced braces since the model may wrap output in markdown fences.

See [LLM Billing via Max](llm-billing-max.md) for why this routes through the CLI rather than the SDK.

## Agent definitions

The system prompt is loaded from `.claude/agents/vigil.md` in each watched repo (`src/agent/agent-loader.ts:36`). The file is YAML frontmatter + markdown:

```yaml
---
name: vigil
description: Git watcher for this repo
model: claude-haiku-4-5-20251001
watchPatterns: ["src/**/*.ts"]
triggerEvents: ["new_commit", "file_change"]
---
Your role is …
```

`checkAgentFilters()` (`src/llm/decision-max.ts:217`) can short-circuit a tick if the repo's agent doesn't claim the events that triggered it.

## Ring buffer

Decisions are stored in a 5-item ring buffer per repo (`src/core/daemon.ts:handleTick` region). This feeds the dashboard's per-repo **decision breakdown** pill on the [Repos plugin](../dashboard/plugins.md#repos) and the decision series chart on the [Metrics plugin](../dashboard/plugins.md#metrics).

## Specialist fan-out

After the primary decision is recorded, the daemon runs matching [specialists](../subsystems/specialists.md) in parallel (`SpecialistRouter.match` → `SpecialistRunner.runAll`). These are *additive* — they append `Finding` rows to the store but don't change the primary decision.

## See also

- [Tick Cycle](tick-cycle.md) — where the decision fires.
- [Action Gates](action-gates.md) — what happens to an ACT decision.
- [Specialists subsystem](../subsystems/specialists.md) — the post-decision fan-out.
- [Prompt Cache](prompt-cache.md) — how the system prompt is sliced for reuse.
