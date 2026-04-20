#!/usr/bin/env bash
# SessionEnd hook: reviews transcript and proposes wiki/ updates.
# Dry-run (default): writes JSON proposal to .claude/hooks/wiki-review.log.
# APPLY=1: lets claude edit wiki/ directly.

set -euo pipefail

APPLY="${APPLY:-0}"
REPO_ROOT="/home/domidex/projects/vigil"
WIKI_DIR="$REPO_ROOT/wiki"
LOG_FILE="$REPO_ROOT/.claude/hooks/wiki-review.log"

payload="$(cat)"
transcript_path="$(printf '%s' "$payload" | jq -r '.transcript_path // empty')"
session_id="$(printf '%s' "$payload" | jq -r '.session_id // "unknown"')"
reason="$(printf '%s' "$payload" | jq -r '.reason // "unknown"')"

[ -z "$transcript_path" ] && { echo "no transcript_path" >&2; exit 0; }
[ ! -f "$transcript_path" ] && { echo "transcript not found: $transcript_path" >&2; exit 0; }

wiki_index="$(cd "$WIKI_DIR" && find . -type f -name '*.md' | sort)"
git_branch="$(cd "$REPO_ROOT" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
git_recent="$(cd "$REPO_ROOT" && git log -5 --oneline 2>/dev/null || echo '')"

read -r -d '' prompt <<PROMPT || true
You are the wiki maintainer for the Vigil project (Bun/TypeScript git-watching daemon).

# Your job
Decide whether this session produced **durable, non-obvious knowledge** that belongs in the wiki. The wiki captures architecture decisions, subsystem behavior, gotchas, and invariants — NOT session notes, debugging traces, or work-in-progress. Git log already records what changed; the wiki records why it matters and how the system fits together.

# Context
- Wiki root: $WIKI_DIR
- Page template: $WIKI_DIR/.template.md (MUST read this before any ADD — all new pages conform to this front-matter schema: title, type, updated, sources, tags)
- Current branch: $git_branch
- Recent commits:
$git_recent

- Wiki files (read relevant ones before proposing changes):
$wiki_index

- Session transcript (JSONL, one message per line): $transcript_path
  Focus on: user intent, decisions reached, new patterns introduced, file changes under src/.
  Ignore: failed tool calls, exploratory reads, trial-and-error debugging, typo fixes.

# How to decide
1. Scan the transcript for durable outcomes (new subsystem, design decision, non-obvious constraint).
2. For each candidate change, Read the relevant wiki file(s) and Grep wiki/ for overlap.
3. Prefer MODIFY over ADD. Prefer skipping over DELETE. Only DELETE when a page is actively wrong or fully superseded.
4. If the session produced nothing durable, return status="up_to_date" — this is the common case.

# Guardrails
- No emojis. Match the existing terse voice of wiki/ files.
- Max 5 changes per run. If more seem warranted, pick the highest-signal 5.
- Do not invent content not grounded in the transcript or existing code.
- Do not propose pages that duplicate README.md, CLAUDE.md, or existing wiki pages.
- Do not document ephemeral state (current task list, in-progress PRs).
- Every ADD must use the front-matter schema from $WIKI_DIR/.template.md (title, type, updated, sources, tags). sources: must list real repo-relative paths or valid globs — no ellipsis ranges.
- After any ADD/DELETE, wiki/index.md must link the new page or drop the removed one. Include that edit as its own MODIFY change.

# Output
Return ONLY a JSON object on a single line, no prose before or after:

{"status":"up_to_date"}

OR

{"status":"changes","changes":[{"op":"ADD|MODIFY|DELETE","path":"wiki/...","reason":"why this belongs in wiki","summary":"what to add/change/remove"}]}

# Example — good ADD
{"status":"changes","changes":[{"op":"ADD","path":"wiki/subsystems/dream-worker.md","reason":"Session introduced the dream worker subsystem and its idle-detection heuristic, not documented elsewhere","summary":"Page explaining dream worker lifecycle: trigger conditions (idle > 10min), Sonnet-backed consolidation, and the EventLog -> VectorStore flow."}]}

# Example — common case
{"status":"up_to_date"}
PROMPT

{
  echo "=== $(date -Iseconds) session=$session_id reason=$reason apply=$APPLY branch=$git_branch ==="
} >> "$LOG_FILE"

if [ "$APPLY" = "1" ]; then
  prompt="$prompt

# Apply mode
After emitting the JSON, apply the changes directly by editing files under $WIKI_DIR. Use Write for ADD, Edit for MODIFY, and rm via Bash for DELETE. Keep edits surgical — do not touch unrelated content."
  printf '%s' "$prompt" | claude -p --allowedTools "Read,Write,Edit,Glob,Grep,Bash" >> "$LOG_FILE" 2>&1 || true
else
  printf '%s' "$prompt" | claude -p --allowedTools "Read,Glob,Grep" >> "$LOG_FILE" 2>&1 || true
fi

echo "" >> "$LOG_FILE"
exit 0
