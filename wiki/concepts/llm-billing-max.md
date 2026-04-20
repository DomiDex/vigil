---
title: LLM Billing via Max
type: concept
updated: 2026-04-19
sources:
  - CLAUDE.md
  - src/llm/decision-max.ts
---

# LLM Billing via Max

All LLM calls in Vigil go through the `claude` CLI, not `@anthropic-ai/sdk`. This is deliberate: it routes the spend through the user's Claude Max subscription instead of API pay-per-token.

## The trick

`callClaude` (`src/llm/decision-max.ts:140`) spawns `claude -p` as a child process with one critical env tweak:

```ts
const env = { ...process.env };
delete env.ANTHROPIC_API_KEY;            // <-- force Max auth, not API
const child = Bun.spawn(
  ["bun", "claude", "-p",
   "--output-format", "text",
   "--model", model],
  { env, stdin: "pipe", stdout: "pipe" }
);
child.stdin.write(prompt);
```

With the env var unset, the Claude CLI falls through to Max-subscription auth (the same auth the IDE uses). With it set, the CLI would go API-direct.

## Why the file name is `decision-max.ts`

The name is load-bearing — it's a reminder that this module routes to Max. The module also owns:

- Zod schemas for `DecisionResult`, `ConsolidationResult`, `CrossRepoAnalysis` (`src/llm/decision-max.ts:34`).
- JSON extraction tolerant of markdown fences (`:59`).
- 5-second `AbortSignal` timeout.
- 3-failure / 60-second-reset circuit breaker (`:130`).

## Tradeoffs

| Pro | Con |
|---|---|
| Fixed-cost subscription instead of per-token billing | Adds a process spawn per call (extra latency) |
| Inherits the user's model access + rate limits | Can't use API-only features (cache control, batch API, etc. *as of 2026-04*) |
| CLI is always up to date with latest models | Circuit breaker must cover CLI crashes as well as LLM errors |

## Consequences

- Tests have to mock at the `callClaude` level (see `src/__tests__/helpers/mock-daemon.ts`) because you can't easily stub a child process.
- `resetCircuitBreaker()` is exported so the CLI (`vigil …`) can force-unblock after troubleshooting.
- The 5s timeout is aggressive on purpose — if Claude-CLI hangs, we'd rather fail fast than block the tick loop.

## CLAUDE.md canonical text

> All LLM calls go through `claude -p` (not the Anthropic API directly). This routes through the Max subscription. The decision-max.ts module temporarily removes `ANTHROPIC_API_KEY` from env before spawning claude CLI to ensure Max billing.

Don't change that invariant without a matching ADR — this is *the* reason this module exists.
