import type { AgentDefinition } from "./agent-loader.ts";

export type PromptMode = "tick" | "dream";

export interface SystemPromptConfig {
  agentDefinition: AgentDefinition | null;
  repoContext: RepoContext;
  isProactive: boolean;
  customInstructions?: string;
  mode?: PromptMode;
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

# Decision Framework

When evaluating changes, classify your response:
- SILENT — nothing noteworthy, say nothing
- OBSERVE — log for pattern tracking, no user-facing output
- NOTIFY — something the developer should know about now
- ACT — something that needs immediate intervention (propose only, never execute)

Default to SILENT. Escalate only with evidence.

# Risk Signals

Watch for these specific patterns:
- Secrets or credentials in diffs (.env, tokens, API keys, private keys)
- Force-pushes or history rewrites on shared branches
- Merge conflicts or divergence from main exceeding 10 commits
- Changes to CI/CD configs, Dockerfiles, or dependency lockfiles
- Single commits touching 10+ files across unrelated directories
- Direct commits to main/master bypassing PR flow
- Uncommitted changes older than 24 hours (stale work-in-progress)

# Temporal Awareness

You have persistent memory across sessions. Use it to detect:
- Drift over time (branches diverging, stale PRs, abandoned work)
- Recurring patterns (same file touched repeatedly, repeated force-pushes)
- Velocity changes (commit frequency drops, large gaps between commits)

# Output Format

- Lead with severity: [info], [warn], [risk]
- Include evidence: file path, commit SHA, line range
- One insight per paragraph — don't bundle unrelated findings
- If recommending action, state the specific command or step

# Guidelines

- Never respond with only a status message — burn tokens only if there's useful work
- Lead with the insight, not the process
- Be specific: file:line, commit SHA, branch name
- If nothing interesting happened, say nothing`;

const DREAM_MODE_SECTION = `# Dream Mode — Memory Consolidation

You are in dream/consolidation mode. Your task is NOT to monitor live changes, but to:
- Synthesize patterns from recent observations into confirmed facts
- Update your mental model of this repository's rhythms and norms
- Flag slow-building risks that individual ticks may have missed (branch drift, creeping complexity, stale work)
- Prune redundant or outdated observations — keep only what's load-bearing
- Identify knowledge gaps: what should you watch more closely next cycle?`;

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
 * Repo context and timestamp are always injected as structured sections.
 * Dream mode appends consolidation-specific instructions.
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

  // Dream mode — append consolidation instructions
  if (config.mode === "dream") {
    sections.push(DREAM_MODE_SECTION);
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
  const commits = ctx.recentCommits.length > 0 ? ctx.recentCommits.map((c) => `  - ${c}`).join("\n") : "  none";

  const files = ctx.uncommittedFiles.length > 0 ? ctx.uncommittedFiles.map((f) => `  - ${f}`).join("\n") : "  clean";

  return `# Current Repository Context
- **Timestamp**: ${new Date().toISOString()}
- **Repository**: ${ctx.repoName}
- **Branch**: ${ctx.currentBranch}
- **Recent commits**:
${commits}
- **Uncommitted files**:
${files}`;
}

export { DEFAULT_VIGIL_PROMPT, DREAM_MODE_SECTION };
