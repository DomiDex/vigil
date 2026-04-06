import { describe, expect, it } from "bun:test";
import {
  buildVigilSystemPrompt,
  DEFAULT_VIGIL_PROMPT,
  type RepoContext,
  type SystemPromptConfig,
} from "../../agent/system-prompt.ts";
import type { AgentDefinition } from "../../agent/agent-loader.ts";

const baseRepoContext: RepoContext = {
  repoName: "my-app",
  currentBranch: "main",
  recentCommits: ["abc1234", "def5678"],
  uncommittedFiles: ["src/index.ts"],
};

const testAgent: AgentDefinition = {
  name: "vigil-security",
  description: "Security monitor",
  systemPrompt: "You are a security-focused watcher. Flag auth changes.",
  watchPatterns: ["src/auth/**"],
  triggerEvents: ["new_commit"],
};

describe("buildVigilSystemPrompt()", () => {
  it("uses default prompt when no agent or custom instructions", () => {
    const config: SystemPromptConfig = {
      agentDefinition: null,
      repoContext: baseRepoContext,
      isProactive: false,
    };
    const result = buildVigilSystemPrompt(config);
    expect(result).toContain(DEFAULT_VIGIL_PROMPT);
    expect(result).toContain("**Repository**: my-app");
    expect(result).toContain("**Branch**: main");
  });

  it("replaces default with agent prompt in non-proactive mode", () => {
    const config: SystemPromptConfig = {
      agentDefinition: testAgent,
      repoContext: baseRepoContext,
      isProactive: false,
    };
    const result = buildVigilSystemPrompt(config);
    expect(result).toContain("security-focused watcher");
    expect(result).not.toContain(DEFAULT_VIGIL_PROMPT);
    expect(result).toContain("**Repository**: my-app");
  });

  it("appends agent instructions to default in proactive mode", () => {
    const config: SystemPromptConfig = {
      agentDefinition: testAgent,
      repoContext: baseRepoContext,
      isProactive: true,
    };
    const result = buildVigilSystemPrompt(config);
    expect(result).toContain(DEFAULT_VIGIL_PROMPT);
    expect(result).toContain("# Custom Agent Instructions");
    expect(result).toContain("security-focused watcher");
  });

  it("uses custom instructions when no agent is defined", () => {
    const config: SystemPromptConfig = {
      agentDefinition: null,
      repoContext: baseRepoContext,
      isProactive: false,
      customInstructions: "Focus only on package.json changes.",
    };
    const result = buildVigilSystemPrompt(config);
    expect(result).toContain("Focus only on package.json changes.");
    expect(result).not.toContain(DEFAULT_VIGIL_PROMPT);
  });

  it("appends custom instructions when agent is also present", () => {
    const config: SystemPromptConfig = {
      agentDefinition: testAgent,
      repoContext: baseRepoContext,
      isProactive: false,
      customInstructions: "Also flag dependency updates.",
    };
    const result = buildVigilSystemPrompt(config);
    expect(result).toContain("security-focused watcher");
    expect(result).toContain("# Additional Instructions");
    expect(result).toContain("Also flag dependency updates.");
  });

  it("includes repo context with commits and files", () => {
    const config: SystemPromptConfig = {
      agentDefinition: null,
      repoContext: baseRepoContext,
      isProactive: false,
    };
    const result = buildVigilSystemPrompt(config);
    expect(result).toContain("abc1234, def5678");
    expect(result).toContain("src/index.ts");
  });

  it("handles empty commits and files", () => {
    const config: SystemPromptConfig = {
      agentDefinition: null,
      repoContext: {
        repoName: "empty-repo",
        currentBranch: "develop",
        recentCommits: [],
        uncommittedFiles: [],
      },
      isProactive: false,
    };
    const result = buildVigilSystemPrompt(config);
    expect(result).toContain("**Recent commits**: none");
    expect(result).toContain("**Uncommitted files**: clean");
  });
});
