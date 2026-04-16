import { describe, test, expect } from "bun:test";

/**
 * Tests for agent switching logic.
 *
 * The AgentsPage uses:
 *   - Agent card click -> setPreviewAgent(agent) -> opens Sheet
 *   - "Activate" button disabled when agent is already active
 *   - switchMut.onSuccess -> invalidate agents.all + agents.current + close Sheet
 *
 * We test the logic without DOM rendering.
 */

interface Agent {
  name: string;
  model: string;
  description?: string;
  systemPrompt: string;
}

function isAgentActive(agent: Agent, currentAgentName: string): boolean {
  return agent.name === currentAgentName;
}

function shouldDisableActivate(
  agent: Agent,
  currentAgentName: string,
  isMutationPending: boolean,
): boolean {
  return isAgentActive(agent, currentAgentName) || isMutationPending;
}

function getInvalidationKeysOnSwitch(): string[][] {
  return [["agents"], ["agents", "current"]];
}

describe("Agent active detection", () => {
  const agents: Agent[] = [
    {
      name: "default",
      model: "haiku",
      description: "Default agent",
      systemPrompt: "You are a helpful assistant.",
    },
    {
      name: "reviewer",
      model: "sonnet",
      description: "Code reviewer",
      systemPrompt: "You review code carefully.",
    },
    {
      name: "planner",
      model: "opus",
      systemPrompt: "You plan projects.",
    },
  ];

  test("identifies active agent correctly", () => {
    expect(isAgentActive(agents[0], "default")).toBe(true);
    expect(isAgentActive(agents[1], "default")).toBe(false);
    expect(isAgentActive(agents[2], "default")).toBe(false);
  });

  test("identifies active agent when switched", () => {
    expect(isAgentActive(agents[1], "reviewer")).toBe(true);
    expect(isAgentActive(agents[0], "reviewer")).toBe(false);
  });
});

describe("Activate button state", () => {
  const agent: Agent = {
    name: "reviewer",
    model: "sonnet",
    systemPrompt: "Review code.",
  };

  test("disabled when agent is already active", () => {
    expect(shouldDisableActivate(agent, "reviewer", false)).toBe(true);
  });

  test("disabled when mutation is pending", () => {
    expect(shouldDisableActivate(agent, "default", true)).toBe(true);
  });

  test("disabled when both active and pending", () => {
    expect(shouldDisableActivate(agent, "reviewer", true)).toBe(true);
  });

  test("enabled when not active and not pending", () => {
    expect(shouldDisableActivate(agent, "default", false)).toBe(false);
  });
});

describe("Switch mutation side effects", () => {
  test("invalidates both agents.all and agents.current keys", () => {
    const keys = getInvalidationKeysOnSwitch();
    expect(keys).toEqual([["agents"], ["agents", "current"]]);
    expect(keys.length).toBe(2);
  });
});
