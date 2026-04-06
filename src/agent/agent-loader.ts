import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as yaml from "yaml";

export interface AgentDefinition {
  name: string;
  description: string;
  model?: string;
  systemPrompt: string;
  tools?: string[];
  watchPatterns?: string[];
  triggerEvents?: string[];
}

const AGENT_DIR = ".claude/agents";
const DEFAULT_AGENT_FILE = "vigil.md";

/**
 * Parse a markdown file with YAML frontmatter into an AgentDefinition.
 * Frontmatter holds structured config, body holds natural language instructions.
 */
export async function loadAgentDefinition(
  repoPath: string,
  agentFile: string = DEFAULT_AGENT_FILE,
): Promise<AgentDefinition | null> {
  const filePath = path.join(repoPath, AGENT_DIR, agentFile);

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return parseAgentFile(raw, agentFile);
  } catch {
    return null;
  }
}

export function parseAgentFile(raw: string, filename: string): AgentDefinition {
  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!frontmatterMatch) {
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
 */
export async function listAgentDefinitions(repoPath: string): Promise<AgentDefinition[]> {
  const dirPath = path.join(repoPath, AGENT_DIR);

  try {
    const files = await fs.readdir(dirPath);
    const mdFiles = files.filter((f) => f.endsWith(".md"));
    const agents = await Promise.all(mdFiles.map((f) => loadAgentDefinition(repoPath, f)));
    return agents.filter((a): a is AgentDefinition => a !== null);
  } catch {
    return [];
  }
}
