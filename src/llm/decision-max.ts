import * as z from "zod";
import type { VigilConfig } from "../core/config.ts";
import { CircuitBreaker } from "../core/circuit-breaker.ts";

export type Decision = "SILENT" | "OBSERVE" | "NOTIFY" | "ACT";

export interface DecisionResult {
  decision: Decision;
  reasoning: string;
  content?: string;
  action?: string;
  confidence?: number;
}

export interface ConsolidationResult {
  summary: string;
  patterns: string[];
  insights: string[];
  confidence: number;
}

// Zod schemas for strict LLM response validation
const DecisionSchema = z.object({
  decision: z.enum(["SILENT", "OBSERVE", "NOTIFY", "ACT"]),
  reasoning: z.string(),
  content: z.string().optional(),
  action: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const ConsolidationSchema = z.object({
  summary: z.string(),
  patterns: z.array(z.string()),
  insights: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

function extractJSON(text: string): string {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];
  return text;
}

function parseDecisionResponse(raw: string): DecisionResult {
  const json = extractJSON(raw);
  try {
    const parsed = JSON.parse(json);
    return DecisionSchema.parse(parsed);
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

async function callClaude(
  prompt: string,
  systemPrompt: string,
  model?: string
): Promise<string> {
  if (!llmBreaker.canCall()) {
    console.warn(
      `[circuit-breaker] LLM calls suspended (${llmBreaker.getFailureCount()} failures, state=${llmBreaker.getState()}). Retrying after cooldown.`
    );
    return "";
  }

  // Remove API key so claude CLI uses Max subscription
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;

  const args = ["claude", "-p", "--output-format", "text"];
  if (model) args.push("--model", model);

  const fullPrompt = systemPrompt
    ? `<system>${systemPrompt}</system>\n\n${prompt}`
    : prompt;

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

  constructor(config: VigilConfig) {
    this.config = config;
  }

  updateConfig(config: VigilConfig): void {
    this.config = config;
  }

  /** Expose breaker state for status/diagnostics */
  getCircuitState() {
    return {
      state: llmBreaker.getState(),
      failures: llmBreaker.getFailureCount(),
    };
  }

  async decide(context: string, recentMemories: string, repoProfile: string): Promise<DecisionResult> {
    const systemPrompt = `You are Vigil, an always-on git monitoring agent. You observe repository state and decide what action to take.

Respond with ONLY a JSON object, no other text:
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

    const prompt = `Current repository state:
${context}

Recent memories:
${recentMemories || "(none)"}

Repo profile:
${repoProfile || "(no profile yet)"}

What is your decision?`;

    try {
      const raw = await callClaude(prompt, systemPrompt, this.config.tickModel);
      if (!raw) return { decision: "SILENT", reasoning: "Circuit breaker active" };
      return parseDecisionResponse(raw);
    } catch (err) {
      console.error(`  [decision] LLM call failed: ${err}`);
      return { decision: "SILENT", reasoning: "Failed to get LLM decision" };
    }
  }

  async consolidate(
    observations: string[],
    existingProfile: string
  ): Promise<ConsolidationResult> {
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
      if (!raw) return { summary: "Consolidation skipped (circuit breaker)", patterns: [], insights: [], confidence: 0 };
      return parseConsolidationResponse(raw);
    } catch {
      return { summary: "Consolidation failed", patterns: [], insights: [], confidence: 0 };
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
      return `Failed to get answer: ${err}`;
    }
  }
}
