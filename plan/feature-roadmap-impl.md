# Vigil Dashboard — Feature Roadmap Implementation Plan

Ultra-detailed, sprint-organized plan with exact file paths, code snippets, and commands.

**Stack context**: React 19 + TanStack Router + TanStack Query 5 + shadcn/ui + Tailwind 4 + Bun + cmdk 1.1.1 + Zod 4 + Recharts 3 + Lucide icons.

**Pattern context**: All mutations use `useMutation` + `onSuccess: invalidateQueries`. Data fetches use `useQuery` + `vigilKeys`. Forms use `FormData` (except config/webhooks/channels which use JSON). SSE auto-invalidates queries. Pages are registered as plugins in `dashboard-v2/src/plugins/index.ts`.

---

## Sprint 1 — Quick Wins: Forms for Existing APIs (3 features, ~5 hours)

These features have **complete backend APIs** and **client wrappers** already written. Only UI forms are missing.

---

### 1.1 Task Creation Form (S — ~1.5 hours)

**Why first**: Tasks are the core workflow unit. Users currently cannot create tasks from the dashboard at all — they must use the CLI. The API (`POST /api/tasks`) and client wrapper (`createTask()`) already exist.

**Files to modify**:
- `dashboard-v2/src/plugins/tasks/TasksPage.tsx` — add create dialog

**Dependencies already in place**:
- `createTask()` in `dashboard-v2/src/server/functions.ts:114-124`
- `vigilKeys.tasks` in `dashboard-v2/src/lib/query-keys.ts`
- `Dialog`, `Input`, `Textarea`, `Select`, `Label`, `Button` components all exist in `dashboard-v2/src/components/ui/`

**Implementation**:

1. Add a "New Task" button to the TasksPage header (next to the completion rate text).
2. Wire it to a `<Dialog>` with a form containing: title (required), description (optional textarea), repo (optional select from overview repos).
3. Use `useMutation({ mutationFn: createTask, onSuccess: invalidate tasks })`.
4. Close dialog and show success toast via `sonner`.

```tsx
// Inside TasksPage.tsx — add to imports
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createTask } from "../../server/functions";
import { getOverview } from "../../server/functions";

// Inside component — add state and mutations
const [createOpen, setCreateOpen] = useState(false);
const [title, setTitle] = useState("");
const [description, setDescription] = useState("");
const [repo, setRepo] = useState<string>("");

const { data: overview } = useQuery({
  queryKey: vigilKeys.overview,
  queryFn: getOverview,
});
const repos = (overview as any)?.repos ?? [];

const create = useMutation({
  mutationFn: () => createTask({
    data: { title, description: description || undefined, repo: repo || undefined }
  }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: vigilKeys.tasks });
    setCreateOpen(false);
    setTitle(""); setDescription(""); setRepo("");
    toast.success("Task created");
  },
  onError: (err) => toast.error(`Failed: ${err.message}`),
});

// In the header — add button
<Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>
  <Plus className="size-3 mr-1" /> New Task
</Button>

// After the main JSX — add dialog
<Dialog open={createOpen} onOpenChange={setCreateOpen}>
  <DialogContent>
    <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
    <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="desc">Description</Label>
        <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="repo">Repository</Label>
        <Select value={repo} onValueChange={setRepo}>
          <SelectTrigger><SelectValue placeholder="All repos" /></SelectTrigger>
          <SelectContent>
            {repos.map((r: any) => (
              <SelectItem key={r.name} value={r.name}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={!title.trim() || create.isPending} className="w-full">
        {create.isPending ? "Creating..." : "Create Task"}
      </Button>
    </form>
  </DialogContent>
</Dialog>
```

**Verify**: `bun run typecheck && bun run dashboard:dev` — open /tasks, click "New Task", fill form, submit. Task should appear in list. SSE `task_updated` event should auto-refresh.

---

### 1.2 Webhook Subscription Form (S — ~1.5 hours)

**Why**: Users can see and delete subscriptions but can't create them. The API (`POST /api/webhooks/subscriptions`) and client wrapper (`createWebhookSubscription()`) exist.

**Files to modify**:
- `dashboard-v2/src/plugins/webhooks/WebhooksPage.tsx` — add create dialog

**Implementation**:

1. Add "Add Subscription" button next to the Subscriptions header.
2. Dialog with: repo select, multi-select checkboxes for event types (fetched from `getWebhookEvents()`), optional expiry input.
3. Webhook subscriptions use JSON body (not FormData) — the client wrapper already handles this.

```tsx
// In WebhooksPage.tsx — add state
const [createOpen, setCreateOpen] = useState(false);
const [subRepo, setSubRepo] = useState("");
const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

// Events data already fetched as `eventsData` — these are the available event types
const eventTypes = Array.isArray(eventsData) ? eventsData : [];

// Need overview for repo list
const { data: overview } = useQuery({
  queryKey: vigilKeys.overview,
  queryFn: getOverview,
});

const createSub = useMutation({
  mutationFn: () => createWebhookSubscription({
    data: { repo: subRepo, eventTypes: selectedEvents }
  }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: vigilKeys.webhooks.subscriptions });
    setCreateOpen(false);
    setSubRepo(""); setSelectedEvents([]);
    toast.success("Subscription created");
  },
});

// Toggle event selection helper
const toggleEvent = (evt: string) => {
  setSelectedEvents(prev =>
    prev.includes(evt) ? prev.filter(e => e !== evt) : [...prev, evt]
  );
};
```

**Dialog UI**: Repo select dropdown + grid of event type checkboxes (use shadcn `Button` with variant toggle pattern — `variant={selected ? "default" : "outline"}`).

**Verify**: Create subscription, see it appear in list, delete it. Confirm events list is fetched and rendered as selectable buttons.

---

### 1.3 Scheduler Creation Form (M — ~2 hours)

**Why**: The scheduler page can only list/delete/trigger — no way to create schedules from UI. API (`POST /api/scheduler`) and wrapper (`createSchedule()`) exist.

**Files to modify**:
- `dashboard-v2/src/plugins/scheduler/SchedulerPage.tsx` — add create dialog

**Implementation**:

1. Add "New Schedule" button in the header.
2. Dialog with: name (text), cron expression (text with placeholder examples), action (select: "dream", "health-check", "summary"), optional repo.
3. Show cron expression preview (e.g., "Every day at 3am") — use a simple lookup map for common patterns, not a library.

```tsx
// Common cron presets as helper buttons
const CRON_PRESETS = [
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Every 6 hours", cron: "0 */6 * * *" },
  { label: "Daily at 3am", cron: "0 3 * * *" },
  { label: "Weekly Sunday", cron: "0 0 * * 0" },
];

// Form fields
const [schedName, setSchedName] = useState("");
const [cronExpr, setCronExpr] = useState("");
const [schedAction, setSchedAction] = useState("dream");
const [schedRepo, setSchedRepo] = useState("");

const createSched = useMutation({
  mutationFn: () => createSchedule({
    data: { name: schedName, cron: cronExpr, action: schedAction, repo: schedRepo || undefined }
  }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: vigilKeys.scheduler });
    setCreateOpen(false);
    toast.success("Schedule created");
  },
});
```

**Cron preset buttons**: Row of small buttons above the cron input that set the value when clicked. This avoids needing a cron builder library.

**Verify**: Create a schedule, see it appear with next-run countdown. Trigger it manually. Delete it.

---

## Sprint 2 — Dream Patterns + Task Edit (2 features, ~3 hours)

---

### 2.1 Dream Pattern Explorer (S — ~1.5 hours)

**Why**: API exists at `GET /api/dreams/patterns/:repo`, client wrapper `getDreamPatterns()` exists, but no UI surfaces it. This gives users visibility into what Vigil has learned.

**Files to modify**:
- `dashboard-v2/src/plugins/dreams/DreamsPage.tsx` — add pattern section

**Implementation**:

1. When a repo filter is active, fetch `getDreamPatterns({ data: { repo } })`.
2. Display patterns as a list of `Card` items below the dream entries.
3. Use `useQuery` with `enabled: !!repoFilter` so it only fires when a repo is selected.

```tsx
// Add to DreamsPage
const { data: patternsData } = useQuery({
  queryKey: vigilKeys.dreamPatterns(repoFilter ?? ""),
  queryFn: () => getDreamPatterns({ data: { repo: repoFilter! } }),
  enabled: !!repoFilter,
});

const patterns = (patternsData as DreamPatternsData | undefined)?.patterns ?? [];

// Render below dream entries when repoFilter is set
{repoFilter && patterns.length > 0 && (
  <div className="space-y-3">
    <h4 className="text-xs font-medium text-muted-foreground uppercase">
      Discovered Patterns — {repoFilter}
    </h4>
    <div className="space-y-2">
      {patterns.map((pattern, i) => (
        <Card key={i}>
          <CardContent className="text-sm">{pattern}</CardContent>
        </Card>
      ))}
    </div>
  </div>
)}
```

**Verify**: Select a repo filter on Dreams page. If that repo has been dreamed about, patterns should appear below the dream list.

---

### 2.2 Inline Task Editing (S — ~1.5 hours)

**Why**: `PUT /api/tasks/:id` and `updateTask()` wrapper exist. Users can change status but can't edit title/description.

**Files to modify**:
- `dashboard-v2/src/plugins/tasks/TasksPage.tsx` — add edit dialog

**Implementation**:

1. Add a pencil icon button to each task card (between badge and action buttons).
2. Opens a `Dialog` pre-populated with current title/description.
3. Uses `updateTask` mutation.

```tsx
import { Pencil } from "lucide-react";
import { updateTask } from "../../server/functions";

// State
const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
const [editTitle, setEditTitle] = useState("");
const [editDesc, setEditDesc] = useState("");

const edit = useMutation({
  mutationFn: () => updateTask({
    data: { id: editingTask!.id, title: editTitle, description: editDesc || undefined }
  }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: vigilKeys.tasks });
    setEditingTask(null);
    toast.success("Task updated");
  },
});

// On each task card — add edit button (only for non-terminal states)
{(task.status === "pending" || task.status === "active" || task.status === "waiting") && (
  <Button size="xs" variant="ghost" onClick={() => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDesc(task.description ?? "");
  }}>
    <Pencil className="size-3" />
  </Button>
)}
```

**Verify**: Click pencil on a task, edit title, save. Task list should refresh with new title.

---

## Sprint 3 — Global Command Palette (1 feature, ~3 hours)

### 3.1 Global Command Palette (M — ~3 hours)

**Why**: Biggest UX win. `cmdk` 1.1.1 is already installed. The shadcn `CommandDialog` wrapper exists at `dashboard-v2/src/components/ui/command.tsx`. This is the highest-impact cross-cutting feature.

**Files to create**:
- `dashboard-v2/src/components/vigil/command-palette.tsx` — the palette component

**Files to modify**:
- `dashboard-v2/src/routes/__root.tsx` — mount the palette globally

**Implementation**:

The command palette needs three sections:
1. **Navigation** — jump to any page (Timeline, Repos, Dreams, etc.)
2. **Quick Actions** — trigger dream, create task, test notification
3. **Search** — search timeline messages and memory (debounced API calls)

```tsx
// dashboard-v2/src/components/vigil/command-palette.tsx
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandShortcut, CommandSeparator,
} from "../ui/command";
import {
  Clock, GitBranch, Sparkles, CheckSquare, Shield, Brain,
  BarChart3, Calendar, Settings, Bot, Heart, Webhook,
  Radio, Bell, Network, Search, Plus, Play, Zap,
} from "lucide-react";
import { vigilKeys } from "../../lib/query-keys";
import { triggerDream, searchMemory } from "../../server/functions";
import { toast } from "sonner";

const NAV_ITEMS = [
  { label: "Timeline", path: "/", icon: Clock, shortcut: "G T" },
  { label: "Repos", path: "/repos", icon: GitBranch, shortcut: "G R" },
  { label: "Dreams", path: "/dreams", icon: Sparkles, shortcut: "G D" },
  { label: "Tasks", path: "/tasks", icon: CheckSquare, shortcut: "G K" },
  { label: "Actions", path: "/actions", icon: Shield, shortcut: "G A" },
  { label: "Memory", path: "/memory", icon: Brain, shortcut: "G M" },
  { label: "Metrics", path: "/metrics", icon: BarChart3, shortcut: "G X" },
  { label: "Scheduler", path: "/scheduler", icon: Calendar, shortcut: "G S" },
  { label: "Config", path: "/config", icon: Settings, shortcut: "G C" },
  { label: "Agents", path: "/agents", icon: Bot, shortcut: "G G" },
  { label: "Health", path: "/health", icon: Heart, shortcut: "G H" },
  { label: "Webhooks", path: "/webhooks", icon: Webhook, shortcut: "G W" },
  { label: "Channels", path: "/channels", icon: Radio, shortcut: "G L" },
  { label: "Notifications", path: "/notifications", icon: Bell, shortcut: "G N" },
  { label: "A2A", path: "/a2a", icon: Network, shortcut: "G 2" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Cmd+K to toggle
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const goTo = useCallback((path: string) => {
    navigate({ to: path });
    setOpen(false);
    setSearch("");
  }, [navigate]);

  const dream = useMutation({
    mutationFn: () => triggerDream({ data: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.dreams });
      toast.success("Dream triggered");
    },
  });

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command Palette" description="Navigate, search, or run actions">
      <CommandInput placeholder="Type a command or search..." value={search} onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {NAV_ITEMS.map(item => (
            <CommandItem key={item.path} onSelect={() => goTo(item.path)}>
              <item.icon className="size-4" />
              <span>{item.label}</span>
              <CommandShortcut>{item.shortcut}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={() => { dream.mutate(); setOpen(false); }}>
            <Sparkles className="size-4" />
            <span>Trigger Dream</span>
          </CommandItem>
          <CommandItem onSelect={() => { goTo("/tasks"); /* TODO: auto-open create dialog */ }}>
            <Plus className="size-4" />
            <span>New Task</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
```

**Mount in root layout** — add `<CommandPalette />` inside the `__root.tsx` layout, inside the providers but outside the `<Outlet />`:

```tsx
// dashboard-v2/src/routes/__root.tsx — inside the layout component
import { CommandPalette } from "../components/vigil/command-palette";

// Add before <Outlet />
<CommandPalette />
```

**Keyboard navigation shortcuts** (`g t`, `g r`, etc.) — implement a two-key chord listener in the same component:

```tsx
// Two-key chord: "g" followed by second key within 500ms
useEffect(() => {
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout>;

  const handler = (e: KeyboardEvent) => {
    if (open) return; // don't interfere with command palette
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    if (pending === "g") {
      const map: Record<string, string> = {
        t: "/", r: "/repos", d: "/dreams", k: "/tasks", a: "/actions",
        m: "/memory", x: "/metrics", s: "/scheduler", c: "/config",
        g: "/agents", h: "/health", w: "/webhooks", l: "/channels",
        n: "/notifications", "2": "/a2a",
      };
      const path = map[e.key];
      if (path) { e.preventDefault(); navigate({ to: path }); }
      pending = null;
      clearTimeout(timer);
    } else if (e.key === "g") {
      pending = "g";
      timer = setTimeout(() => { pending = null; }, 500);
    }
  };

  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}, [open, navigate]);
```

**Verify**: Press Cmd+K — palette opens. Type "tasks" — navigates to tasks. Press `g` then `d` — navigates to dreams. Test on both Mac and Linux (Cmd vs Ctrl).

---

## Sprint 4 — Config & Agent Management (2 features, ~5 hours)

---

### 4.1 Inline Config Editing (M — ~2.5 hours)

**Why**: Users currently toggle feature gates but can't edit config values (tick interval, models, budgets) from the UI. The `PUT /api/config` endpoint and `updateConfig()` wrapper exist.

**Files to modify**:
- `dashboard-v2/src/plugins/config/ConfigPage.tsx` — add inline editing

**Implementation**:

1. Read the existing ConfigPage to understand current layout.
2. For each config value, render an editable field (text input for strings/numbers, switch for booleans).
3. Add a "Save" button that calls `updateConfig()` with changed values.
4. Use local state to track edits, diff against original to build the update payload.

**Config value types** (from `GET /api/config` response): tick intervals (numbers), model names (strings), budget limits (numbers), backend settings (strings). Use `<Input type="number">` for numeric fields, `<Input>` for strings.

**Pattern**: Edit-in-place with a "Save Changes" footer bar that appears when dirty:

```tsx
const [edits, setEdits] = useState<Record<string, any>>({});
const isDirty = Object.keys(edits).length > 0;

const save = useMutation({
  mutationFn: () => updateConfig({ data: edits }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: vigilKeys.config.all });
    setEdits({});
    toast.success("Config saved");
  },
});

// For each config entry
const handleChange = (key: string, value: any) => {
  setEdits(prev => {
    const next = { ...prev };
    if (value === originalConfig[key]) delete next[key];
    else next[key] = value;
    return next;
  });
};

// Sticky save bar at bottom
{isDirty && (
  <div className="sticky bottom-0 bg-background border-t p-4 flex justify-end gap-2">
    <Button variant="ghost" onClick={() => setEdits({})}>Discard</Button>
    <Button onClick={() => save.mutate()} disabled={save.isPending}>
      {save.isPending ? "Saving..." : `Save ${Object.keys(edits).length} changes`}
    </Button>
  </div>
)}
```

**Verify**: Change tick interval, save. Verify via `GET /api/config` that value persisted. Discard button resets.

---

### 4.2 Agent Switching with Preview (M — ~2.5 hours)

**Why**: Users can view agents but switching via UI may be unclear. The `PATCH /api/agents/current` endpoint and `switchAgent()` wrapper exist.

**Files to modify**:
- `dashboard-v2/src/plugins/agents/AgentsPage.tsx` — improve agent cards with switch action and system prompt preview

**Implementation**:

1. Read current AgentsPage to understand layout.
2. Each agent card should show: name, description excerpt, model, whether it's the current agent.
3. "Activate" button on non-current agents calls `switchAgent()`.
4. Clicking an agent card opens a `Sheet` (side panel) showing the full system prompt in a scrollable pre-formatted block.

```tsx
const switchMut = useMutation({
  mutationFn: (agentName: string) => switchAgent({ data: { agentName } }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: vigilKeys.agents.all });
    queryClient.invalidateQueries({ queryKey: vigilKeys.agents.current });
    toast.success("Agent switched");
  },
});
```

**Verify**: See agent list, click "Activate" on a different agent. Current agent badge updates. Open sheet to see system prompt.

---

## Sprint 5 — Repo Management (2 features, ~6 hours)

---

### 5.1 Git Diff Viewer (M — ~3 hours)

**Why**: Repo detail shows `dirtyFileCount` and `uncommittedSummary` but doesn't show actual file changes. This requires a **new API endpoint**.

**Files to create**:
- `src/api-server/api/repos-diff.ts` — new endpoint

**Files to modify**:
- `src/api-server/server.ts` — register new route
- `dashboard-v2/src/server/functions.ts` — add client wrapper
- `dashboard-v2/src/plugins/repos/ReposPage.tsx` — add diff section to detail view

**Backend** (`GET /api/repos/:name/diff`):

```typescript
// src/api-server/api/repos-diff.ts
import type { DashboardContext } from "../types";

export function handleRepoDiff(repoName: string, ctx: DashboardContext) {
  const daemon = ctx.daemon;
  const repoPath = daemon.repoPaths.find(p => p.endsWith(`/${repoName}`) || p === repoName);
  if (!repoPath) return { error: "Repo not found", status: 404 };

  const watcher = daemon.gitWatcher;
  // Use simple-git to get diff
  // The git watcher already has a SimpleGit instance per repo
  // Access via watcher internals or spawn a new one
  return { diff: "..." }; // Return raw diff text
}
```

Actually, `simple-git` is already a dependency. The cleanest approach:

```typescript
import simpleGit from "simple-git";

export async function handleRepoDiff(repoName: string, ctx: DashboardContext) {
  const repoPath = ctx.daemon.repoPaths.find(p =>
    p.endsWith(`/${repoName}`) || p.split("/").pop() === repoName
  );
  if (!repoPath) return null;

  const git = simpleGit(repoPath);
  const diff = await git.diff();
  const diffStat = await git.diffSummary();

  return {
    diff,
    files: diffStat.files.map(f => ({
      file: f.file,
      insertions: f.insertions,
      deletions: f.deletions,
      binary: f.binary,
    })),
    totalInsertions: diffStat.insertions,
    totalDeletions: diffStat.deletions,
  };
}
```

**Frontend**: Render diff in a `<pre>` block with basic syntax coloring (green for `+` lines, red for `-` lines). Use a file list above the diff for navigation.

```tsx
// Style diff lines
const colorDiffLine = (line: string) => {
  if (line.startsWith("+")) return "text-green-400";
  if (line.startsWith("-")) return "text-red-400";
  if (line.startsWith("@@")) return "text-blue-400";
  return "text-muted-foreground";
};
```

**Verify**: Navigate to a repo with dirty files. Diff section should show file changes with colored additions/deletions.

---

### 5.2 Add/Remove Repos (L — ~3 hours)

**Why**: Most requested workflow gap. Currently repos are set at daemon start via CLI args. This needs a **new API endpoint** to modify the watched repo list at runtime.

**Backend changes needed**:

1. `POST /api/repos` — add a repo path to watch list
2. `DELETE /api/repos/:name` — remove from watch list

The daemon's `GitWatcher` needs methods to add/remove repos dynamically. Check if `gitWatcher` already supports this.

**Files to check/modify**:
- `src/git/watcher.ts` — verify/add `addRepo()` and `removeRepo()` methods
- `src/api-server/api/repos.ts` — add POST and DELETE handlers
- `src/api-server/server.ts` — register new routes
- `dashboard-v2/src/server/functions.ts` — add client wrappers
- `dashboard-v2/src/plugins/repos/ReposPage.tsx` — add/remove UI

**Frontend**: "Watch Repo" button that opens a dialog with a path input. Each repo card gets a "Stop Watching" button with confirmation.

```tsx
// Client wrapper
export async function addRepo({ data }: { data: { path: string } }) {
  return api("/api/repos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function removeRepo({ data }: { data: { name: string } }) {
  return apiMutate(`/api/repos/${encodeURIComponent(data.name)}`, {
    method: "DELETE",
  });
}
```

**Verify**: Add a repo path, see it appear in sidebar and repo list. Remove it, confirm it disappears. Daemon should continue watching remaining repos.

---

## Sprint 6 — Dashboard Overview Page (1 feature, ~3 hours)

### 6.1 Dashboard Overview / Home Page (M — ~3 hours)

**Why**: Currently landing on `/` shows the Timeline. A dedicated overview page gives users an at-a-glance summary of all subsystems. This should become the new index route.

**Files to create**:
- `dashboard-v2/src/plugins/overview/OverviewPage.tsx` — new overview plugin

**Files to modify**:
- `dashboard-v2/src/plugins/index.ts` — register overview plugin
- `dashboard-v2/src/routes/index.tsx` — point to overview instead of timeline
- (Optional) `dashboard-v2/src/routes/timeline.tsx` — move timeline to `/timeline`

**Implementation**:

The overview page fetches from multiple endpoints in parallel and renders stat cards:

```tsx
// Parallel queries
const { data: overview } = useQuery({ queryKey: vigilKeys.overview, queryFn: getOverview });
const { data: tasks } = useQuery({ queryKey: vigilKeys.tasks, queryFn: () => getTasks({ data: {} }) });
const { data: actions } = useQuery({ queryKey: vigilKeys.actions.pending, queryFn: getActionsPending });
const { data: health } = useQuery({ queryKey: vigilKeys.health, queryFn: getHealth });
const { data: metrics } = useQuery({ queryKey: vigilKeys.metrics, queryFn: getMetrics });

// Stat cards grid
<div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
  <StatCard title="Repos" value={overview?.repoCount} icon={GitBranch} />
  <StatCard title="Pending Actions" value={actions?.pending?.length} icon={Shield} variant="warning" />
  <StatCard title="Active Tasks" value={tasks?.counts?.active ?? 0} icon={CheckSquare} />
  <StatCard title="Uptime" value={overview?.uptime} icon={Clock} />
</div>

// Decision distribution mini chart (from metrics)
// Repo status list (from overview)
// Recent timeline entries (last 5)
```

**StatCard component**: Simple card with icon, title, value, optional trend indicator. Build inline — not worth a separate file for a single-page component.

**Layout**: 4-column stat grid at top, then 2-column layout below: left = recent timeline + pending actions, right = repo status + dream status.

**Verify**: Navigate to `/` — see summary stats. Click any card to navigate to the detail page.

---

## Sprint 7 — Memory & Notifications (3 features, ~5 hours)

---

### 7.1 Memory CRUD (M — ~2 hours)

**Why**: Users can search memory but can't manually create, edit, or delete entries. Needs **new API endpoints**.

**Backend** — add to `src/api-server/api/memory.ts`:
- `POST /api/memory` — create memory entry (inserts into vector store)
- `DELETE /api/memory/:id` — delete memory entry

The `VectorStore` class (at `src/memory/store.ts`) should have `insert()` and `delete()` methods. Verify and expose them.

**Frontend**: Add "New Memory" button on Memory page, plus delete buttons on search results.

---

### 7.2 Relevance Feedback on Memory (S — ~1 hour)

**Why**: Quick win to improve memory quality. Add "Still relevant" / "Outdated" buttons to each search result.

**Backend**: `PATCH /api/memory/:id` — update a relevance flag or delete if outdated.

**Frontend**: Two small icon buttons on each memory search result card: thumbs-up (mark relevant, maybe boost score) and thumbs-down (mark outdated / delete).

---

### 7.3 Notification Quiet Hours (M — ~2 hours)

**Why**: The `PATCH /api/notifications/rules` endpoint already accepts `quietHours` in the payload. Just needs UI.

**Files to modify**:
- `dashboard-v2/src/plugins/notifications/NotificationsPage.tsx` — add quiet hours editor

**Implementation**: Two time pickers (start/end) for quiet period. Use simple `<Input type="time">` fields. Save via `updateNotificationRules({ data: { quietHours: { start, end } } })`.

---

## Sprint 8 — Metrics & Health Enhancements (3 features, ~5 hours)

---

### 8.1 Date Range Picker for Metrics (M — ~2 hours)

**Why**: Metrics currently show all data. Users need to filter by time window.

**Backend**: Modify `GET /api/metrics` to accept `?from=<timestamp>&to=<timestamp>` query params.

**Frontend**: Row of filter buttons: "1h", "6h", "24h", "7d", "30d". Active button filters the query. Pass timestamps to the API.

```tsx
const RANGES = [
  { label: "1h", ms: 3600_000 },
  { label: "6h", ms: 21600_000 },
  { label: "24h", ms: 86400_000 },
  { label: "7d", ms: 604800_000 },
];

const [range, setRange] = useState(RANGES[2]); // default 24h

const { data } = useQuery({
  queryKey: [...vigilKeys.metrics, range.label],
  queryFn: () => getMetrics({ data: { from: Date.now() - range.ms, to: Date.now() } }),
});
```

Note: `getMetrics()` currently takes no params. Add `from`/`to` support to both the API and client wrapper.

---

### 8.2 Export Metrics CSV (S — ~1 hour)

**Why**: Quick win. Download raw metrics data for external analysis.

**Frontend-only**: Take the metrics data already fetched, convert to CSV, trigger browser download.

```tsx
const exportCSV = () => {
  const rows = metrics.decisions.series.map(s =>
    `${s.time},${s.SILENT},${s.OBSERVE},${s.NOTIFY},${s.ACT}`
  );
  const csv = "time,SILENT,OBSERVE,NOTIFY,ACT\n" + rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "vigil-metrics.csv"; a.click();
  URL.revokeObjectURL(url);
};
```

---

### 8.3 Database Maintenance Buttons (S — ~2 hours)

**Why**: Users should be able to vacuum SQLite and prune old events without CLI access.

**Backend**: New endpoints:
- `POST /api/health/vacuum` — runs `VACUUM` on SQLite databases
- `POST /api/health/prune` — deletes events older than N days (param: `olderThanDays`)

**Frontend**: Two buttons in Health page: "Vacuum Database" and "Prune Old Events" (with a day count input).

---

## Sprint 9 — Action Previews & Audit (2 features, ~4 hours)

---

### 9.1 Action Diff Preview (M — ~2.5 hours)

**Why**: Users approve/reject actions blind. They should see what the action will do before approving.

**Backend**: The `ActionRequest` already contains `command`, `args`, `tier`, and `reason`. For git/file actions, generate a preview of what would change:
- `GET /api/actions/:id/preview` — returns a dry-run or description of the action's effect

**Frontend**: Expand the action approval card to show a collapsible preview section. Fetch preview on demand when user clicks "Preview".

---

### 9.2 Action Audit Log (S — ~1.5 hours)

**Why**: The actions data already includes `createdAt`, `updatedAt`, `status`, and `confidence`. Just need a dedicated filterable view.

**Frontend-only**: Add a "History" tab to ActionsPage that shows all resolved actions with timestamps, who approved, confidence scores. Use `TanStack Table` (already installed) for sortable/filterable columns.

---

## Sprint 10 — Channels & Webhooks Polish (3 features, ~4 hours)

---

### 10.1 Channel Test Message (S — ~1 hour)

**Why**: Users register channels but can't verify they work. Add "Send Test" button per channel.

**Backend**: `POST /api/channels/:id/test` — sends a test message through the channel.

**Frontend**: Add "Test" button on each channel card.

---

### 10.2 Webhook Payload Inspector (S — ~1.5 hours)

**Why**: Users see webhook events but not their payloads. Need to inspect what was received.

**Backend**: Modify webhook event storage to include raw payload. Add `GET /api/webhooks/events/:id` for full payload.

**Frontend**: Click on an event card → expand to show JSON payload in a `<pre>` block.

---

### 10.3 Channel Permission Editor (M — ~1.5 hours)

**Why**: `GET /api/channels/:id/permissions` exists and returns permissions, but there's no UI to modify them.

**Backend**: `PATCH /api/channels/:id/permissions` — update permission flags.

**Frontend**: Toggle switches for each permission (read, write, execute, admin, subscribe) in a sheet panel.

---

## Priority & Dependency Summary

```
Sprint 1 (5h)  ─ Task form, Webhook form, Scheduler form
                  [No backend changes, pure UI]

Sprint 2 (3h)  ─ Dream patterns, Task edit
                  [No backend changes, pure UI]

Sprint 3 (3h)  ─ Command palette
                  [No backend changes, pure UI, cmdk already installed]

Sprint 4 (5h)  ─ Config editing, Agent switching
                  [No backend changes, APIs exist]

Sprint 5 (6h)  ─ Git diff viewer, Add/remove repos
                  [Backend: 2 new endpoints + GitWatcher changes]

Sprint 6 (3h)  ─ Overview page
                  [No backend changes, new route + plugin]

Sprint 7 (5h)  ─ Memory CRUD, Relevance feedback, Quiet hours
                  [Backend: 3 new endpoints]

Sprint 8 (5h)  ─ Date range metrics, CSV export, DB maintenance
                  [Backend: 2 new endpoints + 1 param addition]

Sprint 9 (4h)  ─ Action preview, Audit log
                  [Backend: 1 new endpoint]

Sprint 10 (4h) ─ Channel test, Webhook inspector, Permission editor
                  [Backend: 3 new endpoints]
```

**Total estimate**: ~43 hours across 10 sprints.

**Critical path**: Sprints 1-3 are pure frontend with zero backend risk. Start there. Sprint 5 is the riskiest (GitWatcher mutation). Sprint 6 requires a routing change (timeline moves to `/timeline`).

---

## Not Included (Deferred — L-size or speculative)

These are explicitly deferred because they're large, speculative, or need design decisions:

| Feature | Why deferred |
|---------|-------------|
| Memory graph visualization | Needs d3/force-graph library evaluation |
| Embeddings viewer (t-SNE) | Requires heavy computation, probably Python sidecar |
| Kanban board for tasks | Large UI effort, drag-and-drop library needed |
| Calendar view for scheduler | Large, need calendar component evaluation |
| Agent CRUD (create custom agents) | Needs design for agent definition format |
| Notification rule builder | Complex visual editor, needs UX design |
| Custom metric dashboards | Needs dashboard layout persistence |
| Git connection wizard | Complex OAuth/SSH flows |
| Channel setup wizard (Slack/Discord) | External OAuth integration |
| Task dependencies tree | Complex tree UI, drag-to-reorder |

These should be revisited after Sprints 1-6 validate the interaction patterns.

---

## Testing Strategy

Each sprint follows the same verification pattern:

1. **Type check**: `bun run typecheck`
2. **Dev server**: `bun run dashboard:dev` (Vite dev server with HMR)
3. **Manual test**: Open browser, navigate to page, test the golden path
4. **Unit tests** (for backend changes): Add to `src/__tests__/` following existing patterns
5. **Integration tests** (for new API endpoints): Add to `src/__tests__/integration/` following `dashboard.test.ts` pattern

Existing test patterns use `Bun.serve()` test helpers at `src/__tests__/helpers/fake-dashboard-context.ts` — mock the daemon context and hit API endpoints directly.

---

## Commands Cheatsheet

```bash
# Dev
bun run dashboard:dev          # Start Vite dev server (frontend HMR)
bun run src/cli/index.ts watch # Start daemon (for API server on 7480)

# Verify
bun run typecheck              # TypeScript check
bun run lint                   # Biome lint
bun test                       # All tests
bun test --filter "task"       # Specific tests

# Build
bun run build                  # Full production build
bun run dashboard:build        # Dashboard only

# Add shadcn component (if needed)
cd dashboard-v2 && bunx shadcn@latest add <component>
```
