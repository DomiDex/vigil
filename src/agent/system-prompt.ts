import type { AgentDefinition } from "./agent-loader.ts";

export interface SystemPromptConfig {
  agentDefinition: AgentDefinition | null;
  repoContext: RepoContext;
  isProactive: boolean;
  customInstructions?: string;
}

export interface RepoContext {
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
 * Priority:
 * 1. Custom agent definition (from .claude/agents/vigil.md)
 *    - In proactive mode: APPENDED to default
 *    - Otherwise: REPLACES default
 * 2. Custom instructions (from CLI flag or config)
 * 3. Default Vigil prompt
 *
 * Repo context is always injected as a structured section.
 */
export function buildVigilSystemPrompt(config: SystemPromptConfig): string {
  const sections: string[] = [];

  if (config.agentDefinition && config.isProactive) {
    // Proactive mode: agent instructions supplement default
    sections.push(DEFAULT_VIGIL_PROMPT);
    sections.push(`\n# Custom Agent Instructions\n${config.agentDefinition.systemPrompt}`);
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

export { DEFAULT_VIGIL_PROMPT };
