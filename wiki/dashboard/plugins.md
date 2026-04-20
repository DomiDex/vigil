---
title: Dashboard Plugins Catalog
type: subsystem
updated: 2026-04-19
sources:
  - dashboard-v2/src/plugins/index.ts
  - dashboard-v2/src/plugins/*/
---

# Dashboard Plugins

The dashboard is 100 % plugin-driven. `src/plugins/index.ts` declares a `PluginWidget[]` (16 entries as of 2026-04-19), each with: `id`, `label`, `icon`, `path`, `slot`, `order`, SSE events to listen for, query keys to invalidate, and an optional `featureGate`.

Ordering is by the `.order` field; slots are `tab` | `sidebar` | `timeline-card` | `overlay` | `top-bar`. The sidebar iterates plugins filtered by slot.

## Catalog

### Overview
- `order: -1`, path `/`, slot: `tab`.
- File: `src/plugins/overview/OverviewPage.tsx`.
- **Queries**: `getOverview`, `getTimeline`, `getDreams`, `getActionsPending`, `getHealth`, `getMetrics`.
- **Mutations**: `approveAction`, `rejectAction`, `triggerDream`.
- Stat cards (actions, repos, tasks), pending-actions approver, dream summary, health card.

### Timeline
- `order: 0`, path `/timeline`.
- File: `src/plugins/timeline/TimelinePage.tsx` + `DecisionFilter.tsx`.
- **Queries**: `getTimeline({decision?, repo?, q?, page?})`, `getRepos`.
- Debounced search (300 ms), decision filter, repo filter, live indicator via SSE `message`/`decision`.

### Repos
- `order: 10`, path `/repos`.
- File: `src/plugins/repos/ReposPage.tsx`.
- **Queries**: `getRepos`, `getRepoDetail`, `getRepoDiff`.
- **Mutations**: `addRepo` (Dialog), `removeRepo` (AlertDialog).
- Cards show state indicator, last commit, decision breakdown. Diff viewer modal.

### Dreams
- `order: 20`, path `/dreams`.
- File: `src/plugins/dreams/DreamsPage.tsx`.
- **Queries**: `getDreams` (refetch every 3 s when `status.running=true`), `getDreamPatterns`, `getOverview`.
- **Mutations**: `triggerDream` per repo.
- Renders `DreamEntry` cards with confidence bar, insights, patterns.

### Tasks
- `order: 30`, path `/tasks`, gate: `VIGIL_TASKS`.
- File: `src/plugins/tasks/TasksPage.tsx`.
- **Queries**: `getTasks({status?, repo?})`, `getOverview`.
- **Mutations**: `createTask`, `activateTask`, `completeTask`, `cancelTask`, `updateTask` (all optimistic).
- Status filter (pending/active/waiting/completed/failed) with `ACTION_STYLES` color map.

### Actions
- `order: 40`, path `/actions`.
- File: `src/plugins/actions/ActionsPage.tsx`.
- **Queries**: `getActions({status?})`.
- **Mutations**: `approveAction`, `rejectAction`.
- Sortable table (date/status/tier/command), tier badge (safe/moderate/dangerous), 25/page pagination.
- Phase 8: added **source** filter (specialist-originated vs user/decision).

### Memory
- `order: 50`, path `/memory`.
- File: `src/plugins/memory/MemoryPage.tsx`.
- **Queries**: `getMemory` (tier stats: eventLog / vectorStore / topicTier / indexTier), `getRepos`.
- **Mutations**: `createMemory`, `deleteMemory`.
- Components: `MemorySearch`, `AskVigil`.

### Metrics
- `order: 60`, path `/metrics`.
- File: `src/plugins/metrics/MetricsPage.tsx`.
- **Queries**: `getMetrics({from?, to?})` with range 1h/6h/24h/7d/30d.
- Recharts bar/line chart with SILENT/OBSERVE/NOTIFY/ACT decomposition. CSV export via `metricsToCSV`.

### Scheduler
- `order: 70`, path `/scheduler`, gate: `VIGIL_SCHEDULER`.
- File: `src/plugins/scheduler/SchedulerPage.tsx`.
- **Queries**: `getScheduler`, `getOverview`.
- **Mutations**: `createSchedule` (cron builder dialog), `deleteSchedule`, `triggerSchedule`.
- Utilities: `formatCountdown`, `buildCron`, `parseFrequency`.

### Config
- `order: 75`, path `/config`.
- File: `src/plugins/config/ConfigPage.tsx`.
- **Queries**: `getConfig`, `getFeatureGates`.
- **Mutations**: `updateConfig`, `toggleFeatureGate`.
- `TICK_FIELDS` array drives the form. Feature-gates table shows per-layer status colors (build/config/runtime/session).

### Agents
- `order: 80`, path `/agents`, gate: `VIGIL_AGENT_IDENTITY`.
- File: `src/plugins/agents/` — four lazy Suspense tabs.
- **PersonaTab** (`PersonaTab.tsx`) — `getAgents`, `getCurrentAgent`; switch via `PATCH /api/agents/current`.
- **SpecialistsTab** — `getSpecialists`; grid of `SpecialistCard` (`SpecialistCard.tsx:8`) with toggle, run-now, edit-in-sheet (`SpecialistEditSheet.tsx:77`).
- **FindingsTab** (`FindingsTab.tsx`) — paginated table with specialist/severity/repo filters. Opens `FindingDetailSheet.tsx:38` for dismiss / create-action.
- **FlakyTestsTab** (`FlakyTestsTab.tsx`) — pass-rate table, status badge, run/reset mutations.
- Shared helpers: `severity.ts:3` (`severityClasses`), `time.ts:1` (`formatRelativeTime`).

### Health
- `order: 85`, path `/health`.
- File: `src/plugins/health/HealthPage.tsx`.
- **Queries**: `getHealth` (refetch every 10 s).
- **Mutations**: `vacuumDatabase`, `pruneEvents` (with AlertDialog confirmation).
- Shows process stats (pid, uptime, heap, rss), DB sizes, error summary.

### Webhooks
- `order: 88`, path `/webhooks`.
- File: `src/plugins/webhooks/WebhooksPage.tsx`.
- **Queries**: `getWebhookEvents`, `getWebhookSubscriptions`, `getWebhookStatus`, `getWebhookEventDetail`.
- **Mutations**: `createWebhookSubscription`, `deleteWebhookSubscription`.
- Status card, subscription list, event history (50 KB payload truncation).

### Channels
- `order: 90`, path `/channels`.
- File: `src/plugins/channels/ChannelsPage.tsx`.
- **Queries**: `getChannels`, `getChannelPermissions`, `getChannelQueue`.
- **Mutations**: `deleteChannel`, `testChannel`, `updateChannelPermissions`.
- `STATUS_COLORS` map drives the card chrome. `ChannelPermissionSheet` for edits.

### Notifications
- `order: 92`, path `/notifications`.
- File: `src/plugins/notifications/NotificationsPage.tsx`.
- **Queries**: `getNotifications`.
- **Mutations**: `testNotification`, `updateNotificationRules`.
- Config section (enabled, severity, rate limit, quiet hours) + history list with `isWithinQuietHours` utility and `SEVERITY_COLORS` map.

### A2A
- `order: 93`, path `/a2a`, gate: `VIGIL_A2A`.
- File: `src/plugins/a2a/A2APage.tsx`.
- **Queries**: `getA2AStatus`, `getA2ASkills`, `getA2AHistory`.
- Status card, agent capabilities card, skill list, history table.

## Registry

`src/plugins/index.ts:3-183` exports the array. Adding a plugin:

1. Create `src/plugins/<name>/<Name>Page.tsx`.
2. Register in `index.ts` with a `PluginWidget`.
3. Add matching `queryKey` to `src/lib/query-keys.ts` if needed.
4. Create the route file under `src/routes/<name>.tsx` with `createFileRoute`.
5. Wire any new SSE event in `src/hooks/use-sse.ts`'s `SSE_EVENT_MAP`.

## User plugins

At runtime, `~/.vigil/plugins/` is also scanned — see [Dashboard Backend](../subsystems/dashboard-backend.md#plugin-loaderts). These are loaded into the same registry at startup, gated by `VIGIL_USER_PLUGINS` (aspirational — see [Dashboard v2 Plan](../roadmap/dashboard-v2.md#phase-6--user-plugin-support)).
