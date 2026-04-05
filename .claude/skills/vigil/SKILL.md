---
name: vigil
description: "Always-on git agent that watches repositories and surfaces insights. Use when the user asks to monitor repos, check git status proactively, review uncommitted work, consolidate git observations, or asks about repo state. Triggers for: watch this repo, what did I forget to commit, summarize git activity, vigil."
---

# Vigil — Git Monitoring Agent

Run Vigil commands from the project at ~/projects/vigil.

## Commands

Watch repos (starts daemon):
```bash
bun run ~/projects/vigil/src/cli/index.ts watch <repo-paths...>
```

Check status:
```bash
bun run ~/projects/vigil/src/cli/index.ts status
```

View event log:
```bash
bun run ~/projects/vigil/src/cli/index.ts log --repo <name> --type <type> --limit <n>
```

Ask a question about a repo:
```bash
bun run ~/projects/vigil/src/cli/index.ts ask "your question" --repo <path>
```

Force memory consolidation (dream):
```bash
bun run ~/projects/vigil/src/cli/index.ts dream --repo <path>
```

View memory profile:
```bash
bun run ~/projects/vigil/src/cli/index.ts memory --repo <path>
```

Configure:
```bash
bun run ~/projects/vigil/src/cli/index.ts config [key] [value]
```

## Notes
- LLM calls route through `claude -p` for Max subscription billing
- Data stored at ~/.vigil/
- Default tick interval: 30s, sleep after 15min idle
