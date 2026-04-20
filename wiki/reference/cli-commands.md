---
title: CLI Commands
type: reference
updated: 2026-04-19
sources:
  - src/cli/index.ts
---

# CLI Commands

All commands are invoked via `bun run src/cli/index.ts <command>`. The entry uses Commander.

## watch

```bash
bun run src/cli/index.ts watch <repos...> \
  [--tick <seconds>] [--model <id>] [--brief]
```

Start the daemon watching one or more repositories.

| Flag | Meaning |
|---|---|
| `--tick <seconds>` | Override `tickInterval` for this session |
| `--model <id>` | Override `tickModel` for this session |
| `--brief` | Enable brief mode (suppress routine output) |

Multiple repo paths are positional. CLI flags survive config hot-reloads.

## status

```bash
bun run src/cli/index.ts status
```

Print the effective `VigilConfig` as YAML.

## log

```bash
bun run src/cli/index.ts log \
  [--repo <name>] [--type <type>] [--specialist <name>] [--limit <n>]
```

Tail the EventLog (JSONL) with filters. Event-type icons are rendered in the output.

## ask

```bash
bun run src/cli/index.ts ask <question> [--repo <name>] [--specialist <name>]
```

Run a memory-backed Q&A via `ask-engine.ts`. Optionally scope to a specific repo or specialist's context.

## dream

```bash
bun run src/cli/index.ts dream [--repo <name>]
```

Force a dream consolidation run now (bypasses the `dreamAfter` idle gate).

## memory

```bash
bun run src/cli/index.ts memory [--repo <name>]
```

Show the current repo profile + recent `MemoryEntry` rows.

## specialist

```bash
bun run src/cli/index.ts specialist list
bun run src/cli/index.ts specialist run <name> [--repo <name>]
bun run src/cli/index.ts specialist toggle <name>
bun run src/cli/index.ts specialist findings [--repo <name>] [--severity <level>]
```

Specialist management. `run` bypasses cooldown.

## task

```bash
bun run src/cli/index.ts task list [--status <s>]
bun run src/cli/index.ts task create <title> [--repo <name>] [--description <d>]
bun run src/cli/index.ts task complete <id>
bun run src/cli/index.ts task fail <id> <error>
bun run src/cli/index.ts task cancel <id>
```

Task CRUD with wait-condition transitions handled server-side.

## config

```bash
bun run src/cli/index.ts config                    # print all
bun run src/cli/index.ts config <key>              # print one
bun run src/cli/index.ts config <key> <value>      # set
```

Dotted keys supported (e.g. `specialists.maxParallel`).

## session

```bash
bun run src/cli/index.ts session list
bun run src/cli/index.ts session resume [<id>]
```

Inspect the session history written by `src/core/session.ts`.

## See also

- [Config Schema](config-schema.md) for what `config` can read/write.
- [Architecture Overview](../concepts/architecture.md) for what these commands wire together.
