import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { DEFAULT_GATE_CONFIG, type VigilConfig } from "../../core/config.ts";
import { DecisionEngine, resetCircuitBreaker } from "../../llm/decision-max.ts";

const testConfig: VigilConfig = {
  tickInterval: 30,
  blockingBudget: 15,
  sleepAfter: 900,
  sleepTickInterval: 300,
  dreamAfter: 300,
  tickModel: "claude-haiku-4-5-20251001",
  escalationModel: "claude-sonnet-4-6",
  maxEventWindow: 100,
  notifyBackends: ["file"],
  webhookUrl: "",
  desktopNotify: true,
  allowModerateActions: false,
  actions: { ...DEFAULT_GATE_CONFIG },
};

describe("DecisionEngine agent filters", () => {
  let engine: DecisionEngine;
  let tmpDir: string;

  beforeEach(async () => {
    resetCircuitBreaker();
    engine = new DecisionEngine(testConfig);
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vigil-filter-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns null (pass) when no agent is loaded", () => {
    const result = engine.checkAgentFilters("/fake/repo", "new_commit", ["src/index.ts"]);
    expect(result).toBeNull();
  });

  it("filters events by triggerEvents", async () => {
    const agentDir = path.join(tmpDir, ".claude", "agents");
    await fs.mkdir(agentDir, { recursive: true });
    await fs.writeFile(
      path.join(agentDir, "vigil.md"),
      `---
name: test
triggerEvents:
  - new_commit
  - branch_switch
---

Instructions.`,
    );

    await engine.loadAgent(tmpDir);

    // Matching event type
    expect(engine.checkAgentFilters(tmpDir, "new_commit")).toBeNull();
    expect(engine.checkAgentFilters(tmpDir, "branch_switch")).toBeNull();

    // Non-matching event type
    const skip = engine.checkAgentFilters(tmpDir, "uncommitted_drift");
    expect(skip).toContain("not subscribed");
  });

  it("filters files by watchPatterns", async () => {
    const agentDir = path.join(tmpDir, ".claude", "agents");
    await fs.mkdir(agentDir, { recursive: true });
    await fs.writeFile(
      path.join(agentDir, "vigil.md"),
      `---
name: test
watchPatterns:
  - "src/auth/**"
  - "*.env*"
---

Instructions.`,
    );

    await engine.loadAgent(tmpDir);

    // Matching files
    expect(engine.checkAgentFilters(tmpDir, undefined, ["src/auth/middleware.ts"])).toBeNull();
    expect(engine.checkAgentFilters(tmpDir, undefined, [".env.local"])).toBeNull();

    // Non-matching files
    const skip = engine.checkAgentFilters(tmpDir, undefined, ["src/utils/helpers.ts", "README.md"]);
    expect(skip).toContain("watch patterns");
  });

  it("loads agent and exposes it via getAgent()", async () => {
    const agentDir = path.join(tmpDir, ".claude", "agents");
    await fs.mkdir(agentDir, { recursive: true });
    await fs.writeFile(
      path.join(agentDir, "vigil.md"),
      `---
name: my-agent
description: A test agent
model: sonnet
---

Do things.`,
    );

    expect(engine.getAgent(tmpDir)).toBeNull();
    await engine.loadAgent(tmpDir);
    const agent = engine.getAgent(tmpDir);
    expect(agent).not.toBeNull();
    expect(agent!.name).toBe("my-agent");
    expect(agent!.model).toBe("sonnet");
  });

  it("returns null from loadAgent when no agent file exists", async () => {
    const agent = await engine.loadAgent(tmpDir);
    expect(agent).toBeNull();
    expect(engine.getAgent(tmpDir)).toBeNull();
  });
});
