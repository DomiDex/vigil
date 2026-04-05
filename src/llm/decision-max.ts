import type { VigilConfig } from "../core/config.ts";

export type Decision = "SILENT" | "OBSERVE" | "NOTIFY" | "ACT";

export interface DecisionResult {
  decision: Decision;
  reasoning: string;
  content?: string;
  action?: string;
}

export interface ConsolidationResult {
  summary: string;
  patterns: string[];
  insights: string[];
  confidence: number;
}

function extractJSON(text: string): string {
  // Try to find JSON in the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];
  return text;
}

async function callClaude(
  prompt: string,
  systemPrompt: string,
  model?: string
): Promise<string> {
  // Remove API key so claude CLI uses Max subscription
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;

  const args = ["claude", "-p", "--output-format", "text"];
  if (model) args.push("--model", model);

  const fullPrompt = systemPrompt
    ? `<system>${systemPrompt}</system>\n\n${prompt}`
    : prompt;

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

  return stdout.trim();
}

export class DecisionEngine {
  private config: VigilConfig;

  constructor(config: VigilConfig) {
    this.config = config;
  }

  async decide(context: string, recentMemories: string, repoProfile: string): Promise<DecisionResult> {
    const systemPrompt = `You are Vigil, an always-on git monitoring agent. You observe repository state and decide what action to take.

Respond with ONLY a JSON object, no other text:
{
  "decision": "SILENT" | "OBSERVE" | "NOTIFY" | "ACT",
  "reasoning": "brief explanation",
  "content": "observation text if OBSERVE, notification text if NOTIFY",
  "action": "proposed action description if ACT"
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
      const json = extractJSON(raw);
      const result = JSON.parse(json) as DecisionResult;
      if (!["SILENT", "OBSERVE", "NOTIFY", "ACT"].includes(result.decision)) {
        result.decision = "SILENT";
      }
      return result;
    } catch {
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
      const json = extractJSON(raw);
      return JSON.parse(json) as ConsolidationResult;
    } catch {
      return {
        summary: "Consolidation failed",
        patterns: [],
        insights: [],
        confidence: 0,
      };
    }
  }

  async ask(question: string, context: string): Promise<string> {
    const systemPrompt = `You are Vigil, an always-on git monitoring agent. Answer the user's question based on the repository context provided. Be concise and actionable.`;

    const prompt = `Repository context:
${context}

User question: ${question}`;

    return callClaude(prompt, systemPrompt, this.config.escalationModel);
  }
}
