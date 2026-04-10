import { describe, expect, it } from "bun:test";
import type { AgentDefinition } from "../../agent/agent-loader.ts";
import {
  buildVigilSystemPrompt,
  DEFAULT_VIGIL_PROMPT,
  DREAM_MODE_SECTION,
  type RepoContext,
  type SystemPromptConfig,
} from "../../agent/system-prompt.ts";

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

  it("formats commits as individual list items", () => {
    const config: SystemPromptConfig = {
      agentDefinition: null,
      repoContext: baseRepoContext,
      isProactive: false,
    };
    const result = buildVigilSystemPrompt(config);
    expect(result).toContain("  - abc1234");
    expect(result).toContain("  - def5678");
    expect(result).toContain("  - src/index.ts");
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
    expect(result).toContain("none");
    expect(result).toContain("clean");
  });

  it("injects a timestamp into repo context", () => {
    const config: SystemPromptConfig = {
      agentDefinition: null,
      repoContext: baseRepoContext,
      isProactive: false,
    };
    const result = buildVigilSystemPrompt(config);
    expect(result).toContain("**Timestamp**:");
    // Should be a valid ISO date (at least starts with 20xx)
    expect(result).toMatch(/\*\*Timestamp\*\*: 20\d{2}-\d{2}-\d{2}T/);
  });

  it("includes decision framework in default prompt", () => {
    expect(DEFAULT_VIGIL_PROMPT).toContain("# Decision Framework");
    expect(DEFAULT_VIGIL_PROMPT).toContain("SILENT");
    expect(DEFAULT_VIGIL_PROMPT).toContain("OBSERVE");
    expect(DEFAULT_VIGIL_PROMPT).toContain("NOTIFY");
    expect(DEFAULT_VIGIL_PROMPT).toContain("ACT");
  });

  it("includes risk signals in default prompt", () => {
    expect(DEFAULT_VIGIL_PROMPT).toContain("# Risk Signals");
    expect(DEFAULT_VIGIL_PROMPT).toContain("Secrets or credentials");
    expect(DEFAULT_VIGIL_PROMPT).toContain("Force-pushes");
  });

  it("includes temporal awareness in default prompt", () => {
    expect(DEFAULT_VIGIL_PROMPT).toContain("# Temporal Awareness");
    expect(DEFAULT_VIGIL_PROMPT).toContain("Drift over time");
  });

  it("includes output format in default prompt", () => {
    expect(DEFAULT_VIGIL_PROMPT).toContain("# Output Format");
    expect(DEFAULT_VIGIL_PROMPT).toContain("[info]");
    expect(DEFAULT_VIGIL_PROMPT).toContain("[warn]");
    expect(DEFAULT_VIGIL_PROMPT).toContain("[risk]");
  });

  it("appends dream mode section when mode is dream", () => {
    const config: SystemPromptConfig = {
      agentDefinition: null,
      repoContext: baseRepoContext,
      isProactive: false,
      mode: "dream",
    };
    const result = buildVigilSystemPrompt(config);
    expect(result).toContain(DREAM_MODE_SECTION);
    expect(result).toContain("Dream Mode");
    expect(result).toContain("consolidation mode");
  });

  it("does not include dream section in tick mode", () => {
    const config: SystemPromptConfig = {
      agentDefinition: null,
      repoContext: baseRepoContext,
      isProactive: false,
      mode: "tick",
    };
    const result = buildVigilSystemPrompt(config);
    expect(result).not.toContain(DREAM_MODE_SECTION);
  });

  it("does not include dream section when mode is omitted", () => {
    const config: SystemPromptConfig = {
      agentDefinition: null,
      repoContext: baseRepoContext,
      isProactive: false,
    };
    const result = buildVigilSystemPrompt(config);
    expect(result).not.toContain(DREAM_MODE_SECTION);
  });
});
