---
title: ClaudeClaw Features Roadmap
type: roadmap
updated: 2026-04-19
sources:
  - plan/claudeclaw-inspired-features-spec.md
---

# ClaudeClaw Features

Ten features from the ClaudeClaw OS spec aimed at turning Vigil from a capable git watcher into a hardened, coordinated developer-intelligence platform. **Aspirational** — no implementation yet as of 2026-04-19.

Ordered by priority; file refs are to the spec, not live code.

## P0

### 1. Dashboard Auth
Token-based auth in front of `/api/*` + a privacy-blur toggle on the UI (mask LLM output, repo paths). Target: cover the "someone walks up to my laptop" threat model.

## P1

### 2. Memory v2 — Salience Decay
Memories age out based on a relevance score instead of the current fixed 7/3-day prune rule. Pinned memories are immune. See [Memory Tiers](../concepts/memory-tiers.md) for today's flat-TTL approach.

### 3. Embedding-Based Semantic Search
Add 768-dim embeddings via a local model; cosine-similarity retrieval sits above FTS5. Today's [Memory](../subsystems/memory.md) has co-occurrence semantics only.

### 4. Exfiltration Guard
Scan all outbound text (LLM prompts, notifications, webhook payloads) for leaked credentials and env vars before send. Logged in the audit table below.

### 10. Emergency Stop + Audit Log
Sentinel-file kill switch (touch `~/.vigil/EMERGENCY_STOP` → daemon pauses immediately) + comprehensive audit SQLite table:

```
action_executed | exfiltration_blocked | emergency_stop | auth_failed | …
```

## P2

### 5. Hive Mind — Multi-Instance Coordination
Shared SQLite table (`~/.vigil/hive.db`) for cross-instance awareness. Kinds:
- `observation` — "I saw X in repo Y"
- `alert` — "I need attention here"
- `delegation` — "I'm handing this to instance Z"
- `completion` — "Z handled it"

### 6. Token & Cost Tracking
Record token usage per `callClaude` invocation. Budget warnings when projected daily spend exceeds threshold. (On Max this matters for rate-limit forecasting rather than billing.)

### 7. Priority Task Queue + Stuck Recovery
- Add `priority` field to tasks.
- On daemon start, look for tasks stuck in `active` or `waiting` longer than threshold and either retry or escalate.
- "Mission" concept — grouping tasks into a higher-level goal.

## P3

### 8. Pre-Review Briefing Cards
On PR webhook, generate a structured briefing:
- Risk level, relevant memories, matching patterns, suggested reviewer actions.
- Rendered on the Webhooks plugin + optionally pushed via channels.

### 9. Notification Channel Expansion
Concrete backends: Telegram, Slack, Discord. Slot into the existing [Messaging](../subsystems/messaging.md) delivery model. Today we have `native` and `ntfy` only.

## Scope estimate from the spec

> ~2,500 new LOC, ~15 new files, ~12 modified files.

## Relationship to Kairos

Some features overlap with the [Kairos roadmap](kairos.md) — specifically session management and rate-limit awareness. Keep both specs separately; when implementing, reconcile shared data models (sessions, tokens) first.

## See also

- [Project Status](status.md) — what's actually shipped.
- [Memory Tiers](../concepts/memory-tiers.md) — what salience decay would change.
- [Action Gates](../concepts/action-gates.md) — existing safety model the Emergency Stop layers on top of.
