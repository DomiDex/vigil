import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context";
import {
  getAgentsJSON,
  getCurrentAgentJSON,
  handleAgentSwitch,
} from "../../dashboard/api/agents";

describe("agents API", () => {
  let ctx: ReturnType<typeof createFakeDashboardContext>;
  let agentDir: string;

  beforeEach(() => {
    agentDir = mkdtempSync(join(tmpdir(), "vigil-agents-test-"));

    writeFileSync(
      join(agentDir, "default.md"),
      [
        "---",
        "name: Default Agent",
        "description: Standard monitoring agent",
        "model: claude-haiku-4-5-20251001",
        "tools:",
        "  - git-watch",
        "  - code-review",
        "watchPatterns:",
        '  - "**/*.ts"',
        "triggers:",
        "  - new_commit",
        "  - branch_switch",
        "---",
        "",
        "You are Vigil, an always-on git monitoring agent.",
      ].join("\n"),
    );

    writeFileSync(
      join(agentDir, "security.md"),
      [
        "---",
        "name: Security Scanner",
        "description: Focused on security vulnerabilities",
        "model: claude-sonnet-4-6",
        "tools:",
        "  - git-watch",
        "  - security-scan",
        "---",
        "",
        "You are a security-focused code reviewer.",
      ].join("\n"),
    );

    // Non-.md file should be ignored
    writeFileSync(join(agentDir, "README.txt"), "This is not an agent file.");

    ctx = createFakeDashboardContext({ agentDir });
  });

  afterEach(() => {
    rmSync(agentDir, { recursive: true, force: true });
  });

  describe("getAgentsJSON", () => {
    it("scans directory and returns agent definitions", async () => {
      const result = await getAgentsJSON(ctx, agentDir);
      expect(result).toBeArray();
      expect(result).toHaveLength(2);
    });

    it("parses YAML frontmatter fields", async () => {
      const result = await getAgentsJSON(ctx, agentDir);
      const defaultAgent = result.find((a: any) => a.name === "Default Agent");
      expect(defaultAgent).toBeDefined();
      expect(defaultAgent.description).toBe("Standard monitoring agent");
      expect(defaultAgent.model).toBe("claude-haiku-4-5-20251001");
      expect(defaultAgent.tools).toEqual(["git-watch", "code-review"]);
    });

    it("parses watchPatterns and triggers", async () => {
      const result = await getAgentsJSON(ctx, agentDir);
      const defaultAgent = result.find((a: any) => a.name === "Default Agent");
      expect(defaultAgent.watchPatterns).toEqual(["**/*.ts"]);
      expect(defaultAgent.triggers).toEqual(["new_commit", "branch_switch"]);
    });

    it("ignores non-.md files", async () => {
      const result = await getAgentsJSON(ctx, agentDir);
      const names = result.map((a: any) => a.name);
      expect(names).not.toContain("README");
    });

    it("returns empty array for non-existent directory", async () => {
      const result = await getAgentsJSON(ctx, "/tmp/nonexistent-agent-dir");
      expect(result).toBeArray();
      expect(result).toHaveLength(0);
    });

    it("handles .md file without frontmatter gracefully", async () => {
      writeFileSync(join(agentDir, "broken.md"), "No frontmatter here.");
      const result = await getAgentsJSON(ctx, agentDir);
      // Should either skip or return with empty/default fields
      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("getCurrentAgentJSON", () => {
    it("returns active persona details", () => {
      const result = getCurrentAgentJSON(ctx);
      expect(result.name).toBeString();
      expect(result).toBeDefined();
    });
  });

  describe("handleAgentSwitch", () => {
    it("switches to a valid agent", async () => {
      const result = await handleAgentSwitch(ctx, { agentName: "security" });
      expect(result.success).toBe(true);
    });

    it("rejects empty agent name", async () => {
      const result = await handleAgentSwitch(ctx, { agentName: "" });
      expect(result.error).toBeDefined();
    });

    it("restarts decision engine after switch", async () => {
      await handleAgentSwitch(ctx, { agentName: "security" });
      expect((ctx.daemon as any).decisionEngine.currentAgent).toBe("security");
    });
  });
});
