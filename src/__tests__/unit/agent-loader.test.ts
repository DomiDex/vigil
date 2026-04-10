import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { listAgentDefinitions, loadAgentDefinition, parseAgentFile } from "../../agent/agent-loader.ts";

describe("Agent Loader", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vigil-agent-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("parseAgentFile()", () => {
    it("parses file with YAML frontmatter and markdown body", () => {
      const raw = `---
name: vigil-security
description: Security-focused monitor
model: sonnet
tools:
  - grep
  - read
watchPatterns:
  - "src/auth/**"
  - "*.env*"
triggerEvents:
  - new_commit
  - branch_switch
---

# Security Monitor

Watch for auth changes and secret leaks.`;

      const result = parseAgentFile(raw, "vigil.md");
      expect(result.name).toBe("vigil-security");
      expect(result.description).toBe("Security-focused monitor");
      expect(result.model).toBe("sonnet");
      expect(result.tools).toEqual(["grep", "read"]);
      expect(result.watchPatterns).toEqual(["src/auth/**", "*.env*"]);
      expect(result.triggerEvents).toEqual(["new_commit", "branch_switch"]);
      expect(result.systemPrompt).toContain("# Security Monitor");
      expect(result.systemPrompt).toContain("Watch for auth changes");
    });

    it("handles file with no frontmatter", () => {
      const raw = "You are a simple watcher. Just monitor things.";
      const result = parseAgentFile(raw, "simple.md");
      expect(result.name).toBe("simple");
      expect(result.description).toBe("Custom Vigil agent");
      expect(result.systemPrompt).toBe("You are a simple watcher. Just monitor things.");
      expect(result.model).toBeUndefined();
      expect(result.tools).toBeUndefined();
      expect(result.watchPatterns).toBeUndefined();
      expect(result.triggerEvents).toBeUndefined();
    });

    it("uses filename as name when frontmatter has no name", () => {
      const raw = `---
description: A test agent
---

Some instructions.`;

      const result = parseAgentFile(raw, "my-agent.md");
      expect(result.name).toBe("my-agent");
    });

    it("handles empty frontmatter", () => {
      const raw = `---

---

Instructions here.`;

      const result = parseAgentFile(raw, "empty-meta.md");
      expect(result.name).toBe("empty-meta");
      expect(result.description).toBe("Custom Vigil agent");
      expect(result.systemPrompt).toBe("Instructions here.");
    });

    it("ignores non-array values for tools, watchPatterns, triggerEvents", () => {
      const raw = `---
name: test
tools: "not-an-array"
watchPatterns: 42
triggerEvents: true
---

Body text.`;

      const result = parseAgentFile(raw, "test.md");
      expect(result.tools).toBeUndefined();
      expect(result.watchPatterns).toBeUndefined();
      expect(result.triggerEvents).toBeUndefined();
    });
  });

  describe("loadAgentDefinition()", () => {
    it("loads agent file from .claude/agents/ directory", async () => {
      const agentDir = path.join(tmpDir, ".claude", "agents");
      await fs.mkdir(agentDir, { recursive: true });
      await fs.writeFile(
        path.join(agentDir, "vigil.md"),
        `---
name: test-vigil
description: Test agent
---

Monitor everything.`,
      );

      const result = await loadAgentDefinition(tmpDir);
      expect(result).not.toBeNull();
      expect(result!.name).toBe("test-vigil");
      expect(result!.systemPrompt).toBe("Monitor everything.");
    });

    it("returns null when no agent file exists", async () => {
      const result = await loadAgentDefinition(tmpDir);
      expect(result).toBeNull();
    });

    it("loads a custom agent file by name", async () => {
      const agentDir = path.join(tmpDir, ".claude", "agents");
      await fs.mkdir(agentDir, { recursive: true });
      await fs.writeFile(path.join(agentDir, "reviewer.md"), "Review all PRs carefully.");

      const result = await loadAgentDefinition(tmpDir, "reviewer.md");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("reviewer");
      expect(result!.systemPrompt).toBe("Review all PRs carefully.");
    });
  });

  describe("listAgentDefinitions()", () => {
    it("lists all .md files in agents directory", async () => {
      const agentDir = path.join(tmpDir, ".claude", "agents");
      await fs.mkdir(agentDir, { recursive: true });
      await fs.writeFile(path.join(agentDir, "vigil.md"), "Agent 1");
      await fs.writeFile(path.join(agentDir, "reviewer.md"), "Agent 2");
      await fs.writeFile(path.join(agentDir, "not-md.txt"), "Not an agent");

      const agents = await listAgentDefinitions(tmpDir);
      expect(agents.length).toBe(2);
      const names = agents.map((a) => a.name).sort();
      expect(names).toEqual(["reviewer", "vigil"]);
    });

    it("returns empty array when directory doesn't exist", async () => {
      const agents = await listAgentDefinitions(tmpDir);
      expect(agents).toEqual([]);
    });
  });
});
