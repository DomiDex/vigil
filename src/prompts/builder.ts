import type { AgentDefinition } from "../agent/agent-loader.ts";
import { DEFAULT_VIGIL_PROMPT, DREAM_MODE_SECTION } from "../agent/system-prompt.ts";
import { formatToolsForPrompt } from "../llm/tools.ts";
import { PromptCache } from "./cache.ts";

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
    isProactive: boolean;
    customInstructions?: string;
    mode?: "tick" | "dream";
    repoState: () => string | Promise<string>;
    tickContext?: string;
    features?: string[];
  }): Promise<string> {
    const sections: string[] = [];

    // Section 1: Agent identity (stable — rarely changes)
    const identity = await this.cache.getSection("agent_identity", "stable", () => {
      if (context.agent && context.isProactive) {
        return `${DEFAULT_VIGIL_PROMPT}\n\n# Custom Agent Instructions\n${context.agent.systemPrompt}`;
      }
      if (context.agent) {
        return context.agent.systemPrompt;
      }
      if (context.customInstructions) {
        return context.customInstructions;
      }
      return DEFAULT_VIGIL_PROMPT;
    });
    sections.push(identity);

    // Dream mode section (stable — static text)
    if (context.mode === "dream") {
      const dream = await this.cache.getSection("dream_mode", "stable", () => DREAM_MODE_SECTION);
      sections.push(dream);
    }

    // Section 2: Tool documentation (stable)
    const tools = await this.cache.getSection("tool_docs", "stable", () => formatToolsForPrompt());
    sections.push(tools);

    // Section 3: Active features (session-scoped)
    if (context.features && context.features.length > 0) {
      const features = await this.cache.getSection(
        "active_features",
        "session",
        () => `# Active Features\n${context.features!.map((f) => `- ${f}`).join("\n")}`,
      );
      sections.push(features);
    }

    // Section 4: Repo state (ephemeral — always fresh)
    const repoState = await this.cache.getSection("repo_state", "ephemeral", context.repoState);
    sections.push(repoState);

    // Section 5: Tick context (ephemeral, optional)
    if (context.tickContext) {
      sections.push(context.tickContext);
    }

    // Additional instructions (when agent + custom both present)
    if (context.agent && context.customInstructions) {
      sections.push(`# Additional Instructions\n${context.customInstructions}`);
    }

    return sections.join("\n\n---\n\n");
  }

  /** Call on rebase/reset to flush all caches. */
  onRebaseDetected(): void {
    this.cache.invalidateAll();
  }

  /** Call on config change to flush session-scoped caches. */
  onConfigChanged(): void {
    this.cache.invalidateScope("session");
  }

  /** Call when agent definition is reloaded. */
  onAgentReloaded(): void {
    this.cache.invalidate("agent_identity");
  }

  /** Get cache stats for diagnostics. */
  getStats() {
    return this.cache.getStats();
  }
}
