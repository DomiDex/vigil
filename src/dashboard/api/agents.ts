import { z } from "zod";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import type { DashboardContext } from "../types.ts";

const agentSwitchSchema = z.object({
  agentName: z.string().min(1),
});

interface AgentDefinition {
  name: string;
  description: string;
  model: string;
  tools: string[];
  watchPatterns: string[];
  triggers: string[];
  file: string;
  systemPrompt: string;
}

function parseFrontmatter(content: string): { meta: Record<string, any>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const rawYaml = match[1];
  const body = match[2].trim();
  const meta: Record<string, any> = {};

  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of rawYaml.split("\n")) {
    // Array item
    const arrayMatch = line.match(/^\s+-\s+(.+)$/);
    if (arrayMatch && currentKey) {
      if (!currentArray) currentArray = [];
      currentArray.push(arrayMatch[1].replace(/^["']|["']$/g, ""));
      continue;
    }

    // Flush previous array
    if (currentKey && currentArray) {
      meta[currentKey] = currentArray;
      currentArray = null;
      currentKey = null;
    }

    // Key: value
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      const value = kvMatch[2].trim();
      if (value === "" || value === "|") {
        // Might be start of array or multiline
        currentKey = key;
        currentArray = null;
      } else if (value.startsWith("[") && value.endsWith("]")) {
        // Inline array: [a, b, c]
        meta[key] = value
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""));
      } else {
        meta[key] = value.replace(/^["']|["']$/g, "");
        currentKey = null;
        currentArray = null;
      }
    }
  }

  // Flush last array
  if (currentKey && currentArray) {
    meta[currentKey] = currentArray;
  }

  return { meta, body };
}

export async function getAgentsJSON(
  ctx: DashboardContext,
  agentDir?: string,
): Promise<AgentDefinition[]> {
  const dir = agentDir ?? (ctx.daemon as any).agentDir ?? ".claude/agents";

  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  const agents: AgentDefinition[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(`${dir}/${file}`, "utf-8");
      const { meta, body } = parseFrontmatter(content);
      if (!meta.name) continue; // Skip files without valid frontmatter

      agents.push({
        name: meta.name,
        description: meta.description ?? "",
        model: meta.model ?? "",
        tools: Array.isArray(meta.tools) ? meta.tools : [],
        watchPatterns: Array.isArray(meta.watchPatterns) ? meta.watchPatterns : [],
        triggers: Array.isArray(meta.triggers) ? meta.triggers : [],
        file,
        systemPrompt: body,
      });
    } catch {
      // Skip unreadable files
    }
  }

  return agents;
}

function getEngine(ctx: DashboardContext) {
  try {
    const e = (ctx.daemon as any).decisionEngine;
    return e && typeof e.getSystemPrompt === "function" ? e : null;
  } catch {
    return null;
  }
}

export function getCurrentAgentJSON(ctx: DashboardContext) {
  const engine = getEngine(ctx);
  return {
    name: engine?.currentAgent ?? "default",
    systemPrompt: engine?.getSystemPrompt?.() ?? "",
  };
}

export async function handleAgentSwitch(
  ctx: DashboardContext,
  body: any,
): Promise<{ success?: boolean; error?: string }> {
  const result = agentSwitchSchema.safeParse(body);
  if (!result.success) {
    return { error: result.error.issues.map((i) => i.message).join("; ") };
  }

  const engine = getEngine(ctx);
  if (!engine) return { error: "Decision engine not available" };

  engine.restart(result.data.agentName);
  return { success: true };
}
