import * as z from "zod";
import { minimatch } from "minimatch";
import { loadAgentDefinition, type AgentDefinition } from "../agent/agent-loader.ts";
import { buildVigilSystemPrompt } from "../agent/system-prompt.ts";
import { CircuitBreaker } from "../core/circuit-breaker.ts";
import type { VigilConfig } from "../core/config.ts";
import type { MemoryEntry, RepoProfile } from "../memory/store.ts";

export type Decision = "SILENT" | "OBSERVE" | "NOTIFY" | "ACT";

export interface DecisionResult {
  decision: Decision;
  reasoning: string;
  content?: string;
  action?: string;
  actionType?: string;
  confidence?: number;
}

export interface ConsolidationResult {
  summary: string;
  patterns: string[];
  insights: string[];
  confidence: number;
}

export interface CrossRepoAnalysis {
  patterns: string[];
  risks: string[];
  insights: string[];
}

// Zod schemas for strict LLM response validation
const DecisionSchema = z.object({
  decision: z.enum(["SILENT", "OBSERVE", "NOTIFY", "ACT"]),
  reasoning: z.string(),
  content: z.string().nullable().optional(),
  action: z.string().nullable().optional(),
  actionType: z
    .enum(["git_stash", "git_branch", "git_commit", "run_tests", "run_lint", "custom_script"])
    .nullable()
    .optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

const ConsolidationSchema = z.object({
  summary: z.string(),
  patterns: z.array(z.string()),
  insights: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

const CrossRepoSchema = z.object({
  patterns: z.array(z.string()),
  risks: z.array(z.string()),
  insights: z.array(z.string()),
});

export function extractJSON(text: string): string {
  // Find all { positions and try parsing from each to find valid JSON
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    // Find matching closing brace by tracking depth
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\" && inString) {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(i, j + 1);
          try {
            JSON.parse(candidate);
            return candidate;
          } catch {
            break; // this { didn't lead to valid JSON, try next
          }
        }
      }
    }
  }
  return text;
}

function parseDecisionResponse(raw: string): DecisionResult {
  const json = extractJSON(raw);
  try {
    const parsed = JSON.parse(json);
    const validated = DecisionSchema.parse(parsed);
    // Coerce null → undefined so downstream checks (result.content) work consistently
    return {
      decision: validated.decision,
      reasoning: validated.reasoning,
      content: validated.content ?? undefined,
      action: validated.action ?? undefined,
      confidence: validated.confidence ?? undefined,
    };
  } catch (err) {
    console.warn("[decision] Invalid response, defaulting to SILENT:", err);
    return { decision: "SILENT", reasoning: `Parse error: ${err}` };
  }
}

function parseConsolidationResponse(raw: string): ConsolidationResult {
  const json = extractJSON(raw);
  try {
    const parsed = JSON.parse(json);
    return ConsolidationSchema.parse(parsed);
  } catch {
    return { summary: "Consolidation failed", patterns: [], insights: [], confidence: 0 };
  }
}

/** Shared circuit breaker for all LLM calls */
const llmBreaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeoutMs: 60_000,
});

/** Reset circuit breaker state — for test isolation */
export function resetCircuitBreaker(): void {
  llmBreaker.reset();
}

async function callClaude(prompt: string, systemPrompt: string, model?: string): Promise<string> {
  if (!llmBreaker.canCall()) {
    console.warn(
      `[circuit-breaker] LLM calls suspended (${llmBreaker.getFailureCount()} failures, state=${llmBreaker.getState()}). Retrying after cooldown.`,
    );
    return "";
  }

  // Remove API key so claude CLI uses Max subscription
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;

  const args = ["claude", "-p", "--output-format", "text"];
  if (model) args.push("--model", model);

  const fullPrompt = systemPrompt ? `<system>${systemPrompt}</system>\n\n${prompt}` : prompt;

  try {
    const proc = Bun.spawn(args, {
      env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    proc.stdin.write(fullPrompt);
    proc.stdin.end();

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`Claude CLI failed (exit ${exitCode}): ${stderr}`);
    }

    llmBreaker.recordSuccess();
    return stdout.trim();
  } catch (err) {
    llmBreaker.recordFailure();
    throw err;
  }
}

export class DecisionEngine {
  private config: VigilConfig;
  private agentDefinitions = new Map<string, AgentDefinition>();

  constructor(config: VigilConfig) {
    this.config = config;
  }

  updateConfig(config: VigilConfig): void {
    this.config = config;
  }

  /** Load agent definition for a repo path. Call once per repo at startup. */
  async loadAgent(repoPath: string): Promise<AgentDefinition | null> {
    const agent = await loadAgentDefinition(repoPath);
    if (agent) {
      this.agentDefinitions.set(repoPath, agent);
    }
    return agent;
  }

  /** Get loaded agent for a repo path */
  getAgent(repoPath: string): AgentDefinition | null {
    return this.agentDefinitions.get(repoPath) ?? null;
  }

  /**
   * Check if this event should be processed based on agent filters.
   * Returns null if event passes filters, or a skip reason string.
   */
  checkAgentFilters(repoPath: string, eventType?: string, files?: string[]): string | null {
    const agent = this.agentDefinitions.get(repoPath);
    if (!agent) return null; // No agent = process everything

    // Check triggerEvents filter
    if (agent.triggerEvents && eventType) {
      if (!agent.triggerEvents.includes(eventType)) {
        return `Agent not subscribed to event type: ${eventType}`;
      }
    }

    // Check watchPatterns filter
    if (agent.watchPatterns && files && files.length > 0) {
      const matches = files.some((f) =>
        agent.watchPatterns!.some((p) => minimatch(f, p, { dot: true })),
      );
      if (!matches) {
        return "No files match agent watch patterns";
      }
    }

    return null;
  }

  /** Expose breaker state for status/diagnostics */
  getCircuitState() {
    return {
      state: llmBreaker.getState(),
      failures: llmBreaker.getFailureCount(),
    };
  }

  async decide(
    context: string,
    recentMemories: string,
    repoProfile: string,
    repoContext?: { repoPath: string; repoName: string; branch: string; recentCommits: string[]; uncommittedFiles: string[] },
  ): Promise<DecisionResult> {
    const decisionInstructions = `Respond with ONLY a JSON object, no other text:
{
  "decision": "SILENT" | "OBSERVE" | "NOTIFY" | "ACT",
  "reasoning": "brief explanation",
  "content": "observation text if OBSERVE, notification text if NOTIFY",
  "action": "proposed action description if ACT",
  "confidence": 0.0-1.0
}

Decision guide:
- SILENT: Nothing interesting. Routine state.
- OBSERVE: Something worth noting for future reference. Store as memory.
- NOTIFY: Something the developer should know about now. Uncommitted drift, risky patterns, etc.
- ACT: Something that should be acted upon. Only propose, never execute.`;

    let systemPrompt: string;

    // Use agent-aware prompt if we have repo context and a loaded agent
    if (repoContext) {
      const agent = this.agentDefinitions.get(repoContext.repoPath) ?? null;
      const builtPrompt = buildVigilSystemPrompt({
        agentDefinition: agent,
        repoContext: {
          repoName: repoContext.repoName,
          currentBranch: repoContext.branch,
          recentCommits: repoContext.recentCommits,
          uncommittedFiles: repoContext.uncommittedFiles,
        },
        isProactive: false,
        customInstructions: undefined,
      });
      systemPrompt = `${builtPrompt}\n\n${decisionInstructions}`;
    } else {
      // Fallback: original hardcoded prompt
      systemPrompt = `You are Vigil, an always-on git monitoring agent. You observe repository state and decide what action to take.\n\n${decisionInstructions}`;
    }

    const prompt = `Current repository state:
${context}

Recent memories:
${recentMemories || "(none)"}

Repo profile:
${repoProfile || "(no profile yet)"}

What is your decision?`;

    try {
      const model = repoContext
        ? (this.agentDefinitions.get(repoContext.repoPath)?.model ?? this.config.tickModel)
        : this.config.tickModel;
      const raw = await callClaude(prompt, systemPrompt, model);
      if (!raw) return { decision: "SILENT", reasoning: "Circuit breaker active" };
      return parseDecisionResponse(raw);
    } catch (err) {
      console.error(`  [decision] LLM call failed: ${err}`);
      return { decision: "SILENT", reasoning: "Failed to get LLM decision" };
    }
  }

  async consolidate(observations: string[], existingProfile: string): Promise<ConsolidationResult> {
    const systemPrompt = `You are Vigil in dream/consolidation mode. Review observations collected during monitoring and consolidate them into confirmed facts and patterns.

Respond with ONLY a JSON object:
{
  "summary": "Updated repo profile summary",
  "patterns": ["pattern1", "pattern2"],
  "insights": ["insight1", "insight2"],
  "confidence": 0.0-1.0
}`;

    const prompt = `Observations to consolidate:
${observations.map((o, i) => `${i + 1}. ${o}`).join("\n")}

Existing profile:
${existingProfile || "(none)"}

Consolidate these observations into a coherent understanding.`;

    try {
      const raw = await callClaude(prompt, systemPrompt, this.config.escalationModel);
      if (!raw)
        return { summary: "Consolidation skipped (circuit breaker)", patterns: [], insights: [], confidence: 0 };
      return parseConsolidationResponse(raw);
    } catch {
      return { summary: "Consolidation failed", patterns: [], insights: [], confidence: 0 };
    }
  }

  /**
   * Cross-repo pattern analysis during dream phase.
   * Looks for correlations, cascade risks, and workflow patterns.
   */
  async analyzeCrossRepo(memories: MemoryEntry[], profiles: RepoProfile[]): Promise<CrossRepoAnalysis> {
    const systemPrompt = `You are Vigil, analyzing activity across multiple repositories.
Identify:
1. Correlated changes (repos that change together)
2. Cascade risks (changes in one repo that could affect others)
3. Workflow patterns (sequences of changes across repos)

Respond with ONLY a JSON object:
{
  "patterns": ["pattern1", "pattern2"],
  "risks": ["risk1", "risk2"],
  "insights": ["insight1", "insight2"]
}`;

    const prompt = `Repo profiles:\n${profiles
      .map((p) => `- ${p.repo}: ${p.summary}\n  Patterns: ${p.patterns.join(", ")}`)
      .join("\n")}\n\nRecent cross-repo activity:\n${memories
      .map((m, i) => `${i + 1}. [${m.repo}] ${m.type}: ${m.content}`)
      .join("\n")}`;

    try {
      const raw = await callClaude(prompt, systemPrompt, this.config.escalationModel);
      if (!raw) return { patterns: [], risks: [], insights: [] };
      const json = extractJSON(raw);
      const parsed = JSON.parse(json);
      return CrossRepoSchema.parse(parsed);
    } catch {
      return { patterns: [], risks: [], insights: [] };
    }
  }

  async ask(question: string, context: string): Promise<string> {
    const systemPrompt = `You are Vigil, an always-on git monitoring agent. Answer the user's question based on the repository context provided. Be concise and actionable.`;

    const prompt = `Repository context:
${context}

User question: ${question}`;

    try {
      const raw = await callClaude(prompt, systemPrompt, this.config.escalationModel);
      if (!raw) return "Unable to answer — LLM circuit breaker is active. Try again later.";
      return raw;
    } catch (err) {
      throw new Error(`Failed to get answer: ${err}`);
    }
  }
}
