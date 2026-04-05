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
