# Kairos Advanced Features Plan — Full Implementation Guide

> Generated 2026-04-06 | 10 phases covering every Kairos feature not yet in Vigil
> Builds on top of the existing `vigil-improvement-plan.md` (Phases 1–7)
> All code examples follow Kairos's actual patterns from the Claude Code source

---

## Table of Contents

- [Phase 8: Assistant Mode / Autonomous Agent Identity](#phase-8-assistant-mode--autonomous-agent-identity)
- [Phase 9: Brief Mode / SendUserMessage Tool](#phase-9-brief-mode--sendusermessage-tool)
- [Phase 10: Proactive Mode / Tick-Driven Work Cycles](#phase-10-proactive-mode--tick-driven-work-cycles)
- [Phase 11: Channel Notifications from MCP Servers](#phase-11-channel-notifications-from-mcp-servers)
- [Phase 12: GitHub Webhooks / SubscribePR](#phase-12-github-webhooks--subscribepr)
- [Phase 13: Push Notifications (Mobile/Desktop)](#phase-13-push-notifications-mobiledesktop)
- [Phase 14: Session Management](#phase-14-session-management)
- [Phase 15: Multi-Layer Gating / Kill Switches](#phase-15-multi-layer-gating--kill-switches)
- [Phase 16: System Prompt Caching with TTL](#phase-16-system-prompt-caching-with-ttl)
- [Phase 17: Dead Code Elimination (Build-Time)](#phase-17-dead-code-elimination-build-time)
- [Phase Dependency Map](#phase-dependency-map)

---

## Phase 8: Assistant Mode / Autonomous Agent Identity

> **Goal**: Give Vigil a customizable agent persona — users define who Vigil is, what instructions it follows, and how it behaves via `.claude/agents/vigil.md`.
> **Kairos Reference**: `src/assistant/index.ts`, `src/utils/systemPrompt.ts`, `src/constants/prompts.ts`
> **Estimated Files Changed**: 3 new, 2 modified

### 8.1 Agent Definition Loader

**Kairos Pattern**: Kairos reads `.claude/agents/assistant.md` at startup and injects it into the system prompt. The agent definition supports frontmatter metadata and markdown body instructions.

**New File: `src/agent/agentLoader.ts`**

```typescript
import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "yaml";

export interface AgentDefinition {
  name: string;
  description: string;
  model?: string;
  systemPrompt: string;
  tools?: string[];         // Tool allowlist
  watchPatterns?: string[]; // File globs this agent cares about
  triggerEvents?: string[]; // Event types that activate this agent
}

const AGENT_DIR = ".claude/agents";
const DEFAULT_AGENT_FILE = "vigil.md";

/**
 * Parse a markdown file with YAML frontmatter into an AgentDefinition.
 * Follows Kairos pattern: frontmatter for structured config, body for
 * natural language instructions.
 *
 * Kairos ref: src/tools/AgentTool/loadAgentsDir.ts
 */
export async function loadAgentDefinition(
  repoPath: string,
  agentFile: string = DEFAULT_AGENT_FILE
): Promise<AgentDefinition | null> {
  const filePath = path.join(repoPath, AGENT_DIR, agentFile);

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return parseAgentFile(raw, agentFile);
  } catch {
    return null; // No agent file = use defaults (graceful degradation)
  }
}

function parseAgentFile(raw: string, filename: string): AgentDefinition {
  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    // No frontmatter — entire file is the system prompt
    return {
      name: path.basename(filename, ".md"),
      description: "Custom Vigil agent",
      systemPrompt: raw.trim(),
    };
  }

  const meta = yaml.parse(frontmatterMatch[1]) ?? {};
  const body = frontmatterMatch[2].trim();

  return {
    name: meta.name ?? path.basename(filename, ".md"),
    description: meta.description ?? "Custom Vigil agent",
    model: meta.model,
    systemPrompt: body,
    tools: Array.isArray(meta.tools) ? meta.tools : undefined,
    watchPatterns: Array.isArray(meta.watchPatterns) ? meta.watchPatterns : undefined,
    triggerEvents: Array.isArray(meta.triggerEvents) ? meta.triggerEvents : undefined,
  };
}

/**
 * List all agent definitions in the agents directory.
 * Enables multi-agent setups (e.g., vigil.md for monitoring,
 * reviewer.md for code review, deployer.md for CI).
 */
export async function listAgentDefinitions(
  repoPath: string
): Promise<AgentDefinition[]> {
  const dirPath = path.join(repoPath, AGENT_DIR);

  try {
    const files = await fs.readdir(dirPath);
    const mdFiles = files.filter((f) => f.endsWith(".md"));
    const agents = await Promise.all(
      mdFiles.map((f) => loadAgentDefinition(repoPath, f))
    );
    return agents.filter((a): a is AgentDefinition => a !== null);
  } catch {
    return [];
  }
}
```

### 8.2 Agent Identity System Prompt Builder

**Kairos Pattern**: `buildEffectiveSystemPrompt()` in `src/utils/systemPrompt.ts` composes prompts from multiple sources with clear priority: override > coordinator > agent > custom > default. In proactive mode, agent instructions are **appended** rather than replacing.

**New File: `src/agent/systemPrompt.ts`**

```typescript
import type { AgentDefinition } from "./agentLoader.js";

export interface SystemPromptConfig {
  agentDefinition: AgentDefinition | null;
  repoContext: RepoContext;
  isProactive: boolean;
  customInstructions?: string;
}

interface RepoContext {
  repoName: string;
  currentBranch: string;
  recentCommits: string[];
  uncommittedFiles: string[];
}

const DEFAULT_VIGIL_PROMPT = `You are Vigil, an always-on git monitoring agent. You watch repositories for changes, analyze patterns, detect risks, and surface insights.

Your job is to:
- Monitor git state changes (commits, branches, drift, rebases)
- Analyze code changes for risk signals (large diffs, sensitive files, pattern breaks)
- Surface actionable insights proactively — don't wait to be asked
- Keep context across sessions — remember what you've seen

Guidelines:
- Never respond with only a status message — burn tokens only if there's useful work
- Lead with the insight, not the process
- Be specific: file:line, commit SHA, branch name
- If nothing interesting happened, say nothing`;

/**
 * Build the effective system prompt for Vigil's LLM calls.
 *
 * Priority (matches Kairos pattern from systemPrompt.ts):
 * 1. Custom agent definition (from .claude/agents/vigil.md)
 *    - In proactive mode: APPENDED to default (Kairos pattern)
 *    - Otherwise: REPLACES default
 * 2. Custom instructions (from CLI flag or config)
 * 3. Default Vigil prompt
 *
 * Plus: repo context is always injected as a structured section.
 */
export function buildVigilSystemPrompt(config: SystemPromptConfig): string {
  const sections: string[] = [];

  // Base prompt — agent definition or default
  if (config.agentDefinition && config.isProactive) {
    // Proactive mode: agent instructions supplement default
    // (Kairos pattern: agents add domain-specific behavior on top)
    sections.push(DEFAULT_VIGIL_PROMPT);
    sections.push(
      `\n# Custom Agent Instructions\n${config.agentDefinition.systemPrompt}`
    );
  } else if (config.agentDefinition) {
    // Non-proactive: agent replaces default entirely
    sections.push(config.agentDefinition.systemPrompt);
  } else if (config.customInstructions) {
    sections.push(config.customInstructions);
  } else {
    sections.push(DEFAULT_VIGIL_PROMPT);
  }

  // Repo context — always injected
  sections.push(buildRepoContextSection(config.repoContext));

  // Custom instructions append (if agent is also present)
  if (config.agentDefinition && config.customInstructions) {
    sections.push(`\n# Additional Instructions\n${config.customInstructions}`);
  }

  return sections.join("\n\n");
}

function buildRepoContextSection(ctx: RepoContext): string {
  return `# Current Repository Context
- **Repository**: ${ctx.repoName}
- **Branch**: ${ctx.currentBranch}
- **Recent commits**: ${ctx.recentCommits.length > 0 ? ctx.recentCommits.join(", ") : "none"}
- **Uncommitted files**: ${ctx.uncommittedFiles.length > 0 ? ctx.uncommittedFiles.join(", ") : "clean"}`;
}
```

### 8.3 Example Agent File

**File: `.claude/agents/vigil.md`** (user creates this per-repo)

```markdown
---
name: vigil-security
description: Security-focused git monitor for the payments service
model: sonnet
tools:
  - grep
  - read
  - bash
watchPatterns:
  - "src/auth/**"
  - "src/payments/**"
  - "*.env*"
  - "docker-compose*.yml"
triggerEvents:
  - new_commit
  - branch_switch
  - uncommitted_drift
---

# Security Monitor — Payments Service

You are a security-focused git watcher for the payments service.

## Priority Signals (always flag these)
- Changes to auth middleware or session handling
- New environment variables or secret references
- Dependency updates in package.json (especially auth libs)
- Changes to Dockerfile or docker-compose (port exposure, volume mounts)
- Any file touching `src/payments/` with SQL or ORM queries

## Ignore
- README/docs-only commits
- Test file additions (unless they remove security tests)
- Style/lint changes

## Tone
Direct, concise. Lead with severity. Example:
"🔴 HIGH: `src/auth/middleware.ts` — session token validation removed in commit abc1234"
```

### 8.4 Integration with Decision Engine

**Modify: `src/core/decision-engine.ts`** — Load agent definition and pass to LLM calls

```typescript
import { loadAgentDefinition, type AgentDefinition } from "../agent/agentLoader.js";
import { buildVigilSystemPrompt } from "../agent/systemPrompt.js";

export class DecisionEngine {
  private agentDefinition: AgentDefinition | null = null;

  async initialize(repoPath: string): Promise<void> {
    // Load agent identity at startup (Kairos pattern: one-time load)
    this.agentDefinition = await loadAgentDefinition(repoPath);

    if (this.agentDefinition) {
      this.logger.info(
        `Loaded agent: ${this.agentDefinition.name} — ${this.agentDefinition.description}`
      );
    }
  }

  async analyze(event: GitEvent): Promise<Decision> {
    // Check if agent cares about this event type
    if (this.agentDefinition?.triggerEvents) {
      if (!this.agentDefinition.triggerEvents.includes(event.type)) {
        return { action: "skip", reason: "Agent not subscribed to this event type" };
      }
    }

    // Check if agent cares about these file paths
    if (this.agentDefinition?.watchPatterns && event.files) {
      const matches = event.files.some((f) =>
        this.agentDefinition!.watchPatterns!.some((p) => minimatch(f, p))
      );
      if (!matches) {
        return { action: "skip", reason: "No files match agent watch patterns" };
      }
    }

    // Build system prompt with agent identity
    const systemPrompt = buildVigilSystemPrompt({
      agentDefinition: this.agentDefinition,
      repoContext: await this.getRepoContext(),
      isProactive: this.config.proactiveMode,
      customInstructions: this.config.customInstructions,
    });

    // Pass to LLM with agent-aware prompt
    return this.callLLM(systemPrompt, event);
  }
}
```

---

## Phase 9: Brief Mode / SendUserMessage Tool

> **Goal**: Replace raw console logging with a structured message system. Messages have types, attachments, and status labels — enabling downstream routing (UI, Slack, push).
> **Kairos Reference**: `src/tools/BriefTool/BriefTool.ts`, `src/tools/BriefTool/prompt.ts`
> **Estimated Files Changed**: 3 new, 2 modified

### 9.1 Structured Message Schema

**Kairos Pattern**: The `SendUserMessage` tool uses a Zod schema with `message` (markdown), `attachments` (file paths), and `status` ('normal' | 'proactive'). Output includes resolved attachment metadata with sizes and types.

**New File: `src/messaging/schema.ts`**

```typescript
import { z } from "zod";

/**
 * Message status labels (Kairos pattern from BriefTool).
 * Downstream routing uses these — set honestly.
 *
 * - 'normal': responding to a detected event
 * - 'proactive': surfacing something unsolicited (risk, pattern, insight)
 * - 'scheduled': triggered by a cron/scheduled task
 * - 'alert': high-priority, needs immediate attention
 */
export const MessageStatus = z.enum([
  "normal",
  "proactive",
  "scheduled",
  "alert",
]);
export type MessageStatus = z.infer<typeof MessageStatus>;

/**
 * Attachment metadata — resolved at send time, not at creation.
 * Kairos ref: BriefTool outputSchema
 */
export const AttachmentSchema = z.object({
  path: z.string(),
  size: z.number(),
  isImage: z.boolean(),
  mimeType: z.string().optional(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

/**
 * Core message schema — the structured unit of Vigil output.
 * Every notification, alert, and insight flows through this.
 */
export const VigilMessageSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  source: z.object({
    repo: z.string(),
    branch: z.string().optional(),
    event: z.string().optional(),   // The git event that triggered this
    agent: z.string().optional(),   // Which agent identity produced this
  }),
  status: MessageStatus,
  severity: z.enum(["info", "warning", "critical"]).default("info"),
  message: z.string().describe("Markdown-formatted message body"),
  attachments: z.array(AttachmentSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type VigilMessage = z.infer<typeof VigilMessageSchema>;

/**
 * Message creation helper — fills defaults.
 */
export function createMessage(
  partial: Pick<VigilMessage, "source" | "status" | "message"> &
    Partial<VigilMessage>
): VigilMessage {
  return VigilMessageSchema.parse({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    severity: "info",
    attachments: [],
    metadata: {},
    ...partial,
  });
}
```

### 9.2 Message Router

**Kairos Pattern**: In Brief mode, `SendUserMessage` is the primary output channel. Plain text goes to "detail view" (hidden by default). The router decides which delivery channels receive each message.

**New File: `src/messaging/router.ts`**

```typescript
import type { VigilMessage, MessageStatus } from "./schema.js";
import { EventEmitter } from "events";

/**
 * Delivery channel interface — each destination implements this.
 * Kairos uses tool-based routing; Vigil uses channel-based routing
 * since it's a daemon, not an interactive session.
 */
export interface DeliveryChannel {
  name: string;
  isEnabled(): boolean;
  /**
   * Filter: should this channel receive this message?
   * Channels can filter by status, severity, source, etc.
   */
  accepts(message: VigilMessage): boolean;
  deliver(message: VigilMessage): Promise<DeliveryResult>;
}

export interface DeliveryResult {
  channel: string;
  success: boolean;
  error?: string;
  externalId?: string; // Slack message ID, email ID, etc.
}

/**
 * Message router — takes structured messages and fans out to
 * registered delivery channels.
 *
 * Kairos routes via tool selection (model picks SendUserMessage vs MCP tool).
 * Vigil routes via config (user declares which channels get which messages).
 */
export class MessageRouter extends EventEmitter {
  private channels: DeliveryChannel[] = [];
  private history: VigilMessage[] = [];
  private maxHistory = 1000;

  registerChannel(channel: DeliveryChannel): void {
    this.channels.push(channel);
  }

  async route(message: VigilMessage): Promise<DeliveryResult[]> {
    // Store in history (ring buffer)
    this.history.push(message);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Fan out to all accepting channels
    const targets = this.channels.filter(
      (ch) => ch.isEnabled() && ch.accepts(message)
    );

    if (targets.length === 0) {
      // Kairos pattern: if Brief is the only output and user doesn't
      // see it, the message is lost. Always have a fallback.
      this.emit("undelivered", message);
      return [];
    }

    const results = await Promise.allSettled(
      targets.map(async (ch) => {
        try {
          return await ch.deliver(message);
        } catch (err) {
          return {
            channel: ch.name,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })
    );

    const delivered = results.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : { channel: "unknown", success: false, error: String(r.reason) }
    );

    this.emit("delivered", { message, results: delivered });
    return delivered;
  }

  getHistory(filter?: { status?: MessageStatus; limit?: number }): VigilMessage[] {
    let msgs = this.history;
    if (filter?.status) {
      msgs = msgs.filter((m) => m.status === filter.status);
    }
    if (filter?.limit) {
      msgs = msgs.slice(-filter.limit);
    }
    return msgs;
  }
}
```

### 9.3 Built-in Delivery Channels

**New File: `src/messaging/channels/console.ts`**

```typescript
import type { DeliveryChannel, DeliveryResult } from "../router.js";
import type { VigilMessage } from "../schema.js";

const SEVERITY_PREFIXES = {
  info: "ℹ️",
  warning: "⚠️",
  critical: "🔴",
} as const;

/**
 * Console channel — always-on fallback.
 * Kairos equivalent: the "detail view" text output.
 */
export class ConsoleChannel implements DeliveryChannel {
  name = "console";

  isEnabled(): boolean {
    return true; // Always on — fallback channel
  }

  accepts(): boolean {
    return true; // Accepts everything
  }

  async deliver(message: VigilMessage): Promise<DeliveryResult> {
    const prefix = SEVERITY_PREFIXES[message.severity];
    const source = `[${message.source.repo}${message.source.branch ? `:${message.source.branch}` : ""}]`;
    const statusTag = message.status !== "normal" ? ` (${message.status})` : "";

    console.log(`${prefix} ${source}${statusTag} ${message.message}`);

    if (message.attachments.length > 0) {
      console.log(
        `  📎 ${message.attachments.length} attachment(s): ${message.attachments.map((a) => a.path).join(", ")}`
      );
    }

    return { channel: this.name, success: true };
  }
}
```

**New File: `src/messaging/channels/jsonl.ts`**

```typescript
import * as fs from "fs/promises";
import type { DeliveryChannel, DeliveryResult } from "../router.js";
import type { VigilMessage } from "../schema.js";

/**
 * JSONL file channel — append-only structured log.
 * Queryable via jq, loadable by downstream tools.
 */
export class JsonlChannel implements DeliveryChannel {
  name = "jsonl";

  constructor(private filePath: string) {}

  isEnabled(): boolean {
    return true;
  }

  accepts(): boolean {
    return true; // Log everything
  }

  async deliver(message: VigilMessage): Promise<DeliveryResult> {
    const line = JSON.stringify(message) + "\n";
    await fs.appendFile(this.filePath, line, "utf-8");
    return { channel: this.name, success: true };
  }
}
```

### 9.4 Display Filtering (Brief Mode Pattern)

**Kairos Pattern**: When `isBriefOnly` is true, only `SendUserMessage` output is shown to the user. Plain text is hidden in "detail view". This prevents noise while preserving full logs.

**New File: `src/messaging/displayFilter.ts`**

```typescript
import type { VigilMessage, MessageStatus } from "./schema.js";

export interface DisplayFilterConfig {
  /** Show only these statuses in primary output */
  showStatuses: MessageStatus[];
  /** Minimum severity for primary output */
  minSeverity: "info" | "warning" | "critical";
  /** Suppress duplicate messages within this window (ms) */
  dedupeWindowMs: number;
}

const DEFAULT_FILTER: DisplayFilterConfig = {
  showStatuses: ["proactive", "alert", "scheduled"],
  minSeverity: "info",
  dedupeWindowMs: 60_000,
};

const SEVERITY_ORDER = { info: 0, warning: 1, critical: 2 } as const;

/**
 * Display filter — decides which messages the user actually sees.
 *
 * Kairos ref: components/Spinner.tsx filters on isBriefOnly.
 * Vigil equivalent: filter messages before routing to "primary"
 * channels (console, push) vs "detail" channels (jsonl, file log).
 */
export class DisplayFilter {
  private config: DisplayFilterConfig;
  private recentHashes = new Map<string, number>(); // hash -> timestamp

  constructor(config: Partial<DisplayFilterConfig> = {}) {
    this.config = { ...DEFAULT_FILTER, ...config };
  }

  /**
   * Returns true if this message should be shown in the primary display.
   * Messages that fail this filter still go to detail/log channels.
   */
  shouldDisplay(message: VigilMessage): boolean {
    // Status filter
    if (!this.config.showStatuses.includes(message.status)) {
      return false;
    }

    // Severity filter
    if (SEVERITY_ORDER[message.severity] < SEVERITY_ORDER[this.config.minSeverity]) {
      return false;
    }

    // Dedup filter — suppress near-identical messages within window
    const hash = this.hashMessage(message);
    const lastSeen = this.recentHashes.get(hash);
    const now = Date.now();

    if (lastSeen && now - lastSeen < this.config.dedupeWindowMs) {
      return false; // Duplicate within window
    }

    this.recentHashes.set(hash, now);
    this.pruneHashes(now);
    return true;
  }

  private hashMessage(msg: VigilMessage): string {
    // Hash on source + first 100 chars of message (dedup similar alerts)
    const key = `${msg.source.repo}:${msg.source.event}:${msg.message.slice(0, 100)}`;
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    }
    return hash.toString(36);
  }

  private pruneHashes(now: number): void {
    for (const [hash, ts] of this.recentHashes) {
      if (now - ts > this.config.dedupeWindowMs) {
        this.recentHashes.delete(hash);
      }
    }
  }
}
```

---

## Phase 10: Proactive Mode / Tick-Driven Work Cycles

> **Goal**: Make Vigil's tick engine smart — adaptive sleep, useful-work detection, and `<tick>` prompts that the LLM can reason about.
> **Kairos Reference**: `src/tools/SleepTool/prompt.ts`, `src/constants/prompts.ts` (proactive section)
> **Estimated Files Changed**: 2 new, 2 modified

### 10.1 Useful Work Detection

**Kairos Pattern**: Proactive mode instructions say "Never respond with only a status message — burn tokens only if there's useful work." The model gets `<tick>` prompts and decides whether to act or sleep.

**New File: `src/core/work-detector.ts`**

```typescript
/**
 * Work detector — decides if a tick should trigger LLM analysis or
 * be skipped. Prevents wasting tokens on "nothing happened" ticks.
 *
 * Kairos ref: constants/prompts.ts PROACTIVE_SECTION
 * "Investigate, reduce risk, verify assumptions" — but only when
 * there's actually something to investigate.
 */

export interface WorkSignal {
  type: "new_commit" | "branch_switch" | "uncommitted_drift" | "rebase_detected" | "file_change";
  weight: number;      // 0.0–1.0 importance score
  description: string;
  timestamp: number;
}

export interface WorkDetectorConfig {
  /** Minimum accumulated weight to trigger LLM call */
  triggerThreshold: number;
  /** Maximum time (ms) without any LLM call — forces a heartbeat check */
  maxSilenceMs: number;
  /** Weight decay rate per second — old signals lose relevance */
  decayRatePerSec: number;
}

const DEFAULT_CONFIG: WorkDetectorConfig = {
  triggerThreshold: 0.5,
  maxSilenceMs: 30 * 60 * 1000, // 30 min max silence
  decayRatePerSec: 0.001,
};

export class WorkDetector {
  private signals: WorkSignal[] = [];
  private lastLLMCallAt: number = Date.now();
  private config: WorkDetectorConfig;

  constructor(config: Partial<WorkDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  addSignal(signal: WorkSignal): void {
    this.signals.push(signal);
  }

  /**
   * Should the current tick trigger an LLM analysis?
   * Returns the signals that justify the call, or null if no work needed.
   *
   * Three triggers:
   * 1. Accumulated signal weight exceeds threshold
   * 2. Max silence timer expired (heartbeat)
   * 3. Critical signal (weight >= 0.9) — immediate
   */
  shouldAnalyze(): { reason: string; signals: WorkSignal[] } | null {
    const now = Date.now();

    // Apply time decay to signals
    const activeSignals = this.signals
      .map((s) => ({
        ...s,
        weight: s.weight * Math.exp(
          -this.config.decayRatePerSec * ((now - s.timestamp) / 1000)
        ),
      }))
      .filter((s) => s.weight > 0.01); // Prune negligible signals

    // Check for critical signals (immediate trigger)
    const critical = activeSignals.filter((s) => s.weight >= 0.9);
    if (critical.length > 0) {
      this.consumeSignals();
      return { reason: "critical_signal", signals: critical };
    }

    // Check accumulated weight
    const totalWeight = activeSignals.reduce((sum, s) => sum + s.weight, 0);
    if (totalWeight >= this.config.triggerThreshold) {
      this.consumeSignals();
      return { reason: "threshold_exceeded", signals: activeSignals };
    }

    // Check max silence (heartbeat)
    const silenceMs = now - this.lastLLMCallAt;
    if (silenceMs >= this.config.maxSilenceMs) {
      this.consumeSignals();
      return {
        reason: "heartbeat",
        signals: activeSignals.length > 0 ? activeSignals : [],
      };
    }

    return null; // No useful work — skip this tick
  }

  private consumeSignals(): void {
    this.signals = [];
    this.lastLLMCallAt = Date.now();
  }
}
```

### 10.2 Adaptive Sleep with SleepTool Pattern

**Kairos Pattern**: `SleepTool` lets the LLM control how long to wait. `<tick>` prompts wake it periodically. Sleep duration adapts based on activity level.

**New File: `src/core/adaptive-sleep.ts`**

```typescript
/**
 * Adaptive sleep — dynamically adjusts tick intervals based on
 * repository activity. Quiet repos get longer intervals; active
 * repos get shorter ones.
 *
 * Kairos ref: SleepTool prompt — "balance accordingly" between
 * wake-up API cost and prompt cache expiry (5 min).
 */

export interface SleepConfig {
  /** Base tick interval (seconds) */
  baseTick: number;
  /** Minimum tick interval when highly active (seconds) */
  minTick: number;
  /** Maximum tick interval when idle (seconds) */
  maxTick: number;
  /** Prompt cache expiry — avoid sleeping longer than this */
  cacheExpiryMs: number;
}

const DEFAULT_SLEEP: SleepConfig = {
  baseTick: 60,
  minTick: 15,
  maxTick: 300,
  cacheExpiryMs: 5 * 60 * 1000, // 5 min (Kairos SleepTool prompt)
};

export class AdaptiveSleep {
  private config: SleepConfig;
  private activityHistory: number[] = []; // timestamps of recent events
  private readonly historyWindow = 10 * 60 * 1000; // 10 min window

  constructor(config: Partial<SleepConfig> = {}) {
    this.config = { ...DEFAULT_SLEEP, ...config };
  }

  recordActivity(): void {
    this.activityHistory.push(Date.now());
  }

  /**
   * Compute next sleep duration based on recent activity.
   *
   * Activity rate → interval mapping:
   * - High activity (5+ events/10min): minTick
   * - Normal (1-4 events/10min): baseTick
   * - Idle (0 events/10min): maxTick (capped at cache expiry)
   */
  getNextInterval(): number {
    const now = Date.now();
    const cutoff = now - this.historyWindow;

    // Prune old events
    this.activityHistory = this.activityHistory.filter((t) => t > cutoff);
    const eventCount = this.activityHistory.length;

    let intervalSec: number;
    if (eventCount >= 5) {
      intervalSec = this.config.minTick;
    } else if (eventCount >= 1) {
      // Linear interpolation between minTick and baseTick
      const ratio = eventCount / 5;
      intervalSec =
        this.config.baseTick -
        ratio * (this.config.baseTick - this.config.minTick);
    } else {
      intervalSec = this.config.maxTick;
    }

    // Cap at cache expiry to avoid cache misses (Kairos SleepTool insight)
    const maxFromCache = this.config.cacheExpiryMs / 1000;
    intervalSec = Math.min(intervalSec, maxFromCache);

    return Math.round(intervalSec);
  }

  /**
   * Format a <tick> prompt for the LLM (Kairos pattern).
   * Includes context about why the tick fired and what's pending.
   */
  formatTickPrompt(context: {
    signals: Array<{ type: string; description: string }>;
    timeSinceLastTick: number;
    isHeartbeat: boolean;
  }): string {
    const lines = [`<tick timestamp="${new Date().toISOString()}">`];

    if (context.isHeartbeat) {
      lines.push(
        `  Heartbeat — ${Math.round(context.timeSinceLastTick / 1000)}s since last check.`
      );
      lines.push("  No new signals. Look for useful work or sleep.");
    } else {
      lines.push(`  ${context.signals.length} signal(s) since last tick:`);
      for (const s of context.signals) {
        lines.push(`  - [${s.type}] ${s.description}`);
      }
    }

    lines.push("</tick>");
    return lines.join("\n");
  }
}
```

### 10.3 Integration with Tick Engine

**Modify: `src/core/tick-engine.ts`**

```typescript
import { WorkDetector, type WorkSignal } from "./work-detector.js";
import { AdaptiveSleep } from "./adaptive-sleep.js";

export class TickEngine {
  private workDetector: WorkDetector;
  private adaptiveSleep: AdaptiveSleep;

  constructor(config: TickEngineConfig) {
    this.workDetector = new WorkDetector(config.workDetection);
    this.adaptiveSleep = new AdaptiveSleep(config.sleep);
  }

  /**
   * Feed git events into the work detector as signals.
   */
  onGitEvent(event: GitEvent): void {
    const weight = this.computeEventWeight(event);
    this.workDetector.addSignal({
      type: event.type,
      weight,
      description: this.describeEvent(event),
      timestamp: Date.now(),
    });
    this.adaptiveSleep.recordActivity();
  }

  /**
   * Tick handler — called on each interval. Checks if there's
   * useful work before spending tokens.
   */
  private async onTick(): Promise<void> {
    const analysis = this.workDetector.shouldAnalyze();

    if (!analysis) {
      // Nothing to do — reschedule with adaptive interval
      this.scheduleNext();
      return;
    }

    // Format <tick> prompt for LLM (Kairos proactive pattern)
    const tickPrompt = this.adaptiveSleep.formatTickPrompt({
      signals: analysis.signals.map((s) => ({
        type: s.type,
        description: s.description,
      })),
      timeSinceLastTick: Date.now() - this.lastTickAt,
      isHeartbeat: analysis.reason === "heartbeat",
    });

    // Send to decision engine with tick context
    await this.decisionEngine.analyzeWithTick(tickPrompt, analysis.signals);

    this.lastTickAt = Date.now();
    this.scheduleNext();
  }

  private scheduleNext(): void {
    const intervalSec = this.adaptiveSleep.getNextInterval();
    this.timer = setTimeout(() => this.onTick(), intervalSec * 1000);
  }

  private computeEventWeight(event: GitEvent): number {
    switch (event.type) {
      case "new_commit":        return 0.7;
      case "branch_switch":     return 0.5;
      case "rebase_detected":   return 0.9; // Critical — cache invalidation
      case "uncommitted_drift": return 0.3;
      case "file_change":       return 0.2;
      default:                  return 0.1;
    }
  }

  private describeEvent(event: GitEvent): string {
    switch (event.type) {
      case "new_commit":
        return `New commit on ${event.branch}: ${event.detail}`;
      case "branch_switch":
        return `Branch switch: ${event.detail}`;
      case "rebase_detected":
        return `Rebase/reset detected on ${event.branch}`;
      case "uncommitted_drift":
        return `Uncommitted changes for ${event.detail}`;
      default:
        return event.detail ?? event.type;
    }
  }
}
```

---

## Phase 11: Channel Notifications from MCP Servers

> **Goal**: Let external MCP servers push inbound messages into Vigil's processing pipeline. Servers declare capabilities; Vigil gates access through layered permissions.
> **Kairos Reference**: `src/services/mcp/channelNotification.ts`
> **Estimated Files Changed**: 4 new, 1 modified

### 11.1 Channel Notification Schema

**Kairos Pattern**: MCP servers send `notifications/claude/channel` with content + meta. Vigil wraps the content in a `<channel>` XML tag and enqueues it. Multi-gate activation chain: capability → runtime gate → auth → policy → session → allowlist.

**New File: `src/channels/schema.ts`**

```typescript
import { z } from "zod";

/**
 * Inbound channel message — matches Kairos's
 * ChannelMessageNotificationSchema exactly.
 *
 * Kairos ref: services/mcp/channelNotification.ts
 */
export const ChannelMessageSchema = z.object({
  method: z.literal("notifications/vigil/channel"),
  params: z.object({
    content: z.string(),
    // Opaque passthrough — thread_id, user, platform metadata.
    // Rendered as attributes on the <channel> tag.
    meta: z.record(z.string(), z.string()).optional(),
  }),
});
export type ChannelMessage = z.infer<typeof ChannelMessageSchema>;

/**
 * Permission reply from a channel server.
 * Kairos ref: ChannelPermissionNotificationSchema
 */
export const ChannelPermissionSchema = z.object({
  method: z.literal("notifications/vigil/channel/permission"),
  params: z.object({
    request_id: z.string(),
    behavior: z.enum(["allow", "deny"]),
  }),
});

/**
 * Channel server capability declaration.
 * Server must expose this in capabilities to be eligible.
 */
export interface ChannelCapability {
  "vigil/channel": {};
  "vigil/channel/permission"?: {}; // Optional permission workflow support
}

/**
 * Registered channel entry.
 */
export interface ChannelEntry {
  kind: "plugin" | "server";
  name: string;
  serverUrl: string;
  dev?: boolean;      // Loaded via --dangerously-load-development-channels
  capabilities: ChannelCapability;
}

/**
 * Wrap a channel message in XML tags for LLM consumption.
 * Kairos ref: channelNotification.ts — uses CHANNEL_TAG constant.
 */
export function wrapChannelMessage(
  source: string,
  content: string,
  meta?: Record<string, string>
): string {
  const attrs = meta
    ? Object.entries(meta)
        .map(([k, v]) => ` ${escapeXmlAttr(k)}="${escapeXmlAttr(v)}"`)
        .join("")
    : "";

  return `<channel source="${escapeXmlAttr(source)}"${attrs}>\n${content}\n</channel>`;
}

function escapeXmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
```

### 11.2 Channel Gate Chain

**Kairos Pattern**: 6-layer activation chain — each gate independently disables the feature.

**New File: `src/channels/gate.ts`**

```typescript
import type { ChannelEntry } from "./schema.js";
import { getFeatureGate } from "../core/feature-gates.js";

/**
 * Multi-gate activation chain for channel notifications.
 * Each layer can independently block — mirrors Kairos's 6-gate pattern.
 *
 * Kairos ref: channelNotification.ts isChannelAllowed() flow
 *
 * Gate order (cheapest checks first):
 * 1. Build-time: feature('VIGIL_CHANNELS') — compiled out if disabled
 * 2. Runtime: feature gate check (kill-switch, refreshed with TTL)
 * 3. Auth: require authenticated connection (no anonymous channels)
 * 4. Policy: organization/team settings must allow channels
 * 5. Session: server must be declared in --channels flag
 * 6. Allowlist: server must be in approved list (or dev mode)
 */
export interface GateContext {
  featureEnabled: boolean;         // Gate 1: build-time flag
  runtimeEnabled: boolean;         // Gate 2: runtime kill-switch
  isAuthenticated: boolean;        // Gate 3: auth check
  orgChannelsAllowed: boolean;     // Gate 4: org policy
  sessionChannels: string[];       // Gate 5: --channels flag values
  allowlist: string[];             // Gate 6: approved servers
  devMode: boolean;                // Bypass gate 6 for dev
}

export interface GateResult {
  allowed: boolean;
  deniedAt?: string;  // Which gate blocked
  reason?: string;
}

export function checkChannelGates(
  channel: ChannelEntry,
  ctx: GateContext
): GateResult {
  // Gate 1: Build-time feature flag
  if (!ctx.featureEnabled) {
    return { allowed: false, deniedAt: "build-time", reason: "VIGIL_CHANNELS not enabled" };
  }

  // Gate 2: Runtime kill-switch (TTL-refreshed)
  if (!ctx.runtimeEnabled) {
    return { allowed: false, deniedAt: "runtime", reason: "Channels disabled via runtime gate" };
  }

  // Gate 3: Auth requirement
  if (!ctx.isAuthenticated) {
    return { allowed: false, deniedAt: "auth", reason: "Channel requires authenticated connection" };
  }

  // Gate 4: Organization policy
  if (!ctx.orgChannelsAllowed) {
    return { allowed: false, deniedAt: "policy", reason: "Organization has not enabled channels" };
  }

  // Gate 5: Session declaration
  if (!ctx.sessionChannels.includes(channel.name)) {
    return { allowed: false, deniedAt: "session", reason: `Channel "${channel.name}" not declared in --channels` };
  }

  // Gate 6: Allowlist (bypassed in dev mode)
  if (!channel.dev && !ctx.devMode && !ctx.allowlist.includes(channel.name)) {
    return { allowed: false, deniedAt: "allowlist", reason: `Channel "${channel.name}" not in approved list` };
  }

  return { allowed: true };
}
```

### 11.3 Channel Handler

**New File: `src/channels/handler.ts`**

```typescript
import { ChannelMessageSchema, wrapChannelMessage, type ChannelEntry } from "./schema.js";
import { checkChannelGates, type GateContext } from "./gate.js";
import { createMessage, type VigilMessage } from "../messaging/schema.js";
import type { MessageRouter } from "../messaging/router.js";
import { EventEmitter } from "events";

/**
 * Channel notification handler — processes inbound MCP server messages.
 *
 * Kairos ref: channelNotification.ts
 * "SleepTool polls hasCommandsInQueue() and wakes within 1s.
 *  The model sees where the message came from and decides which
 *  tool to reply with."
 */
export class ChannelHandler extends EventEmitter {
  private channels = new Map<string, ChannelEntry>();
  private messageQueue: VigilMessage[] = [];

  constructor(
    private router: MessageRouter,
    private getGateContext: () => GateContext
  ) {
    super();
  }

  /**
   * Register a channel server after capability negotiation.
   */
  registerChannel(entry: ChannelEntry): void {
    const ctx = this.getGateContext();
    const result = checkChannelGates(entry, ctx);

    if (!result.allowed) {
      this.emit("channel_rejected", {
        channel: entry.name,
        gate: result.deniedAt,
        reason: result.reason,
      });
      return;
    }

    this.channels.set(entry.name, entry);
    this.emit("channel_registered", { channel: entry.name });
  }

  /**
   * Handle inbound notification from MCP server.
   * Validates schema, wraps in XML tag, routes as structured message.
   */
  async handleNotification(
    serverName: string,
    raw: unknown
  ): Promise<void> {
    // Validate channel is registered
    const channel = this.channels.get(serverName);
    if (!channel) {
      this.emit("notification_rejected", {
        server: serverName,
        reason: "Server not registered as channel",
      });
      return;
    }

    // Validate message schema
    const parsed = ChannelMessageSchema.safeParse(raw);
    if (!parsed.success) {
      this.emit("notification_rejected", {
        server: serverName,
        reason: `Invalid schema: ${parsed.error.message}`,
      });
      return;
    }

    const { content, meta } = parsed.data.params;

    // Wrap in XML for LLM consumption (Kairos pattern)
    const wrapped = wrapChannelMessage(serverName, content, meta);

    // Create structured message and route
    const message = createMessage({
      source: {
        repo: "channel",
        event: `channel:${serverName}`,
        agent: meta?.user ?? serverName,
      },
      status: "proactive",
      message: wrapped,
      metadata: { channelSource: serverName, ...meta },
    });

    // Queue for next tick (SleepTool wake pattern)
    this.messageQueue.push(message);
    this.emit("notification_queued", { server: serverName });

    // Route immediately to non-tick channels (console, jsonl)
    await this.router.route(message);
  }

  /**
   * Check if there are queued channel messages (polled by tick engine).
   * Kairos ref: "SleepTool polls hasCommandsInQueue()"
   */
  hasQueuedMessages(): boolean {
    return this.messageQueue.length > 0;
  }

  drainQueue(): VigilMessage[] {
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    return messages;
  }
}
```

### 11.4 Permission Workflow

**New File: `src/channels/permissions.ts`**

```typescript
import { randomBytes } from "crypto";

interface PendingPermission {
  requestId: string;
  channelName: string;
  toolName: string;
  createdAt: number;
  expiresAt: number;
  resolve: (granted: boolean) => void;
}

/**
 * Permission workflow for channel tool use.
 * When the LLM wants to use a channel's tool (e.g., send a Slack message),
 * the user must approve via the channel itself.
 *
 * Kairos ref: channelNotification.ts CHANNEL_PERMISSION_METHOD
 * "Server parses the user's reply and emits {request_id, behavior}"
 */
export class ChannelPermissionManager {
  private pending = new Map<string, PendingPermission>();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 min expiry

  /**
   * Request permission for a tool use via channel.
   * Returns a promise that resolves when user responds.
   */
  async requestPermission(
    channelName: string,
    toolName: string,
    description: string
  ): Promise<boolean> {
    // Generate unique request ID (5-char alphanumeric, Kairos pattern)
    const requestId = randomBytes(3).toString("hex").slice(0, 5);

    return new Promise<boolean>((resolve) => {
      const entry: PendingPermission = {
        requestId,
        channelName,
        toolName,
        createdAt: Date.now(),
        expiresAt: Date.now() + this.TTL_MS,
        resolve,
      };

      this.pending.set(requestId, entry);

      // Auto-expire
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          resolve(false); // Expired = denied
        }
      }, this.TTL_MS);
    });
  }

  /**
   * Handle permission response from channel server.
   * Kairos ref: ChannelPermissionNotificationSchema
   */
  handlePermissionResponse(requestId: string, behavior: "allow" | "deny"): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;

    this.pending.delete(requestId);
    entry.resolve(behavior === "allow");
    return true;
  }
}
```

---

## Phase 12: GitHub Webhooks / SubscribePR

> **Goal**: React to GitHub events (PRs, issues, reviews) via webhooks instead of local git polling only.
> **Kairos Reference**: `feature('KAIROS_GITHUB_WEBHOOKS')`, SubscribePRTool (planned)
> **Estimated Files Changed**: 4 new, 1 modified

### 12.1 Webhook Server

**New File: `src/webhooks/server.ts`**

```typescript
import * as http from "http";
import * as crypto from "crypto";
import { z } from "zod";
import type { EventEmitter } from "events";

export interface WebhookConfig {
  port: number;
  secret: string;          // HMAC secret for signature verification
  path: string;            // Webhook endpoint path
  allowedEvents: string[]; // GitHub event types to accept
}

const DEFAULT_CONFIG: WebhookConfig = {
  port: 7433, // VIGIL on phone keypad
  secret: "",
  path: "/webhook/github",
  allowedEvents: [
    "pull_request",
    "pull_request_review",
    "push",
    "issues",
    "issue_comment",
  ],
};

/**
 * Lightweight webhook HTTP server for GitHub events.
 * Validates signatures, parses payloads, emits typed events.
 *
 * Kairos context: SubscribePRTool is planned but not yet implemented.
 * This is the full implementation of that concept.
 */
export class WebhookServer {
  private server: http.Server | null = null;
  private config: WebhookConfig;

  constructor(
    private emitter: EventEmitter,
    config: Partial<WebhookConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));

    return new Promise((resolve, reject) => {
      this.server!.listen(this.config.port, () => {
        this.emitter.emit("webhook_server_started", { port: this.config.port });
        resolve();
      });
      this.server!.on("error", reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server?.close(() => resolve());
    });
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    // Only accept POST to configured path
    if (req.method !== "POST" || req.url !== this.config.path) {
      res.writeHead(404);
      res.end();
      return;
    }

    const body = await this.readBody(req);

    // Verify GitHub HMAC signature
    if (this.config.secret) {
      const signature = req.headers["x-hub-signature-256"] as string;
      if (!this.verifySignature(body, signature)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid signature" }));
        return;
      }
    }

    // Parse event type
    const eventType = req.headers["x-github-event"] as string;
    if (!eventType || !this.config.allowedEvents.includes(eventType)) {
      res.writeHead(200); // Accept but ignore
      res.end();
      return;
    }

    // Parse payload
    try {
      const payload = JSON.parse(body);
      this.emitter.emit("webhook_event", {
        type: eventType,
        action: payload.action,
        payload,
        receivedAt: Date.now(),
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ received: true }));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
    }
  }

  private verifySignature(body: string, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected =
      "sha256=" +
      crypto
        .createHmac("sha256", this.config.secret)
        .update(body)
        .digest("hex");
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString()));
      req.on("error", reject);
    });
  }
}
```

### 12.2 PR Subscription Manager

**New File: `src/webhooks/subscriptions.ts`**

```typescript
import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";

const SubscriptionSchema = z.object({
  id: z.string(),
  repo: z.string(),           // "owner/repo"
  prNumber: z.number(),
  events: z.array(z.string()), // ["opened", "review_submitted", "merged"]
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  active: z.boolean().default(true),
});
type Subscription = z.infer<typeof SubscriptionSchema>;

/**
 * PR subscription manager — tracks which PRs Vigil is watching
 * and what events to react to.
 *
 * Kairos planned this as SubscribePRTool. This is the data layer.
 * File-backed for persistence across restarts (Kairos cron pattern).
 */
export class SubscriptionManager {
  private subscriptions = new Map<string, Subscription>();
  private filePath: string;

  constructor(configDir: string) {
    this.filePath = path.join(configDir, "pr_subscriptions.json");
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const item of data) {
          const parsed = SubscriptionSchema.safeParse(item);
          if (parsed.success) {
            this.subscriptions.set(parsed.data.id, parsed.data);
          }
          // Silently drop invalid entries (Kairos graceful degradation)
        }
      }
    } catch {
      // No file = no subscriptions — not an error
    }
  }

  async save(): Promise<void> {
    const data = Array.from(this.subscriptions.values());
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  subscribe(repo: string, prNumber: number, events: string[]): Subscription {
    const sub: Subscription = {
      id: crypto.randomUUID().slice(0, 8), // Kairos pattern: short IDs
      repo,
      prNumber,
      events,
      createdAt: new Date().toISOString(),
      active: true,
    };
    this.subscriptions.set(sub.id, sub);
    return sub;
  }

  unsubscribe(id: string): boolean {
    return this.subscriptions.delete(id);
  }

  /**
   * Match a webhook event against active subscriptions.
   * Returns matching subscriptions.
   */
  match(repo: string, prNumber: number, action: string): Subscription[] {
    return Array.from(this.subscriptions.values()).filter(
      (s) =>
        s.active &&
        s.repo === repo &&
        s.prNumber === prNumber &&
        s.events.includes(action)
    );
  }

  list(filter?: { repo?: string; active?: boolean }): Subscription[] {
    let subs = Array.from(this.subscriptions.values());
    if (filter?.repo) subs = subs.filter((s) => s.repo === filter.repo);
    if (filter?.active !== undefined) subs = subs.filter((s) => s.active === filter.active);
    return subs;
  }
}
```

### 12.3 Webhook Event Processor

**New File: `src/webhooks/processor.ts`**

```typescript
import type { SubscriptionManager } from "./subscriptions.js";
import { createMessage } from "../messaging/schema.js";
import type { MessageRouter } from "../messaging/router.js";

interface WebhookEvent {
  type: string;
  action: string;
  payload: Record<string, unknown>;
  receivedAt: number;
}

/**
 * Processes webhook events against subscriptions and generates
 * structured messages for the routing pipeline.
 */
export class WebhookProcessor {
  constructor(
    private subscriptions: SubscriptionManager,
    private router: MessageRouter
  ) {}

  async process(event: WebhookEvent): Promise<void> {
    if (event.type === "pull_request") {
      await this.processPR(event);
    } else if (event.type === "pull_request_review") {
      await this.processPRReview(event);
    } else if (event.type === "push") {
      await this.processPush(event);
    } else if (event.type === "issue_comment") {
      await this.processComment(event);
    }
  }

  private async processPR(event: WebhookEvent): Promise<void> {
    const pr = event.payload.pull_request as Record<string, unknown>;
    const repo = (event.payload.repository as Record<string, unknown>)
      ?.full_name as string;
    const prNumber = pr?.number as number;
    const action = event.action;

    const matches = this.subscriptions.match(repo, prNumber, action);
    if (matches.length === 0) return;

    const title = pr?.title as string;
    const author = (pr?.user as Record<string, unknown>)?.login as string;
    const url = pr?.html_url as string;

    const severity = action === "closed" && (pr?.merged as boolean)
      ? "warning"
      : "info";

    const message = createMessage({
      source: { repo, branch: pr?.head?.ref as string, event: `pr:${action}` },
      status: "proactive",
      severity,
      message: `**PR #${prNumber}** ${action}: [${title}](${url}) by @${author}`,
      metadata: { prNumber, action, author, url },
    });

    await this.router.route(message);
  }

  private async processPRReview(event: WebhookEvent): Promise<void> {
    const review = event.payload.review as Record<string, unknown>;
    const pr = event.payload.pull_request as Record<string, unknown>;
    const repo = (event.payload.repository as Record<string, unknown>)
      ?.full_name as string;
    const prNumber = pr?.number as number;

    const matches = this.subscriptions.match(repo, prNumber, "review_submitted");
    if (matches.length === 0) return;

    const reviewer = (review?.user as Record<string, unknown>)?.login as string;
    const state = review?.state as string;

    const severity = state === "changes_requested" ? "warning" : "info";

    const message = createMessage({
      source: { repo, event: "pr:review" },
      status: "proactive",
      severity,
      message: `**Review on PR #${prNumber}**: ${state} by @${reviewer}`,
      metadata: { prNumber, reviewer, state },
    });

    await this.router.route(message);
  }

  private async processPush(event: WebhookEvent): Promise<void> {
    const repo = (event.payload.repository as Record<string, unknown>)
      ?.full_name as string;
    const ref = event.payload.ref as string;
    const branch = ref?.replace("refs/heads/", "");
    const commits = event.payload.commits as Array<Record<string, unknown>>;

    if (!commits || commits.length === 0) return;

    const message = createMessage({
      source: { repo, branch, event: "push" },
      status: "normal",
      message: `**Push to ${branch}**: ${commits.length} commit(s) — latest: "${commits[commits.length - 1]?.message}"`,
      metadata: { branch, commitCount: commits.length },
    });

    await this.router.route(message);
  }

  private async processComment(event: WebhookEvent): Promise<void> {
    const comment = event.payload.comment as Record<string, unknown>;
    const issue = event.payload.issue as Record<string, unknown>;
    const repo = (event.payload.repository as Record<string, unknown>)
      ?.full_name as string;
    const issueNumber = issue?.number as number;

    // Only process if there's a PR subscription matching this issue number
    const matches = this.subscriptions.match(repo, issueNumber, "commented");
    if (matches.length === 0) return;

    const author = (comment?.user as Record<string, unknown>)?.login as string;
    const body = (comment?.body as string)?.slice(0, 200);

    const message = createMessage({
      source: { repo, event: "issue_comment" },
      status: "proactive",
      message: `**Comment on #${issueNumber}** by @${author}: ${body}`,
      metadata: { issueNumber, author },
    });

    await this.router.route(message);
  }
}
```

---

## Phase 13: Push Notifications (Mobile/Desktop)

> **Goal**: Deliver high-priority Vigil alerts to the user's devices when they're not watching the terminal.
> **Kairos Reference**: `PushNotificationTool` (planned in Kairos), `feature('KAIROS_PUSH_NOTIFICATION')`
> **Estimated Files Changed**: 3 new, 1 modified

### 13.1 Push Notification Service

**New File: `src/notifications/push.ts`**

```typescript
import type { DeliveryChannel, DeliveryResult } from "../messaging/router.js";
import type { VigilMessage } from "../messaging/schema.js";

/**
 * Push notification delivery channel.
 * Supports multiple backends: native OS, ntfy.sh, Pushover, custom webhook.
 *
 * Kairos context: PushNotificationTool is planned but not implemented.
 * This implements the concept with pluggable backends.
 */

export interface PushBackend {
  name: string;
  send(notification: PushNotification): Promise<boolean>;
}

export interface PushNotification {
  title: string;
  body: string;
  priority: "low" | "default" | "high" | "urgent";
  url?: string;         // Click-through URL
  tags?: string[];
  actions?: Array<{
    label: string;
    url: string;
  }>;
}

export interface PushConfig {
  enabled: boolean;
  /** Only push messages at or above this severity */
  minSeverity: "info" | "warning" | "critical";
  /** Only push these status types */
  statuses: string[];
  /** Quiet hours — no push during these times */
  quietHours?: { start: string; end: string }; // "22:00" - "07:00"
  /** Max pushes per hour (rate limit) */
  maxPerHour: number;
}

const DEFAULT_PUSH_CONFIG: PushConfig = {
  enabled: false,
  minSeverity: "warning",
  statuses: ["alert", "proactive"],
  maxPerHour: 10,
};

const SEVERITY_TO_PRIORITY: Record<string, PushNotification["priority"]> = {
  info: "default",
  warning: "high",
  critical: "urgent",
};

export class PushChannel implements DeliveryChannel {
  name = "push";
  private config: PushConfig;
  private backends: PushBackend[] = [];
  private sentTimestamps: number[] = [];

  constructor(config: Partial<PushConfig> = {}) {
    this.config = { ...DEFAULT_PUSH_CONFIG, ...config };
  }

  addBackend(backend: PushBackend): void {
    this.backends.push(backend);
  }

  isEnabled(): boolean {
    return this.config.enabled && this.backends.length > 0;
  }

  accepts(message: VigilMessage): boolean {
    // Severity filter
    const severityOrder = { info: 0, warning: 1, critical: 2 };
    if (severityOrder[message.severity] < severityOrder[this.config.minSeverity]) {
      return false;
    }

    // Status filter
    if (!this.config.statuses.includes(message.status)) {
      return false;
    }

    // Quiet hours
    if (this.isQuietHours()) return false;

    // Rate limit
    if (this.isRateLimited()) return false;

    return true;
  }

  async deliver(message: VigilMessage): Promise<DeliveryResult> {
    const notification: PushNotification = {
      title: `Vigil — ${message.source.repo}`,
      body: stripMarkdown(message.message).slice(0, 256),
      priority: SEVERITY_TO_PRIORITY[message.severity] ?? "default",
      tags: [message.severity, message.status],
    };

    this.sentTimestamps.push(Date.now());

    // Send to all backends in parallel
    const results = await Promise.allSettled(
      this.backends.map((b) => b.send(notification))
    );
    const anySuccess = results.some(
      (r) => r.status === "fulfilled" && r.value
    );

    return {
      channel: this.name,
      success: anySuccess,
      error: anySuccess ? undefined : "All push backends failed",
    };
  }

  private isQuietHours(): boolean {
    if (!this.config.quietHours) return false;
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    const { start, end } = this.config.quietHours;

    if (start <= end) {
      return timeStr >= start && timeStr < end;
    }
    // Overnight range (e.g., 22:00 - 07:00)
    return timeStr >= start || timeStr < end;
  }

  private isRateLimited(): boolean {
    const oneHourAgo = Date.now() - 3600_000;
    this.sentTimestamps = this.sentTimestamps.filter((t) => t > oneHourAgo);
    return this.sentTimestamps.length >= this.config.maxPerHour;
  }
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/[#`>]/g, "")
    .trim();
}
```

### 13.2 ntfy.sh Backend (Zero-Config Push)

**New File: `src/notifications/backends/ntfy.ts`**

```typescript
import type { PushBackend, PushNotification } from "../push.js";

/**
 * ntfy.sh push backend — zero-config, self-hostable push notifications.
 * User subscribes to a topic on their phone, Vigil publishes to it.
 *
 * Setup: `vigil config set push.ntfy.topic my-vigil-alerts`
 * Phone: Install ntfy app → subscribe to "my-vigil-alerts"
 */
export class NtfyBackend implements PushBackend {
  name = "ntfy";

  constructor(
    private topic: string,
    private serverUrl: string = "https://ntfy.sh"
  ) {}

  async send(notification: PushNotification): Promise<boolean> {
    const priorityMap = { low: 2, default: 3, high: 4, urgent: 5 };
    const url = `${this.serverUrl}/${this.topic}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Title: notification.title,
        Priority: String(priorityMap[notification.priority] ?? 3),
        Tags: notification.tags?.join(",") ?? "",
        ...(notification.url ? { Click: notification.url } : {}),
      },
      body: notification.body,
    });

    return response.ok;
  }
}
```

### 13.3 OS Native Backend

**New File: `src/notifications/backends/native.ts`**

```typescript
import { exec } from "child_process";
import { promisify } from "util";
import type { PushBackend, PushNotification } from "../push.js";

const execAsync = promisify(exec);

/**
 * OS-native notification backend.
 * macOS: osascript, Linux: notify-send, Windows: PowerShell toast.
 */
export class NativeBackend implements PushBackend {
  name = "native";

  async send(notification: PushNotification): Promise<boolean> {
    try {
      const platform = process.platform;

      if (platform === "darwin") {
        const title = escapeAppleScript(notification.title);
        const body = escapeAppleScript(notification.body);
        await execAsync(
          `osascript -e 'display notification "${body}" with title "${title}"'`
        );
      } else if (platform === "linux") {
        const urgency =
          notification.priority === "urgent" ? "critical" :
          notification.priority === "high" ? "normal" : "low";
        await execAsync(
          `notify-send -u ${urgency} ${shellEscape(notification.title)} ${shellEscape(notification.body)}`
        );
      } else if (platform === "win32") {
        const ps = `
          [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
          $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent(0)
          $textNodes = $template.GetElementsByTagName('text')
          $textNodes.Item(0).AppendChild($template.CreateTextNode('${notification.title.replace(/'/g, "''")}')) > $null
          $textNodes.Item(1).AppendChild($template.CreateTextNode('${notification.body.replace(/'/g, "''")}')) > $null
          $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
          [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Vigil').Show($toast)
        `;
        await execAsync(`powershell -Command "${ps.replace(/\n/g, " ")}"`);
      }

      return true;
    } catch {
      return false;
    }
  }
}

function escapeAppleScript(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
```

---

## Phase 14: Session Management

> **Goal**: Full session persistence — resume conversations across restarts, maintain history, track parent/child session relationships.
> **Kairos Reference**: `src/assistant/sessionHistory.ts`, `--session-id`, `--continue` flags
> **Estimated Files Changed**: 3 new, 2 modified

### 14.1 Session Store

**New File: `src/session/store.ts`**

```typescript
import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";

const SessionSchema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().optional(),  // Parent session (Kairos pattern)
  createdAt: z.string().datetime(),
  lastActiveAt: z.string().datetime(),
  status: z.enum(["active", "sleeping", "terminated"]),
  repos: z.array(z.string()),              // Watched repo paths
  config: z.record(z.string(), z.unknown()),
  /** Conversation events — the full interaction history */
  events: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["tick", "analysis", "message", "action", "error"]),
      timestamp: z.string().datetime(),
      data: z.unknown(),
    })
  ),
  /** Cursor for pagination (Kairos sessionHistory pattern) */
  firstEventId: z.string().nullable(),
  hasMoreEvents: z.boolean().default(false),
});
export type Session = z.infer<typeof SessionSchema>;

/**
 * File-backed session store with pagination support.
 *
 * Kairos ref: sessionHistory.ts — paginated event API with
 * anchor_to_latest and before_id cursors.
 */
export class SessionStore {
  private sessionsDir: string;
  private activeSession: Session | null = null;

  constructor(configDir: string) {
    this.sessionsDir = path.join(configDir, "sessions");
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
  }

  /**
   * Create a new session. Optionally link to a parent session
   * for analytics correlation (Kairos pattern: plan mode → impl mode).
   */
  async create(opts: {
    repos: string[];
    config: Record<string, unknown>;
    parentId?: string;
  }): Promise<Session> {
    const session: Session = {
      id: crypto.randomUUID(),
      parentId: opts.parentId,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      status: "active",
      repos: opts.repos,
      config: opts.config,
      events: [],
      firstEventId: null,
      hasMoreEvents: false,
    };

    await this.persist(session);
    this.activeSession = session;
    return session;
  }

  /**
   * Resume an existing session by ID.
   * Kairos ref: --session-id <uuid> flag
   */
  async resume(sessionId: string): Promise<Session | null> {
    try {
      const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
      const raw = await fs.readFile(filePath, "utf-8");
      const session = SessionSchema.parse(JSON.parse(raw));
      session.status = "active";
      session.lastActiveAt = new Date().toISOString();
      this.activeSession = session;
      return session;
    } catch {
      return null;
    }
  }

  /**
   * Resume the most recent session in this directory.
   * Kairos ref: --continue / -c flag
   */
  async resumeLatest(repoPath: string): Promise<Session | null> {
    try {
      const files = await fs.readdir(this.sessionsDir);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));

      let latest: { session: Session; mtime: number } | null = null;

      for (const file of jsonFiles) {
        const filePath = path.join(this.sessionsDir, file);
        const stat = await fs.stat(filePath);
        const raw = await fs.readFile(filePath, "utf-8");
        const session = SessionSchema.safeParse(JSON.parse(raw));

        if (
          session.success &&
          session.data.repos.includes(repoPath) &&
          (!latest || stat.mtimeMs > latest.mtime)
        ) {
          latest = { session: session.data, mtime: stat.mtimeMs };
        }
      }

      if (latest) {
        return this.resume(latest.session.id);
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Append an event to the active session.
   * Auto-persists after every N events or on status change.
   */
  async addEvent(event: Omit<Session["events"][0], "id">): Promise<void> {
    if (!this.activeSession) return;

    const fullEvent = {
      ...event,
      id: crypto.randomUUID().slice(0, 8),
    };

    this.activeSession.events.push(fullEvent);
    this.activeSession.lastActiveAt = new Date().toISOString();

    // Auto-persist every 10 events
    if (this.activeSession.events.length % 10 === 0) {
      await this.persist(this.activeSession);
    }
  }

  /**
   * Fetch latest events with pagination.
   * Kairos ref: fetchLatestEvents() with anchor_to_latest
   */
  getLatestEvents(limit: number = 100): {
    events: Session["events"];
    hasMore: boolean;
    firstId: string | null;
  } {
    if (!this.activeSession) {
      return { events: [], hasMore: false, firstId: null };
    }

    const all = this.activeSession.events;
    const events = all.slice(-limit);
    return {
      events,
      hasMore: all.length > limit,
      firstId: events.length > 0 ? events[0].id : null,
    };
  }

  /**
   * Fetch older events before a cursor.
   * Kairos ref: fetchOlderEvents(beforeId)
   */
  getOlderEvents(
    beforeId: string,
    limit: number = 100
  ): {
    events: Session["events"];
    hasMore: boolean;
    firstId: string | null;
  } {
    if (!this.activeSession) {
      return { events: [], hasMore: false, firstId: null };
    }

    const all = this.activeSession.events;
    const idx = all.findIndex((e) => e.id === beforeId);
    if (idx <= 0) return { events: [], hasMore: false, firstId: null };

    const start = Math.max(0, idx - limit);
    const events = all.slice(start, idx);
    return {
      events,
      hasMore: start > 0,
      firstId: events.length > 0 ? events[0].id : null,
    };
  }

  async terminate(): Promise<void> {
    if (!this.activeSession) return;
    this.activeSession.status = "terminated";
    this.activeSession.lastActiveAt = new Date().toISOString();
    await this.persist(this.activeSession);
    this.activeSession = null;
  }

  getActive(): Session | null {
    return this.activeSession;
  }

  private async persist(session: Session): Promise<void> {
    const filePath = path.join(this.sessionsDir, `${session.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(session, null, 2), "utf-8");
  }
}
```

### 14.2 CLI Integration

**Modify: `src/cli/index.ts`** — Add `--session-id` and `--continue` flags

```typescript
import { SessionStore } from "../session/store.js";

// Add CLI flags (Kairos pattern: gated behind feature flag at parse time)
const sessionFlags = {
  "--session-id": {
    type: "string" as const,
    description: "Resume a specific session by UUID",
  },
  "--continue": {
    alias: "-c",
    type: "boolean" as const,
    description: "Resume the most recent session for this directory",
  },
};

async function initializeSession(
  args: ParsedArgs,
  store: SessionStore,
  repoPath: string
): Promise<Session> {
  if (args["session-id"]) {
    const session = await store.resume(args["session-id"]);
    if (!session) {
      throw new Error(`Session ${args["session-id"]} not found`);
    }
    console.log(`Resumed session ${session.id} (${session.events.length} events)`);
    return session;
  }

  if (args["continue"]) {
    const session = await store.resumeLatest(repoPath);
    if (session) {
      console.log(`Resumed latest session ${session.id}`);
      return session;
    }
    console.log("No previous session found — starting new session");
  }

  return store.create({ repos: [repoPath], config: args });
}
```

---

## Phase 15: Multi-Layer Gating / Kill Switches

> **Goal**: 4-layer gating system with TTL-refreshed runtime kill switches. Any layer can independently disable a feature mid-session.
> **Kairos Reference**: `src/tools/BriefTool/BriefTool.ts` (isBriefEntitled/isBriefEnabled), `src/services/analytics/growthbook.ts`
> **Estimated Files Changed**: 2 new, 3 modified

### 15.1 Feature Gate System

**New File: `src/core/feature-gates.ts`**

```typescript
/**
 * Multi-layer feature gating system.
 *
 * Kairos ref: BriefTool.ts isBriefEntitled() + isBriefEnabled()
 *
 * Layer 1: Build-time — compile out entire modules
 * Layer 2: Config-time — enabled in .vigil/config.json
 * Layer 3: Runtime — TTL-refreshed remote kill-switch
 * Layer 4: Session — per-session opt-in state
 *
 * Each layer is independent. A feature requires ALL layers to pass.
 */

import * as fs from "fs/promises";

export interface FeatureGateConfig {
  /** Path to config file for layer 2 */
  configPath: string;
  /** URL for remote feature flags (layer 3) */
  remoteUrl?: string;
  /** TTL for remote flag refresh in ms */
  remoteTTL: number;
}

interface RemoteFlagCache {
  flags: Record<string, boolean>;
  fetchedAt: number;
}

type GateLayer = "build" | "config" | "runtime" | "session";

export class FeatureGates {
  // Layer 1: Build-time flags (set once, never change)
  private buildFlags: Record<string, boolean> = {};

  // Layer 2: Config-time flags (loaded from file, reloaded on change)
  private configFlags: Record<string, boolean> = {};

  // Layer 3: Runtime flags (TTL-refreshed from remote)
  private remoteCache: RemoteFlagCache = { flags: {}, fetchedAt: 0 };
  private remoteTTL: number;
  private remoteUrl?: string;

  // Layer 4: Session flags (in-memory, per-session)
  private sessionFlags: Record<string, boolean> = {};

  constructor(private config: FeatureGateConfig) {
    this.remoteTTL = config.remoteTTL;
    this.remoteUrl = config.remoteUrl;
  }

  /**
   * Set a build-time flag (Layer 1).
   * Called once at startup based on build configuration.
   */
  setBuildFlag(name: string, enabled: boolean): void {
    this.buildFlags[name] = enabled;
  }

  /**
   * Load config flags from file (Layer 2).
   */
  async loadConfigFlags(): Promise<void> {
    try {
      const raw = await fs.readFile(this.config.configPath, "utf-8");
      const config = JSON.parse(raw);
      this.configFlags = config.features ?? {};
    } catch {
      this.configFlags = {};
    }
  }

  /**
   * Set a session flag (Layer 4).
   */
  setSessionFlag(name: string, enabled: boolean): void {
    this.sessionFlags[name] = enabled;
  }

  /**
   * Check if a feature is enabled through ALL layers.
   *
   * Kairos pattern: isBriefEntitled() checks build + runtime,
   * isBriefEnabled() adds session state on top.
   * We combine all 4 layers in one call.
   */
  async isEnabled(name: string): Promise<boolean> {
    // Layer 1: Build-time (defaults to true if not explicitly set)
    if (this.buildFlags[name] === false) return false;

    // Layer 2: Config-time
    if (this.configFlags[name] === false) return false;

    // Layer 3: Runtime (with TTL refresh — Kairos 5-min refresh pattern)
    const remoteEnabled = await this.checkRemoteFlag(name);
    if (remoteEnabled === false) return false;

    // Layer 4: Session
    if (this.sessionFlags[name] === false) return false;

    return true;
  }

  /**
   * Synchronous version — uses cached remote value.
   * Kairos ref: getFeatureValue_CACHED_MAY_BE_STALE()
   *
   * Use for hot paths where async isn't viable.
   * Value may be up to TTL-ms stale.
   */
  isEnabledCached(name: string): boolean {
    if (this.buildFlags[name] === false) return false;
    if (this.configFlags[name] === false) return false;
    if (this.remoteCache.flags[name] === false) return false;
    if (this.sessionFlags[name] === false) return false;
    return true;
  }

  /**
   * Check with TTL refresh — Kairos KAIROS_BRIEF_REFRESH_MS pattern.
   * Flipping the remote flag off mid-session disables the feature
   * on the next refresh cycle.
   */
  private async checkRemoteFlag(name: string): Promise<boolean | undefined> {
    if (!this.remoteUrl) return undefined; // No remote = layer doesn't apply

    const now = Date.now();
    if (now - this.remoteCache.fetchedAt < this.remoteTTL) {
      return this.remoteCache.flags[name]; // Use cache
    }

    // Refresh (fire-and-forget on failure — Kairos graceful degradation)
    try {
      const resp = await fetch(this.remoteUrl, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const data = await resp.json() as Record<string, boolean>;
        this.remoteCache = { flags: data, fetchedAt: now };
      }
    } catch {
      // Use stale cache on failure — never crash on flag fetch
      this.remoteCache.fetchedAt = now; // Reset TTL to avoid hammering
    }

    return this.remoteCache.flags[name];
  }

  /**
   * Debug: which layer blocked a feature?
   */
  async diagnose(name: string): Promise<Record<GateLayer, boolean | undefined>> {
    return {
      build: this.buildFlags[name] ?? true,
      config: this.configFlags[name] ?? true,
      runtime: await this.checkRemoteFlag(name),
      session: this.sessionFlags[name] ?? true,
    };
  }
}
```

### 15.2 Feature Registry

**New File: `src/core/features.ts`**

```typescript
/**
 * Central feature registry — all Vigil features declared in one place.
 * Prevents magic strings and makes feature audit trivial.
 */
export const FEATURES = {
  // Core
  VIGIL_WATCHER: "vigil.watcher",
  VIGIL_DECISION_ENGINE: "vigil.decision_engine",

  // Phase 8
  VIGIL_AGENT_IDENTITY: "vigil.agent_identity",

  // Phase 9
  VIGIL_BRIEF: "vigil.brief",

  // Phase 10
  VIGIL_PROACTIVE: "vigil.proactive",

  // Phase 11
  VIGIL_CHANNELS: "vigil.channels",

  // Phase 12
  VIGIL_WEBHOOKS: "vigil.webhooks",

  // Phase 13
  VIGIL_PUSH: "vigil.push_notifications",

  // Phase 14
  VIGIL_SESSIONS: "vigil.sessions",
} as const;

export type FeatureName = (typeof FEATURES)[keyof typeof FEATURES];
```

---

## Phase 16: System Prompt Caching with TTL

> **Goal**: Cache expensive system prompt sections with scope-aware invalidation. Avoid re-computing static sections on every LLM call.
> **Kairos Reference**: `src/constants/systemPromptSections.ts`, `src/constants/prompts.ts`
> **Estimated Files Changed**: 2 new, 1 modified

### 16.1 Cache-Aware Prompt Sections

**Kairos Pattern**: Uses `systemPromptSection()` and `DANGEROUS_uncachedSystemPromptSection()` decorators. Sections are marked with cache scope (`ephemeral` vs `stable`). Stable sections survive across turns; ephemeral sections are recomputed.

**New File: `src/prompts/cache.ts`**

```typescript
/**
 * System prompt caching with TTL and scope-aware invalidation.
 *
 * Kairos ref: constants/systemPromptSections.ts
 * - systemPromptSection(): stable, cacheable across turns
 * - DANGEROUS_uncachedSystemPromptSection(): recomputed every turn
 *
 * Vigil equivalent: cache prompt sections with TTL. Static sections
 * (agent identity, base instructions) are cached long. Dynamic sections
 * (repo state, recent events) are short-lived or uncached.
 */

export type CacheScope = "stable" | "session" | "ephemeral";

interface CachedSection {
  content: string;
  scope: CacheScope;
  computedAt: number;
  ttlMs: number;
}

const SCOPE_TTL: Record<CacheScope, number> = {
  stable: 60 * 60 * 1000,    // 1 hour — agent identity, base instructions
  session: 5 * 60 * 1000,    // 5 min — matches Kairos cache expiry
  ephemeral: 0,               // Never cached — recomputed every call
};

export class PromptCache {
  private cache = new Map<string, CachedSection>();

  /**
   * Get or compute a prompt section with caching.
   *
   * @param key - Unique section identifier
   * @param scope - Cache duration tier
   * @param compute - Function that generates the section content
   */
  async getSection(
    key: string,
    scope: CacheScope,
    compute: () => string | Promise<string>
  ): Promise<string> {
    const cached = this.cache.get(key);
    const now = Date.now();

    if (cached && scope !== "ephemeral") {
      const age = now - cached.computedAt;
      if (age < cached.ttlMs) {
        return cached.content;
      }
    }

    // Compute fresh
    const content = await compute();
    const ttlMs = SCOPE_TTL[scope];

    if (scope !== "ephemeral") {
      this.cache.set(key, { content, scope, computedAt: now, ttlMs });
    }

    return content;
  }

  /**
   * Invalidate a specific section (e.g., after config change).
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate all sections of a given scope.
   * Useful on session restart (invalidate "session" scope).
   */
  invalidateScope(scope: CacheScope): void {
    for (const [key, entry] of this.cache) {
      if (entry.scope === scope) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Invalidate everything — nuclear option for rebase/reset.
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats for observability.
   */
  getStats(): { size: number; byScope: Record<CacheScope, number> } {
    const byScope: Record<CacheScope, number> = { stable: 0, session: 0, ephemeral: 0 };
    for (const entry of this.cache.values()) {
      byScope[entry.scope]++;
    }
    return { size: this.cache.size, byScope };
  }
}
```

### 16.2 Prompt Builder with Caching

**New File: `src/prompts/builder.ts`**

```typescript
import { PromptCache } from "./cache.js";
import type { AgentDefinition } from "../agent/agentLoader.js";

/**
 * Builds the complete system prompt with cache-aware sections.
 *
 * Section composition:
 * 1. [stable]    Agent identity / base instructions
 * 2. [stable]    Tool documentation
 * 3. [session]   Active configuration / feature flags
 * 4. [ephemeral] Current repo state (branch, uncommitted, recent commits)
 * 5. [ephemeral] Pending signals / tick context
 */
export class PromptBuilder {
  private cache = new PromptCache();

  async build(context: {
    agent: AgentDefinition | null;
    repoState: () => Promise<string>;
    tickContext?: string;
    features: string[];
  }): Promise<string> {
    const sections: string[] = [];

    // Section 1: Agent identity (stable — rarely changes)
    const identity = await this.cache.getSection(
      "agent_identity",
      "stable",
      () => {
        if (context.agent) {
          return `# Agent: ${context.agent.name}\n\n${context.agent.systemPrompt}`;
        }
        return DEFAULT_IDENTITY;
      }
    );
    sections.push(identity);

    // Section 2: Tool documentation (stable)
    const tools = await this.cache.getSection(
      "tool_docs",
      "stable",
      () => TOOL_DOCUMENTATION
    );
    sections.push(tools);

    // Section 3: Active features (session-scoped)
    const features = await this.cache.getSection(
      "active_features",
      "session",
      () => `# Active Features\n${context.features.map((f) => `- ${f}`).join("\n")}`
    );
    sections.push(features);

    // Section 4: Repo state (ephemeral — always fresh)
    const repoState = await this.cache.getSection(
      "repo_state",
      "ephemeral",
      context.repoState
    );
    sections.push(repoState);

    // Section 5: Tick context (ephemeral, optional)
    if (context.tickContext) {
      sections.push(context.tickContext);
    }

    return sections.join("\n\n---\n\n");
  }

  /**
   * Call on rebase/reset to flush all caches.
   */
  onRebaseDetected(): void {
    this.cache.invalidateAll();
  }

  /**
   * Call on config change to flush session-scoped caches.
   */
  onConfigChanged(): void {
    this.cache.invalidateScope("session");
  }
}

const DEFAULT_IDENTITY = `You are Vigil, an always-on git monitoring agent.`;

const TOOL_DOCUMENTATION = `# Available Tools
- git: Execute git commands for repository analysis
- read: Read file contents
- grep: Search file contents`;
```

---

## Phase 17: Dead Code Elimination (Build-Time)

> **Goal**: Enable tree-shaking of disabled feature modules at build time. Disabled features produce zero runtime cost.
> **Kairos Reference**: `feature()` from `bun:bundle`, conditional `require()` in `src/constants/prompts.ts`
> **Estimated Files Changed**: 2 new, 4 modified

### 17.1 Build-Time Feature Function

**Kairos Pattern**: `feature('KAIROS')` returns a compile-time constant. Bun constant-folds the ternary, and dead code elimination removes the unused branch entirely. The pattern uses conditional `require()` inside ternaries so the bundler can see the dependency is conditional.

**New File: `src/build/features.ts`**

```typescript
/**
 * Build-time feature flags for dead code elimination.
 *
 * Kairos ref: `import { feature } from 'bun:bundle'`
 *
 * In Kairos, `feature()` is a Bun bundler primitive that returns
 * a compile-time constant boolean. The bundler constant-folds
 * `feature('X') ? require('./module') : null` and eliminates
 * the unused branch + its transitive dependencies.
 *
 * Vigil equivalent: define flags that the bundler replaces at build time.
 * For esbuild: `--define:FEATURE_CHANNELS=false`
 * For tsup: `env: { FEATURE_CHANNELS: 'false' }`
 * For Bun: use `feature()` directly
 */

// Type-safe feature flag checker
// At build time, the bundler replaces these with literal `true` or `false`
declare const FEATURE_VIGIL_CHANNELS: boolean;
declare const FEATURE_VIGIL_WEBHOOKS: boolean;
declare const FEATURE_VIGIL_PUSH: boolean;
declare const FEATURE_VIGIL_PROACTIVE: boolean;
declare const FEATURE_VIGIL_SESSIONS: boolean;
declare const FEATURE_VIGIL_AGENT: boolean;

/**
 * Build-time feature check. Bundler replaces this with a constant.
 *
 * Usage pattern (matches Kairos exactly):
 * ```
 * const channelModule = feature('VIGIL_CHANNELS')
 *   ? require('./channels/handler.js')
 *   : null;
 * ```
 */
export function feature(name: string): boolean {
  switch (name) {
    case "VIGIL_CHANNELS":  return typeof FEATURE_VIGIL_CHANNELS !== "undefined" ? FEATURE_VIGIL_CHANNELS : true;
    case "VIGIL_WEBHOOKS":  return typeof FEATURE_VIGIL_WEBHOOKS !== "undefined" ? FEATURE_VIGIL_WEBHOOKS : true;
    case "VIGIL_PUSH":      return typeof FEATURE_VIGIL_PUSH !== "undefined" ? FEATURE_VIGIL_PUSH : true;
    case "VIGIL_PROACTIVE": return typeof FEATURE_VIGIL_PROACTIVE !== "undefined" ? FEATURE_VIGIL_PROACTIVE : true;
    case "VIGIL_SESSIONS":  return typeof FEATURE_VIGIL_SESSIONS !== "undefined" ? FEATURE_VIGIL_SESSIONS : true;
    case "VIGIL_AGENT":     return typeof FEATURE_VIGIL_AGENT !== "undefined" ? FEATURE_VIGIL_AGENT : true;
    default: return true;
  }
}
```

### 17.2 Conditional Module Loading

**Modify: `src/main.ts`** — Use feature-gated conditional imports

```typescript
import { feature } from "./build/features.js";

// Dead code elimination: conditional imports for feature-gated modules.
// Same pattern as Kairos prompts.ts — lazy require inside ternary.
// Bundler constant-folds feature() → eliminates dead branch + deps.

/* eslint-disable @typescript-eslint/no-require-imports */

// Channel notifications (Phase 11)
const channelModule = feature("VIGIL_CHANNELS")
  ? (require("./channels/handler.js") as typeof import("./channels/handler.js"))
  : null;

// GitHub webhooks (Phase 12)
const webhookModule = feature("VIGIL_WEBHOOKS")
  ? (require("./webhooks/server.js") as typeof import("./webhooks/server.js"))
  : null;

// Push notifications (Phase 13)
const pushModule = feature("VIGIL_PUSH")
  ? (require("./notifications/push.js") as typeof import("./notifications/push.js"))
  : null;

// Proactive mode (Phase 10)
const proactiveModule = feature("VIGIL_PROACTIVE")
  ? (require("./core/work-detector.js") as typeof import("./core/work-detector.js"))
  : null;

// Session management (Phase 14)
const sessionModule = feature("VIGIL_SESSIONS")
  ? (require("./session/store.js") as typeof import("./session/store.js"))
  : null;

// Agent identity (Phase 8)
const agentModule = feature("VIGIL_AGENT")
  ? (require("./agent/agentLoader.js") as typeof import("./agent/agentLoader.js"))
  : null;

/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * Initialize Vigil with feature-gated modules.
 * Disabled features produce zero runtime cost.
 */
async function main() {
  // Always-on core
  const watcher = new GitWatcher(config);
  const engine = new DecisionEngine(config);
  const router = new MessageRouter();

  // Feature-gated initialization
  if (channelModule) {
    const handler = new channelModule.ChannelHandler(router, getGateContext);
    // ... register channels
  }

  if (webhookModule) {
    const server = new webhookModule.WebhookServer(emitter, config.webhooks);
    await server.start();
  }

  if (pushModule) {
    const push = new pushModule.PushChannel(config.push);
    router.registerChannel(push);
  }

  if (proactiveModule) {
    const detector = new proactiveModule.WorkDetector(config.workDetection);
    // ... wire into tick engine
  }

  if (sessionModule) {
    const store = new sessionModule.SessionStore(config.configDir);
    await store.initialize();
  }

  if (agentModule) {
    const agent = await agentModule.loadAgentDefinition(config.repoPath);
    engine.setAgent(agent);
  }

  // Start core loop
  await watcher.start();
}
```

### 17.3 Build Configuration

**New File: `build.config.ts`**

```typescript
/**
 * Build configuration for feature-gated Vigil builds.
 *
 * Full build: all features enabled (default)
 * Lite build: core only (watcher + decision engine + console output)
 * Custom: pick features via CLI flags
 *
 * Example:
 *   # Full build
 *   bun run build
 *
 *   # Lite build (no webhooks, no push, no channels)
 *   bun run build --lite
 *
 *   # Custom
 *   FEATURE_VIGIL_WEBHOOKS=false FEATURE_VIGIL_PUSH=false bun run build
 */

import { build } from "bun";

const isLite = process.argv.includes("--lite");

const featureDefines: Record<string, string> = {
  FEATURE_VIGIL_CHANNELS:  String(!isLite && (process.env.FEATURE_VIGIL_CHANNELS  !== "false")),
  FEATURE_VIGIL_WEBHOOKS:  String(!isLite && (process.env.FEATURE_VIGIL_WEBHOOKS  !== "false")),
  FEATURE_VIGIL_PUSH:      String(!isLite && (process.env.FEATURE_VIGIL_PUSH      !== "false")),
  FEATURE_VIGIL_PROACTIVE: String(!isLite && (process.env.FEATURE_VIGIL_PROACTIVE !== "false")),
  FEATURE_VIGIL_SESSIONS:  String(!isLite && (process.env.FEATURE_VIGIL_SESSIONS  !== "false")),
  FEATURE_VIGIL_AGENT:     String(!isLite && (process.env.FEATURE_VIGIL_AGENT     !== "false")),
};

await build({
  entrypoints: ["./src/main.ts"],
  outdir: "./dist",
  target: "node",
  define: featureDefines,
  minify: true,
  sourcemap: "external",
});

console.log("Build complete. Features:", featureDefines);
```

---

## Phase Dependency Map

```
Phase 8:  Agent Identity          ──┐
Phase 9:  Brief/Messaging         ──┤── Can start in parallel
Phase 15: Feature Gates           ──┘
                │
                ▼
Phase 10: Proactive Mode          ── Depends on Phase 8 (agent prompt)
                │                     + Phase 9 (message routing)
                ▼
Phase 14: Session Management      ── Depends on Phase 9 (events to store)
                │
                ▼
Phase 11: Channel Notifications   ── Depends on Phase 9 (message router)
Phase 12: GitHub Webhooks         ── + Phase 15 (feature gates)
Phase 13: Push Notifications      ──┘
                │
                ▼
Phase 16: Prompt Caching          ── Depends on Phase 8 (prompt builder)
                │                     + Phase 10 (tick context)
                ▼
Phase 17: Dead Code Elimination   ── Last: wraps all modules in feature gates
```

### Recommended Implementation Order

| Order | Phase | Rationale |
|-------|-------|-----------|
| 1 | **Phase 15**: Feature Gates | Foundation — every other phase uses this |
| 2 | **Phase 9**: Brief/Messaging | Core output pipeline — everything routes through this |
| 3 | **Phase 8**: Agent Identity | Customizable behavior — high user value |
| 4 | **Phase 10**: Proactive Mode | Smart tick engine — reduces wasted LLM calls |
| 5 | **Phase 14**: Session Management | Persistence — makes Vigil stateful across restarts |
| 6 | **Phase 12**: GitHub Webhooks | High-demand feature — react to PRs |
| 7 | **Phase 13**: Push Notifications | Deliver alerts when user is away |
| 8 | **Phase 11**: Channel Notifications | MCP integration — advanced use case |
| 9 | **Phase 16**: Prompt Caching | Optimization — reduces token usage |
| 10 | **Phase 17**: Dead Code Elimination | Build optimization — do last |

---

### Summary

| Phase | New Files | Modified Files | Key Pattern from Kairos |
|-------|-----------|----------------|------------------------|
| 8 | 3 | 2 | Agent definition + system prompt composition |
| 9 | 4 | 2 | SendUserMessage structured output + display filtering |
| 10 | 2 | 2 | `<tick>` prompts + adaptive sleep + work detection |
| 11 | 4 | 1 | 6-gate activation chain + XML wrapping + permission workflow |
| 12 | 4 | 1 | Webhook server + subscription manager + event processor |
| 13 | 3 | 1 | Push backends (ntfy, native) + rate limiting + quiet hours |
| 14 | 3 | 2 | Paginated session history + resume flags |
| 15 | 2 | 3 | 4-layer gating with TTL refresh + kill-switch |
| 16 | 2 | 1 | Scope-aware prompt caching (stable/session/ephemeral) |
| 17 | 2 | 4 | Conditional require + bundler constant-folding |
| **Total** | **29** | **19** | |

---

*All code examples reference actual Kairos patterns from the Claude Code source at `src/`. Phase numbers continue from the existing vigil-improvement-plan.md (Phases 1–7).*
