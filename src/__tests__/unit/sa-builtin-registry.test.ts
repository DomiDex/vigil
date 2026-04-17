import { describe, expect, it } from "bun:test";
import {
  BUILTIN_SPECIALISTS,
  CODE_REVIEW_AGENT,
  SECURITY_AGENT,
  TEST_DRIFT_AGENT,
} from "../../specialists/agents/index.ts";

describe("BUILTIN_SPECIALISTS registry", () => {
  it("contains exactly 3 agents", () => {
    expect(BUILTIN_SPECIALISTS).toHaveLength(3);
  });

  it("has correct agent names in order", () => {
    const names = BUILTIN_SPECIALISTS.map((a) => a.name);
    expect(names).toEqual(["code-review", "security", "test-drift"]);
  });

  it("every agent has buildPrompt defined", () => {
    for (const agent of BUILTIN_SPECIALISTS) {
      expect(agent.buildPrompt).toBeDefined();
      expect(typeof agent.buildPrompt).toBe("function");
    }
  });

  it("every agent has class 'analytical'", () => {
    for (const agent of BUILTIN_SPECIALISTS) {
      expect(agent.class).toBe("analytical");
    }
  });

  it("re-exports individual agents", () => {
    expect(CODE_REVIEW_AGENT).toBeDefined();
    expect(SECURITY_AGENT).toBeDefined();
    expect(TEST_DRIFT_AGENT).toBeDefined();
  });

  it("re-exported agents are the same references as array entries", () => {
    expect(BUILTIN_SPECIALISTS[0]).toBe(CODE_REVIEW_AGENT);
    expect(BUILTIN_SPECIALISTS[1]).toBe(SECURITY_AGENT);
    expect(BUILTIN_SPECIALISTS[2]).toBe(TEST_DRIFT_AGENT);
  });
});
