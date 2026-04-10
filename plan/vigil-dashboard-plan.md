# Vigil Dashboard — Ultra-Detailed Implementation Plan

> **Stack**: HTMX + Plain HTML + Pico CSS + Chart.js (local bundle) served from `Bun.serve()`
> **Zero build step. Zero node_modules. Works fully offline.**

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [File Structure](#2-file-structure)
3. [API Endpoints](#3-api-endpoints)
4. [Phase 1 — Foundation & Live Overview](#phase-1--foundation--live-overview)
5. [Phase 2 — Timeline Feed](#phase-2--timeline-feed)
6. [Phase 3 — Per-Repo Sidebar](#phase-3--per-repo-sidebar)
7. [Phase 4 — Metrics Panel](#phase-4--metrics-panel)
8. [Phase 5 — Memory & Dreams](#phase-5--memory--dreams)
9. [Phase 6 — Task Manager](#phase-6--task-manager)
10. [Phase 7 — Scheduler](#phase-7--scheduler)
11. [Phase 8 — Action Log](#phase-8--action-log)
12. [Phase 9 — Agent Identity](#phase-9--agent-identity)
13. [Phase 10 — Webhooks](#phase-10--webhooks)
14. [Phase 11 — Push Notifications](#phase-11--push-notifications)
15. [Phase 12 — Config Panel](#phase-12--config-panel)
16. [Phase 13 — System Health](#phase-13--system-health)
17. [Phase 14 — A2A Protocol](#phase-14--a2a-protocol)
18. [SSE Event Stream Design](#sse-event-stream-design)
19. [Data Source Mapping](#data-source-mapping)
20. [ASCII Layout Reference](#ascii-layout-reference)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           BROWSER (SPA)                                 │
│                                                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│  │  HTMX   │  │Pico CSS │  │Chart.js │  │  SSE    │  │ Vanilla │     │
│  │ (swap)  │  │(styling)│  │(charts) │  │(stream) │  │   JS    │     │
│  └────┬────┘  └─────────┘  └────┬────┘  └────┬────┘  └────┬────┘     │
│       │                         │             │             │           │
│       └────────────┬────────────┘             │             │           │
│                    │                          │             │           │
│              HTTP  │                    SSE   │        fetch│           │
└────────────────────┼──────────────────────────┼─────────────┼───────────┘
                     │                          │             │
┌────────────────────┼──────────────────────────┼─────────────┼───────────┐
│                    ▼                          ▼             ▼           │
│              ┌──────────────────────────────────────────┐              │
│              │         Bun.serve() — Dashboard Server    │              │
│              │         (extends existing A2A server)     │              │
│              └──────┬──────────┬────────────┬───────────┘              │
│                     │          │            │                           │
│              ┌──────▼──┐ ┌────▼────┐ ┌─────▼─────┐                    │
│              │  Static │ │  API    │ │   SSE     │                    │
│              │  Files  │ │  Routes │ │  Stream   │                    │
│              │ /dash/* │ │ /api/*  │ │ /api/sse  │                    │
│              └─────────┘ └────┬────┘ └─────┬─────┘                    │
│                               │            │                           │
│  ┌────────────────────────────┼────────────┼──────────────────────┐    │
│  │                    DATA LAYER           │                      │    │
│  │                                         │                      │    │
│  │  ┌──────────┐  ┌──────────┐  ┌─────────▼───┐  ┌───────────┐  │    │
│  │  │ SQLite   │  │ EventLog │  │ MessageRouter│  │ Metrics   │  │    │
│  │  │ vigil.db │  │  (JSONL) │  │  (in-mem)   │  │ Store     │  │    │
│  │  └──────────┘  └──────────┘  └─────────────┘  └───────────┘  │    │
│  │                                                                │    │
│  │  ┌──────────┐  ┌──────────┐  ┌─────────────┐  ┌───────────┐  │    │
│  │  │ Session  │  │ Task     │  │ Scheduler   │  │ Vector    │  │    │
│  │  │ Store    │  │ Manager  │  │             │  │ Store     │  │    │
│  │  └──────────┘  └──────────┘  └─────────────┘  └───────────┘  │    │
│  │                                                                │    │
│  │  ┌──────────┐  ┌──────────┐  ┌─────────────┐  ┌───────────┐  │    │
│  │  │ Action   │  │ Webhook  │  │ Feature     │  │ Topic/    │  │    │
│  │  │ Executor │  │ Server   │  │ Gates       │  │ Index Tier│  │    │
│  │  └──────────┘  └──────────┘  └─────────────┘  └───────────┘  │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│                         VIGIL DAEMON                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. File Structure

```
src/dashboard/
├── server.ts              — Dashboard HTTP server (extends Bun.serve)
├── api/
│   ├── overview.ts        — GET /api/overview (top bar data)
│   ├── timeline.ts        — GET /api/timeline + fragments
│   ├── repos.ts           — GET /api/repos, GET /api/repos/:name
│   ├── metrics.ts         — GET /api/metrics
│   ├── memory.ts          — GET /api/memory, GET /api/memory/search
│   ├── dreams.ts          — GET /api/dreams
│   ├── tasks.ts           — GET/POST/PATCH /api/tasks
│   ├── scheduler.ts       — GET/POST/DELETE /api/scheduler
│   ├── actions.ts         — GET/POST /api/actions
│   ├── agents.ts          — GET/PATCH /api/agents
│   ├── webhooks.ts        — GET /api/webhooks
│   ├── push.ts            — GET/POST /api/push
│   ├── config.ts          — GET/PATCH /api/config
│   ├── health.ts          — GET /api/health
│   ├── a2a.ts             — GET /api/a2a
│   └── sse.ts             — GET /api/sse (Server-Sent Events stream)
├── static/
│   ├── index.html         — Main SPA shell (tab nav + containers)
│   ├── styles.css         — Custom styles (extends Pico CSS)
│   ├── app.js             — Minimal JS (SSE handler, chart init, tab logic)
│   ├── vendor/
│   │   ├── htmx.min.js   — HTMX library (local bundle, ~14kb)
│   │   ├── pico.min.css  — Pico CSS (local bundle, ~10kb)
│   │   └── chart.min.js  — Chart.js (local bundle, ~65kb)
│   └── fragments/         — HTMX partial HTML templates
│       ├── overview.html  — Top bar fragment
│       ├── timeline.html  — Timeline entries fragment
│       ├── repo-sidebar.html
│       ├── metrics.html
│       ├── dreams.html
│       ├── tasks.html
│       ├── scheduler.html
│       ├── actions.html
│       ├── agents.html
│       ├── webhooks.html
│       ├── push.html
│       ├── config.html
│       ├── health.html
│       └── a2a.html
```

---

## 3. API Endpoints

### Full Route Table

```
METHOD  PATH                          SOURCE                    RETURNS
──────  ────────────────────────────  ────────────────────────  ─────────────────────
GET     /dash                         static/index.html         Full SPA shell
GET     /dash/*                       static/*                  Static assets
GET     /api/sse                      sse.ts                    SSE event stream

GET     /api/overview                 overview.ts               JSON: daemon state
GET     /api/overview/fragment        overview.ts               HTML: top bar

GET     /api/timeline                 timeline.ts               JSON: messages[]
GET     /api/timeline/fragment        timeline.ts               HTML: timeline entries
GET     /api/timeline/search?q=       timeline.ts               JSON: FTS5 results
GET     /api/timeline/:id             timeline.ts               JSON: single message
GET     /api/timeline/:id/fragment    timeline.ts               HTML: expanded entry
POST    /api/timeline/:id/reply       timeline.ts               JSON: reply submitted

GET     /api/repos                    repos.ts                  JSON: repo list
GET     /api/repos/:name              repos.ts                  JSON: repo detail
GET     /api/repos/:name/fragment     repos.ts                  HTML: sidebar panel
GET     /api/repos/:name/commits      repos.ts                  JSON: recent commits
GET     /api/repos/:name/decisions    repos.ts                  JSON: decision stats

GET     /api/metrics                  metrics.ts                JSON: all metrics
GET     /api/metrics/fragment         metrics.ts                HTML: metrics panel
GET     /api/metrics/latency          metrics.ts                JSON: latency series
GET     /api/metrics/decisions        metrics.ts                JSON: decision counts
GET     /api/metrics/tokens           metrics.ts                JSON: token usage
GET     /api/metrics/sleep            metrics.ts                JSON: sleep cycles

GET     /api/memory                   memory.ts                 JSON: pipeline stats
GET     /api/memory/fragment          memory.ts                 HTML: memory tab
GET     /api/memory/search?q=         memory.ts                 JSON: FTS5 results
GET     /api/memory/topics/:repo      memory.ts                 JSON: topic list
GET     /api/memory/index/:repo       memory.ts                 JSON: repo index
GET     /api/memory/profiles          memory.ts                 JSON: all profiles

GET     /api/dreams                   dreams.ts                 JSON: dream log
GET     /api/dreams/fragment          dreams.ts                 HTML: dreams tab
GET     /api/dreams/patterns/:repo    dreams.ts                 JSON: patterns
GET     /api/dreams/topics/:repo      dreams.ts                 JSON: topic evolution
POST    /api/dreams/trigger           dreams.ts                 JSON: dream started

GET     /api/tasks                    tasks.ts                  JSON: task list
GET     /api/tasks/fragment           tasks.ts                  HTML: task panel
POST    /api/tasks                    tasks.ts                  JSON: create task
PATCH   /api/tasks/:id               tasks.ts                  JSON: update task
DELETE  /api/tasks/:id               tasks.ts                  JSON: cancel task

GET     /api/scheduler                scheduler.ts              JSON: schedule list
GET     /api/scheduler/fragment       scheduler.ts              HTML: scheduler panel
POST    /api/scheduler                scheduler.ts              JSON: add schedule
DELETE  /api/scheduler/:id           scheduler.ts              JSON: remove schedule
POST    /api/scheduler/:id/trigger   scheduler.ts              JSON: manual trigger

GET     /api/actions                  actions.ts                JSON: action history
GET     /api/actions/fragment         actions.ts                HTML: action panel
GET     /api/actions/pending          actions.ts                JSON: pending queue
POST    /api/actions/:id/approve     actions.ts                JSON: approve action
POST    /api/actions/:id/reject      actions.ts                JSON: reject action

GET     /api/agents                   agents.ts                 JSON: agent profiles
GET     /api/agents/fragment          agents.ts                 HTML: agent panel
GET     /api/agents/current           agents.ts                 JSON: active persona
PATCH   /api/agents/current           agents.ts                 JSON: switch persona

GET     /api/webhooks                 webhooks.ts               JSON: subscriptions
GET     /api/webhooks/fragment        webhooks.ts               HTML: webhook panel
GET     /api/webhooks/events          webhooks.ts               JSON: event log
GET     /api/webhooks/health          webhooks.ts               JSON: webhook health

GET     /api/push                     push.ts                   JSON: notification log
GET     /api/push/fragment            push.ts                   HTML: push panel
POST    /api/push/test               push.ts                   JSON: send test notif
PATCH   /api/push/rules              push.ts                   JSON: update rules

GET     /api/config                   config.ts                 JSON: full config
GET     /api/config/fragment          config.ts                 HTML: config panel
PATCH   /api/config                   config.ts                 JSON: update config
GET     /api/config/features          config.ts                 JSON: feature gates
PATCH   /api/config/features/:name   config.ts                 JSON: toggle gate

GET     /api/health                   health.ts                 JSON: system health
GET     /api/health/fragment          health.ts                 HTML: health panel

GET     /api/a2a                      a2a.ts                    JSON: connected agents
GET     /api/a2a/fragment             a2a.ts                    HTML: a2a panel
GET     /api/a2a/messages             a2a.ts                    JSON: message log
```

---

## Phase 1 — Foundation & Live Overview

### Goal
Stand up the dashboard server, serve static files, wire SSE, render the top bar.

### Data Sources
```
SessionStore     → session.id, session.startedAt, session.tickCount, session.repos
TickEngine       → currentTick, isSleeping
AdaptiveSleep    → currentInterval
MetricsStore     → uptime gauge
VigilConfig      → tickModel, escalationModel, tickInterval
Daemon           → state (awake/sleeping/dreaming), briefMode
```

### API: `GET /api/overview`
```json
{
  "repos": [
    { "name": "vigil", "path": "/home/user/projects/vigil", "state": "active" }
  ],
  "repoCount": 1,
  "sessionId": "e37c73e5",
  "uptime": "4h 12m",
  "uptimeSeconds": 15120,
  "state": "awake",
  "tickCount": 142,
  "lastTickAt": "2026-04-10T15:52:40Z",
  "nextTickIn": 18,
  "tickInterval": 30,
  "adaptiveInterval": 24,
  "tickModel": "claude-haiku-4-5-20251001",
  "escalationModel": "claude-sonnet-4-6"
}
```

### ASCII Layout — Top Bar
```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                                                                                ║
║  ◉ VIGIL                                                                       ║
║                                                                                ║
║  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────┐ ║
║  │ 🟢 Awake   │ │ Repos: 3   │ │ Tick #142  │ │ Next: 18s  │ │ haiku-4-5    │ ║
║  │            │ │            │ │ ~24s adapt │ │            │ │              │ ║
║  └────────────┘ └────────────┘ └────────────┘ └────────────┘ └──────────────┘ ║
║                                                                                ║
║  Session: e37c73e5                                         Uptime: 4h 12m     ║
║                                                                                ║
╚══════════════════════════════════════════════════════════════════════════════════╝
```

### HTML Structure
```html
<!-- Top bar — polled via HTMX every 5s -->
<header hx-get="/api/overview/fragment" hx-trigger="every 5s" hx-swap="innerHTML">
  <div class="top-bar">
    <span class="logo">◉ VIGIL</span>
    <div class="stat-cards">
      <div class="card state awake">🟢 Awake</div>
      <div class="card repos">Repos: 3</div>
      <div class="card tick">Tick #142 <small>~24s adapt</small></div>
      <div class="card countdown" id="countdown">Next: 18s</div>
      <div class="card model">haiku-4-5</div>
    </div>
    <div class="meta">
      <span>Session: e37c73e5</span>
      <span>Uptime: 4h 12m</span>
    </div>
  </div>
</header>
```

### Implementation Steps
1. Create `src/dashboard/server.ts` — static file server on configurable port (default 7480)
2. Wire into `Daemon` — start dashboard server alongside A2A server
3. Download HTMX, Pico CSS, Chart.js into `static/vendor/`
4. Create `index.html` shell with tab navigation
5. Implement `GET /api/overview` pulling from `SessionStore`, `TickEngine`, `Config`
6. Implement `GET /api/overview/fragment` returning HTML partial
7. Wire SSE endpoint stub (`GET /api/sse`)
8. Add countdown timer in `app.js` (decrements locally, resets on SSE tick event)

### Tests
- `GET /dash` returns 200 with HTML
- `GET /api/overview` returns valid JSON with all fields
- SSE connection stays open, receives heartbeat
- Top bar updates every 5s via HTMX poll
- Countdown resets on tick event

---

## Phase 2 — Timeline Feed

### Goal
Real-time stream of VigilMessages with filtering, search, expand/collapse, and inline reply.

### Data Sources
```
MessageRouter    → getHistory(filter) — in-memory, max 1000
VectorStore      → search(query, limit) — FTS5 full-text
EventLog         → query(options) — JSONL by repo/type/date
SSE stream       → new messages pushed in real-time
```

### API: `GET /api/timeline`
```json
{
  "messages": [
    {
      "id": "msg-abc123",
      "timestamp": "2026-04-10T15:52:40Z",
      "source": { "repo": "vigil", "branch": "main", "event": "tick", "agent": "vigil" },
      "status": "normal",
      "severity": "info",
      "decision": "OBSERVE",
      "message": "New feature detected: src/messaging/...",
      "reasoning": "I see a new untracked directory...",
      "model": "claude-haiku-4-5",
      "tokens": 342,
      "latency": 1.2,
      "confidence": 0.85,
      "attachments": []
    }
  ],
  "total": 247,
  "hasMore": true
}
```

### SSE Events
```
event: message
data: {"id":"msg-abc123","decision":"OBSERVE","message":"New feature...","timestamp":"..."}

event: tick
data: {"tickCount":143,"nextIn":30}
```

### ASCII Layout — Timeline
```
┌─ Timeline ──────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  [All ●] [Observe] [Notify] [Act]   Repo: [All ▾]   🔍 ___________  [Live 🔴] │
│                                                                                 │
│  ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ │
│                                                                                 │
│  ┌─ 3:52 PM ── OBSERVE ── vigil ───────────────────────────────────── 0.85 ──┐ │
│  │  👁  New feature detected: src/messaging/ directory +                      │ │
│  │     src/__tests__/unit/messaging.test.ts. Uncommitted.           ▸ expand  │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌─ 3:38 PM ── OBSERVE ── vigil ───────────────────────────────────── 0.82 ──┐ │
│  │  👁  Untracked src/messaging/ added to working tree.                       │ │
│  │     Phase 8 at HEAD.                                             ▸ expand  │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌─ 3:34 PM ── NOTIFY ── vigil ────────────────────────────────────── 0.90 ──┐ │
│  │  📦  New commit: b19bbac Phase 8: Agent Identity System                    │ │
│  │     — customizable agent persona via .claude/agents/             ▸ expand  │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌─ 3:24 PM ── NOTIFY ── vigil ────────────────────────────────────── 0.92 ──┐ │
│  │  🔔  ⚠️ Index Anomaly Detected — 42 files in MM state                      │ │
│  │     with 0 actual line changes                                   ▸ expand  │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│                           ── Load more (page 2) ──                              │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### ASCII Layout — Expanded Entry
```
┌─ 3:52 PM ── OBSERVE ── vigil ───────────────────────────────────────── 0.85 ──┐
│                                                                                │
│  👁  New feature detected: src/messaging/ directory +                          │
│     src/__tests__/unit/messaging.test.ts. Uncommitted, not yet in a commit.    │
│     Line-ending changes in 42 files (0 net insertions/deletions) are expected  │
│     .gitattributes drift — no logic changes.                                   │
│                                                                                │
│  ┌─ LLM Reasoning ──────────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Model: claude-haiku-4-5    Tokens: 342    Latency: 1.2s                │  │
│  │  Confidence: 0.85                                                        │  │
│  │                                                                          │  │
│  │  I see a new untracked directory src/messaging/ which suggests the       │  │
│  │  developer is starting work on a messaging pipeline. The 42 modified     │  │
│  │  files show 0 net insertions/deletions which is consistent with          │  │
│  │  .gitattributes LF normalization introduced in ba9f1c3.                  │  │
│  │                                                                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│  💬 Reply: ___________________________________________________  [Send]        │
│                                                                                │
│                                                                    ▴ collapse  │
└────────────────────────────────────────────────────────────────────────────────┘
```

### HTMX Wiring
```html
<!-- Filter buttons swap timeline content -->
<button hx-get="/api/timeline/fragment?decision=OBSERVE"
        hx-target="#timeline-entries" hx-swap="innerHTML">Observe</button>

<!-- Search -->
<input type="search" name="q"
       hx-get="/api/timeline/fragment"
       hx-trigger="keyup changed delay:300ms"
       hx-target="#timeline-entries" hx-swap="innerHTML">

<!-- Expand entry -->
<button hx-get="/api/timeline/msg-abc123/fragment"
        hx-target="closest .entry" hx-swap="outerHTML">▸ expand</button>

<!-- Reply -->
<form hx-post="/api/timeline/msg-abc123/reply"
      hx-target="closest .reply-area" hx-swap="innerHTML">
  <input name="reply" placeholder="Reply...">
  <button type="submit">Send</button>
</form>

<!-- SSE live updates (prepend new entries) -->
<div id="timeline-entries" hx-ext="sse"
     sse-connect="/api/sse" sse-swap="message"
     hx-swap="afterbegin">
</div>
```

### Implementation Steps
1. Implement `GET /api/timeline` — pull from `MessageRouter.getHistory()` with pagination
2. Implement `GET /api/timeline/fragment` — render HTML partial with filters (decision, repo, q)
3. Implement `GET /api/timeline/:id/fragment` — expanded view with reasoning
4. Implement `POST /api/timeline/:id/reply` — feed into `UserReply` system
5. Implement `GET /api/timeline/search?q=` — delegates to `VectorStore.search()`
6. Wire SSE `message` event — push new VigilMessages as they route through MessageRouter
7. Add decision color-coding CSS (SILENT=gray, OBSERVE=blue, NOTIFY=amber, ACT=red)
8. Implement infinite scroll via HTMX `revealed` trigger on sentinel element
9. Add confidence badge (0.0–1.0) on each entry

### Tests
- Timeline loads with messages sorted by timestamp descending
- Filter buttons return only matching decision types
- Search returns FTS5 results ranked by relevance
- SSE pushes new messages in real-time, prepended to timeline
- Expand/collapse toggles reasoning panel
- Reply submits and shows confirmation
- Pagination loads next page on scroll

---

## Phase 3 — Per-Repo Sidebar

### Goal
Detailed per-repo view: branch, status, commits, decision distribution, drift, patterns.

### Data Sources
```
GitWatcher       → RepoState (path, name, lastCommitHash, currentBranch, uncommittedSince)
VectorStore      → getByRepo(repo), getRepoProfile(repo)
MetricsStore     → getSummary() filtered by repo label
EventLog         → query({repo, type: "decision"})
TopicTier        → listTopics(repo)
Git CLI          → git log --oneline -N, git diff --stat
```

### API: `GET /api/repos/:name`
```json
{
  "name": "vigil",
  "path": "/home/user/projects/vigil",
  "state": "active",
  "branch": "main",
  "head": "b19bbac",
  "headMessage": "Phase 8: Agent Identity System",
  "dirty": true,
  "dirtyFileCount": 42,
  "uncommittedSummary": "42 files (line-ending drift), 3 new untracked",
  "lastReviewedCommit": "b19bbac",
  "driftCommits": 0,
  "recentCommits": [
    { "sha": "b19bbac", "message": "Phase 8: Agent Identity System", "date": "2026-04-10T15:34:03Z" },
    { "sha": "ba9f1c3", "message": "Add .gitattributes", "date": "2026-04-10T15:26:08Z" }
  ],
  "decisions": {
    "SILENT": 116, "OBSERVE": 20, "NOTIFY": 5, "ACT": 1,
    "total": 142
  },
  "patterns": [
    "All LLM calls route through claude -p CLI",
    "Tiered memory pipeline: EventLog → VectorStore → TopicTier → IndexTier"
  ],
  "topics": [
    { "name": "agent-identity", "observationCount": 8, "trend": "rising" },
    { "name": "tick-engine", "observationCount": 14, "trend": "stable" }
  ]
}
```

### ASCII Layout — Repo Sidebar
```
┌─ vigil ─────────────────────────────────┐
│                                          │
│  Branch: main                            │
│  HEAD:   b19bbac (Phase 8)               │
│  Status: ● 42 modified, 3 untracked     │
│  Drift:  0 commits ahead of reviewed     │
│                                          │
│  ── Recent Commits ───────────────────── │
│  b19bbac  Phase 8: Agent Identity Sys..  │
│  ba9f1c3  Add .gitattributes             │
│  9ba2f36  Phase 8: Agent Identity Sys..  │
│  b2e5501  Decision Engine Hardening      │
│  596c71f  Initial commit                 │
│                                          │
│  ── Decisions ────────────────────────── │
│  SILENT  ████████████████████████░░  82% │
│  OBSERVE ████░░░░░░░░░░░░░░░░░░░░░  14% │
│  NOTIFY  █░░░░░░░░░░░░░░░░░░░░░░░░   3% │
│  ACT     ░░░░░░░░░░░░░░░░░░░░░░░░░   1% │
│                                          │
│  ── Patterns ─────────────────────────── │
│  • LLM calls via claude -p (Max)        │
│  • Tiered memory pipeline                │
│  • Decision targets: 80/15/4/1           │
│  • Dream phase after idle                │
│                                          │
│  ── Topics ───────────────────────────── │
│  agent-identity  ▓▓▓▓▓░  ↑ rising       │
│  tick-engine     ▓▓▓▓░░  ── stable      │
│  memory-pipeline ▓▓▓░░░  ── stable      │
│  decision-engine ▓▓░░░░  ↓ cooling      │
│                                          │
│  ── Uncommitted Work ─────────────────── │
│  42 files: line-ending drift (LF norm)   │
│  NEW: src/messaging/ (Phase 9?)          │
│  NEW: src/webhooks/                      │
│  NEW: src/__tests__/unit/messaging.ts    │
│                                          │
└──────────────────────────────────────────┘
```

### HTMX Wiring
```html
<!-- Repo list — click to load sidebar -->
<nav id="repo-list">
  <button hx-get="/api/repos/vigil/fragment"
          hx-target="#repo-detail" hx-swap="innerHTML"
          class="active">vigil</button>
  <button hx-get="/api/repos/my-app/fragment"
          hx-target="#repo-detail" hx-swap="innerHTML">my-app</button>
</nav>
<aside id="repo-detail" hx-get="/api/repos/vigil/fragment"
       hx-trigger="load" hx-swap="innerHTML">
</aside>
```

### Implementation Steps
1. Implement `GET /api/repos` — list all watched repos with state
2. Implement `GET /api/repos/:name` — full detail with git state, decisions, patterns
3. Implement `GET /api/repos/:name/fragment` — HTML sidebar panel
4. Shell out to `git log --oneline -5` and `git diff --stat` for live git data
5. Pull decision distribution from `MetricsStore.getSummary()` or count from `EventLog`
6. Pull patterns from `VectorStore.getRepoProfile()`
7. Pull topics from `TopicTier.listTopics()`
8. Auto-refresh sidebar every 30s via `hx-trigger="every 30s"`
9. Highlight dirty vs clean with CSS (green dot vs orange dot)

### Tests
- Repo list shows all watched repos
- Clicking repo loads sidebar with correct data
- Decision bars render proportionally
- Patterns and topics load from memory store
- Sidebar refreshes on 30s interval

---

## Phase 4 — Metrics Panel

### Goal
Charts and numbers for decisions, latency, tokens, sleep cycles, adaptive intervals.

### Data Sources
```
MetricsStore     → getSummary(since) — counters, gauges, timings
                 → Raw query: SELECT name, value, labels, recorded_at FROM metrics
SessionStore     → tickCount, sleep/wake transitions
TickEngine       → sleep.currentInterval, detector activity log
VigilConfig      → tickInterval (configured baseline)
```

### API: `GET /api/metrics`
```json
{
  "decisions": {
    "series": [
      { "time": "2026-04-10T15:00:00Z", "SILENT": 12, "OBSERVE": 2, "NOTIFY": 1, "ACT": 0 },
      { "time": "2026-04-10T15:30:00Z", "SILENT": 14, "OBSERVE": 3, "NOTIFY": 0, "ACT": 0 }
    ],
    "totals": { "SILENT": 116, "OBSERVE": 20, "NOTIFY": 5, "ACT": 1 }
  },
  "latency": {
    "series": [
      { "tick": 138, "ms": 1200 },
      { "tick": 139, "ms": 980 },
      { "tick": 140, "ms": 2100 }
    ],
    "avg": 1340,
    "p95": 2100,
    "max": 3200
  },
  "tokens": {
    "total": 14200,
    "perTick": { "avg": 100, "max": 342 },
    "costEstimate": "$0.00"
  },
  "tickTiming": {
    "configured": 30,
    "adaptiveCurrent": 24,
    "series": [
      { "time": "2026-04-10T15:00:00Z", "interval": 30 },
      { "time": "2026-04-10T15:10:00Z", "interval": 18 },
      { "time": "2026-04-10T15:30:00Z", "interval": 45 }
    ]
  },
  "sleepCycles": [
    { "sleptAt": "2026-04-10T12:00:00Z", "wokeAt": "2026-04-10T13:15:00Z", "duration": "1h 15m" }
  ]
}
```

### ASCII Layout — Metrics Panel
```
┌─ Metrics ───────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  ┌─ Decisions Over Time ──────────────────────┐  ┌─ Quick Stats ─────────────┐ │
│  │                                             │  │                           │ │
│  │  20 ┤                                       │  │  Total Ticks     142      │ │
│  │  15 ┤     ██                                │  │  LLM Calls        27      │ │
│  │  10 ┤  ██ ██ ██    ██                       │  │  Tokens Used    14.2k     │ │
│  │   5 ┤  ██ ██ ██ ██ ██ ██                    │  │  Cost Est.      $0.00     │ │
│  │   0 ┤  ██ ██ ██ ██ ██ ██ ██                 │  │                           │ │
│  │      └──────────────────────                │  │  Avg Latency    1.34s     │ │
│  │      ■ SILENT ■ OBSERVE ■ NOTIFY ■ ACT     │  │  P95 Latency    2.10s     │ │
│  │                                             │  │  Max Latency    3.20s     │ │
│  └─────────────────────────────────────────────┘  │                           │ │
│                                                    │  Sleep Cycles     3       │ │
│  ┌─ LLM Latency (ms) ─────────────────────────┐  │  Total Sleep    2h 45m    │ │
│  │                                             │  │                           │ │
│  │  3.2s ┤                    ╭╮               │  └───────────────────────────┘ │
│  │  2.1s ┤          ╭╮      ╭╯╰╮              │                                │
│  │  1.3s ┤    ╭─╮  ╭╯╰╮  ╭─╯   ╰╮            │  ┌─ Token Usage / Tick ─────┐ │
│  │  0.7s ┤╭──╯  ╰──╯   ╰──╯     ╰──╮         │  │                           │ │
│  │  0.0s ┤╯                          ╰──       │  │  342 ┤  █                 │ │
│  │       └────────────────────────────────     │  │  200 ┤  █ █     █         │ │
│  │       tick 130         tick 140              │  │  100 ┤█ █ █ █ █ █ █       │ │
│  └─────────────────────────────────────────────┘  │    0 ┤█ █ █ █ █ █ █ █     │ │
│                                                    │      └──────────────────  │ │
│  ┌─ Adaptive Tick Interval ────────────────────┐  └───────────────────────────┘ │
│  │                                             │                                │
│  │  60s ┤                         ╭────────    │  ┌─ Sleep/Wake History ──────┐ │
│  │  45s ┤                    ╭────╯            │  │                           │ │
│  │  30s ┤────────╮      ╭───╯     configured   │  │  12:00  😴 Slept          │ │
│  │  18s ┤        ╰──────╯         ── adaptive  │  │  13:15  ⏰ Woke (commit)  │ │
│  │  10s ┤                                      │  │  14:30  😴 Slept          │ │
│  │      └────────────────────────────────      │  │  14:45  ⏰ Woke (file Δ)  │ │
│  │      12:00            15:00                 │  │  15:00  😴 Slept          │ │
│  └─────────────────────────────────────────────┘  │  15:20  ⏰ Woke (commit)  │ │
│                                                    └───────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Chart.js Config (local bundle)
```javascript
// Decision stacked bar chart
new Chart(ctx, {
  type: 'bar',
  data: { labels: timeLabels, datasets: [
    { label: 'SILENT',  data: silentCounts,  backgroundColor: '#6b7280' },
    { label: 'OBSERVE', data: observeCounts, backgroundColor: '#3b82f6' },
    { label: 'NOTIFY',  data: notifyCounts,  backgroundColor: '#f59e0b' },
    { label: 'ACT',     data: actCounts,     backgroundColor: '#ef4444' },
  ]},
  options: { scales: { x: { stacked: true }, y: { stacked: true } } }
});

// Latency line chart
new Chart(ctx, {
  type: 'line',
  data: { labels: tickLabels, datasets: [{
    label: 'Latency (ms)', data: latencyValues,
    borderColor: '#8b5cf6', tension: 0.3
  }]}
});

// Adaptive interval line chart (dual line: configured vs actual)
new Chart(ctx, {
  type: 'line',
  data: { labels: timeLabels, datasets: [
    { label: 'Configured', data: configuredLine, borderDash: [5, 5] },
    { label: 'Adaptive',   data: adaptiveLine }
  ]}
});
```

### Implementation Steps
1. Implement `GET /api/metrics` — aggregate from `MetricsStore.getSummary()`
2. Implement sub-routes: `/latency`, `/decisions`, `/tokens`, `/sleep`
3. Implement `GET /api/metrics/fragment` — HTML with Chart.js canvases
4. Add `app.js` chart initialization — fetch JSON, render 4 charts
5. Calculate cost estimate: tokens × model pricing (haiku=$0.25/MTok, sonnet=$3/MTok)
6. Auto-refresh charts every 30s via HTMX poll on fragment
7. Add quick stats card with computed values

### Tests
- Metrics endpoint returns valid time-series data
- Chart.js renders without errors (test via fragment load)
- Cost estimate calculates correctly for mixed model usage
- Sleep cycle history shows correct wake triggers

---

## Phase 5 — Memory & Dreams

### Goal
Browse the full memory pipeline, search via FTS5, view dream consolidations, track topics.

### Data Sources
```
VectorStore      → search(), getByRepo(), storeConsolidated()
EventLog         → query() — raw JSONL events
TopicTier        → listTopics(), getTopic()
IndexTier        → getIndex()
DreamWorker      → dream results from ~/.vigil/data/dream-result-{repo}.json
Semantic         → TF-IDF cosine similarity scores
```

### API: `GET /api/memory`
```json
{
  "pipeline": {
    "eventLog": { "count": 1247, "oldestDate": "2026-04-08", "newestDate": "2026-04-10" },
    "vectorStore": { "count": 312, "types": { "git_event": 180, "decision": 95, "insight": 22, "consolidated": 15 } },
    "topicTier": { "count": 28, "repos": ["vigil"] },
    "indexTier": { "count": 6, "repos": ["vigil"] }
  },
  "profiles": [
    { "repo": "vigil", "summary": "Headless TypeScript/Bun git daemon...", "patternCount": 10, "lastUpdated": "..." }
  ]
}
```

### API: `GET /api/dreams`
```json
{
  "dreams": [
    {
      "timestamp": "2026-04-10T15:55:00Z",
      "repo": "vigil",
      "observationsConsolidated": 19,
      "summary": "Phase 8 complete at b19bbac...",
      "patterns": ["LLM → claude -p (Max billing)", "Tiered memory pipeline"],
      "insights": [
        "Phase progression steady: 596c71f → b2e5501 → ba9f1c3 → b19bbac",
        "src/messaging/ is mid-implementation, no commit yet"
      ],
      "confidence": 0.88
    }
  ]
}
```

### ASCII Layout — Memory Tab
```
┌─ Memory ────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  ┌─ Search ──────────────────────────────────────────────────────────────────┐  │
│  │  🔍 __________________________________________ [Search]   Repo: [All ▾]  │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─ Memory Pipeline ────────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │   EventLog           VectorStore          TopicTier          IndexTier   │  │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌──────────┐  │  │
│  │  │             │    │             │    │             │    │          │  │  │
│  │  │    1,247    │───▸│     312     │───▸│      28     │───▸│     6    │  │  │
│  │  │   events    │    │   vectors   │    │   topics    │    │  indices │  │  │
│  │  │             │    │             │    │             │    │          │  │  │
│  │  └─────────────┘    └─────────────┘    └─────────────┘    └──────────┘  │  │
│  │    JSONL files        SQLite FTS5        Grouped by          Cross-repo  │  │
│  │    Apr 8 → Apr 10     4 types            theme/area          summaries   │  │
│  │                                                                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─ Search Results ─────────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  0.92  vigil  Decision Engine Hardening landed at b2e5501. Added         │  │
│  │               structured JSON output, retry logic, and decision          │  │
│  │               enum validation.                            [decision]     │  │
│  │                                                                          │  │
│  │  0.78  vigil  Decision distribution targets: SILENT 80%, OBSERVE         │  │
│  │               15%, NOTIFY 4%, ACT 1%.                     [insight]      │  │
│  │                                                                          │  │
│  │  0.61  vigil  DecisionEngine temporarily strips ANTHROPIC_API_KEY        │  │
│  │               from env before spawning claude CLI.        [consolidated] │  │
│  │                                                                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─ Ask Vigil ──────────────────────────────────────────────────────────────┐  │
│  │  💬 _____________________________________________  [Ask]                 │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### ASCII Layout — Dreams Tab
```
┌─ Dreams ────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  [Trigger Dream]                                           Repo: [All ▾]       │
│                                                                                 │
│  ┌─ Dream Log ──────────────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  🌙 Apr 10, 3:55 PM ─── 19 observations ── confidence: 0.88 ─────────  │  │
│  │  │                                                                       │  │
│  │  │  Summary                                                              │  │
│  │  │  Phase 8 complete at b19bbac. 42 files with LF drift from             │  │
│  │  │  .gitattributes — not logic changes. New src/messaging/               │  │
│  │  │  signals Phase 9 underway.                                            │  │
│  │  │                                                                       │  │
│  │  │  Insights                                                             │  │
│  │  │  💡 Phase progression steady: 596c71f → b2e5501 → ba9f1c3 → b19bbac  │  │
│  │  │  💡 src/messaging/ is mid-implementation, no commit yet               │  │
│  │  │  💡 Cache staleness after rebase is structural, not a bug             │  │
│  │  │                                                                       │  │
│  │  │  Patterns                                                             │  │
│  │  │  • LLM → claude -p (Max billing)                                      │  │
│  │  │  • Tiered memory pipeline                                             │  │
│  │  │                                                                       │  │
│  │  ╰──────────────────────────────────────────────────────────────────────  │  │
│  │                                                                          │  │
│  │  🌙 Apr 9, 11:38 PM ─── 34 observations ── confidence: 0.91 ─────────  │  │
│  │  │  ...                                                                  │  │
│  │                                                                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─ Patterns ─────────────────────────┐  ┌─ Topic Evolution ──────────────┐   │
│  │                                     │  │                                │   │
│  │  0.95  LLM → claude -p (Max)       │  │  agent-identity  ▓▓▓▓▓░  ↑    │   │
│  │  0.92  Tiered memory pipeline       │  │  tick-engine     ▓▓▓▓░░  ↑    │   │
│  │  0.88  Decision: 80/15/4/1          │  │  memory-pipeline ▓▓▓░░░  ──   │   │
│  │  0.85  Dream phase after idle       │  │  decision-engine ▓▓░░░░  ↓    │   │
│  │  0.80  Biome lint + strict TS       │  │  git-watcher     ▓░░░░░  ──   │   │
│  │  0.75  Cache stale after rebase     │  │  cli-output      ▓░░░░░  new  │   │
│  │                                     │  │                                │   │
│  └─────────────────────────────────────┘  └────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Steps
1. Implement `GET /api/memory` — pipeline stats from each tier
2. Implement `GET /api/memory/search?q=` — FTS5 search with relevance scores
3. Implement `GET /api/memory/topics/:repo` — topic list from `TopicTier`
4. Implement `GET /api/dreams` — read dream result JSON files, sorted by date
5. Implement `POST /api/dreams/trigger` — spawn `DreamWorker` for a repo
6. Implement `GET /api/dreams/patterns/:repo` — extract from `RepoProfile`
7. Build "Ask Vigil" — `POST /api/memory/ask` → delegates to `AskEngine`
8. Render pipeline visualization with CSS boxes and arrows
9. Topic evolution trend arrows based on observation count delta

### Tests
- Memory pipeline counts match actual database state
- FTS5 search returns ranked results
- Dream trigger spawns worker and returns status
- Ask Vigil returns coherent answer
- Topic trends calculate correctly from observation history

---

## Phase 6 — Task Manager

### Goal
View, create, edit, complete tasks from the dashboard. Show wait conditions and subtask trees.

### Data Sources
```
TaskManager      → list(), getById(), create(), activate(), complete(), fail(), cancel()
                 → getActive(), getWaiting(), getSubtasks(), checkWaitConditions()
```

### API: `GET /api/tasks`
```json
{
  "tasks": [
    {
      "id": "task-001",
      "repo": "vigil",
      "title": "Wire webhook processor to daemon",
      "description": "Connect WebhookProcessor events to the main tick cycle",
      "status": "pending",
      "waitCondition": null,
      "parentId": null,
      "metadata": {},
      "result": null,
      "createdAt": "2026-04-10T15:00:00Z",
      "updatedAt": "2026-04-10T15:00:00Z"
    }
  ],
  "counts": { "pending": 2, "active": 1, "waiting": 0, "completed": 5, "failed": 0, "cancelled": 0 }
}
```

### ASCII Layout — Tasks
```
┌─ Tasks ──────────────────────────────────────────────────────────── [+ New Task]┐
│                                                                                 │
│  [All] [Pending ●2] [Active ●1] [Waiting] [Completed ●5]          🔍 _______  │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │  Status    Task                              Repo     Updated    Actions   ││
│  │ ──────────────────────────────────────────────────────────────────────────  ││
│  │  ● todo    Wire webhook processor            vigil    Apr 10     [▶][✓][✗] ││
│  │  ● todo    Add ntfy push backend             vigil    Apr 10     [▶][✓][✗] ││
│  │  ◐ wip     Implement messaging router        vigil    Apr 10     [✓][✗]    ││
│  │  ✓ done    Agent Identity System             vigil    Apr 9                 ││
│  │  ✓ done    Decision Engine Hardening         vigil    Apr 8                 ││
│  │  ✓ done    Git Watcher Fingerprinting        vigil    Apr 7                 ││
│  │  ✓ done    Memory Pipeline Tiering           vigil    Apr 6                 ││
│  │  ✓ done    Initial Commit                    vigil    Apr 5                 ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  ┌─ New Task ──────────────────────────────────────────────────────────────────┐│
│  │  Title:  ________________________________________________                  ││
│  │  Repo:   [vigil ▾]                                                         ││
│  │  Desc:   ________________________________________________                  ││
│  │  Wait:   [None ▾]  event / task / schedule                                 ││
│  │                                                        [Create Task]       ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  ┌─ Stats ─────────────────────────────────────────────────────────────────────┐│
│  │  Completion Rate: 71%  ████████████████████░░░░░░░░                        ││
│  │  Avg Time to Complete: 1.2 days                                             ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### HTMX Wiring
```html
<!-- Create task -->
<form hx-post="/api/tasks" hx-target="#task-list" hx-swap="innerHTML">
  <input name="title" required>
  <select name="repo">...</select>
  <textarea name="description"></textarea>
  <button type="submit">Create Task</button>
</form>

<!-- Activate task -->
<button hx-patch="/api/tasks/task-001" hx-vals='{"status":"active"}'
        hx-target="closest tr" hx-swap="outerHTML">▶</button>

<!-- Complete task -->
<button hx-patch="/api/tasks/task-001" hx-vals='{"status":"completed"}'
        hx-target="closest tr" hx-swap="outerHTML">✓</button>
```

### Implementation Steps
1. Implement `GET /api/tasks` — list with filters (status, repo)
2. Implement `POST /api/tasks` — create via `TaskManager.create()`
3. Implement `PATCH /api/tasks/:id` — update status via appropriate method
4. Implement `DELETE /api/tasks/:id` — cancel via `TaskManager.cancel()`
5. Implement task fragment with action buttons
6. Add completion rate calculation
7. Support wait conditions in create form (event type, task dependency, cron)

### Tests
- Task CRUD operations work end-to-end
- Status transitions follow valid paths (pending→active→completed)
- Wait conditions display correctly
- Completion rate calculates from historical data

---

## Phase 7 — Scheduler

### Goal
View, create, delete cron schedules. Show run history, enable manual triggers.

### Data Sources
```
Scheduler        → list(), add(), remove()
                 → onSchedule() callback for run history
                 → Persisted at ~/.vigil/data/schedules.json
```

### ASCII Layout — Scheduler
```
┌─ Scheduler ──────────────────────────────────────────────────── [+ New Schedule]┐
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │  Name              Cron            Repo     Next Run     Actions            ││
│  │ ──────────────────────────────────────────────────────────────────────────  ││
│  │  Nightly dream     0 2 * * *       vigil    in 8h 12m    [▶ Run][🗑]       ││
│  │  Hourly check      0 * * * *       my-app   in 42m       [▶ Run][🗑]       ││
│  │  Weekly summary    0 9 * * 1       vigil    in 4d 18h    [▶ Run][🗑]       ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  ┌─ Add Schedule ──────────────────────────────────────────────────────────────┐│
│  │  Name:   ____________________________                                      ││
│  │  Cron:   ____________________________  (e.g., 0 * * * *)                   ││
│  │  Repo:   [vigil ▾]                                                         ││
│  │  Action: ____________________________                                      ││
│  │                                                         [Create Schedule]  ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  ┌─ Run History ───────────────────────────────────────────────────────────────┐│
│  │  Time              Schedule          Status    Duration                     ││
│  │ ──────────────────────────────────────────────────────────────────────────  ││
│  │  Apr 10, 2:00 AM   Nightly dream     ✓ ok     12.3s                        ││
│  │  Apr 10, 1:00 AM   Hourly check      ✓ ok     1.2s                         ││
│  │  Apr 10, 12:00 AM  Hourly check      ✗ fail   timeout (60s)                ││
│  │  Apr 9, 2:00 AM    Nightly dream     ✓ ok     14.1s                        ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Steps
1. Implement `GET /api/scheduler` — list entries with next-run countdown
2. Implement `POST /api/scheduler` — add via `Scheduler.add()`
3. Implement `DELETE /api/scheduler/:id` — remove via `Scheduler.remove()`
4. Implement `POST /api/scheduler/:id/trigger` — manual trigger
5. Track run history (success/fail/duration) — store in SQLite or memory
6. Calculate next-run from croner library
7. Render countdown timers that tick down in JS

### Tests
- CRUD operations persist to schedules.json
- Manual trigger fires the schedule action
- Next-run countdown calculates correctly
- Run history records success and failure

---

## Phase 8 — Action Log

### Goal
View action history, approve/reject pending actions, see gate breakdown.

### Data Sources
```
ActionExecutor   → getPending(), getRecent(), getById()
                 → approve(), reject(), execute()
                 → checkGates() — 6-gate model with per-gate results
VigilConfig      → allowModerateActions, actions (ActionGateConfig)
```

### ASCII Layout — Actions
```
┌─ Actions ───────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  ┌─ Pending Approval ──────────────────────────────────────────────────────────┐│
│  │                                                                             ││
│  │  ┌──────────────────────────────────────────────────────────────────────┐   ││
│  │  │  🟡 vigil wants to: git stash                          [moderate]   │   ││
│  │  │                                                                     │   ││
│  │  │  Reason: Dirty working tree blocks rebase analysis                  │   ││
│  │  │  Confidence: 0.85                                                   │   ││
│  │  │                                                                     │   ││
│  │  │  Gate Checklist:                                                    │   ││
│  │  │  ✓ Gate 1: Config enabled                                          │   ││
│  │  │  ✓ Gate 2: Session opted in                                        │   ││
│  │  │  ✓ Gate 3: Repo in allowlist                                       │   ││
│  │  │  ✓ Gate 4: Action type allowed (git_stash)                         │   ││
│  │  │  ✓ Gate 5: Confidence ≥ 0.80 threshold                            │   ││
│  │  │  ⏳ Gate 6: Awaiting user approval                                 │   ││
│  │  │                                                                     │   ││
│  │  │                              [ ✓ Approve ]  [ ✗ Reject ]           │   ││
│  │  └──────────────────────────────────────────────────────────────────────┘   ││
│  │                                                                             ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  ┌─ Action History ────────────────────────────────────────────────────────────┐│
│  │  Time          Action               Repo     Tier       Status    Result   ││
│  │ ──────────────────────────────────────────────────────────────────────────  ││
│  │  3:40 PM       git diff --stat      vigil    safe       ✓ exec   0 exit   ││
│  │  3:20 PM       git log --oneline    vigil    safe       ✓ exec   5 lines  ││
│  │  2:55 PM       git stash pop        api-srv  moderate   ✗ denied user     ││
│  │  2:30 PM       bun test             vigil    safe       ✓ exec   all pass ││
│  │  1:15 PM       git branch feat/x    my-app   moderate   ✓ exec   created  ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  ┌─ Action Stats ──────────────────────────────────────────────────────────────┐│
│  │  Approved: 12    Rejected: 3    Auto-approved: 28    Failed: 1             ││
│  │  By tier:  safe: 30  moderate: 12  dangerous: 1                             ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Steps
1. Implement `GET /api/actions` — recent history from `ActionExecutor.getRecent()`
2. Implement `GET /api/actions/pending` — from `ActionExecutor.getPending()`
3. Implement `POST /api/actions/:id/approve` — `ActionExecutor.approve()`
4. Implement `POST /api/actions/:id/reject` — `ActionExecutor.reject()`
5. Render gate checklist from `gateResults` field on each action
6. Push pending actions via SSE for real-time approval queue
7. Color-code tiers: safe=green, moderate=amber, dangerous=red

### Tests
- Pending actions display with full gate breakdown
- Approve/reject buttons update action status
- SSE pushes new pending actions in real-time
- History table shows all outcomes with tier badges

---

## Phase 9 — Agent Identity

### Goal
View current agent persona, switch profiles, preview system prompt.

### Data Sources
```
AgentLoader      → loadAgent() from .claude/agents/vigil.md
AgentDefinition  → name, description, model, systemPrompt, tools, watchPatterns, triggerEvents
SystemPrompt     → buildSystemPrompt(config) — full prompt with repo context
```

### ASCII Layout — Agent Identity
```
┌─ Agent Identity ────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  ┌─ Current Agent ─────────────────────────────────────────────────────────────┐│
│  │                                                                             ││
│  │  Name:         vigil-default                                                ││
│  │  Description:  Always-on git watcher with tiered decision making            ││
│  │  Model:        claude-haiku-4-5-20251001                                    ││
│  │  Source:       .claude/agents/vigil.md                                       ││
│  │                                                                             ││
│  │  Tools:        git_diff, git_log, git_status, file_read                     ││
│  │  Watch:        *.ts, *.json, .gitignore                                     ││
│  │  Triggers:     new_commit, branch_switch, rebase_detected                   ││
│  │                                                                             ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  ┌─ Available Agents ──────────────────────────────────────────────────────────┐│
│  │                                                                             ││
│  │  ● vigil-default      Always-on git watcher           [Active]              ││
│  │  ○ vigil-strict       Security-focused, flag risks    [Switch]              ││
│  │  ○ vigil-quiet        Minimal output, only alerts     [Switch]              ││
│  │                                                                             ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  ┌─ System Prompt Preview ─────────────────────────────────────────────────────┐│
│  │                                                                             ││
│  │  You are Vigil, an always-on git monitoring agent.                          ││
│  │                                                                             ││
│  │  ## Decision Framework                                                      ││
│  │  For each tick, classify the situation:                                      ││
│  │  - SILENT: No meaningful changes                                            ││
│  │  - OBSERVE: Log but don't alert                                             ││
│  │  - NOTIFY: Alert the developer                                              ││
│  │  - ACT: Take autonomous action                                              ││
│  │  ...                                                                        ││
│  │                                                          [Show Full ▾]      ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Steps
1. Implement `GET /api/agents` — scan `.claude/agents/` for all agent definitions
2. Implement `GET /api/agents/current` — return active persona
3. Implement `PATCH /api/agents/current` — switch persona (restart decision engine)
4. Implement system prompt preview — `buildSystemPrompt()` with current repo context
5. Parse YAML frontmatter from agent `.md` files
6. Show tools, watch patterns, trigger events from definition

### Tests
- Agent list scans directory correctly
- Switching agent reloads system prompt
- System prompt preview renders full prompt
- Invalid agent file handled gracefully

---

## Phase 10 — Webhooks

### Goal
View GitHub webhook subscriptions, event log, health metrics.

### Data Sources
```
SubscriptionManager → list(), subscribe(), unsubscribe(), size()
WebhookServer       → event log (emitted events)
WebhookProcessor    → processed events with message routing
VigilConfig         → webhook.port, webhook.secret, webhook.allowedEvents
```

### ASCII Layout — Webhooks
```
┌─ Webhooks ──────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  ┌─ Server Status ─────────────────────────────────────────────────────────────┐│
│  │  Port: 7433    Path: /webhook/github    Status: 🟢 Running                 ││
│  │  Allowed Events: pull_request, push, issues, issue_comment                  ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  ┌─ Subscriptions ─────────────────────────────────────────── [+ Subscribe] ───┐│
│  │                                                                             ││
│  │  Repo               PR#    Events                  Expires     Actions      ││
│  │ ──────────────────────────────────────────────────────────────────────────  ││
│  │  user/vigil          —     push, pull_request      never       [🗑]         ││
│  │  user/my-app         42    pull_request_review     in 6d       [🗑]         ││
│  │  org/api-server      —     push, issues            in 29d      [🗑]         ││
│  │                                                                             ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  ┌─ Event Log ──────────────────────────────────────────────── Filter: [All ▾] ┐│
│  │                                                                             ││
│  │  Time          Type                  Repo            Action    Status       ││
│  │ ──────────────────────────────────────────────────────────────────────────  ││
│  │  3:45 PM       push                  user/vigil      —        ✓ processed  ││
│  │  3:30 PM       pull_request          user/my-app     opened   ✓ processed  ││
│  │  3:15 PM       issue_comment         org/api-server  created  ✓ processed  ││
│  │  2:50 PM       pull_request_review   user/my-app     approved ✓ processed  ││
│  │                                                                             ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  ┌─ Health ────────────────────────────────────────────────────────────────────┐│
│  │  Events received: 47    Errors: 1    Last event: 3:45 PM (15m ago)         ││
│  │  Signature failures: 0    Avg processing: 0.3s                              ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Steps
1. Implement `GET /api/webhooks` — subscriptions from `SubscriptionManager.list()`
2. Implement `GET /api/webhooks/events` — event log from webhook processor
3. Implement `GET /api/webhooks/health` — error count, last event, avg processing time
4. Implement subscribe/unsubscribe forms via HTMX
5. Filter event log by type (push, PR, issue)
6. Show server status (running/stopped, port, path)

### Tests
- Subscription list matches SubscriptionManager state
- Event log filters by type correctly
- Health metrics calculate from event history
- Subscribe/unsubscribe updates state

---

## Phase 11 — Push Notifications

### Goal
View notification history, configure rules, test notifications.

### Data Sources
```
PushChannel      → delivery history
PushConfig       → enabled, minSeverity, statuses, quietHours, maxPerHour
NtfyBackend      → ntfy.sh config (topic, server, token)
NativeBackend    → OS-specific notification status
MessageRouter    → getHistory({status: 'push'})
```

### ASCII Layout — Push Notifications
```
┌─ Push Notifications ────────────────────────────────────────────────────────────┐
│                                                                                 │
│  ┌─ Config ────────────────────────────────────────────────────────────────────┐│
│  │                                                                             ││
│  │  Enabled:       [✓]                                                         ││
│  │  Min Severity:  [warning ▾]   info | warning | critical                     ││
│  │  Statuses:      [✓] normal  [✓] alert  [ ] proactive  [✓] scheduled        ││
│  │  Max/Hour:      [10]                                                        ││
│  │  Quiet Hours:   [22:00] to [07:00]                                          ││
│  │                                                                             ││
│  │  Backend: ntfy.sh                                                           ││
│  │  Topic:   vigil-alerts                                                      ││
│  │  Server:  https://ntfy.sh                                                   ││
│  │                                                                             ││
│  │  Native:  [✓] OS notifications (Linux: notify-send)                         ││
│  │                                                                             ││
│  │                                          [Save]  [Test Notification 🔔]     ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  ┌─ Notification History ──────────────────────────────────────────────────────┐│
│  │                                                                             ││
│  │  Time          Severity    Message                    Backend    Status     ││
│  │ ──────────────────────────────────────────────────────────────────────────  ││
│  │  3:24 PM       ⚠ warning   Index Anomaly: 42 files    ntfy      ✓ sent    ││
│  │  2:10 PM       🔴 critical  Build failed in api-srv    ntfy      ✓ sent    ││
│  │  1:30 PM       ⚠ warning   Uncommitted drift > 2h     native    ✓ sent    ││
│  │  12:00 PM      ℹ info      Nightly dream complete     — skipped (quiet)   ││
│  │                                                                             ││
│  │  Sent today: 3/10 max     Rate: 0.25/hr     In quiet hours: 1 suppressed  ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Steps
1. Implement `GET /api/push` — notification history from PushChannel delivery results
2. Implement `POST /api/push/test` — send test notification via configured backend
3. Implement `PATCH /api/push/rules` — update push config and persist
4. Show rate limit status (sent/max, rate per hour)
5. Show quiet hours suppression count
6. Test button sends sample notification to verify backend works

### Tests
- Config form loads current push settings
- Test notification fires and returns success/failure
- Rate limit status shows correct counts
- Quiet hours suppression tracked

---

## Phase 12 — Config Panel

### Goal
View and edit all config values, toggle feature gates, select models.

### Data Sources
```
VigilConfig      → full config object
FeatureGates     → isEnabled(), diagnose() — 4-layer gate status
FEATURES         → feature name registry
watchConfig()    → live config reload on file change
```

### ASCII Layout — Config
```
┌─ Configuration ─────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  ┌─ Tick Settings ─────────────────────────────────────────────────────────────┐│
│  │                                                                             ││
│  │  Tick Interval     [====●==================] 30s                            ││
│  │  Sleep After       [==============●========] 900s (15m)                     ││
│  │  Sleep Interval    [==================●====] 300s (5m)                      ││
│  │  Dream After       [==================●====] 1800s (30m)                    ││
│  │  Blocking Budget   [========●==============] 120s                           ││
│  │  Event Window      [====●==================] 100                            ││
│  │                                                                             ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  ┌─ Model Selection ──────────────────────────────────────────────────────────┐│
│  │                                                                             ││
│  │  Tick Model:        [claude-haiku-4-5-20251001 ▾]                           ││
│  │  Escalation Model:  [claude-sonnet-4-6 ▾]                                  ││
│  │                                                                             ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  ┌─ Feature Gates ─────────────────────────────────────────────────────────────┐│
│  │                                                                             ││
│  │  Feature                    Build   Config  Runtime  Session   Status       ││
│  │ ──────────────────────────────────────────────────────────────────────────  ││
│  │  VIGIL_WATCHER              ✓       ✓       ✓        ✓        🟢 ON        ││
│  │  VIGIL_DECISION_ENGINE      ✓       ✓       ✓        ✓        🟢 ON        ││
│  │  VIGIL_AGENT_IDENTITY       ✓       ✓       ✓        ✓        🟢 ON        ││
│  │  VIGIL_BRIEF                ✓       ✓       ✓        ✗        🔴 OFF       ││
│  │  VIGIL_PROACTIVE            ✓       ✓       ✓        ✓        🟢 ON        ││
│  │  VIGIL_CHANNELS             ✓       ✗       —        —        🔴 OFF       ││
│  │  VIGIL_WEBHOOKS             ✓       ✓       ✓        ✓        🟢 ON        ││
│  │  VIGIL_PUSH                 ✓       ✗       —        —        🔴 OFF       ││
│  │  VIGIL_SESSIONS             ✓       ✓       ✓        ✓        🟢 ON        ││
│  │                                                                             ││
│  │  Toggle: Click status to flip config-layer gate                             ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  ┌─ Action Gates ──────────────────────────────────────────────────────────────┐│
│  │                                                                             ││
│  │  Enabled:              [✓]                                                  ││
│  │  Auto-approve:         [ ]                                                  ││
│  │  Confidence threshold: [====●==================] 0.80                       ││
│  │  Allowed repos:        vigil, my-app                                        ││
│  │  Allowed actions:      git_stash, run_tests, run_lint                       ││
│  │                                                                             ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│                                              [Save Config]  [Reset Defaults]   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Steps
1. Implement `GET /api/config` — return full VigilConfig
2. Implement `PATCH /api/config` — update and persist via `saveConfig()`
3. Implement `GET /api/config/features` — all gates with `diagnose()` per feature
4. Implement `PATCH /api/config/features/:name` — toggle config-layer gate
5. Build slider inputs for numeric config values
6. Build model dropdown from known model list
7. Feature gate table with 4-layer diagnostic columns
8. Reset button loads `DEFAULT_CONFIG`

### Tests
- Config loads all current values
- Slider changes persist to config.json
- Feature gate toggle updates config-layer and reflects in diagnose()
- Reset restores defaults
- Config file watcher picks up external edits

---

## Phase 13 — System Health

### Goal
Monitor Bun process, database sizes, error log, uptime.

### Data Sources
```
Bun.nanoseconds() → process uptime
process.memoryUsage() → heap, RSS
fs.statSync()     → database file sizes
MetricsStore      → error counters, tick failure log
EventLog          → error events
SessionStore      → crash detection
```

### ASCII Layout — System Health
```
┌─ System Health ─────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  ┌─ Process ───────────────────────────┐  ┌─ Database ─────────────────────┐   │
│  │                                      │  │                                │   │
│  │  Runtime:  Bun 1.x                   │  │  vigil.db      1.2 MB         │   │
│  │  PID:      21002                     │  │  metrics.db    0.3 MB         │   │
│  │  Uptime:   4h 12m                    │  │  JSONL logs    0.8 MB         │   │
│  │                                      │  │  Topics        0.1 MB         │   │
│  │  Memory:                             │  │  Index         0.02 MB        │   │
│  │  Heap     ▓▓▓▓▓▓░░░░░░  48 MB       │  │  ──────────────────────────── │   │
│  │  RSS      ▓▓▓▓▓▓▓▓░░░░  82 MB       │  │  Total         2.42 MB       │   │
│  │  External ▓░░░░░░░░░░░░  2 MB        │  │                                │   │
│  │                                      │  │  Dream results  3 files       │   │
│  │  CPU:     ▓▓░░░░░░░░░░  ~2%         │  │  Schedule data  1 file        │   │
│  │                                      │  │  Worker output  0 pending     │   │
│  └──────────────────────────────────────┘  └────────────────────────────────┘   │
│                                                                                 │
│  ┌─ Uptime Graph (24h) ────────────────────────────────────────────────────┐   │
│  │                                                                          │   │
│  │  ████████████░░░░░████████████░░████████████████████████████████████     │   │
│  │  12am       4am    8am         12pm      4pm                  now       │   │
│  │  ■ Running  ░ Sleeping  · Down                                          │   │
│  │                                                                          │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─ Error Log ──────────────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Time          Type              Message                                 │  │
│  │ ──────────────────────────────────────────────────────────────────────── │  │
│  │  2:15 PM       LLM timeout       claude CLI did not respond in 60s      │  │
│  │  12:00 AM      Tick crash         SQLITE_BUSY: database is locked       │  │
│  │  Apr 9 11pm    Dream fail         Consolidation returned empty result   │  │
│  │                                                                          │  │
│  │  Total errors (24h): 3    Error rate: 0.02/tick                         │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Steps
1. Implement `GET /api/health` — process stats, DB sizes, error counts
2. Use `process.memoryUsage()` for heap/RSS
3. Use `Bun.nanoseconds()` for uptime
4. Walk `~/.vigil/data/` to calculate file sizes
5. Query `MetricsStore` for error counters
6. Build uptime timeline from session history (active/sleeping/down segments)
7. Refresh every 10s

### Tests
- Health endpoint returns valid process stats
- Database sizes match actual file sizes
- Error log pulls from metrics store
- Uptime graph renders session transitions

---

## Phase 14 — A2A Protocol

### Goal
Show connected agents, message exchange log, capabilities.

### Data Sources
```
A2A Server       → active connections, request log
AgentCard        → capabilities, skills
Auth             → bearer token info
Rate limiter     → concurrent request count
```

### ASCII Layout — A2A
```
┌─ A2A Protocol ──────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  ┌─ Server Status ─────────────────────────────────────────────────────────────┐│
│  │  Endpoint: http://localhost:4110    Status: 🟢 Running                      ││
│  │  Auth: Bearer token (a2a-token)    Concurrent: 2/10                        ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  ┌─ Agent Card ────────────────────────────────────────────────────────────────┐│
│  │                                                                             ││
│  │  Name:         vigil-agent                                                  ││
│  │  Version:      1.0.0                                                        ││
│  │  Capabilities: streaming: false, pushNotifications: false                   ││
│  │                                                                             ││
│  │  Skills:                                                                    ││
│  │  • ask     — Ask questions about monitored repositories                     ││
│  │  • status  — Get current daemon status and repo state                       ││
│  │  • dream   — Trigger memory consolidation                                   ││
│  │                                                                             ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  ┌─ Message Log ───────────────────────────────────────────────────────────────┐│
│  │                                                                             ││
│  │  Time          Method          Status    Latency    Tokens                  ││
│  │ ──────────────────────────────────────────────────────────────────────────  ││
│  │  3:50 PM       message/send    ✓ 200     1.2s       342                     ││
│  │  3:35 PM       message/send    ✓ 200     0.9s       256                     ││
│  │  3:20 PM       message/send    ✗ 429     —          — (rate limited)        ││
│  │  3:10 PM       message/send    ✓ 200     1.5s       410                     ││
│  │                                                                             ││
│  │  Total requests: 47    Success: 46    Rate limited: 1    Errors: 0         ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Steps
1. Implement `GET /api/a2a` — server status, agent card, message log
2. Add request logging middleware to A2A server
3. Track concurrent connections, total requests, errors
4. Display agent card with capabilities and skills
5. Show message log with latency and token counts

### Tests
- A2A status shows server as running
- Agent card matches configuration
- Message log records requests with timing
- Rate limiting events tracked

---

## SSE Event Stream Design

### `GET /api/sse`

Single SSE endpoint pushes all real-time events to the dashboard.

```
Event Types:
─────────────────────────────────────────────────────
event: tick
data: {"tickCount":143,"nextIn":30,"state":"awake"}

event: message
data: {"id":"msg-abc","decision":"OBSERVE","message":"...","timestamp":"..."}

event: action_pending
data: {"id":"act-001","command":"git stash","repo":"vigil","confidence":0.85}

event: action_resolved
data: {"id":"act-001","status":"approved"}

event: dream_started
data: {"repo":"vigil","observations":19}

event: dream_completed
data: {"repo":"vigil","summary":"...","insights":[...]}

event: webhook_event
data: {"type":"push","repo":"user/vigil","action":null}

event: state_change
data: {"from":"awake","to":"sleeping"}

event: config_changed
data: {"key":"tickInterval","value":45}

event: task_updated
data: {"id":"task-001","status":"completed"}

event: schedule_fired
data: {"id":"sched-001","name":"Nightly dream","status":"ok"}

event: health
data: {"heap":48000000,"rss":82000000,"tickErrors":0}

event: heartbeat
data: {"ts":"2026-04-10T15:53:00Z"}
```

### Implementation
```typescript
// src/dashboard/api/sse.ts
export function handleSSE(req: Request, daemon: Daemon): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Heartbeat every 15s
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`event: heartbeat\ndata: {"ts":"${new Date().toISOString()}"}\n\n`));
      }, 15000);

      // Subscribe to daemon events
      const unsub = daemon.messageRouter.on('delivered', (msg) => {
        controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(msg)}\n\n`));
      });

      // Cleanup on disconnect
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        unsub();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}
```

---

## Data Source Mapping

### Quick reference: which Vigil module powers which dashboard panel

```
┌─────────────────────────┬──────────────────────────────────────────────────────┐
│ Dashboard Panel         │ Data Sources                                         │
├─────────────────────────┼──────────────────────────────────────────────────────┤
│ Live Overview           │ SessionStore, TickEngine, AdaptiveSleep, Config      │
│ Timeline Feed           │ MessageRouter, VectorStore, EventLog, SSE            │
│ Per-Repo Sidebar        │ GitWatcher, VectorStore, MetricsStore, TopicTier     │
│ Metrics Panel           │ MetricsStore, SessionStore, TickEngine               │
│ Memory & Dreams         │ VectorStore, EventLog, TopicTier, IndexTier, Dream   │
│ Task Manager            │ TaskManager                                          │
│ Scheduler               │ Scheduler                                            │
│ Action Log              │ ActionExecutor                                       │
│ Agent Identity          │ AgentLoader, SystemPrompt                            │
│ Webhooks                │ SubscriptionManager, WebhookServer, WebhookProcessor │
│ Push Notifications      │ PushChannel, NtfyBackend, NativeBackend              │
│ Config Panel            │ VigilConfig, FeatureGates, FEATURES                  │
│ System Health           │ process, fs, MetricsStore, SessionStore              │
│ A2A Protocol            │ A2A Server, AgentCard                                │
└─────────────────────────┴──────────────────────────────────────────────────────┘
```

---

## ASCII Layout Reference — Full Dashboard

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║  ◉ VIGIL          ┊ 🟢 Awake ┊ Repos: 3 ┊ Tick #142 ┊ Next: 18s ┊ ⚙ Config  ║
║  Session: e37c73e5 ┊ ~24s adaptive ┊ haiku-4-5          Uptime: 4h 12m       ║
╠══════════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║  ┌─ Repos ─────────────────────────────┐  ┌─ vigil (detail) ────────────────┐ ║
║  │  ● vigil    main  b19bbac  [active] │  │  Branch: main                    │ ║
║  │  ● my-app   feat  a3f21c  [sleep]   │  │  HEAD:   b19bbac                │ ║
║  │  ● api-srv  main  ff91d2  [active]  │  │  Status: ● 42 mod, 3 new       │ ║
║  └─────────────────────────────────────┘  │  Drift:  0 ahead               │ ║
║                                            │                                 │ ║
║  ┌─ Timeline ──────────────────────────┐  │  Decisions:                      │ ║
║  │  [All][Observe][Notify][Act] 🔍 __  │  │  SILENT  ████████████████░  82% │ ║
║  │                                      │  │  OBSERVE ████░░░░░░░░░░░  14% │ ║
║  │  3:52 👁 vigil  New feature...       │  │  NOTIFY  █░░░░░░░░░░░░░░   3% │ ║
║  │  3:38 👁 vigil  Untracked src/...    │  │  ACT     ░░░░░░░░░░░░░░░   1% │ ║
║  │  3:34 📦 vigil  New commit b19...    │  │                                 │ ║
║  │  3:24 🔔 vigil  ⚠️ Index Anomaly     │  │  Patterns:                      │ ║
║  │  3:20 👁 vigil  Phase 8 Complete     │  │  • claude -p billing            │ ║
║  │       ── Load more ──                │  │  • Tiered memory                │ ║
║  └──────────────────────────────────────┘  │  • 80/15/4/1 targets            │ ║
║                                            └─────────────────────────────────┘ ║
║  ┌─ Metrics ───────────────────────────┐  ┌─ Decisions (24h) ──────────────┐  ║
║  │  Latency    1.3s avg  2.1s p95      │  │  ██                             │  ║
║  │  Tokens     14.2k total  $0.00      │  │  ██ ██                          │  ║
║  │  Ticks      142 total               │  │  ██ ██ ██    ██                 │  ║
║  │  Sleep      2h 45m total  3 cycles  │  │  ██ ██ ██ ██ ██ ██             │  ║
║  └─────────────────────────────────────┘  └─────────────────────────────────┘  ║
║                                                                                ║
╠══════════════════════════════════════════════════════════════════════════════════╣
║ [Timeline] [Dreams] [Tasks] [Actions] [Memory] [Webhooks] [Push] [Config] [A2A]║
╚══════════════════════════════════════════════════════════════════════════════════╝
```

---

## Implementation Order & Dependencies

```
Phase 1  Foundation + Live Overview     ← no dependencies, start here
  │
  ├── Phase 2  Timeline Feed            ← needs SSE from Phase 1
  │     │
  │     └── Phase 3  Per-Repo Sidebar   ← needs repo data patterns from Phase 2
  │
  ├── Phase 4  Metrics Panel            ← needs Chart.js from Phase 1 static assets
  │
  ├── Phase 5  Memory & Dreams          ← independent, can parallel with Phase 4
  │
  ├── Phase 6  Task Manager             ← independent
  │
  ├── Phase 7  Scheduler                ← independent
  │
  ├── Phase 8  Action Log               ← needs SSE action_pending event
  │
  ├── Phase 9  Agent Identity           ← independent
  │
  ├── Phase 10 Webhooks                 ← independent
  │
  ├── Phase 11 Push Notifications       ← independent
  │
  ├── Phase 12 Config Panel             ← independent
  │
  ├── Phase 13 System Health            ← independent
  │
  └── Phase 14 A2A Protocol             ← independent

Recommended parallel tracks:
  Track A: Phase 1 → 2 → 3 → 8 (real-time core)
  Track B: Phase 4 → 13 (metrics + health)
  Track C: Phase 5 → 9 (memory + identity)
  Track D: Phase 6 → 7 (task + scheduler)
  Track E: Phase 10 → 11 → 12 (external + config)
  Track F: Phase 14 (A2A, last)
```

---

## Color System

```
Decision Colors:
  SILENT   → #6b7280 (gray-500)
  OBSERVE  → #3b82f6 (blue-500)
  NOTIFY   → #f59e0b (amber-500)
  ACT      → #ef4444 (red-500)

Severity Colors:
  info     → #3b82f6 (blue-500)
  warning  → #f59e0b (amber-500)
  critical → #ef4444 (red-500)

State Colors:
  awake    → #22c55e (green-500)
  sleeping → #6b7280 (gray-500)
  dreaming → #8b5cf6 (purple-500)

Action Tiers:
  safe       → #22c55e (green-500)
  moderate   → #f59e0b (amber-500)
  dangerous  → #ef4444 (red-500)

Status:
  success  → #22c55e (green-500)
  pending  → #f59e0b (amber-500)
  failed   → #ef4444 (red-500)
  skipped  → #6b7280 (gray-500)
```

---

## CSS Variables (Pico CSS extension)

```css
:root {
  /* Vigil brand */
  --vigil-bg: #0f172a;
  --vigil-surface: #1e293b;
  --vigil-border: #334155;
  --vigil-text: #e2e8f0;
  --vigil-text-muted: #94a3b8;

  /* Decision palette */
  --color-silent: #6b7280;
  --color-observe: #3b82f6;
  --color-notify: #f59e0b;
  --color-act: #ef4444;

  /* State palette */
  --color-awake: #22c55e;
  --color-sleeping: #6b7280;
  --color-dreaming: #8b5cf6;

  /* Status palette */
  --color-success: #22c55e;
  --color-pending: #f59e0b;
  --color-failed: #ef4444;
}
```

---

*Total: 14 phases, ~75 API endpoints, 14 HTML fragments, 1 SSE stream, 4 Chart.js instances.*
*Estimated static bundle: HTMX (~14kb) + Pico CSS (~10kb) + Chart.js (~65kb) = ~89kb total.*
*Zero build step. Zero external dependencies at runtime. Works fully offline.*
