# Phase 4 — Port Core Plugins

---
duration: ~12 hours
depends_on: Phase 3 (Plugin System & Timeline — plugin registry, PluginSlot, Timeline proving the pattern)
blocks: Phase 7 (Remove HTMX Legacy)
risk: MEDIUM — each plugin follows the proven Timeline pattern from Phase 3, but Memory's Ask Vigil is more complex. Recharts v3 confirmed compatible with React 19
stack: typescript
runner: single-agent (tasks 4.1-4.7 parallelizable)
---

## 1. Objective + What Success Looks Like

**Objective**: Port all 7 remaining core plugins (Repos, Dreams, Tasks, Actions, Memory, Scheduler, Metrics) from HTMX partials to React components following the plugin pattern proven by Timeline in Phase 3. Each plugin uses existing JSON APIs via server functions from Phase 1 — no backend changes needed.

**Observable success conditions**:

1. All 7 plugin routes render their full UI when navigated to via the sidebar — no stub text remains
2. Each plugin lazy-loads via `lazyRouteComponent()` (SSR-safe) through the `PluginSlot` component
3. Repos plugin shows repo grid with branch, HEAD sha (7-char), dirty dot, and state icon — expanding a repo shows commits, decision distribution bars, patterns, topics, and uncommitted files
4. Dreams plugin shows dream log cards with expandable summaries, a running/idle status indicator, a manual trigger button with repo selector, patterns panel, and topic evolution panel
5. Tasks plugin shows a task table with status filter tabs (counts in badges), create dialog with wait condition selector, action buttons for status transitions, stats bar with completion rate, and parent-child indentation
6. Actions plugin shows pending approval cards with tier badges (safe=green, moderate=amber, dangerous=red), 6-gate checklist with check/cross/pending icons, approve/reject buttons, action history table, and stats bar
7. Memory plugin shows the 4-box pipeline visualization (EventLog, VectorStore, TopicTier, IndexTier with counts), search with similarity scores, repo profile cards, and Ask Vigil with loading spinner and response display
8. Scheduler plugin shows schedule table with live countdown timers, create dialog with cron hint, run history table, and Run Now/Delete buttons
9. Metrics plugin renders 6 Recharts panels (decision stacked bar, latency line, token bar, adaptive tick area, sleep/wake strip, quick stats grid) with Vigil theme colors
10. SSE events invalidate the correct query keys for each plugin (as defined in `corePlugins` registry)
11. All mutations (task CRUD, action approve/reject, dream trigger, schedule CRUD) call the correct server functions and invalidate their query keys
12. No TypeScript errors across all plugin files (`bunx tsc --noEmit` passes in `dashboard-v2/`)

---

## 2. Key Design Decisions

### Data model strategy

| Entity | Pattern | Why |
|---|---|---|
| All API response types | `interface` in `app/types/api.ts` | Already defined in Phase 1 (Task 1.3). Repos, Dreams, Tasks, Actions, Memory, Metrics, Scheduler types are all there. |
| Plugin widget definitions | `PluginWidget` interface from `app/types/plugin.ts` | Phase 3 established this. Each plugin is a `{ id, label, icon, slot, order, component, sseEvents, queryKeys }` entry in `corePlugins`. |
| Component props | `interface` for object shapes, `type` for unions | Follow the convention from Phase 0 and Phase 3. Use `WidgetProps` for plugin page components (`activeRepo`, `queryClient`). |
| Server function inputs | `z.object()` with `inputValidator()` | Phase 1 established all server functions with Zod schemas. Plugins call these directly — no new server functions needed. |

### Architecture: plugin pattern (proven in Phase 3)

Every plugin follows this exact structure:

```
app/plugins/<name>/
  <Name>Page.tsx       — default export, receives WidgetProps
app/components/vigil/
  <name>-*.tsx          — shared sub-components (reusable outside the plugin)
app/routes/<name>.tsx   — createFileRoute with loader + lazy import
```

**Route file pattern** (from Phase 3's Timeline):
```typescript
// app/routes/<name>.tsx
import { createFileRoute } from "@tanstack/react-router";
import { lazyRouteComponent } from "@tanstack/react-router";
import { get<Name> } from "../server/functions";

export const Route = createFileRoute("/<name>")({
  loader: () => get<Name>({ data: {} }),
  component: lazyRouteComponent(() => import("../plugins/<name>/<Name>Page")),
});
```

> **SSR safety note**: Do NOT use `React.lazy()` in route files — it throws during SSR.
> TanStack Router's `lazyRouteComponent()` handles both server and client rendering correctly
> and provides built-in `Suspense` boundaries. No manual `<Suspense>` wrapper needed.

**Plugin page pattern** (from Timeline):
```typescript
// app/plugins/<name>/<Name>Page.tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { vigilKeys } from "../../lib/query-keys";
import { get<Name>, ... } from "../../server/functions";
import type { WidgetProps } from "../../types/plugin";

export default function <Name>Page({ activeRepo }: WidgetProps) {
  const queryClient = useQueryClient();
  // useQuery for reads, useMutation for writes
  // invalidateQueries on mutation success
}
```

### Recharts theming (Task 4.7)

> **Compatibility**: Recharts v3 is confirmed compatible with React 19 — no peer dependency conflicts or workarounds needed.

Recharts must use Vigil theme colors as CSS custom property values. Define a shared color map:

```typescript
// app/components/vigil/metrics-chart.tsx
export const VIGIL_CHART_COLORS = {
  SILENT: "var(--color-text-muted)",   // muted gray
  OBSERVE: "var(--color-info)",        // blue
  NOTIFY: "var(--color-warning)",      // amber
  ACT: "var(--color-vigil)",           // orange
  primary: "var(--color-vigil)",
  secondary: "var(--color-info)",
  success: "var(--color-success)",
  error: "var(--color-error)",
  grid: "var(--color-border)",
  text: "var(--color-text-muted)",
} as const;
```

Recharts components use `<ResponsiveContainer>` wrapping every chart. Tooltip and legend use `contentStyle={{ background: "var(--color-surface-dark)", border: "1px solid var(--color-border)" }}`.

### Critical rules

1. **No new server functions** — all data flows through the server functions created in Phase 1 (Task 1.4). If a server function is missing, it means Phase 1 was incomplete and must be fixed there, not here.
2. **No CDN or external requests** — all assets bundled locally. Recharts is the only new dependency (`bun add recharts` in `dashboard-v2/`).
3. **shadcn/ui components only** — no custom UI primitives. Use `Card`, `Badge`, `Button`, `Dialog`, `Tabs`, `Select`, `Input`, `Textarea`, `Skeleton`, `ScrollArea`, `Separator`, `Tooltip`, `Table` (from `@/components/ui/`).
4. **Lucide React for all icons** — import from `lucide-react`. No emoji, no custom SVG.
5. **`cn()` for all conditional classes** — import from `@/lib/cn`.
6. **Mutations invalidate query keys** — every `useMutation` must call `queryClient.invalidateQueries({ queryKey: vigilKeys.<domain> })` in its `onSuccess` callback.
7. **`inputValidator()` not `validator()`** — if calling server functions with data, use the `.inputValidator()` API.

---

## 3. Tasks

### Task 4.1 — Repos plugin (~1.5 hr)

**Depends on**: Phase 3 (plugin system proven), Phase 1 (`getRepos`, `getRepoDetail` server functions, `RepoListItem`/`RepoDetail` types)
**No inter-dependencies with Tasks 4.2-4.7 — fully parallelizable.**
**Completion condition**: Navigate to `/repos`, see repo grid with status indicators. Click a repo card to expand detail panel showing commits, decision bars, patterns, topics, and uncommitted files.

**Files to create**:

1. **`app/plugins/repos/ReposPage.tsx`** (default export)
   - `useQuery` with `vigilKeys.repos.all` calling `getRepos()`
   - Repo grid (responsive: 1 col mobile, 2 col md, 3 col lg) using `RepoCard` components
   - Selected repo state (`useState<string | null>`) — clicking a card sets it
   - When a repo is selected, render detail panel below the grid
   - Detail panel uses `useQuery` with `vigilKeys.repos.detail(name)` calling `getRepoDetail({ data: { name } })`
   - Detail sections: Git state, Recent commits (last 5), Decision distribution (horizontal bars), Patterns (bulleted), Topics (with trend arrows), Uncommitted work (grouped by status)

2. **`app/components/vigil/repo-card.tsx`**
   - Props: `repo: RepoListItem`, `isSelected: boolean`, `onSelect: () => void`
   - Shows: name (bold), branch name (`GitBranch` icon), HEAD sha 7-char (monospace), dirty dot (yellow `Circle` if dirty), state icon (active=green `Circle`, sleeping=`Moon`, dreaming=`Sparkles`)
   - Card styling: `bg-surface border-border`, selected state: `border-vigil`
   - Decision distribution sub-component: 4 horizontal bars (SILENT/OBSERVE/NOTIFY/ACT) with percentage labels, colored per `DecisionBadge` convention

3. **`app/routes/repos.tsx`**
   - `createFileRoute("/repos")` with loader calling `getRepos()`
   - Lazy imports `ReposPage`

**Sanity check**: `getRepos()` returns `{ repos: RepoListItem[] }`. `getRepoDetail({ data: { name } })` returns `RepoDetail | null`. Both types are in `app/types/api.ts`.

---

### Task 4.2 — Dreams plugin (~1.5 hr)

**Depends on**: Phase 3, Phase 1 (`getDreams`, `getDreamPatterns`, `triggerDream` server functions, `DreamsData`/`DreamResult` types)
**No inter-dependencies with other Phase 4 tasks.**
**Completion condition**: Navigate to `/dreams`, see dream log cards with expandable details, status indicator, trigger button, patterns panel, and topic evolution panel.

**Files to create**:

1. **`app/plugins/dreams/DreamsPage.tsx`** (default export)
   - `useQuery` with `vigilKeys.dreams` calling `getDreams()`
   - Dream status indicator at top: if `data.status.running` show "Dreaming: {repo} (PID {pid})" with `Sparkles` icon animated, else "Idle" with `Moon` icon
   - Trigger button: `Button` with `Sparkles` icon. Opens a `Select` for repo selection. Calls `triggerDream` mutation
   - `useMutation` for `triggerDream` invalidating `vigilKeys.dreams`
   - Repo filter `Select` at top — filters dream list client-side by `dream.repo`
   - Dream log: map over `data.dreams`, render `DreamEntry` for each
   - Patterns panel: `useQuery` with `vigilKeys.dreamPatterns(selectedRepo)` calling `getDreamPatterns({ data: { repo } })` when a repo is selected
   - Topic evolution panel: topics from patterns response, each showing name + observation count bar (proportional width) + trend indicator (`TrendingUp`/`Minus`/`TrendingDown` icons from Lucide, or "NEW" badge)

2. **`app/components/vigil/dream-entry.tsx`**
   - Props: `dream: DreamResult`
   - Card layout: timestamp (formatted), repo badge, observations count, confidence score (percentage)
   - Summary text: truncated to 2 lines by default, expandable on click (`line-clamp-2` toggle)
   - Expanded state shows: insights list (bulleted with `Lightbulb` icon), patterns list (bulleted with `Puzzle` icon)

3. **`app/routes/dreams.tsx`**
   - `createFileRoute("/dreams")` with loader calling `getDreams()`
   - Lazy imports `DreamsPage`

**Sanity check**: `getDreams()` returns `DreamsData { dreams: DreamResult[], status: { running, repo?, pid? } }`. `getDreamPatterns({ data: { repo } })` returns patterns + topics. `triggerDream({ data: { repo? } })` is a POST mutation.

---

### Task 4.3 — Tasks plugin (~1.5 hr)

**Depends on**: Phase 3, Phase 1 (`getTasks`, `createTask`, `activateTask`, `completeTask`, `failTask`, `updateTask`, `cancelTask` server functions, `TasksData`/`TaskItem` types)
**No inter-dependencies with other Phase 4 tasks.**
**Completion condition**: Navigate to `/tasks`, see task table with filter tabs showing counts, create dialog, action buttons, stats bar, and parent-child indentation.

**Files to create**:

1. **`app/plugins/tasks/TasksPage.tsx`** (default export)
   - `useQuery` with `vigilKeys.tasks` calling `getTasks({ data: {} })`
   - **Filter tabs** using shadcn `Tabs`: All, Pending ({count}), Active ({count}), Waiting ({count}), Completed ({count}) — counts from `data.counts`
   - **Stats bar** at top: completion rate as `Progress` (or a styled `div` bar), task counts by status as `Badge` elements
   - **Task table**: columns — Status icon (`Circle` for pending, `Play` for active, `Clock` for waiting, `CheckCircle` for completed, `XCircle` for failed, `Ban` for cancelled), Title, Repo, Updated (relative time), Actions
   - **Action buttons** per row: contextual based on status — Pending: Activate/Cancel, Active: Complete/Fail, Waiting: Activate/Cancel. All are `useMutation` calls invalidating `vigilKeys.tasks`
   - **Parent-child indentation**: tasks with `parentId` indented with `ml-6` under their parent. Sort: parents first, then children grouped under parent
   - **Create dialog**: `Dialog` with form fields — Title (`Input`, required), Description (`Textarea`), Repo (`Select` dropdown from `getRepos()`), Wait condition selector (`Select`: None/Event-based/Task-based/Schedule-based). Submit calls `createTask` mutation

2. **`app/routes/tasks.tsx`**
   - `createFileRoute("/tasks")` with loader calling `getTasks({ data: {} })`
   - Lazy imports `TasksPage`

**Sanity check**: `getTasks({ data: {} })` returns `TasksData { tasks: TaskItem[], counts: Record<TaskStatus, number>, completionRate: number }`. All 6 mutation server functions accept `{ data: { id } }` (or `{ data: { title, ... } }` for create). All invalidate `["tasks"]`.

---

### Task 4.4 — Actions plugin (~1.5 hr)

**Depends on**: Phase 3, Phase 1 (`getActions`, `approveAction`, `rejectAction` server functions, `ActionsData`/`ActionRequest` types)
**No inter-dependencies with other Phase 4 tasks.**
**Completion condition**: Navigate to `/actions`, see pending approval cards with tier badges, 6-gate checklist, approve/reject buttons, action history table, and stats bar.

**Files to create**:

1. **`app/plugins/actions/ActionsPage.tsx`** (default export)
   - `useQuery` with `vigilKeys.actions.all` calling `getActions({ data: {} })`
   - **Stats bar** at top: Approved/Rejected/Executed/Failed counts as `Badge` elements. By-tier counts: Safe/Moderate/Dangerous
   - **Pending approvals section**: filter `data.actions` where `status === "pending"`. Render `ActionApproval` card for each
   - **Action history table**: filter `data.actions` where `status !== "pending"`. Columns: Time (relative), Command (monospace), Repo, Tier (colored badge), Status, Result (truncated)

2. **`app/components/vigil/action-approval.tsx`**
   - Props: `action: ActionRequest`, `onApprove: () => void`, `onReject: () => void`
   - Card layout: Command in monospace `code` block, Repo badge, Reason text
   - **Tier badge**: `safe` = `Badge` with green bg (`bg-success/10 text-success`), `moderate` = amber (`bg-warning/10 text-warning`), `dangerous` = red (`bg-error/10 text-error`)
   - **Confidence**: percentage display
   - **6-gate checklist**: iterate over `action.gateResults` (Record<string, boolean>). Each gate shows: `CheckCircle` (green) if true, `XCircle` (red) if false, `Clock` (muted) if undefined/pending. Gate labels: "Config enabled", "Session opted in", "Repo in allowlist", "Action type allowed", "Confidence >= threshold", "User approval"
   - **Action buttons**: `Button variant="default"` for Approve (green-ish), `Button variant="outline"` for Reject. Both call mutations that invalidate `vigilKeys.actions.all`

3. **`app/routes/actions.tsx`**
   - `createFileRoute("/actions")` with loader calling `getActions({ data: {} })`
   - Lazy imports `ActionsPage`

**Sanity check**: `getActions({ data: {} })` returns `ActionsData { actions: ActionRequest[], stats, byTier, pending }`. `approveAction({ data: { id } })` and `rejectAction({ data: { id } })` are POST mutations.

---

### Task 4.5 — Memory plugin (~2 hr)

**Depends on**: Phase 3, Phase 1 (`getMemory`, `searchMemory`, `askVigil` server functions, `MemoryData`/`MemorySearchResult` types)
**No inter-dependencies with other Phase 4 tasks.**
**Completion condition**: Navigate to `/memory`, see 4-box pipeline visualization with counts, search with results showing similarity scores, repo profile cards, and Ask Vigil with loading state and response display.

**Files to create**:

1. **`app/plugins/memory/MemoryPage.tsx`** (default export)
   - `useQuery` with `vigilKeys.memory.stats` calling `getMemory()`
   - **Memory pipeline visualization**: 4 connected boxes in a horizontal row (flex, responsive to vertical on mobile). Each box is a `Card`:
     - EventLog: count = `data.logEntries.count`, subtitle = "JSONL files", date range
     - VectorStore: count = `data.vectorStore.count`, subtitle = "SQLite FTS5", type breakdown badges
     - TopicTier: count = `data.topics.count`, subtitle = "Grouped by theme", repo count
     - IndexTier: count = `data.index.count`, subtitle = "Cross-repo summaries", repo count
     - Boxes connected by `ChevronRight` icons between them
   - **Repo profiles section**: Cards for each repo (from topics/index data), showing summary, pattern count, last updated
   - Tabs or sections for Search and Ask Vigil

2. **`app/components/vigil/memory-search.tsx`**
   - Props: none (self-contained with own state)
   - Search input (`Input`) + repo filter (`Select`) + Search button
   - `useMutation` or `useQuery` (with `enabled: false` + manual refetch) for `searchMemory({ data: { query, repo } })`
   - Results list: each result shows similarity score (percentage badge), repo badge, content excerpt (truncated), type badge (git_event/decision/insight/consolidated — different colors)

3. **`app/components/vigil/ask-vigil.tsx`**
   - Props: none (self-contained)
   - Question `Textarea` + repo `Select` (optional) + "Ask" `Button`
   - `useMutation` for `askVigil({ data: { question, repo } })`
   - Loading state: spinner + "Thinking..." text (may take 5-30 seconds)
   - Response display: answer text in a `Card`, sources list (bulleted), round count badge
   - Disable button while loading (`mutation.isPending`)

4. **`app/routes/memory.tsx`**
   - `createFileRoute("/memory")` with loader calling `getMemory()`
   - Lazy imports `MemoryPage`

**Sanity check**: `getMemory()` returns `MemoryData { vectorStore, logEntries, topics, index }`. `searchMemory({ data: { query, repo? } })` returns `{ results: MemorySearchResult[], query }`. `askVigil({ data: { question, repo? } })` returns `{ answer, sources, rounds }`. Ask Vigil is the most complex — it's a long-running mutation (5-30s) with no streaming.

---

### Task 4.6 — Scheduler plugin (~1 hr)

**Depends on**: Phase 3, Phase 1 (`getScheduler`, `createSchedule`, `deleteSchedule`, `triggerSchedule` server functions, `SchedulerData`/`ScheduleEntry` types)
**No inter-dependencies with other Phase 4 tasks.**
**Completion condition**: Navigate to `/scheduler`, see schedule table with live countdown timers, create dialog, run history table, and Run Now/Delete buttons.

**Files to create**:

1. **`app/plugins/scheduler/SchedulerPage.tsx`** (default export)
   - `useQuery` with `vigilKeys.scheduler` calling `getScheduler()`
   - **Schedule table**: columns — Name, Cron expression (monospace), Repo, Next Run (live countdown), Actions (Run Now + Delete buttons)
   - **Live countdown timers**: each row computes remaining time from `entry.msToNext`. Use `useState` + `useEffect` with `setInterval(1000)` to tick down. Display as "Xm Ys" or "Xh Ym". When <= 0, show "Now" or "Overdue"
   - **Create dialog**: `Dialog` with form — Name (`Input`), Cron (`Input` with placeholder "0 * * * *" and helper text), Repo (`Select` dropdown from `getRepos()`), Action (`Textarea`). Submit calls `createSchedule` mutation
   - **Run history table**: columns — Time (relative), Schedule name, Status (`CheckCircle` green / `XCircle` red), Duration, Output (truncated, click to expand in `Dialog` or inline)
   - Mutations: `createSchedule`, `deleteSchedule`, `triggerSchedule` — all invalidate `vigilKeys.scheduler`
   - Delete confirmation: either inline "Are you sure?" toggle or simple `window.confirm()`

2. **`app/routes/scheduler.tsx`**
   - `createFileRoute("/scheduler")` with loader calling `getScheduler()`
   - Lazy imports `SchedulerPage`

**Sanity check**: `getScheduler()` returns `SchedulerData { entries: ScheduleEntry[], history }`. `createSchedule({ data: { name, cron, action, repo? } })`, `deleteSchedule({ data: { id } })`, `triggerSchedule({ data: { id } })` are POST mutations. `ScheduleEntry.msToNext` is nullable (null if no next run).

---

### Task 4.7 — Metrics plugin with Recharts (~2 hr)

**Depends on**: Phase 3, Phase 1 (`getMetrics` server function, `MetricsData` type)
**No inter-dependencies with other Phase 4 tasks.**
**Completion condition**: Navigate to `/metrics`, see 6 Recharts panels rendered with Vigil theme colors and live data from `getMetrics()`.

**Pre-requisite**: Install Recharts:
```bash
cd dashboard-v2 && bun add recharts
```

**Files to create**:

1. **`app/components/vigil/metrics-chart.tsx`** — Reusable Recharts wrapper
   - Exports `VIGIL_CHART_COLORS` constant mapping decision types and semantic colors to CSS custom properties
   - Exports `VigilTooltip` — pre-styled `<Tooltip>` with `contentStyle` using `--color-surface-dark` background and `--color-border` border
   - Exports `VigilCartesianGrid` — pre-styled `<CartesianGrid>` with `stroke="var(--color-border)"` and `strokeDasharray="3 3"`
   - Exports `chartAxisProps` — shared axis styling: `tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}`, `axisLine={{ stroke: "var(--color-border)" }}`

2. **`app/plugins/metrics/MetricsPage.tsx`** (default export)
   - `useQuery` with `vigilKeys.metrics` calling `getMetrics()`, `refetchInterval: 30_000`
   - **6 panels in a responsive grid** (2 cols on lg, 1 col on mobile):

   **Panel 1 — Decision Distribution** (Stacked Bar Chart):
   - `<BarChart>` with `data={data.decisions.series}`
   - 4 stacked `<Bar>` components: SILENT, OBSERVE, NOTIFY, ACT
   - Colors from `VIGIL_CHART_COLORS`
   - X-axis: time (30-min bucket labels), Y-axis: count
   - `<Legend>` below chart

   **Panel 2 — LLM Latency** (Line Chart):
   - `<LineChart>` with `data={data.latency.series}`
   - Single `<Line>` for `ms` values, color = `--color-vigil`
   - `<ReferenceLine>` at p95 value (dashed, color = `--color-warning`), labeled "p95"
   - X-axis: tick number, Y-axis: ms
   - Stats below: avg, p95, max, count

   **Panel 3 — Token Usage** (Bar Chart):
   - `<BarChart>` with token-per-tick data
   - Single `<Bar>` color = `--color-info`
   - Text overlay card: "Total: {total}", "Est. cost: {costEstimate}"

   **Panel 4 — Adaptive Tick Interval** (Area Chart):
   - `<AreaChart>` with `data={data.tickTiming.series}`
   - Configured baseline as dashed `<Line>` (reference), actual adaptive interval as filled `<Area>`
   - Shows how interval adapts to activity level

   **Panel 5 — Sleep/Wake Timeline** (Custom):
   - Horizontal strip showing 24h timeline
   - Segments colored: running=`--color-success`, sleeping=`--color-text-muted`, down=`--color-error`
   - Can use Recharts `<BarChart layout="vertical">` with a single stacked bar, or a custom SVG
   - Wake event labels if available

   **Panel 6 — Quick Stats** (Card Grid):
   - 2x5 grid of stat cards (or 3x4 responsive)
   - Items: Total ticks, LLM calls, Tokens used, Cost estimate, Avg latency, P95 latency, Max latency, Sleep cycles, Total sleep time, Proactive ticks
   - Each card: label (text-muted, small), value (text-text, large/bold), optional trend indicator

3. **`app/routes/metrics.tsx`**
   - `createFileRoute("/metrics")` with loader calling `getMetrics()`
   - Uses `lazyRouteComponent()` to load `MetricsPage` (SSR-safe)

**Sanity check**: `getMetrics()` returns `MetricsData` with `decisions.series[]`, `latency.series[]`, `tokens`, `tickTiming`, `ticks`, `state`. Recharts tree-shakes well — import only needed components (`BarChart`, `Bar`, `LineChart`, `Line`, `AreaChart`, `Area`, `XAxis`, `YAxis`, `Tooltip`, `Legend`, `ResponsiveContainer`, `CartesianGrid`, `ReferenceLine`). Do NOT import the entire `recharts` module.

---

## 4. Deliverables

```
dashboard-v2/
├── package.json                                    # Updated: +recharts dependency
├── src/
│   ├── plugins/
│   │   ├── repos/
│   │   │   └── ReposPage.tsx                       # Repo grid + detail panel
│   │   ├── dreams/
│   │   │   └── DreamsPage.tsx                      # Dream log + trigger + patterns + topics
│   │   ├── tasks/
│   │   │   └── TasksPage.tsx                       # Task table + filters + create dialog + stats
│   │   ├── actions/
│   │   │   └── ActionsPage.tsx                     # Pending approvals + history + stats
│   │   ├── memory/
│   │   │   └── MemoryPage.tsx                      # Pipeline viz + search + profiles + ask
│   │   ├── scheduler/
│   │   │   └── SchedulerPage.tsx                   # Schedule table + create dialog + history
│   │   └── metrics/
│   │       └── MetricsPage.tsx                     # 6 Recharts panels
│   ├── components/vigil/
│   │   ├── repo-card.tsx                           # Repo card with status indicators
│   │   ├── dream-entry.tsx                         # Dream result card with expandable details
│   │   ├── action-approval.tsx                     # Approval card with 6-gate checklist
│   │   ├── memory-search.tsx                       # Search input + results with similarity scores
│   │   ├── ask-vigil.tsx                           # Question input + answer display
│   │   └── metrics-chart.tsx                       # Recharts wrapper with Vigil theme colors
│   └── routes/
│       ├── repos.tsx                               # /repos route
│       ├── dreams.tsx                              # /dreams route
│       ├── tasks.tsx                               # /tasks route
│       ├── actions.tsx                             # /actions route
│       ├── memory.tsx                              # /memory route
│       ├── scheduler.tsx                           # /scheduler route
│       └── metrics.tsx                             # /metrics route
```

**Total new files**: 20 (7 plugin pages + 6 vigil components + 7 route files)
**Modified files**: 1 (`package.json` for recharts)

---

## 5. Exit Criteria

- [ ] `bun add recharts` installed in `dashboard-v2/` and `package.json` updated
- [ ] All 7 route files exist and use `createFileRoute` with loader + lazy import pattern
- [ ] All 7 plugin page components exist as default exports receiving `WidgetProps`
- [ ] All 6 shared vigil components exist (`repo-card`, `dream-entry`, `action-approval`, `memory-search`, `ask-vigil`, `metrics-chart`)
- [ ] Repos plugin: grid with branch/HEAD/dirty/state indicators, expandable detail with commits + decision bars + patterns + topics + uncommitted
- [ ] Dreams plugin: dream log cards expandable, status indicator, trigger button with repo selector, patterns panel, topic evolution
- [ ] Tasks plugin: task table with status filter tabs (counts), create dialog with wait conditions, action buttons, stats bar, parent-child indentation
- [ ] Actions plugin: pending approval cards with tier badges + 6-gate checklist + approve/reject, history table, stats bar
- [ ] Memory plugin: 4-box pipeline visualization with counts, search with similarity scores, repo profiles, Ask Vigil with loading spinner
- [ ] Scheduler plugin: schedule table with live countdown timers, create dialog with cron hint, run history, Run Now/Delete buttons
- [ ] Metrics plugin: 6 Recharts panels (decision stacked bar, latency line, token bar, adaptive tick area, sleep/wake strip, quick stats grid) with Vigil theme colors
- [ ] All mutations call correct server functions and invalidate appropriate query keys on success
- [ ] `bunx tsc --noEmit` passes in `dashboard-v2/` with no errors across all new files
- [ ] No external CDN requests — all assets bundled locally

---

## 6. Execution Prompt

You are implementing Phase 4 (Port Core Plugins) of Vigil Dashboard v2 — a TanStack Start + React rewrite of an existing HTMX dashboard for a local git monitoring daemon.

### What the project is

Vigil is a local dev tool (Bun/TypeScript) that watches git repos, makes LLM-powered decisions, and consolidates memory during idle time. The dashboard v2 is a TanStack Start app inside `dashboard-v2/` at the repo root, embedded into Vigil's `Bun.serve()` on port 7480.

### What prior phases established

- **Phase 0**: TanStack Start app with Bun.serve() embedding, Tailwind v4 with `@theme` tokens (navy bg `#222745`, orange accent `#FF8102`), shadcn/ui components, `cn()` utility
- **Phase 1**: Full project structure — 15+ route stubs, all shadcn/ui components installed, TypeScript types in `app/types/api.ts` and `app/types/plugin.ts`, server functions in `app/server/functions.ts` wrapping all JSON APIs, query key factory in `app/lib/query-keys.ts`, Lucide React installed
- **Phase 2**: Shell layout — shadcn/ui `Sidebar` (`collapsible="icon"`), `SidebarInset` with sticky header (breadcrumbs, daemon status, tick countdown), `SidebarProvider` in root, SSE hook for live updates
- **Phase 3**: Plugin system — `corePlugins` array in `app/plugins/index.ts`, `PluginSlot` with `Suspense` + `ErrorBoundary` lazy loading, Timeline plugin fully working as first plugin (search, filters, expandable entries, pagination)

### Architecture decisions (must follow)

- **`inputValidator()`, NOT `validator()`** — current TanStack Start API
- **Tailwind v4 CSS-first config** — colors via `@theme` tokens, use `bg-surface`, `text-vigil`, `border-border`, etc.
- **shadcn/ui components** — all UI from `@/components/ui/`. No custom primitives.
- **Lucide React** — all icons from `lucide-react`. No emoji.
- **`cn()` for conditional classes** — from `@/lib/cn`
- **Module-level imports** — server functions from `../../server/functions`, query keys from `../../lib/query-keys`, types from `../../types/api`

### Data model rules (TypeScript)

- All API types are defined in `app/types/api.ts` — do NOT redefine them. Import and use:
  - `RepoListItem`, `RepoDetail`, `TopicInfo` for Repos
  - `DreamResult`, `DreamsData` for Dreams
  - `TaskItem`, `TasksData`, `TaskStatus` for Tasks
  - `ActionRequest`, `ActionsData`, `ActionTier`, `ActionStatus` for Actions
  - `MemoryData`, `MemorySearchResult` for Memory
  - `ScheduleEntry`, `SchedulerData` for Scheduler
  - `MetricsData`, `DecisionType` for Metrics
- `WidgetProps` from `app/types/plugin.ts` — `{ activeRepo: string | null; queryClient: QueryClient }`
- Use `interface` for object shapes, `type` for unions (already done in api.ts)

### Server functions available (from Phase 1)

All in `app/server/functions.ts`. No new server functions needed:

**Reads** (used in `useQuery`):
- `getRepos()` → `{ repos: RepoListItem[] }`
- `getRepoDetail({ data: { name } })` → `RepoDetail | null`
- `getDreams()` → `DreamsData`
- `getDreamPatterns({ data: { repo } })` → patterns + topics
- `getTasks({ data: { status?, repo? } })` → `TasksData`
- `getActions({ data: { status? } })` → `ActionsData`
- `getMemory()` → `MemoryData`
- `searchMemory({ data: { query, repo? } })` → `{ results: MemorySearchResult[], query }`
- `getMetrics()` → `MetricsData`
- `getScheduler()` → `SchedulerData`

**Mutations** (used in `useMutation`):
- `triggerDream({ data: { repo? } })` → invalidate `vigilKeys.dreams`
- `createTask({ data: { title, description?, repo? } })` → invalidate `vigilKeys.tasks`
- `activateTask({ data: { id } })` → invalidate `vigilKeys.tasks`
- `completeTask({ data: { id } })` → invalidate `vigilKeys.tasks`
- `failTask({ data: { id } })` → invalidate `vigilKeys.tasks`
- `updateTask({ data: { id, title?, description?, repo? } })` → invalidate `vigilKeys.tasks`
- `cancelTask({ data: { id } })` → invalidate `vigilKeys.tasks`
- `approveAction({ data: { id } })` → invalidate `vigilKeys.actions.all`
- `rejectAction({ data: { id } })` → invalidate `vigilKeys.actions.all`
- `askVigil({ data: { question, repo? } })` → no invalidation (one-shot)
- `createSchedule({ data: { name, cron, action, repo? } })` → invalidate `vigilKeys.scheduler`
- `deleteSchedule({ data: { id } })` → invalidate `vigilKeys.scheduler`
- `triggerSchedule({ data: { id } })` → invalidate `vigilKeys.scheduler`

### Query key factory (from Phase 1)

```typescript
// app/lib/query-keys.ts
export const vigilKeys = {
  overview: ["overview"] as const,
  repos: {
    all: ["repos"] as const,
    detail: (name: string) => ["repos", name] as const,
  },
  timeline: (filters?) => ["timeline", filters ?? {}] as const,
  dreams: ["dreams"] as const,
  dreamPatterns: (repo: string) => ["dreams", "patterns", repo] as const,
  memory: {
    stats: ["memory"] as const,
    search: (query: string) => ["memory", "search", query] as const,
  },
  actions: {
    all: ["actions"] as const,
    pending: ["actions", "pending"] as const,
  },
  tasks: ["tasks"] as const,
  scheduler: ["scheduler"] as const,
  metrics: ["metrics"] as const,
} as const;
```

### Per-file guidance

**Route files** (7 files, all follow this template):

```typescript
// app/routes/<name>.tsx
import { createFileRoute } from "@tanstack/react-router";
import { lazyRouteComponent } from "@tanstack/react-router";
import { get<Name> } from "../server/functions";

export const Route = createFileRoute("/<name>")({
  loader: () => get<Name>(),  // or get<Name>({ data: {} }) if inputValidator requires it
  component: lazyRouteComponent(() => import("../plugins/<name>/<Name>Page")),
});
```

> **SSR safety note**: `lazyRouteComponent()` replaces `React.lazy()` + manual `<Suspense>`.
> Native `React.lazy()` throws on the server; TanStack Router's lazy helpers are SSR-safe.

**Plugin page files** (7 files, all follow this pattern):

```typescript
// app/plugins/<name>/<Name>Page.tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { vigilKeys } from "../../lib/query-keys";
import { get<Name>, ... } from "../../server/functions";
import type { WidgetProps } from "../../types/plugin";
// Import shadcn/ui components as needed
// Import Lucide icons as needed
// Import vigil components as needed

export default function <Name>Page({ activeRepo }: WidgetProps) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: vigilKeys.<name>,
    queryFn: () => get<Name>(),
  });

  // For mutations:
  const someMutation = useMutation({
    mutationFn: (input: SomeType) => someServerFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.<name> });
    },
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Plugin UI here */}
    </div>
  );
}
```

**Vigil component files** (6 files):

Each is a focused, reusable component. Props use types from `app/types/api.ts`. Styling uses Tailwind v4 theme tokens (`bg-surface`, `text-vigil`, `border-border`, etc.) and `cn()` for conditional classes. Icons from `lucide-react`.

**Metrics chart wrapper** (`app/components/vigil/metrics-chart.tsx`):

```typescript
import {
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";

export const VIGIL_CHART_COLORS = {
  SILENT: "var(--color-text-muted)",
  OBSERVE: "var(--color-info)",
  NOTIFY: "var(--color-warning)",
  ACT: "var(--color-vigil)",
  primary: "var(--color-vigil)",
  secondary: "var(--color-info)",
  success: "var(--color-success)",
  error: "var(--color-error)",
  grid: "var(--color-border)",
  text: "var(--color-text-muted)",
} as const;

export const vigilTooltipStyle = {
  contentStyle: {
    background: "var(--color-surface-dark)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    color: "var(--color-text)",
    fontSize: 12,
  },
} as const;

export const vigilAxisProps = {
  tick: { fill: "var(--color-text-muted)", fontSize: 12 },
  axisLine: { stroke: "var(--color-border)" },
  tickLine: { stroke: "var(--color-border)" },
} as const;
```

**Recharts import rule**: Import only the specific Recharts components needed — NOT `import * from "recharts"`. Example:

```typescript
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
```

### Execution order

All 7 tasks are fully parallelizable — no inter-dependencies. Suggested order for a single agent:

1. **Task 4.7** (Metrics) — do this first since it requires `bun add recharts` which modifies `package.json`
2. **Tasks 4.1-4.6** — any order. Each is self-contained.

Within each task, create files in this order:
1. Route file (quick, template-based)
2. Shared vigil components (if any)
3. Plugin page component (the main work)

### Vigil theme color reference

```
--color-vigil: #FF8102        (orange accent)
--color-vigil-light: #FF9B33
--color-vigil-hover: #E57300
--color-background: #222745   (navy bg)
--color-surface: #2A3055
--color-surface-dark: #1B2038
--color-surface-light: #333A62
--color-border: #3D4470
--color-border-light: #4A5280
--color-text: #E8E9F0
--color-text-muted: #9498B8
--color-success: #4ADE80      (green)
--color-warning: #FBBF24      (amber)
--color-error: #F87171        (red)
--color-info: #60A5FA         (blue)
```

### Success criteria

Run these checks after implementation:

```bash
# 1. TypeScript compiles
cd dashboard-v2 && bunx tsc --noEmit

# 2. All plugin files exist
ls src/plugins/repos/ReposPage.tsx \
   src/plugins/dreams/DreamsPage.tsx \
   src/plugins/tasks/TasksPage.tsx \
   src/plugins/actions/ActionsPage.tsx \
   src/plugins/memory/MemoryPage.tsx \
   src/plugins/scheduler/SchedulerPage.tsx \
   src/plugins/metrics/MetricsPage.tsx

# 3. All route files exist
ls src/routes/repos.tsx src/routes/dreams.tsx src/routes/tasks.tsx \
   src/routes/actions.tsx src/routes/memory.tsx src/routes/scheduler.tsx \
   src/routes/metrics.tsx

# 4. All vigil components exist
ls src/components/vigil/repo-card.tsx \
   src/components/vigil/dream-entry.tsx \
   src/components/vigil/action-approval.tsx \
   src/components/vigil/memory-search.tsx \
   src/components/vigil/ask-vigil.tsx \
   src/components/vigil/metrics-chart.tsx

# 5. Recharts installed
grep '"recharts"' package.json

# 6. Dev server starts
bun run dev
```

---

## Readiness Check

- [PASS] All inputs from prior phases are listed and available — Phase 3 plugin registry, PluginSlot, Timeline pattern; Phase 1 server functions, types, query keys; Phase 0 Tailwind tokens, shadcn/ui components
- [PASS] Every sub-task has a clear, testable completion condition — each plugin has specific UI elements to verify
- [PASS] Execution prompt is self-contained: includes (a) prior phase summaries, (b) confirmed API patterns (server functions, query keys, WidgetProps), (c) Data Model Rules section, (d) per-file guidance for all 20 files, and (e) observable success criteria
- [PASS] Exit criteria map 1:1 to deliverables — 7 routes, 7 plugin pages, 6 vigil components, recharts dep, TypeScript compilation, no CDN
- [PASS] Any heavy external dependency has a fake/stub strategy noted — Recharts is the only new dep, installed via `bun add recharts`; all data comes from existing server functions. Recharts v3 confirmed compatible with React 19
- [PASS] New library (Recharts) has confirmed usage patterns — standard `<BarChart>`, `<LineChart>`, `<AreaChart>` components with `<ResponsiveContainer>` wrapping; CSS custom properties for Vigil theme colors; tree-shakeable named imports
- [PASS] Route files use `lazyRouteComponent()` from TanStack Router instead of `React.lazy()` — SSR-safe lazy loading confirmed
