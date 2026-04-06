# Vigil Improvement Plan — Kairos-Informed Architecture Upgrade

> Generated 2026-04-05 | Based on deep analysis of both Kairos (Claude Code's autonomous mode) and Vigil (always-on git daemon)
> Priority: Watcher quality first, no TUI work unless requested

---

## Executive Summary

Kairos is a production-grade autonomous agent framework with ~91 TypeScript files powering Claude Code's assistant mode. Vigil is a ~1,552-line KAIROS-inspired git monitoring daemon. This plan extracts the **battle-tested patterns** from Kairos and maps them onto Vigil's architecture across **7 phases**, each with exact code references, implementation details, and dependency chains.

### What Kairos Does That Vigil Doesn't (Yet)

| Kairos Pattern | Vigil Gap | Phase |
|---|---|---|
| Deterministic jittered cron scheduling | Fixed-interval ticks, no jitter | 1 |
| Cache invalidation on rebase/reset | Stale SHAs after rebase (known bug) | 1 |
| File-backed lock mechanism (`cronTasksLock.ts`) | No multi-instance protection | 1 |
| Circuit breaker + retry logic | Silent failures, no recovery | 2 |
| Multi-layer gating / kill switches | No runtime feature control | 2 |
| Structured event pipeline with dedup | Raw event emission, no filtering | 3 |
| Session persistence across restarts | Session data lost on restart | 3 |
| Cross-repo pattern analysis | Each repo isolated | 4 |
| Notification delivery (channels, push) | NOTIFY logs to console only | 4 |
| A2A authentication | Wide-open HTTP server | 5 |
| Observability / metrics / tracing | No instrumentation | 5 |
| Comprehensive test suite | Zero test coverage | 6 |
| Action execution with safety gates | ACT only proposes, never executes | 7 |

---

## Phase 1: Watcher Reliability & Core Hardening

> **Goal**: Make the git monitoring loop bulletproof — fix the stale SHA bug, add jitter, add instance locking.
> **Priority**: HIGHEST (aligns with project memory: "focus on watcher quality")
> **Estimated Files Changed**: 4 modified, 2 new

### 1.1 Cache Invalidation on Rebase/Reset

**The Problem** (from project memory `project_cache_invalidation.md`):
Vigil's `lastCommitHash` in `RepoState` holds stale SHAs after `git rebase`, `git reset --hard`, or `git commit --amend`. The polling loop compares `git rev-parse HEAD` against this cached value, but after a rebase the old SHA no longer exists on the branch. This causes:
- Missed commit detection (new rebased commits look like "same commit")
- Ghost drift alerts (tracking changes that were already committed via rebase)

**Kairos Reference**: Kairos doesn't have this specific problem because it uses `getRepoRemoteHash()` for analytics only — it doesn't cache local SHAs for diff detection. But its general pattern of **file-watching `.git/HEAD`** for immediate state invalidation is the right model.

**Implementation**:

**File: `src/git/watcher.ts`** — Add reflog-based rebase detection

```typescript
// NEW: Add to RepoState interface (line ~8)
interface RepoState {
  path: string;
  name: string;
  lastCommitHash: string;
  currentBranch: string;
  uncommittedSince: number | null;
  lastReflogHash: string;        // NEW: Track reflog tip
  knownCommitSHAs: Set<string>;  // NEW: Track known-valid SHAs
}

// NEW: Add rebase detection method
async detectRebase(repo: RepoState): Promise<boolean> {
  // Read reflog tip — changes on rebase/reset/amend
  const reflogResult = await this.git(repo.path, [
    "reflog", "show", "--format=%H", "-1"
  ]);
  const currentReflogHash = reflogResult.trim();
  
  if (repo.lastReflogHash && currentReflogHash !== repo.lastReflogHash) {
    // Reflog changed — validate that cached SHA still exists
    const validateResult = await this.git(repo.path, [
      "cat-file", "-t", repo.lastCommitHash
    ]).catch(() => null);
    
    if (!validateResult || validateResult.trim() !== "commit") {
      // SHA is orphaned — invalidate cache
      return true;
    }
  }
  
  repo.lastReflogHash = currentReflogHash;
  return false;
}
```

**Integrate into polling loop** (modify `src/git/watcher.ts` lines 87-138):

```typescript
// Inside pollRepos(), before commit comparison (line ~95):
const rebased = await this.detectRebase(state);
if (rebased) {
  // Reset all cached state for this repo
  state.lastCommitHash = "";
  state.uncommittedSince = null;
  state.knownCommitSHAs.clear();
  
  this.emit("rebase_detected", {
    repo: state.name,
    path: state.path,
    detail: "Cache invalidated after rebase/reset"
  });
}
```

**Add `.git/HEAD` file watcher** for immediate detection:

```typescript
// NEW: Watch .git/HEAD for ref changes (add near line 56-70)
const gitHeadPath = path.join(repoPath, ".git", "HEAD");
fs.watch(gitHeadPath, () => {
  // Immediate invalidation — don't wait for next poll
  const state = this.repos.get(repoPath);
  if (state) {
    state.lastCommitHash = ""; // Force re-read on next poll
    this.reportActivity();
  }
});
```

**New event type**:
```typescript
// Add to GitEventType (line ~12)
type GitEventType = "file_change" | "new_commit" | "branch_switch" 
  | "uncommitted_drift" | "rebase_detected";  // NEW
```

---

### 1.2 Deterministic Jittered Tick Scheduling

**Kairos Reference**: `src/utils/cronScheduler.ts` lines 150+ implement deterministic per-task jitter seeded by task ID. This prevents thundering herd when many instances fire simultaneously.

**Why Vigil Needs This**: When watching multiple repos, all ticks fire simultaneously. If 5 repos are watched, 5 LLM calls happen at the exact same moment. This causes:
- CPU/memory spikes
- Potential rate limiting on Claude CLI
- Unnecessary load clustering

**Implementation**:

**File: `src/core/tick-engine.ts`** — Add per-repo jitter

```typescript
// NEW: Deterministic jitter based on repo name (Kairos pattern)
// Reference: Kairos cronScheduler.ts jitter logic
function computeJitter(repoName: string, baseInterval: number): number {
  // Simple hash of repo name for deterministic spread
  let hash = 0;
  for (let i = 0; i < repoName.length; i++) {
    hash = ((hash << 5) - hash) + repoName.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  
  // Jitter: 0-10% of base interval, capped at 15 seconds
  const maxJitter = Math.min(baseInterval * 0.1, 15);
  const jitter = Math.abs(hash % 1000) / 1000 * maxJitter;
  return jitter * 1000; // Return milliseconds
}
```

**Modify `scheduleNext()`** (line ~62):

```typescript
// Instead of fixed interval, use jittered interval
private scheduleNext() {
  const baseInterval = this.sleeping 
    ? this.config.sleepTickInterval 
    : this.config.tickInterval;
  
  // Stagger repo ticks (Kairos pattern: deterministic per-task jitter)
  const jitterMs = this.repoName 
    ? computeJitter(this.repoName, baseInterval)
    : 0;
  
  const intervalMs = (baseInterval * 1000) + jitterMs;
  
  this.timer = setTimeout(async () => {
    // ... existing tick logic
  }, intervalMs);
}
```

---

### 1.3 Instance Lock Mechanism

**Kairos Reference**: `src/utils/cronTasksLock.ts` — File-based lock using sessionId + PID. Prevents concurrent scheduling across multiple Claude Code instances.

**Why Vigil Needs This**: Two `vigil watch` processes on the same repos would:
- Generate duplicate events
- Double LLM calls (wasted tokens)
- Create conflicting memories in VectorStore
- Corrupt JSONL event logs

**Implementation**:

**New File: `src/core/instance-lock.ts`**

```typescript
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { getConfigDir } from "./config";

interface LockData {
  pid: number;
  sessionId: string;
  startedAt: number;
  repos: string[];
}

const LOCK_FILE = join(getConfigDir(), "vigil.lock");

/**
 * Acquire instance lock. Returns true if lock acquired.
 * Pattern from Kairos cronTasksLock.ts — PID-based liveness detection.
 */
export function acquireLock(sessionId: string, repos: string[]): boolean {
  if (existsSync(LOCK_FILE)) {
    try {
      const existing: LockData = JSON.parse(readFileSync(LOCK_FILE, "utf-8"));
      
      // Check if owning process is still alive
      try {
        process.kill(existing.pid, 0); // Signal 0 = check existence
        // Process exists — check repo overlap
        const overlap = repos.filter(r => existing.repos.includes(r));
        if (overlap.length > 0) {
          console.error(`Another Vigil instance (PID ${existing.pid}) is watching: ${overlap.join(", ")}`);
          return false;
        }
        // No overlap — allow parallel watching of different repos
      } catch {
        // Process is dead — stale lock, safe to overwrite
        console.warn("Removing stale lock from dead process");
      }
    } catch {
      // Corrupt lock file — overwrite
    }
  }
  
  const lock: LockData = {
    pid: process.pid,
    sessionId,
    startedAt: Date.now(),
    repos,
  };
  
  writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2));
  return true;
}

export function releaseLock(sessionId: string): void {
  if (!existsSync(LOCK_FILE)) return;
  try {
    const existing: LockData = JSON.parse(readFileSync(LOCK_FILE, "utf-8"));
    if (existing.sessionId === sessionId) {
      unlinkSync(LOCK_FILE);
    }
  } catch {
    // Best effort
  }
}
```

**Integrate into daemon** (modify `src/core/daemon.ts` lines 46-96):

```typescript
// In Daemon.start(), before initializing subsystems:
import { acquireLock, releaseLock } from "./instance-lock";
import { randomUUID } from "crypto";

const sessionId = randomUUID();

if (!acquireLock(sessionId, this.repoPaths)) {
  console.error("Failed to acquire instance lock. Exiting.");
  process.exit(1);
}

// Update SIGINT handler (line ~88):
process.on("SIGINT", () => {
  releaseLock(sessionId);
  // ... existing shutdown
});
```

---

### 1.4 Git Command Resilience

**The Problem**: `src/git/watcher.ts` lines 172-175 use `Bun.spawn()` for git commands but failures are silently swallowed. A git lock file, corrupted index, or network-mounted repo can cause permanent silent failures.

**Kairos Reference**: Kairos wraps git operations with error tracking in `src/utils/git.ts`.

**Implementation**:

**New File: `src/git/exec.ts`** — Resilient git command wrapper

```typescript
import { spawn } from "bun";

interface GitExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

interface GitExecOptions {
  timeoutMs?: number;    // Default: 10_000 (10s)
  retries?: number;      // Default: 2
  retryDelayMs?: number; // Default: 1_000
}

const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY = 1_000;

/**
 * Execute a git command with timeout, retry, and structured error reporting.
 * 
 * Retry logic inspired by Kairos's resilient subprocess patterns.
 * Only retries on transient errors (lock files, network), not logical errors.
 */
export async function gitExec(
  cwd: string,
  args: string[],
  opts: GitExecOptions = {}
): Promise<GitExecResult> {
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const maxRetries = opts.retries ?? DEFAULT_RETRIES;
  const retryDelay = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    
    try {
      const proc = spawn(["git", ...args], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      });
      
      // Timeout race (Kairos pattern: TickEngine budget timeout)
      const result = await Promise.race([
        proc.exited,
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            proc.kill();
            reject(new Error(`git ${args[0]} timed out after ${timeout}ms`));
          }, timeout)
        ),
      ]);
      
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const durationMs = Date.now() - start;
      
      // Check for transient errors worth retrying
      if (result !== 0 && isTransientError(stderr) && attempt < maxRetries) {
        lastError = new Error(`git ${args[0]} failed (attempt ${attempt + 1}): ${stderr}`);
        await Bun.sleep(retryDelay);
        continue;
      }
      
      return { stdout, stderr, exitCode: result as number, durationMs };
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        await Bun.sleep(retryDelay);
        continue;
      }
    }
  }
  
  throw lastError;
}

function isTransientError(stderr: string): boolean {
  const transientPatterns = [
    "Unable to create",        // .git/index.lock exists
    "cannot lock ref",         // ref lock contention
    "Connection refused",      // network mount
    "fatal: loose object",     // temporary corruption during gc
  ];
  return transientPatterns.some(p => stderr.includes(p));
}
```

**Replace raw `Bun.spawn()` calls** in `src/git/watcher.ts` lines 172-175:

```typescript
// BEFORE (watcher.ts line 172-175):
private async git(cwd: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  await proc.exited;
  return new Response(proc.stdout).text();
}

// AFTER:
import { gitExec } from "./exec";

private async git(cwd: string, args: string[]): Promise<string> {
  const result = await gitExec(cwd, args);
  if (result.exitCode !== 0) {
    throw new Error(`git ${args[0]} failed: ${result.stderr}`);
  }
  return result.stdout;
}
```

---

## Phase 2: Decision Engine Hardening

> **Goal**: Make LLM calls resilient with circuit breaker, structured error handling, and runtime configuration.
> **Priority**: HIGH
> **Estimated Files Changed**: 2 modified, 2 new

### 2.1 Circuit Breaker for LLM Calls

**Kairos Reference**: Kairos uses GrowthBook kill switches (`tengu_kairos_brief` with 5-min TTL) to disable features at runtime. Vigil needs a local equivalent — a circuit breaker that stops wasting tokens when Claude CLI is repeatedly failing.

**Implementation**:

**New File: `src/core/circuit-breaker.ts`**

```typescript
/**
 * Circuit breaker for LLM calls.
 * 
 * States: CLOSED (normal) → OPEN (failing, skip calls) → HALF_OPEN (test one call)
 * 
 * Inspired by Kairos kill-switch pattern (tengu_kairos_brief TTL gate),
 * adapted for local use without a remote feature flag service.
 */

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerConfig {
  failureThreshold: number;    // Consecutive failures before opening (default: 3)
  resetTimeoutMs: number;      // Time in OPEN before trying HALF_OPEN (default: 60_000)
  halfOpenMaxAttempts: number;  // Successes needed to close (default: 1)
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private config: CircuitBreakerConfig;
  
  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: config?.failureThreshold ?? 3,
      resetTimeoutMs: config?.resetTimeoutMs ?? 60_000,
      halfOpenMaxAttempts: config?.halfOpenMaxAttempts ?? 1,
    };
  }
  
  /**
   * Check if a call should be allowed.
   */
  canCall(): boolean {
    if (this.state === "CLOSED") return true;
    
    if (this.state === "OPEN") {
      // Check if enough time has passed to try again
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs) {
        this.state = "HALF_OPEN";
        return true;
      }
      return false;
    }
    
    // HALF_OPEN: allow one test call
    return true;
  }
  
  /**
   * Record a successful call.
   */
  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = "CLOSED";
  }
  
  /**
   * Record a failed call.
   */
  recordFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    
    if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.state = "OPEN";
    }
  }
  
  getState(): CircuitState { return this.state; }
  getFailureCount(): number { return this.consecutiveFailures; }
}
```

**Integrate into DecisionEngine** (modify `src/llm/decision-max.ts` lines 26-61):

```typescript
import { CircuitBreaker } from "../core/circuit-breaker";

export class DecisionEngine {
  private breaker = new CircuitBreaker({
    failureThreshold: 3,
    resetTimeoutMs: 60_000,  // 1 min cooldown after 3 failures
  });
  
  private async callClaude(prompt: string, model?: string): Promise<string> {
    if (!this.breaker.canCall()) {
      console.warn(`[circuit-breaker] LLM calls suspended (${this.breaker.getFailureCount()} failures). Retrying in 60s.`);
      return ""; // Caller handles empty response as SILENT
    }
    
    try {
      // ... existing Bun.spawn logic (lines 32-60)
      const result = /* ... */;
      this.breaker.recordSuccess();
      return result;
    } catch (err) {
      this.breaker.recordFailure();
      throw err;
    }
  }
}
```

---

### 2.2 Runtime Feature Configuration

**Kairos Reference**: GrowthBook gates (`tengu_kairos_cron_config`) allow tuning jitter, delays, and expiry without restarting. Vigil can achieve this with a simpler file-watcher on `~/.vigil/config.json`.

**Implementation**:

**Modify `src/core/config.ts`** — Add hot-reload support

```typescript
import { watch } from "fs";

type ConfigChangeHandler = (newConfig: VigilConfig) => void;

let currentConfig: VigilConfig | null = null;
let configWatcher: ReturnType<typeof watch> | null = null;
const changeHandlers: ConfigChangeHandler[] = [];

/**
 * Start watching config file for changes.
 * Inspired by Kairos's GrowthBook TTL pattern — changes take effect
 * without daemon restart.
 */
export function watchConfig(onReload?: ConfigChangeHandler): void {
  const configPath = join(getConfigDir(), "config.json");
  
  if (onReload) changeHandlers.push(onReload);
  
  configWatcher = watch(configPath, async () => {
    // 300ms debounce (matches Kairos FILE_STABILITY_MS)
    await Bun.sleep(300);
    const newConfig = loadConfig();
    currentConfig = newConfig;
    changeHandlers.forEach(h => h(newConfig));
    console.log("[config] Reloaded config.json");
  });
}

export function stopWatchingConfig(): void {
  configWatcher?.close();
  configWatcher = null;
}
```

**Wire into daemon** (modify `src/core/daemon.ts`):

```typescript
// In Daemon.start(), after loading config:
import { watchConfig, stopWatchingConfig } from "./config";

watchConfig((newConfig) => {
  this.config = newConfig;
  this.tickEngine.updateConfig(newConfig);
  console.log("[daemon] Config reloaded — tick interval now", newConfig.tickInterval);
});

// In SIGINT handler:
stopWatchingConfig();
```

---

### 2.3 Structured Decision Validation

**The Problem**: `src/llm/decision-max.ts` lines 19-24 extract JSON from LLM response with a simple regex. If the LLM hallucinates a new decision type or returns malformed JSON, Vigil silently falls back to SILENT.

**Implementation**:

```typescript
// NEW: Strict decision validation (replace lines 19-24 in decision-max.ts)
import { z } from "zod"; // Already in node_modules via @anthropic-ai/sdk

const DecisionSchema = z.object({
  decision: z.enum(["SILENT", "OBSERVE", "NOTIFY", "ACT"]),
  reasoning: z.string(),
  content: z.string().optional(),
  action: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

type ValidatedDecision = z.infer<typeof DecisionSchema>;

function parseDecisionResponse(raw: string): ValidatedDecision {
  // Extract JSON from response (LLM may wrap in markdown)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { decision: "SILENT", reasoning: "Failed to parse response" };
  }
  
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return DecisionSchema.parse(parsed);
  } catch (err) {
    console.warn("[decision] Invalid response, defaulting to SILENT:", err);
    return { decision: "SILENT", reasoning: `Parse error: ${err}` };
  }
}
```

---

## Phase 3: Memory & Session Persistence

> **Goal**: Make Vigil survive restarts gracefully and improve memory quality.
> **Priority**: HIGH
> **Estimated Files Changed**: 3 modified, 1 new

### 3.1 Session Persistence

**Kairos Reference**: `src/bootstrap/state.ts` tracks `sessionId`, `parentSessionId`, and session metadata. `src/assistant/sessionHistory.ts` enables resuming prior sessions.

**Why Vigil Needs This**: Currently, Vigil loses all in-memory state on restart:
- `tickCount` resets to 0
- `lastActivity` resets to now (delays sleep detection)
- `lastConsolidation` resets (could trigger premature dream)
- No continuity in decision context

**Implementation**:

**New File: `src/core/session.ts`**

```typescript
import { Database } from "bun:sqlite";
import { getDataDir } from "./config";
import { join } from "path";
import { randomUUID } from "crypto";

interface SessionData {
  id: string;
  startedAt: number;
  lastTickAt: number;
  tickCount: number;
  repos: string[];
  config: Record<string, unknown>;
  state: "active" | "stopped" | "crashed";
}

/**
 * Session persistence for Vigil daemon.
 * 
 * Inspired by Kairos session tracking (bootstrap/state.ts sessionId + 
 * parentSessionId) but adapted for daemon lifecycle.
 * 
 * Stored in the same SQLite database as memories for simplicity.
 */
export class SessionStore {
  private db: Database;
  
  constructor() {
    this.db = new Database(join(getDataDir(), "vigil.db"));
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL,
        last_tick_at INTEGER,
        tick_count INTEGER DEFAULT 0,
        repos TEXT NOT NULL,
        config TEXT,
        state TEXT DEFAULT 'active',
        stopped_at INTEGER
      )
    `);
  }
  
  create(repos: string[], config: Record<string, unknown>): SessionData {
    const session: SessionData = {
      id: randomUUID(),
      startedAt: Date.now(),
      lastTickAt: Date.now(),
      tickCount: 0,
      repos,
      config,
      state: "active",
    };
    
    this.db.run(
      `INSERT INTO sessions (id, started_at, last_tick_at, tick_count, repos, config, state)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [session.id, session.startedAt, session.lastTickAt, session.tickCount,
       JSON.stringify(session.repos), JSON.stringify(session.config), session.state]
    );
    
    // Mark any previous "active" sessions as "crashed"
    this.db.run(
      `UPDATE sessions SET state = 'crashed', stopped_at = ? WHERE state = 'active' AND id != ?`,
      [Date.now(), session.id]
    );
    
    return session;
  }
  
  updateTick(id: string, tickCount: number): void {
    this.db.run(
      `UPDATE sessions SET last_tick_at = ?, tick_count = ? WHERE id = ?`,
      [Date.now(), tickCount, id]
    );
  }
  
  stop(id: string): void {
    this.db.run(
      `UPDATE sessions SET state = 'stopped', stopped_at = ? WHERE id = ?`,
      [Date.now(), id]
    );
  }
  
  getLastSession(repos: string[]): SessionData | null {
    const row = this.db.query(
      `SELECT * FROM sessions WHERE state IN ('stopped', 'crashed') 
       ORDER BY last_tick_at DESC LIMIT 1`
    ).get() as any;
    
    if (!row) return null;
    return {
      id: row.id,
      startedAt: row.started_at,
      lastTickAt: row.last_tick_at,
      tickCount: row.tick_count,
      repos: JSON.parse(row.repos),
      config: JSON.parse(row.config || "{}"),
      state: row.state,
    };
  }
}
```

**Integrate into daemon** (modify `src/core/daemon.ts`):

```typescript
import { SessionStore } from "./session";

// In Daemon.start():
const sessionStore = new SessionStore();
const lastSession = sessionStore.getLastSession(this.repoPaths);

if (lastSession) {
  console.log(`Resuming after ${lastSession.state} session (${lastSession.tickCount} ticks)`);
  // Restore consolidation timing to avoid premature dream
  if (lastSession.state === "stopped") {
    this.lastConsolidation = lastSession.lastTickAt;
  }
}

const session = sessionStore.create(this.repoPaths, this.config as any);

// In tick handler:
sessionStore.updateTick(session.id, tickNum);

// In SIGINT handler:
sessionStore.stop(session.id);
```

---

### 3.2 Event Deduplication Pipeline

**Kairos Reference**: Kairos's cron scheduler uses `lastFiredAt` timestamps to prevent duplicate fires. Its file watcher uses 300ms debounce (`FILE_STABILITY_MS`).

**The Problem**: Vigil's `fs.watch()` fires multiple events for a single save (editor write + temp file + rename). The polling loop can also detect the same change twice if a commit happens during the poll interval.

**Implementation**:

**Modify `src/git/watcher.ts`** — Add dedup layer

```typescript
// NEW: Event deduplication (add after line 17)

interface EventFingerprint {
  type: GitEventType;
  repo: string;
  detail: string;
  timestamp: number;
}

class EventDeduplicator {
  private seen = new Map<string, number>(); // fingerprint → timestamp
  private readonly windowMs: number;
  
  constructor(windowMs = 5_000) {
    this.windowMs = windowMs;
  }
  
  /**
   * Returns true if this event is a duplicate (should be dropped).
   * Uses content-based fingerprinting — same type + repo + detail
   * within the dedup window is considered duplicate.
   */
  isDuplicate(event: { type: string; repo: string; detail: string }): boolean {
    const key = `${event.type}:${event.repo}:${event.detail}`;
    const now = Date.now();
    const lastSeen = this.seen.get(key);
    
    if (lastSeen && (now - lastSeen) < this.windowMs) {
      return true;
    }
    
    this.seen.set(key, now);
    
    // Periodic cleanup (Kairos pattern: avoid unbounded growth)
    if (this.seen.size > 1000) {
      for (const [k, t] of this.seen) {
        if (now - t > this.windowMs * 2) this.seen.delete(k);
      }
    }
    
    return false;
  }
}

// In GitWatcher class:
private dedup = new EventDeduplicator(5_000);

// Wrap emit calls:
private emitDeduped(type: GitEventType, data: any): void {
  if (!this.dedup.isDuplicate({ type, repo: data.repo, detail: data.detail })) {
    this.emit(type, data);
  }
}
```

---

### 3.3 Memory Pruning & Compaction

**Kairos Reference**: Kairos auto-expires recurring tasks after 7 days (`recurringMaxAgeMs`). `permanent: true` tasks are exempt. This prevents unbounded growth.

**The Problem**: Vigil's VectorStore grows indefinitely. Old, low-confidence memories accumulate noise that degrades LLM decision quality.

**Implementation**:

**Add to `src/memory/store.ts`** — after line 227

```typescript
/**
 * Prune old, low-confidence memories.
 * Inspired by Kairos auto-expiry (cronTasks.ts: recurringMaxAgeMs).
 * 
 * Rules:
 * - git_event memories older than 7 days → delete
 * - decision memories with confidence < 0.3 older than 3 days → delete
 * - consolidated memories are NEVER pruned (equivalent to Kairos permanent: true)
 * - Keep at least `minPerRepo` memories per repo
 */
prune(options?: { maxAgeDays?: number; minPerRepo?: number }): number {
  const maxAge = (options?.maxAgeDays ?? 7) * 86_400_000;
  const minPerRepo = options?.minPerRepo ?? 50;
  const cutoff = Date.now() - maxAge;
  
  // Count per repo to enforce minimum
  const counts = this.db.query(
    `SELECT repo, COUNT(*) as count FROM memories GROUP BY repo`
  ).all() as { repo: string; count: number }[];
  
  let pruned = 0;
  
  for (const { repo, count } of counts) {
    if (count <= minPerRepo) continue;
    
    const excess = count - minPerRepo;
    
    // Delete oldest git_event memories beyond minimum
    const deleted = this.db.run(
      `DELETE FROM memories WHERE id IN (
        SELECT id FROM memories 
        WHERE repo = ? AND type IN ('git_event', 'decision') 
          AND type != 'consolidated'
          AND created_at < ?
        ORDER BY created_at ASC
        LIMIT ?
      )`,
      [repo, cutoff, excess]
    );
    
    pruned += deleted.changes;
  }
  
  // Vacuum after bulk delete
  if (pruned > 100) {
    this.db.run("VACUUM");
  }
  
  return pruned;
}
```

**Trigger during dream phase** (modify `src/core/daemon.ts` consolidation, line ~246):

```typescript
// After consolidation loop, add pruning:
const pruned = this.vectorStore.prune();
if (pruned > 0) {
  console.log(`  Pruned ${pruned} stale memories`);
}
```

---

## Phase 4: Notification Delivery & Cross-Repo Analysis

> **Goal**: Make NOTIFY decisions actually reach the developer, and enable cross-repo pattern detection.
> **Priority**: MEDIUM
> **Estimated Files Changed**: 2 modified, 2 new

### 4.1 Notification Delivery System

**Kairos Reference**: `src/services/mcp/channelNotification.ts` — Multi-channel notification with structured permission workflows. Supports Discord, Slack, SMS via MCP server capabilities.

**Vigil Approach**: Start simpler — webhook + desktop notification + file-based notification queue.

**Implementation**:

**New File: `src/core/notifier.ts`**

```typescript
import { join } from "path";
import { getDataDir } from "./config";
import { existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync, readFileSync } from "fs";

interface Notification {
  id: string;
  repo: string;
  decision: "NOTIFY" | "ACT";
  content: string;
  timestamp: number;
  delivered: boolean;
  channels: string[];  // Which channels were used
}

interface NotifierConfig {
  webhookUrl?: string;          // POST JSON to this URL
  desktopNotify?: boolean;      // Use notify-send / osascript
  fileQueue?: boolean;          // Write to ~/.vigil/notifications/
}

/**
 * Notification delivery system.
 * 
 * Inspired by Kairos channel notifications (channelNotification.ts)
 * but simplified for local daemon use.
 * 
 * Channels are tried in order; failures are logged but don't block.
 */
export class Notifier {
  private config: NotifierConfig;
  private queueDir: string;
  
  constructor(config: NotifierConfig) {
    this.config = config;
    this.queueDir = join(getDataDir(), "notifications");
    if (config.fileQueue && !existsSync(this.queueDir)) {
      mkdirSync(this.queueDir, { recursive: true });
    }
  }
  
  async send(notification: Omit<Notification, "id" | "delivered" | "channels">): Promise<void> {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channels: string[] = [];
    
    // Channel 1: Webhook (Slack, Discord, custom)
    if (this.config.webhookUrl) {
      try {
        const resp = await fetch(this.config.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `[Vigil] ${notification.repo}: ${notification.content}`,
            repo: notification.repo,
            decision: notification.decision,
            timestamp: notification.timestamp,
          }),
        });
        if (resp.ok) channels.push("webhook");
      } catch (err) {
        console.warn("[notifier] Webhook failed:", err);
      }
    }
    
    // Channel 2: Desktop notification
    if (this.config.desktopNotify) {
      try {
        const title = `Vigil — ${notification.repo}`;
        const body = notification.content.slice(0, 200);
        
        if (process.platform === "darwin") {
          await Bun.spawn(["osascript", "-e",
            `display notification "${body}" with title "${title}"`
          ]).exited;
        } else {
          // Linux (WSL included)
          await Bun.spawn(["notify-send", title, body]).exited;
        }
        channels.push("desktop");
      } catch {
        // Desktop notifications are best-effort
      }
    }
    
    // Channel 3: File queue (always-on fallback)
    if (this.config.fileQueue !== false) {
      const notif: Notification = {
        id,
        ...notification,
        delivered: channels.length > 0,
        channels,
      };
      writeFileSync(
        join(this.queueDir, `${id}.json`),
        JSON.stringify(notif, null, 2)
      );
      channels.push("file");
    }
    
    if (channels.length === 0) {
      console.warn("[notifier] No channels delivered notification");
    }
  }
  
  /**
   * Get unread notifications (for CLI `vigil notifications` command).
   */
  getUnread(): Notification[] {
    if (!existsSync(this.queueDir)) return [];
    return readdirSync(this.queueDir)
      .filter(f => f.endsWith(".json"))
      .map(f => JSON.parse(readFileSync(join(this.queueDir, f), "utf-8")))
      .sort((a, b) => b.timestamp - a.timestamp);
  }
  
  /**
   * Mark notification as read (delete file).
   */
  markRead(id: string): void {
    const filePath = join(this.queueDir, `${id}.json`);
    if (existsSync(filePath)) unlinkSync(filePath);
  }
}
```

**Add to config** (modify `src/core/config.ts`):

```typescript
// Add to VigilConfig interface (line ~14):
interface VigilConfig {
  // ... existing fields
  webhookUrl?: string;
  desktopNotify: boolean;  // default: true
}

// Add to defaults (line ~25):
desktopNotify: true,
```

**Wire into daemon** (modify `src/core/daemon.ts`):

```typescript
import { Notifier } from "./notifier";

// In constructor:
this.notifier = new Notifier({
  webhookUrl: this.config.webhookUrl,
  desktopNotify: this.config.desktopNotify,
  fileQueue: true,
});

// In handleTick, NOTIFY case (around line 185):
case "NOTIFY":
  await this.notifier.send({
    repo: repoState.name,
    decision: "NOTIFY",
    content: result.content || result.reasoning,
    timestamp: Date.now(),
  });
  // ... existing logging
```

**Add CLI command** (modify `src/cli/index.ts`):

```typescript
program
  .command("notifications")
  .description("View unread notifications")
  .option("--clear", "Clear all notifications")
  .action(async (opts) => {
    const notifier = new Notifier({ fileQueue: true });
    if (opts.clear) {
      notifier.getUnread().forEach(n => notifier.markRead(n.id));
      console.log("Cleared all notifications.");
      return;
    }
    const unread = notifier.getUnread();
    if (unread.length === 0) {
      console.log("No unread notifications.");
      return;
    }
    for (const n of unread) {
      const time = new Date(n.timestamp).toLocaleTimeString();
      const icon = n.decision === "ACT" ? "⚡" : "🔔";
      console.log(`  ${icon} ${time} [${n.repo}] ${n.content}`);
    }
  });
```

---

### 4.2 Cross-Repo Pattern Analysis

**Kairos Reference**: Kairos routes cron tasks to specific teammates via `agentId`, enabling coordinated multi-agent work. While Vigil doesn't have teammates, it can correlate patterns across repos.

**The Problem**: Vigil watches repos independently. It can't detect:
- Correlated changes (monorepo frontend + backend changed together)
- Cascade risks (shared dependency updated in one repo)
- Workflow patterns (always deploy repo A after merging repo B)

**Implementation**:

**Add to `src/memory/store.ts`** — Cross-repo query methods

```typescript
/**
 * Get recent memories across ALL repos, for cross-repo analysis.
 * Used during dream consolidation to detect inter-repo patterns.
 */
getCrossRepoMemories(limit = 50): MemoryEntry[] {
  const rows = this.db.query(
    `SELECT * FROM memories ORDER BY created_at DESC LIMIT ?`
  ).all(limit) as any[];
  
  return rows.map(this.rowToEntry);
}

/**
 * Get all repo profiles for cross-repo comparison.
 */
getAllRepoProfiles(): { repo: string; summary: string; patterns: string[] }[] {
  const rows = this.db.query(
    `SELECT * FROM repo_profiles`
  ).all() as any[];
  
  return rows.map(r => ({
    repo: r.repo,
    summary: r.summary,
    patterns: JSON.parse(r.patterns || "[]"),
  }));
}
```

**Add cross-repo consolidation** (modify `src/llm/decision-max.ts`):

```typescript
/**
 * Cross-repo pattern analysis during dream phase.
 * Looks for correlations, cascade risks, and workflow patterns.
 */
async analyzeCrossRepo(
  memories: MemoryEntry[],
  profiles: { repo: string; summary: string; patterns: string[] }[]
): Promise<{ patterns: string[]; risks: string[]; insights: string[] }> {
  const system = `You are Vigil, analyzing activity across multiple repositories.
Identify:
1. Correlated changes (repos that change together)
2. Cascade risks (changes in one repo that could affect others)
3. Workflow patterns (sequences of changes across repos)

Respond with JSON: { "patterns": [...], "risks": [...], "insights": [...] }`;

  const prompt = `Repo profiles:\n${profiles.map(p => 
    `- ${p.repo}: ${p.summary}\n  Patterns: ${p.patterns.join(", ")}`
  ).join("\n")}\n\nRecent cross-repo activity:\n${memories.map((m, i) => 
    `${i + 1}. [${m.repo}] ${m.type}: ${m.content}`
  ).join("\n")}`;

  const raw = await this.callClaude(`<system>${system}</system>\n\n${prompt}`, this.escalationModel);
  
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { patterns: [], risks: [], insights: [] };
  } catch {
    return { patterns: [], risks: [], insights: [] };
  }
}
```

**Wire into dream phase** (modify `src/core/daemon.ts` consolidation, line ~240):

```typescript
// After per-repo consolidation, add cross-repo analysis:
if (this.repoPaths.length > 1) {
  const crossMemories = this.vectorStore.getCrossRepoMemories(50);
  const profiles = this.vectorStore.getAllRepoProfiles();
  
  if (profiles.length > 1) {
    const crossAnalysis = await this.decisionEngine.analyzeCrossRepo(crossMemories, profiles);
    
    if (crossAnalysis.risks.length > 0) {
      console.log("\n  Cross-repo risks detected:");
      crossAnalysis.risks.forEach(r => console.log(`    ⚠️  ${r}`));
    }
    
    // Store as a special cross-repo memory
    await this.vectorStore.store({
      id: randomUUID(),
      timestamp: Date.now(),
      repo: "_cross_repo",
      type: "consolidated",
      content: JSON.stringify(crossAnalysis),
      metadata: { repos: this.repoPaths.map(p => path.basename(p)) },
      confidence: 0.8,
    });
  }
}
```

---

## Phase 5: Security & Observability

> **Goal**: Secure the A2A server and add operational metrics.
> **Priority**: MEDIUM
> **Estimated Files Changed**: 2 modified, 1 new

### 5.1 A2A Server Authentication

**Kairos Reference**: `src/services/mcp/channelNotification.ts` lines 50-96 — 6-layer gating for channel access (capability declaration → runtime gate → auth → policy → session → allowlist).

**Vigil's Problem**: `src/llm/a2a-server.ts` has zero authentication. Anyone on localhost (or network if exposed) can query repo state.

**Implementation**:

**Modify `src/llm/a2a-server.ts`** — Add bearer token auth

```typescript
// NEW: Simple bearer token authentication
// Inspired by Kairos multi-layer gating but simplified for local use

function loadOrCreateToken(): string {
  const tokenPath = join(getConfigDir(), "a2a-token");
  
  if (existsSync(tokenPath)) {
    return readFileSync(tokenPath, "utf-8").trim();
  }
  
  // Generate random token on first run
  const token = randomUUID();
  writeFileSync(tokenPath, token, { mode: 0o600 }); // Owner-only read
  console.log(`[a2a] Generated auth token: ${tokenPath}`);
  return token;
}

// In startA2AServer():
const authToken = loadOrCreateToken();

// Add auth middleware to Bun.serve() fetch handler (line ~40):
fetch(req: Request) {
  const url = new URL(req.url);
  
  // Agent card and health are public (needed for discovery)
  if (url.pathname === "/.well-known/agent-card.json" || url.pathname === "/health") {
    // ... existing handlers
  }
  
  // All other endpoints require auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || authHeader !== `Bearer ${authToken}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  
  // ... existing JSON-RPC handler
}
```

---

### 5.2 Operational Metrics

**Kairos Reference**: `src/bootstrap/state.ts` tracks `modelUsage` per session. `src/services/analytics/metadata.ts` handles PII sanitization. OpenTelemetry providers for Meter, Logger, Tracer.

**Vigil Approach**: Lightweight local metrics — no external dependencies, just SQLite counters.

**Implementation**:

**New File: `src/core/metrics.ts`**

```typescript
import { Database } from "bun:sqlite";
import { join } from "path";
import { getDataDir } from "./config";

/**
 * Lightweight local metrics for Vigil.
 * 
 * Tracks operational health without external telemetry services.
 * Inspired by Kairos modelUsage tracking (bootstrap/state.ts)
 * but stored in SQLite for persistence and queryability.
 */
export class MetricsStore {
  private db: Database;
  private counters = new Map<string, number>();
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  
  constructor() {
    this.db = new Database(join(getDataDir(), "vigil.db"));
    this.db.run(`
      CREATE TABLE IF NOT EXISTS metrics (
        name TEXT NOT NULL,
        value REAL NOT NULL,
        labels TEXT DEFAULT '{}',
        recorded_at INTEGER NOT NULL
      )
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_metrics_name_time 
      ON metrics(name, recorded_at)
    `);
  }
  
  /**
   * Increment a counter. Batched — flushed every 30s.
   */
  increment(name: string, amount = 1): void {
    this.counters.set(name, (this.counters.get(name) || 0) + amount);
  }
  
  /**
   * Record a gauge value immediately.
   */
  gauge(name: string, value: number, labels: Record<string, string> = {}): void {
    this.db.run(
      `INSERT INTO metrics (name, value, labels, recorded_at) VALUES (?, ?, ?, ?)`,
      [name, value, JSON.stringify(labels), Date.now()]
    );
  }
  
  /**
   * Record a timing/duration.
   */
  timing(name: string, durationMs: number, labels: Record<string, string> = {}): void {
    this.gauge(name, durationMs, labels);
  }
  
  /**
   * Start periodic flush of counters.
   */
  startFlushing(intervalMs = 30_000): void {
    this.flushInterval = setInterval(() => this.flush(), intervalMs);
  }
  
  /**
   * Flush accumulated counters to SQLite.
   */
  flush(): void {
    const now = Date.now();
    for (const [name, value] of this.counters) {
      this.db.run(
        `INSERT INTO metrics (name, value, labels, recorded_at) VALUES (?, ?, '{}', ?)`,
        [name, value, now]
      );
    }
    this.counters.clear();
  }
  
  /**
   * Get metrics summary for CLI display.
   */
  getSummary(since?: number): Record<string, { count: number; avg: number; max: number }> {
    const cutoff = since || Date.now() - 86_400_000; // Last 24h
    const rows = this.db.query(`
      SELECT name, COUNT(*) as count, AVG(value) as avg, MAX(value) as max
      FROM metrics WHERE recorded_at > ?
      GROUP BY name
    `).all(cutoff) as any[];
    
    const summary: Record<string, any> = {};
    for (const row of rows) {
      summary[row.name] = { count: row.count, avg: row.avg, max: row.max };
    }
    return summary;
  }
  
  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flush(); // Final flush
    }
  }
}
```

**Instrument the daemon** (modify `src/core/daemon.ts`):

```typescript
import { MetricsStore } from "./metrics";

// In constructor:
this.metrics = new MetricsStore();

// In start():
this.metrics.startFlushing();

// In handleTick:
const tickStart = Date.now();
this.metrics.increment("ticks.total");

// After LLM call:
this.metrics.timing("llm.decision_ms", Date.now() - decisionStart, { repo: repoState.name });
this.metrics.increment(`decisions.${result.decision.toLowerCase()}`);

// In SIGINT:
this.metrics.stop();
```

**Add CLI command** (modify `src/cli/index.ts`):

```typescript
program
  .command("metrics")
  .description("Show operational metrics")
  .option("--hours <n>", "Hours to look back", "24")
  .action((opts) => {
    const metrics = new MetricsStore();
    const since = Date.now() - (parseInt(opts.hours) * 3_600_000);
    const summary = metrics.getSummary(since);
    
    console.log(`\nMetrics (last ${opts.hours}h):\n`);
    for (const [name, data] of Object.entries(summary)) {
      console.log(`  ${name}: count=${data.count} avg=${data.avg.toFixed(1)} max=${data.max.toFixed(1)}`);
    }
  });
```

---

## Phase 6: Testing

> **Goal**: Comprehensive test coverage using Bun test.
> **Priority**: HIGH (but parallelizable with other phases)
> **Estimated Files**: 7 new test files

### 6.1 Test Infrastructure

**Kairos Reference**: Kairos uses pure functions for testability (e.g., `isRecurringTaskAged()`, `parseCronExpression()`), dependency injection for mocking (scheduler accepts callbacks), and deterministic jitter (seeded by task ID).

**Implementation**:

**New File: `tests/helpers/mock-claude.ts`**

```typescript
import { spawn } from "bun";

/**
 * Mock claude CLI for testing.
 * Creates a temporary script that returns predetermined responses.
 * 
 * Inspired by Kairos's dependency injection pattern — the DecisionEngine
 * accepts a callClaude function that can be replaced in tests.
 */
export function createMockClaude(responses: Map<string, string>): string {
  const scriptPath = "/tmp/vigil-mock-claude.sh";
  
  // Write a shell script that reads stdin and returns matching response
  const script = `#!/bin/bash
INPUT=$(cat)
${Array.from(responses.entries()).map(([pattern, response]) => 
  `if echo "$INPUT" | grep -q "${pattern}"; then echo '${response}'; exit 0; fi`
).join("\n")}
echo '{"decision":"SILENT","reasoning":"no match"}'
`;
  
  Bun.write(scriptPath, script);
  Bun.spawnSync(["chmod", "+x", scriptPath]);
  return scriptPath;
}

/**
 * Create a temporary git repo for testing.
 */
export async function createTempRepo(): Promise<{ path: string; cleanup: () => void }> {
  const tmpDir = `/tmp/vigil-test-${Date.now()}`;
  
  await Bun.spawn(["mkdir", "-p", tmpDir]).exited;
  await Bun.spawn(["git", "init"], { cwd: tmpDir }).exited;
  await Bun.spawn(["git", "config", "user.email", "test@test.com"], { cwd: tmpDir }).exited;
  await Bun.spawn(["git", "config", "user.name", "Test"], { cwd: tmpDir }).exited;
  
  // Initial commit
  Bun.write(`${tmpDir}/README.md`, "# Test");
  await Bun.spawn(["git", "add", "."], { cwd: tmpDir }).exited;
  await Bun.spawn(["git", "commit", "-m", "Initial commit"], { cwd: tmpDir }).exited;
  
  return {
    path: tmpDir,
    cleanup: () => Bun.spawnSync(["rm", "-rf", tmpDir]),
  };
}
```

---

### 6.2 Unit Tests

**New File: `tests/core/tick-engine.test.ts`**

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { TickEngine } from "../../src/core/tick-engine";

describe("TickEngine", () => {
  let engine: TickEngine;
  
  beforeEach(() => {
    engine = new TickEngine({
      tickInterval: 1,       // 1s for fast tests
      sleepAfter: 3,         // 3s until sleep
      sleepTickInterval: 2,  // 2s in sleep
      blockingBudget: 5,
      dreamAfter: 2,
      tickModel: "test",
      escalationModel: "test",
      maxEventWindow: 10,
    });
  });
  
  afterEach(() => engine.stop());
  
  test("fires tick handlers", async () => {
    const ticks: number[] = [];
    engine.onTick(async (num) => { ticks.push(num); });
    engine.start();
    await Bun.sleep(2500);
    engine.stop();
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks[0]).toBe(1);
  });
  
  test("transitions to sleep after idle", async () => {
    let wasSleeping = false;
    engine.onTick(async (_, sleeping) => { wasSleeping = sleeping; });
    engine.start();
    await Bun.sleep(4000);
    expect(wasSleeping).toBe(true);
  });
  
  test("wakes on activity report", async () => {
    let sleepStates: boolean[] = [];
    engine.onTick(async (_, sleeping) => { sleepStates.push(sleeping); });
    engine.start();
    await Bun.sleep(4000); // Enter sleep
    engine.reportActivity(); // Wake
    await Bun.sleep(1500);
    expect(sleepStates.at(-1)).toBe(false);
  });
  
  test("respects blocking budget", async () => {
    engine = new TickEngine({
      tickInterval: 1,
      sleepAfter: 900,
      sleepTickInterval: 300,
      blockingBudget: 1, // 1 second budget
      dreamAfter: 300,
      tickModel: "test",
      escalationModel: "test",
      maxEventWindow: 10,
    });
    
    let timedOut = false;
    engine.onTick(async () => {
      await Bun.sleep(5000); // Exceed budget
    });
    
    // Should not hang — budget timeout kicks in
    engine.start();
    await Bun.sleep(3000);
    engine.stop();
    // If we reach here, budget worked
    expect(true).toBe(true);
  });
});
```

**New File: `tests/core/circuit-breaker.test.ts`**

```typescript
import { describe, test, expect } from "bun:test";
import { CircuitBreaker } from "../../src/core/circuit-breaker";

describe("CircuitBreaker", () => {
  test("starts CLOSED", () => {
    const cb = new CircuitBreaker();
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.canCall()).toBe(true);
  });
  
  test("opens after threshold failures", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.canCall()).toBe(true); // Still CLOSED
    cb.recordFailure();
    expect(cb.getState()).toBe("OPEN");
    expect(cb.canCall()).toBe(false);
  });
  
  test("transitions to HALF_OPEN after timeout", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 100 });
    cb.recordFailure();
    expect(cb.canCall()).toBe(false);
    await Bun.sleep(150);
    expect(cb.canCall()).toBe(true); // HALF_OPEN
    expect(cb.getState()).toBe("HALF_OPEN");
  });
  
  test("closes on success after HALF_OPEN", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 100 });
    cb.recordFailure();
    await Bun.sleep(150);
    cb.canCall(); // Triggers HALF_OPEN
    cb.recordSuccess();
    expect(cb.getState()).toBe("CLOSED");
  });
  
  test("resets failure count on success", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess(); // Reset
    cb.recordFailure();
    expect(cb.getState()).toBe("CLOSED"); // Only 1 failure
  });
});
```

**New File: `tests/git/watcher.test.ts`**

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { GitWatcher } from "../../src/git/watcher";
import { createTempRepo } from "../helpers/mock-claude";

describe("GitWatcher", () => {
  let repo: { path: string; cleanup: () => void };
  let watcher: GitWatcher;
  
  beforeEach(async () => {
    repo = await createTempRepo();
    watcher = new GitWatcher();
    watcher.addRepo(repo.path);
  });
  
  afterEach(() => {
    watcher.stop();
    repo.cleanup();
  });
  
  test("detects new commits", async () => {
    const events: any[] = [];
    watcher.on("new_commit", (e) => events.push(e));
    
    // Create a new commit
    Bun.write(`${repo.path}/test.txt`, "hello");
    await Bun.spawn(["git", "add", "."], { cwd: repo.path }).exited;
    await Bun.spawn(["git", "commit", "-m", "test"], { cwd: repo.path }).exited;
    
    watcher.startPolling(1); // 1s interval for test
    await Bun.sleep(2000);
    
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].type).toBe("new_commit");
  });
  
  test("detects branch switch", async () => {
    const events: any[] = [];
    watcher.on("branch_switch", (e) => events.push(e));
    
    await Bun.spawn(["git", "checkout", "-b", "feature"], { cwd: repo.path }).exited;
    
    watcher.startPolling(1);
    await Bun.sleep(2000);
    
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
  
  test("builds context for LLM", async () => {
    const state = watcher.getRepoState(repo.path);
    const context = await watcher.buildContext(state!);
    
    expect(context).toContain("Status:");
    expect(context).toContain("Recent commits:");
  });
});
```

**New File: `tests/memory/store.test.ts`**

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { VectorStore, EventLog } from "../../src/memory/store";
import { randomUUID } from "crypto";
import { mkdirSync, rmSync } from "fs";

describe("VectorStore", () => {
  let store: VectorStore;
  const testDir = `/tmp/vigil-test-db-${Date.now()}`;
  
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    // Override data dir for test isolation
    process.env.VIGIL_DATA_DIR = testDir;
    store = new VectorStore();
    await store.init();
  });
  
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    delete process.env.VIGIL_DATA_DIR;
  });
  
  test("stores and retrieves memories", async () => {
    await store.store({
      id: randomUUID(),
      timestamp: Date.now(),
      repo: "test-repo",
      type: "decision",
      content: "Noticed unusual commit pattern",
      metadata: {},
      confidence: 0.8,
    });
    
    const results = await store.getByRepo("test-repo", 10);
    expect(results.length).toBe(1);
    expect(results[0].content).toContain("unusual commit");
  });
  
  test("FTS search works", async () => {
    await store.store({
      id: randomUUID(),
      timestamp: Date.now(),
      repo: "test-repo",
      type: "insight",
      content: "Developer tends to commit frequently on Fridays",
      metadata: {},
      confidence: 0.7,
    });
    
    const results = await store.search("Friday commit", 10);
    expect(results.length).toBe(1);
  });
  
  test("repo profiles CRUD", async () => {
    await store.saveRepoProfile({
      repo: "test-repo",
      summary: "A TypeScript project",
      patterns: ["frequent refactoring", "good test coverage"],
    });
    
    const profile = await store.getRepoProfile("test-repo");
    expect(profile).toBeTruthy();
    expect(profile!.summary).toBe("A TypeScript project");
    expect(profile!.patterns).toContain("frequent refactoring");
  });
  
  test("prune removes old memories", async () => {
    // Insert 60 old memories
    for (let i = 0; i < 60; i++) {
      await store.store({
        id: randomUUID(),
        timestamp: Date.now() - 10 * 86_400_000, // 10 days ago
        repo: "test-repo",
        type: "git_event",
        content: `Old event ${i}`,
        metadata: {},
        confidence: 0.5,
      });
    }
    
    const pruned = store.prune({ maxAgeDays: 7, minPerRepo: 50 });
    expect(pruned).toBe(10); // 60 - 50 minimum
  });
});
```

**New File: `tests/core/instance-lock.test.ts`**

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import { acquireLock, releaseLock } from "../../src/core/instance-lock";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { getConfigDir } from "../../src/core/config";

const LOCK_FILE = join(getConfigDir(), "vigil.lock");

describe("InstanceLock", () => {
  afterEach(() => {
    if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE);
  });
  
  test("acquires lock on first call", () => {
    const result = acquireLock("session-1", ["/repo/a"]);
    expect(result).toBe(true);
    expect(existsSync(LOCK_FILE)).toBe(true);
    releaseLock("session-1");
  });
  
  test("blocks overlapping repos", () => {
    acquireLock("session-1", ["/repo/a", "/repo/b"]);
    const result = acquireLock("session-2", ["/repo/b", "/repo/c"]);
    expect(result).toBe(false); // /repo/b overlaps
    releaseLock("session-1");
  });
  
  test("allows non-overlapping repos", () => {
    acquireLock("session-1", ["/repo/a"]);
    const result = acquireLock("session-2", ["/repo/b"]);
    expect(result).toBe(true);
    releaseLock("session-1");
    releaseLock("session-2");
  });
  
  test("releases lock on correct session", () => {
    acquireLock("session-1", ["/repo/a"]);
    releaseLock("session-1");
    expect(existsSync(LOCK_FILE)).toBe(false);
  });
  
  test("does not release lock from wrong session", () => {
    acquireLock("session-1", ["/repo/a"]);
    releaseLock("session-2"); // Wrong session
    expect(existsSync(LOCK_FILE)).toBe(true);
    releaseLock("session-1");
  });
});
```

---

## Phase 7: Safe Action Execution

> **Goal**: Allow Vigil to execute proposed actions with multi-gate safety.
> **Priority**: LOW (build trust first)
> **Estimated Files Changed**: 2 modified, 2 new

### 7.1 Action Executor with Safety Gates

**Kairos Reference**: Kairos's multi-layer gating pattern (build-time → runtime gate → entitlement → session state → tool availability). 6 independent kill switches prevent unauthorized channel access.

**Vigil Approach**: Apply the same multi-layer pattern to action execution.

**Implementation**:

**New File: `src/core/action-executor.ts`**

```typescript
/**
 * Safe action execution with multi-gate safety.
 * 
 * Directly modeled on Kairos's 6-layer gating pattern
 * (channelNotification.ts lines 50-96).
 * 
 * Gate chain:
 * 1. Config gate: actions.enabled must be true in config
 * 2. Session gate: user must have opted in this session
 * 3. Repo gate: repo must be in allowlist
 * 4. Action gate: action type must be in allowlist
 * 5. Confidence gate: decision confidence must exceed threshold
 * 6. Confirmation gate: user must confirm (unless auto-approve enabled)
 */

interface ActionGateConfig {
  enabled: boolean;                    // Gate 1: Master switch
  allowedRepos: string[];              // Gate 3: Repo allowlist (* = all)
  allowedActions: ActionType[];        // Gate 4: Action type allowlist
  confidenceThreshold: number;         // Gate 5: Min confidence (0-1)
  autoApprove: boolean;                // Gate 6: Skip confirmation
}

type ActionType = 
  | "git_stash"           // Stash uncommitted changes
  | "git_branch"          // Create a branch
  | "git_commit"          // Auto-commit with message
  | "run_tests"           // Execute test suite
  | "run_lint"            // Execute linter
  | "custom_script";      // Run user-defined script

interface ActionRequest {
  type: ActionType;
  repo: string;
  description: string;
  command: string;
  confidence: number;
  reasoning: string;
}

interface ActionResult {
  success: boolean;
  output: string;
  duration: number;
  gatesPassed: string[];
  gatesFailed: string[];
}

const DEFAULT_GATE_CONFIG: ActionGateConfig = {
  enabled: false,            // OFF by default — must be explicitly enabled
  allowedRepos: [],          // Empty = none allowed
  allowedActions: ["git_stash", "run_tests", "run_lint"], // Safe defaults
  confidenceThreshold: 0.8,  // High confidence required
  autoApprove: false,        // Always confirm
};

export class ActionExecutor {
  private config: ActionGateConfig;
  private sessionOptIn = false;
  
  constructor(config?: Partial<ActionGateConfig>) {
    this.config = { ...DEFAULT_GATE_CONFIG, ...config };
  }
  
  /**
   * User opts in to action execution for this session.
   * Gate 2 — session-level consent.
   */
  optIn(): void {
    this.sessionOptIn = true;
  }
  
  /**
   * Check all gates. Returns gate results for transparency.
   */
  checkGates(request: ActionRequest): { allowed: boolean; results: Record<string, boolean> } {
    const results: Record<string, boolean> = {
      "1_config_enabled": this.config.enabled,
      "2_session_optin": this.sessionOptIn,
      "3_repo_allowed": this.config.allowedRepos.includes("*") || 
                         this.config.allowedRepos.includes(request.repo),
      "4_action_allowed": this.config.allowedActions.includes(request.type),
      "5_confidence": request.confidence >= this.config.confidenceThreshold,
    };
    
    const allowed = Object.values(results).every(v => v);
    return { allowed, results };
  }
  
  /**
   * Execute an action after all gates pass.
   */
  async execute(request: ActionRequest): Promise<ActionResult> {
    const { allowed, results } = this.checkGates(request);
    const gatesPassed = Object.entries(results).filter(([_, v]) => v).map(([k]) => k);
    const gatesFailed = Object.entries(results).filter(([_, v]) => !v).map(([k]) => k);
    
    if (!allowed) {
      return {
        success: false,
        output: `Action blocked by gates: ${gatesFailed.join(", ")}`,
        duration: 0,
        gatesPassed,
        gatesFailed,
      };
    }
    
    // Validate command against action type (prevent injection)
    if (!this.validateCommand(request)) {
      return {
        success: false,
        output: "Command validation failed — does not match declared action type",
        duration: 0,
        gatesPassed,
        gatesFailed: ["command_validation"],
      };
    }
    
    const start = Date.now();
    
    try {
      const proc = Bun.spawn(["bash", "-c", request.command], {
        cwd: request.repo,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30_000, // 30s hard limit
      });
      
      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      
      return {
        success: exitCode === 0,
        output: stdout + (stderr ? `\nSTDERR: ${stderr}` : ""),
        duration: Date.now() - start,
        gatesPassed,
        gatesFailed,
      };
    } catch (err) {
      return {
        success: false,
        output: `Execution error: ${err}`,
        duration: Date.now() - start,
        gatesPassed,
        gatesFailed,
      };
    }
  }
  
  /**
   * Validate that the command matches the declared action type.
   * Prevents the LLM from declaring "run_tests" but executing "rm -rf".
   */
  private validateCommand(request: ActionRequest): boolean {
    const commandPatterns: Record<ActionType, RegExp[]> = {
      git_stash: [/^git stash/],
      git_branch: [/^git (checkout -b|branch|switch -c)/],
      git_commit: [/^git (add|commit)/],
      run_tests: [/^(bun test|npm test|pytest|cargo test|go test|make test)/],
      run_lint: [/^(bun run lint|npm run lint|eslint|prettier|ruff|clippy)/],
      custom_script: [/.*/], // Custom scripts validated by allowlist only
    };
    
    const patterns = commandPatterns[request.type];
    if (!patterns) return false;
    
    return patterns.some(p => p.test(request.command));
  }
}
```

**Add to config** (modify `src/core/config.ts`):

```typescript
interface VigilConfig {
  // ... existing fields
  actions?: {
    enabled: boolean;
    allowedRepos: string[];
    allowedActions: string[];
    confidenceThreshold: number;
    autoApprove: boolean;
  };
}
```

---

## Phase Dependency Map

```
Phase 1 (Watcher Reliability)     ← HIGHEST PRIORITY, start here
  │
  ├── 1.1 Cache invalidation      ← Fixes known bug
  ├── 1.2 Jittered ticks          ← Independent
  ├── 1.3 Instance lock           ← Independent
  └── 1.4 Git command resilience  ← Independent (1.1 benefits from this)
  
Phase 2 (Decision Hardening)       ← Depends on Phase 1.4 (gitExec)
  │
  ├── 2.1 Circuit breaker         ← Independent
  ├── 2.2 Runtime config reload   ← Independent
  └── 2.3 Decision validation     ← Independent
  
Phase 3 (Memory & Sessions)       ← Can start in parallel with Phase 2
  │
  ├── 3.1 Session persistence     ← Independent
  ├── 3.2 Event deduplication     ← Depends on Phase 1.1
  └── 3.3 Memory pruning          ← Independent
  
Phase 4 (Notifications & Cross-Repo) ← Depends on Phase 3.3
  │
  ├── 4.1 Notification delivery   ← Independent
  └── 4.2 Cross-repo analysis     ← Depends on 3.3 (memory queries)
  
Phase 5 (Security & Observability) ← Can start in parallel with Phase 4
  │
  ├── 5.1 A2A auth                ← Independent
  └── 5.2 Metrics                 ← Independent
  
Phase 6 (Testing)                  ← Parallelizable with ALL phases
  │
  └── Write tests as each phase completes
  
Phase 7 (Action Execution)        ← Depends on Phase 5.1 (security) + Phase 2.1 (circuit breaker)
  │
  └── 7.1 Gated action executor   ← Requires all safety infrastructure
```

---

## Implementation Order (Recommended)

| Sprint | Phase | Items | Rationale |
|--------|-------|-------|-----------|
| 1 | 1.1 + 1.4 | Cache invalidation + git resilience | Fix known bug, foundation for all git ops |
| 2 | 1.2 + 1.3 | Jitter + instance lock | Prevent resource waste |
| 3 | 2.1 + 2.3 | Circuit breaker + validation | Prevent token waste on failures |
| 4 | 3.1 + 3.2 | Sessions + dedup | Survive restarts, reduce noise |
| 5 | 2.2 + 3.3 | Hot config + pruning | Runtime control, prevent DB bloat |
| 6 | 4.1 | Notification delivery | NOTIFY becomes useful |
| 7 | 5.1 + 5.2 | A2A auth + metrics | Production readiness |
| 8 | 4.2 | Cross-repo analysis | Unlock multi-repo intelligence |
| 9 | 6.* | Full test suite | Comprehensive coverage |
| 10 | 7.1 | Action execution | Only after trust is built |

---

## Kairos Patterns Reference Card

Quick reference of which Kairos pattern maps to which Vigil improvement:

| Kairos File | Pattern | Vigil Application |
|---|---|---|
| `cronScheduler.ts:150+` | Deterministic jitter | Phase 1.2: TickEngine jitter |
| `cronTasksLock.ts` | PID-based file lock | Phase 1.3: Instance lock |
| `cronTasks.ts:51-57` | `permanent: true` exemption | Phase 3.3: Consolidated memories never pruned |
| `cronScheduler.ts:9,200+` | Chokidar file watching + 300ms debounce | Phase 2.2: Config hot-reload |
| `channelNotification.ts:50-96` | 6-layer gating | Phase 7.1: Action executor gates |
| `BriefTool.ts` | 5-min TTL kill switch | Phase 2.1: Circuit breaker (local equivalent) |
| `bootstrap/state.ts:100-102` | Session ID + parent tracking | Phase 3.1: Session persistence |
| `cronTasks.ts:recurringMaxAgeMs` | 7-day auto-expiry | Phase 3.3: Memory pruning |
| `Spinner.tsx:62-81` | Hook-safe component splitting | N/A (no TUI work) |
| `analytics/metadata.ts:70-77` | PII sanitization | Phase 5.2: Metrics (no PII in metric names) |
| `git.ts` | Resilient git wrappers | Phase 1.4: gitExec with retry |
| `cron.ts` | Pure parseable functions | Phase 6: Testable pure functions |

---

## Files Created/Modified Summary

### New Files (10)
| File | Phase | Lines (est) |
|---|---|---|
| `src/core/instance-lock.ts` | 1.3 | ~60 |
| `src/git/exec.ts` | 1.4 | ~80 |
| `src/core/circuit-breaker.ts` | 2.1 | ~70 |
| `src/core/session.ts` | 3.1 | ~90 |
| `src/core/notifier.ts` | 4.1 | ~120 |
| `src/core/metrics.ts` | 5.2 | ~100 |
| `src/core/action-executor.ts` | 7.1 | ~150 |
| `tests/helpers/mock-claude.ts` | 6.1 | ~50 |
| `tests/core/*.test.ts` (3 files) | 6.2 | ~200 |
| `tests/git/watcher.test.ts` | 6.2 | ~80 |
| `tests/memory/store.test.ts` | 6.2 | ~80 |

### Modified Files (7)
| File | Phases | Changes |
|---|---|---|
| `src/git/watcher.ts` | 1.1, 1.4, 3.2 | Rebase detection, gitExec, dedup |
| `src/core/tick-engine.ts` | 1.2 | Jitter computation |
| `src/core/daemon.ts` | 1.3, 2.2, 3.1, 3.3, 4.1, 4.2, 5.2 | Lock, session, metrics, notifier |
| `src/core/config.ts` | 2.2, 4.1, 7.1 | Hot-reload, notification config, action config |
| `src/llm/decision-max.ts` | 2.1, 2.3, 4.2 | Circuit breaker, validation, cross-repo |
| `src/llm/a2a-server.ts` | 5.1 | Bearer token auth |
| `src/memory/store.ts` | 3.3, 4.2 | Pruning, cross-repo queries |
| `src/cli/index.ts` | 4.1, 5.2 | Notifications + metrics commands |
