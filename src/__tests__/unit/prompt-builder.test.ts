import { describe, expect, it } from "bun:test";
import type { AgentDefinition } from "../../agent/agent-loader.ts";
import { DEFAULT_VIGIL_PROMPT, DREAM_MODE_SECTION } from "../../agent/system-prompt.ts";
import { PromptBuilder } from "../../prompts/builder.ts";

const mockAgent: AgentDefinition = {
  name: "test-agent",
  description: "A test agent",
  systemPrompt: "You are a custom agent.",
};

describe("PromptBuilder", () => {
  it("builds prompt with default identity when no agent", async () => {
    const builder = new PromptBuilder();
    const result = await builder.build({
      agent: null,
      isProactive: false,
      repoState: () => "repo state here",
    });

    expect(result).toContain(DEFAULT_VIGIL_PROMPT);
    expect(result).toContain("repo state here");
  });

  it("uses agent systemPrompt when not proactive", async () => {
    const builder = new PromptBuilder();
    const result = await builder.build({
      agent: mockAgent,
      isProactive: false,
      repoState: () => "repo state",
    });

    expect(result).toContain("You are a custom agent.");
    expect(result).not.toContain(DEFAULT_VIGIL_PROMPT);
  });

  it("appends agent to default in proactive mode", async () => {
    const builder = new PromptBuilder();
    const result = await builder.build({
      agent: mockAgent,
      isProactive: true,
      repoState: () => "repo state",
    });

    expect(result).toContain(DEFAULT_VIGIL_PROMPT);
    expect(result).toContain("Custom Agent Instructions");
    expect(result).toContain("You are a custom agent.");
  });

  it("includes dream mode section", async () => {
    const builder = new PromptBuilder();
    const result = await builder.build({
      agent: null,
      isProactive: false,
      mode: "dream",
      repoState: () => "repo state",
    });

    expect(result).toContain(DREAM_MODE_SECTION);
  });

  it("includes tick context when provided", async () => {
    const builder = new PromptBuilder();
    const result = await builder.build({
      agent: null,
      isProactive: false,
      repoState: () => "repo state",
      tickContext: "tick signal: new commit detected",
    });

    expect(result).toContain("tick signal: new commit detected");
  });

  it("includes features when provided", async () => {
    const builder = new PromptBuilder();
    const result = await builder.build({
      agent: null,
      isProactive: false,
      repoState: () => "repo state",
      features: ["channels", "webhooks"],
    });

    expect(result).toContain("# Active Features");
    expect(result).toContain("- channels");
    expect(result).toContain("- webhooks");
  });

  it("caches stable sections across calls", async () => {
    const builder = new PromptBuilder();
    let repoCallCount = 0;

    const buildOpts = () => ({
      agent: null as AgentDefinition | null,
      isProactive: false,
      repoState: () => {
        repoCallCount++;
        return `repo-v${repoCallCount}`;
      },
    });

    const first = await builder.build(buildOpts());
    const second = await builder.build(buildOpts());

    // Repo state is ephemeral — should be recomputed
    expect(first).toContain("repo-v1");
    expect(second).toContain("repo-v2");
    expect(repoCallCount).toBe(2);

    // Both should contain the same identity (cached)
    expect(first).toContain(DEFAULT_VIGIL_PROMPT);
    expect(second).toContain(DEFAULT_VIGIL_PROMPT);
  });

  it("invalidates agent identity on onAgentReloaded", async () => {
    const builder = new PromptBuilder();

    // First build with no agent
    await builder.build({
      agent: null,
      isProactive: false,
      repoState: () => "state",
    });

    // Reload agent — should invalidate identity cache
    builder.onAgentReloaded();

    // Second build with agent — should pick up new identity
    const result = await builder.build({
      agent: mockAgent,
      isProactive: false,
      repoState: () => "state",
    });

    expect(result).toContain("You are a custom agent.");
    expect(result).not.toContain(DEFAULT_VIGIL_PROMPT);
  });

  it("onConfigChanged invalidates session scope", async () => {
    const builder = new PromptBuilder();

    await builder.build({
      agent: null,
      isProactive: false,
      repoState: () => "state",
      features: ["old-feature"],
    });

    builder.onConfigChanged();

    const result = await builder.build({
      agent: null,
      isProactive: false,
      repoState: () => "state",
      features: ["new-feature"],
    });

    expect(result).toContain("- new-feature");
    expect(result).not.toContain("- old-feature");
  });

  it("appends additional instructions when agent + custom both present", async () => {
    const builder = new PromptBuilder();
    const result = await builder.build({
      agent: mockAgent,
      isProactive: false,
      customInstructions: "Also check for typos.",
      repoState: () => "state",
    });

    expect(result).toContain("# Additional Instructions");
    expect(result).toContain("Also check for typos.");
  });

  it("sections are joined with --- separator", async () => {
    const builder = new PromptBuilder();
    const result = await builder.build({
      agent: null,
      isProactive: false,
      repoState: () => "repo state",
    });

    expect(result).toContain("\n\n---\n\n");
  });
});
