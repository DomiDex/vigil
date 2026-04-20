---
title: Config Schema
type: reference
updated: 2026-04-19
sources:
  - src/core/config.ts
---

# Config Schema

`~/.vigil/config.json` — loaded on daemon start, hot-reloaded on change (300 ms debounce, content snapshot to ignore spurious WSL events).

Defined at `src/core/config.ts:44`. Loader merges `DEFAULT_CONFIG` with the file via `deepMerge`.

## Top-level fields

| Key | Type | Default | Meaning |
|---|---|---|---|
| `tickInterval` | number | `30` | Seconds between ticks |
| `blockingBudget` | number | `120` | Max seconds a tick handler may take |
| `sleepAfter` | number | `900` | Idle seconds before entering sleep mode |
| `sleepTickInterval` | number | `300` | Seconds between ticks when sleeping |
| `dreamAfter` | number | `1800` | Idle seconds before dream consolidation |
| `tickModel` | string | `claude-haiku-4-5-20251001` | Model for tick decisions |
| `escalationModel` | string | `claude-sonnet-4-6` | Model for dreams + deeper analysis |
| `maxEventWindow` | number | `100` | Max recent events passed in context |
| `notifyBackends` | string[] | `["file"]` | Which backends are active |
| `webhookUrl` | string | `""` | HTTP POST sink for notifications |
| `desktopNotify` | boolean | `true` | Enable desktop OS notifications |
| `allowModerateActions` | boolean | `false` | Allow moderate-tier actions |
| `briefMode` | boolean | `false` | Suppress routine output |

## actions — `ActionGateConfig`

Controls the [6-gate ActionExecutor](../concepts/action-gates.md).

| Key | Type | Default |
|---|---|---|
| `enabled` | boolean | `false` |
| `allowedRepos` | string[] | `[]` |
| `allowedActions` | ActionType[] | `["git_stash", "run_tests", "run_lint"]` |
| `confidenceThreshold` | number | `0.8` |
| `autoApprove` | boolean | `false` |

## features — `Record<string, boolean>`

Per-flag opt-in/out. See [Feature Flags reference](feature-flags.md) for all known flags. Any unlisted flag defaults to `true` for shipped builds.

## push

| Key | Type | Default |
|---|---|---|
| `enabled` | boolean | `false` |
| `minSeverity` | "info"\|"warning"\|"critical" | `"warning"` |
| `statuses` | string[] | `["alert", "proactive"]` |
| `quietHours` | `{start, end}` | — |
| `maxPerHour` | number | `10` |
| `ntfy` | `{topic, server?, token?}` | — |
| `native` | boolean | — |

## webhook

| Key | Type | Default |
|---|---|---|
| `port` | number | `7433` |
| `secret` | string | `""` |
| `path` | string | `"/webhook/github"` |
| `allowedEvents` | string[] | `["pull_request", "pull_request_review", "push", "issues", "issue_comment"]` |

## channels

| Key | Type | Default |
|---|---|---|
| `enabled` | boolean | `false` |
| `sessionChannels` | string[] | `[]` — declared for this session (gate 5) |
| `allowlist` | string[] | `[]` — approved server names (gate 6) |
| `devMode` | boolean | `false` — bypasses allowlist |

## specialists — `SpecialistGlobalConfig`

| Key | Type | Default |
|---|---|---|
| `enabled` | boolean | `true` |
| `agents` | string[] | `["code-review", "security", "test-drift", "flaky-test"]` |
| `maxParallel` | number | `2` |
| `cooldownSeconds` | number | `300` |
| `severityThreshold` | "info"\|"warning"\|"critical" | `"info"` |
| `flakyTest.testCommand` | string | `"bun test"` |
| `flakyTest.runOnCommit` | boolean | `true` |
| `flakyTest.minRunsToJudge` | number | `3` |
| `flakyTest.flakyThreshold` | number | `0.5` |
| `flakyTest.maxTestHistory` | number | `100` |
| `autoAction.enabled` | boolean | `false` |
| `autoAction.minSeverity` | "info"\|"warning"\|"critical" | `"critical"` |
| `autoAction.minConfidence` | number | `0.8` |
| `autoAction.tierCap` | "safe"\|"moderate"\|"dangerous" | `"safe"` |

## Paths

`src/core/config.ts` also exports directory helpers:

- `getConfigDir()` → `~/.vigil/`
- `getDataDir()` → `~/.vigil/data/`
- `getLogsDir()` → `~/.vigil/data/logs/`

## Hot reload

`watchConfig(onReload)` (`src/core/config.ts:226`) installs an `fs.watch` with:

- 300 ms debounce (matches Kairos `FILE_STABILITY_MS`).
- Content snapshot to suppress spurious events (common on WSL).
- Handlers array so subsystems (PromptBuilder, FeatureGates, TickEngine, etc.) can each subscribe.

`stopWatchingConfig()` cleans up on shutdown.

## See also

- [Feature Gates](../concepts/feature-gates.md) for how config flags are layered.
- [Action Gates](../concepts/action-gates.md) for the `actions` subtree semantics.
