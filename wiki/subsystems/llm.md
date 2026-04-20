---
title: LLM Subsystem
type: subsystem
updated: 2026-04-19
sources:
  - src/llm/decision-max.ts
  - src/llm/ask-engine.ts
  - src/llm/tools.ts
  - src/llm/code-tools.ts
  - src/llm/check-runner.ts
  - src/llm/startup-analyzer.ts
  - src/llm/session-manager.ts
  - src/llm/a2a-server.ts
  - src/prompts/builder.ts
  - src/prompts/cache.ts
---

# LLM Subsystem

`src/llm/` owns every path that talks to an LLM. Everything routes through `claude -p` so Max-subscription billing applies — see [LLM Billing via Max](../concepts/llm-billing-max.md).

## decision-max.ts — the core

`src/llm/decision-max.ts` is the entrypoint for all per-tick calls.

- **`callClaude(prompt, systemPrompt, model?)`** (`:140`) — spawns `bun claude -p`, deletes `ANTHROPIC_API_KEY` from the child env, 5s timeout, stream stdout.
- **Zod schemas** (`:34`) — `DecisionSchema`, `ConsolidationSchema`, `CrossRepoSchema`.
- **`extractJSON(raw)`** (`:59`) — brace-balance scanner tolerant of markdown fences.
- **`parseDecisionResponse(raw)`** (`:100`) — validate + null→undefined normalization.
- **Circuit breaker** (`:130`) — 3 failures in 60s opens it; `resetCircuitBreaker()` is an escape hatch for the CLI.
- **`DecisionEngine` class** (`:184`):
  - `loadAgent(repoPath)` — parses `.claude/agents/vigil.md`.
  - `checkAgentFilters(events, files)` — short-circuits a tick if the repo's agent declares no interest.
  - `decide(context)` (`:257`) — composes prompt via `PromptBuilder`, calls `callClaude`, parses, returns `DecisionResult`.
  - `consolidate(memories)` — dream phase escalation call, uses Sonnet.

## ask-engine.ts

Interactive Q&A path used by `vigil ask <question>` CLI and the dashboard "Ask Vigil" feature.

- Retrieval: FTS5 search on the vector store + recent entries for context.
- Calls the same `callClaude` plumbing.
- Can cite memory IDs in responses.

## tools.ts & code-tools.ts

`tools.ts` defines the LLM-callable tool set: `read_file`, `grep`, `git_show`, `git_log`, `run_check`, etc. It's large because it includes JSON-schema definitions per tool.

`code-tools.ts` adds LSP-flavored tools (go-to-definition, find-references) on top of the raw file/grep tools.

## check-runner.ts

Runs per-repo check commands (`npm test`, `tsc --noEmit`, `pytest`, whatever the agent config declares). Captures stdout/stderr/exit code for the LLM to analyze.

## startup-analyzer.ts

One-shot analysis on `vigil watch` startup — reads the repo's `package.json` / `pyproject.toml` / etc., looks at git metadata, builds an initial repo profile if none exists.

## session-manager.ts

Manages per-session LLM context + tool state across consecutive ticks in the same run. Kept small intentionally; heavy state lives in the memory subsystem, not here.

## a2a-server.ts

Agent-to-Agent protocol server. Lets Vigil act as a callable sub-agent from a parent Claude Code invocation. Exposed on the dashboard's [A2A plugin](../dashboard/plugins.md#a2a).

## Prompt plumbing

These live under `src/prompts/` but belong conceptually to the LLM subsystem.

### PromptBuilder

`src/prompts/builder.ts:16` — composes the system prompt from stable/session/ephemeral sections. Cache hooks:

- `onRebaseDetected()` — clears all.
- `onConfigChanged()` — clears session.
- `onAgentReloaded()` — clears agent identity.

Full detail in [Prompt Cache](../concepts/prompt-cache.md).

### PromptCache

`src/prompts/cache.ts` — backing store for section text, TTL per scope.

## Agent definitions

`src/agent/agent-loader.ts:36` parses `.claude/agents/vigil.md` — YAML frontmatter (`name`, `description`, `model`, `tools`, `watchPatterns`, `triggerEvents`) + markdown body as system prompt.

`src/agent/system-prompt.ts` holds the default Vigil system prompt used if no repo-local agent file exists.

## See also

- [Decision Engine concept](../concepts/decision-engine.md)
- [Prompt Cache concept](../concepts/prompt-cache.md)
- [LLM Billing via Max](../concepts/llm-billing-max.md)
