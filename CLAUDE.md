# Vigil — Always-On Git Agent

KAIROS-inspired daemon that watches git repos, makes LLM-powered decisions, and consolidates memory during idle time.

## Stack
- **Runtime**: Bun (TypeScript)
- **Database**: bun:sqlite (FTS5 for memory search)
- **LLM**: claude -p (routes through Claude CLI for Max subscription billing)

## Architecture

```
src/
├── cli/index.ts        — CLI entry point (commander)
├── core/
│   ├── config.ts       — Config at ~/.vigil/config.json
│   ├── daemon.ts       — Main orchestrator
│   └── tick-engine.ts  — Heartbeat with sleep mode
├── git/
│   └── watcher.ts      — Git monitoring (fs.watch + polling)
├── llm/
│   ├── decision-max.ts — LLM client via claude CLI
│   └── a2a-server.ts   — A2A protocol server
├── memory/
│   └── store.ts        — EventLog (JSONL) + VectorStore (SQLite)
└── a2a-entry.ts        — A2A server entry point
```

## Key Commands
```bash
bun run src/cli/index.ts watch <repos...>   # Start daemon
bun run src/cli/index.ts status             # Show config
bun run src/cli/index.ts log                # View events
bun run src/cli/index.ts ask <question>     # Ask about a repo
bun run src/cli/index.ts dream              # Force consolidation
bun run src/cli/index.ts memory             # Show repo profile
bun run src/cli/index.ts config [key] [val] # View/set config
```

## Critical: LLM Billing
All LLM calls go through `claude -p` (not the Anthropic API directly). This routes through the Max subscription. The decision-max.ts module temporarily removes ANTHROPIC_API_KEY from env before spawning claude CLI to ensure Max billing.

## Tick Cycle
1. TickEngine fires every N seconds (default 30s)
2. GitWatcher provides repo context
3. DecisionEngine (haiku) returns SILENT|OBSERVE|NOTIFY|ACT
4. After idle period, enters "dream" phase for memory consolidation (sonnet)

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install`
- Use `bun run <script>` instead of `npm run <script>`
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.serve()` for HTTP servers. Don't use `express`.

## Coding Guidelines

Behavioral rules to reduce common mistakes. Biased toward caution over speed — use judgment for trivial tasks.

### Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.

### Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:
- "Add validation" → write tests for invalid inputs, then make them pass
- "Fix the bug" → write a test that reproduces it, then make it pass
- "Refactor X" → ensure tests pass before and after

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```
