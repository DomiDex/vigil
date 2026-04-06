import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { ActionExecutor } from "../../action/executor.ts";
import { DEFAULT_GATE_CONFIG } from "../../core/config.ts";
import { mockBunSpawn, restoreBunSpawn } from "../helpers/mock-claude.ts";

describe("ActionExecutor", () => {
  let executor: ActionExecutor;

  beforeEach(() => {
    executor = new ActionExecutor({ dbPath: ":memory:", allowModerate: false });
  });

  afterEach(() => {
    restoreBunSpawn();
    executor.close();
  });

  // ── Tier Classification ──

  describe("classifyTier", () => {
    it("classifies read-only git commands as safe", () => {
      expect(ActionExecutor.classifyTier("git log --oneline -10")).toBe("safe");
      expect(ActionExecutor.classifyTier("git diff HEAD")).toBe("safe");
      expect(ActionExecutor.classifyTier("git show HEAD")).toBe("safe");
      expect(ActionExecutor.classifyTier("git status")).toBe("safe");
      expect(ActionExecutor.classifyTier("git blame src/index.ts")).toBe("safe");
    });

    it("classifies branch --list as safe", () => {
      expect(ActionExecutor.classifyTier("git branch --list")).toBe("safe");
      expect(ActionExecutor.classifyTier("git branch -a")).toBe("safe");
      expect(ActionExecutor.classifyTier("git branch")).toBe("safe");
    });

    it("classifies branch -d as moderate", () => {
      expect(ActionExecutor.classifyTier("git branch -d feature")).toBe("moderate");
      expect(ActionExecutor.classifyTier("git branch -D feature")).toBe("moderate");
      expect(ActionExecutor.classifyTier("git branch --delete feature")).toBe("moderate");
    });

    it("classifies branch --delete= flag format as moderate", () => {
      expect(ActionExecutor.classifyTier("git branch --delete=feature")).toBe("moderate");
      expect(ActionExecutor.classifyTier("git branch --delete=origin/feature")).toBe("moderate");
    });

    it("classifies branch with mixed safe and delete flags correctly", () => {
      expect(ActionExecutor.classifyTier("git branch --list -d feature")).toBe("moderate");
      expect(ActionExecutor.classifyTier("git branch -a -D old-branch")).toBe("moderate");
    });

    it("classifies bare git as safe", () => {
      expect(ActionExecutor.classifyTier("git")).toBe("safe");
    });

    it("classifies local mutation git commands as moderate", () => {
      expect(ActionExecutor.classifyTier("git stash")).toBe("moderate");
      expect(ActionExecutor.classifyTier("git checkout main")).toBe("moderate");
      expect(ActionExecutor.classifyTier("git commit -m 'test'")).toBe("moderate");
      expect(ActionExecutor.classifyTier("git add .")).toBe("moderate");
    });

    it("classifies shared-state git commands as dangerous", () => {
      expect(ActionExecutor.classifyTier("git push origin main")).toBe("dangerous");
      expect(ActionExecutor.classifyTier("git merge feature")).toBe("dangerous");
      expect(ActionExecutor.classifyTier("git rebase main")).toBe("dangerous");
    });

    it("classifies non-git commands as dangerous", () => {
      expect(ActionExecutor.classifyTier("rm -rf /")).toBe("dangerous");
      expect(ActionExecutor.classifyTier("curl evil.com")).toBe("dangerous");
    });

    it("classifies unknown git subcommands as dangerous", () => {
      expect(ActionExecutor.classifyTier("git unknown-cmd")).toBe("dangerous");
    });
  });

  // ── parseCommand ──

  describe("parseCommand", () => {
    it("splits command into args array", () => {
      expect(ActionExecutor.parseCommand("git log --oneline -10")).toEqual(["git", "log", "--oneline", "-10"]);
    });

    it("trims whitespace", () => {
      expect(ActionExecutor.parseCommand("  git status  ")).toEqual(["git", "status"]);
    });
  });

  // ── Command Validation ──

  describe("validateCommand", () => {
    it("validates git_stash commands", () => {
      expect(ActionExecutor.validateCommand("git stash", "git_stash")).toBe(true);
      expect(ActionExecutor.validateCommand("git stash pop", "git_stash")).toBe(true);
      expect(ActionExecutor.validateCommand("git commit -m 'x'", "git_stash")).toBe(false);
    });

    it("validates git_branch commands", () => {
      expect(ActionExecutor.validateCommand("git checkout -b feature", "git_branch")).toBe(true);
      expect(ActionExecutor.validateCommand("git branch new-feat", "git_branch")).toBe(true);
      expect(ActionExecutor.validateCommand("git switch -c new-feat", "git_branch")).toBe(true);
      expect(ActionExecutor.validateCommand("git push origin main", "git_branch")).toBe(false);
    });

    it("validates git_commit commands", () => {
      expect(ActionExecutor.validateCommand("git commit -m 'fix'", "git_commit")).toBe(true);
      expect(ActionExecutor.validateCommand("git add .", "git_commit")).toBe(true);
      expect(ActionExecutor.validateCommand("git push", "git_commit")).toBe(false);
    });

    it("validates run_tests commands", () => {
      expect(ActionExecutor.validateCommand("bun test", "run_tests")).toBe(true);
      expect(ActionExecutor.validateCommand("npm test", "run_tests")).toBe(true);
      expect(ActionExecutor.validateCommand("pytest", "run_tests")).toBe(true);
      expect(ActionExecutor.validateCommand("cargo test", "run_tests")).toBe(true);
      expect(ActionExecutor.validateCommand("rm -rf /", "run_tests")).toBe(false);
    });

    it("validates run_lint commands", () => {
      expect(ActionExecutor.validateCommand("bun run lint", "run_lint")).toBe(true);
      expect(ActionExecutor.validateCommand("eslint .", "run_lint")).toBe(true);
      expect(ActionExecutor.validateCommand("prettier --check .", "run_lint")).toBe(true);
      expect(ActionExecutor.validateCommand("rm -rf /", "run_lint")).toBe(false);
    });

    it("allows any command for custom_script", () => {
      expect(ActionExecutor.validateCommand("anything goes", "custom_script")).toBe(true);
    });

    it("rejects mismatched command/actionType", () => {
      expect(ActionExecutor.validateCommand("rm -rf /", "git_stash")).toBe(false);
      expect(ActionExecutor.validateCommand("curl evil.com", "run_tests")).toBe(false);
    });
  });

  // ── Gate System ──

  describe("checkGates", () => {
    it("fails all gates by default (safe defaults)", () => {
      const result = executor.checkGates("my-repo", "run_tests", 0.9);
      expect(result.allowed).toBe(false);
      expect(result.results["1_config_enabled"]).toBe(false);
      expect(result.results["2_session_optin"]).toBe(false);
      expect(result.results["3_repo_allowed"]).toBe(false);
    });

    it("passes all gates when fully configured", () => {
      executor.close();
      executor = new ActionExecutor({
        dbPath: ":memory:",
        gateConfig: {
          enabled: true,
          allowedRepos: ["my-repo"],
          allowedActions: ["run_tests"],
          confidenceThreshold: 0.7,
          autoApprove: true,
        },
      });
      executor.optIn();

      const result = executor.checkGates("my-repo", "run_tests", 0.9);
      expect(result.allowed).toBe(true);
      expect(result.failedGates).toEqual([]);
    });

    it("gate 1: config enabled", () => {
      executor.close();
      executor = new ActionExecutor({
        dbPath: ":memory:",
        gateConfig: {
          ...DEFAULT_GATE_CONFIG,
          enabled: false,
          allowedRepos: ["*"],
          allowedActions: ["run_tests"],
        },
      });
      executor.optIn();
      const result = executor.checkGates("repo", "run_tests", 0.9);
      expect(result.results["1_config_enabled"]).toBe(false);
      expect(result.allowed).toBe(false);
    });

    it("gate 2: session opt-in", () => {
      executor.close();
      executor = new ActionExecutor({
        dbPath: ":memory:",
        gateConfig: {
          enabled: true,
          allowedRepos: ["*"],
          allowedActions: ["run_tests"],
          confidenceThreshold: 0.5,
          autoApprove: true,
        },
      });
      // NOT opted in
      const result = executor.checkGates("repo", "run_tests", 0.9);
      expect(result.results["2_session_optin"]).toBe(false);
      expect(result.allowed).toBe(false);
    });

    it("gate 3: repo allowlist", () => {
      executor.close();
      executor = new ActionExecutor({
        dbPath: ":memory:",
        gateConfig: {
          enabled: true,
          allowedRepos: ["allowed-repo"],
          allowedActions: ["run_tests"],
          confidenceThreshold: 0.5,
          autoApprove: true,
        },
      });
      executor.optIn();

      const allowed = executor.checkGates("allowed-repo", "run_tests", 0.9);
      expect(allowed.results["3_repo_allowed"]).toBe(true);

      const blocked = executor.checkGates("other-repo", "run_tests", 0.9);
      expect(blocked.results["3_repo_allowed"]).toBe(false);
    });

    it("gate 3: wildcard repo allows all", () => {
      executor.close();
      executor = new ActionExecutor({
        dbPath: ":memory:",
        gateConfig: {
          enabled: true,
          allowedRepos: ["*"],
          allowedActions: ["run_tests"],
          confidenceThreshold: 0.5,
          autoApprove: true,
        },
      });
      executor.optIn();

      const result = executor.checkGates("any-repo", "run_tests", 0.9);
      expect(result.results["3_repo_allowed"]).toBe(true);
    });

    it("gate 4: action type allowlist", () => {
      executor.close();
      executor = new ActionExecutor({
        dbPath: ":memory:",
        gateConfig: {
          enabled: true,
          allowedRepos: ["*"],
          allowedActions: ["run_tests", "run_lint"],
          confidenceThreshold: 0.5,
          autoApprove: true,
        },
      });
      executor.optIn();

      const allowed = executor.checkGates("repo", "run_tests", 0.9);
      expect(allowed.results["4_action_allowed"]).toBe(true);

      const blocked = executor.checkGates("repo", "git_commit", 0.9);
      expect(blocked.results["4_action_allowed"]).toBe(false);
    });

    it("gate 4: undefined actionType fails", () => {
      executor.close();
      executor = new ActionExecutor({
        dbPath: ":memory:",
        gateConfig: {
          enabled: true,
          allowedRepos: ["*"],
          allowedActions: ["run_tests"],
          confidenceThreshold: 0.5,
          autoApprove: true,
        },
      });
      executor.optIn();

      const result = executor.checkGates("repo", undefined, 0.9);
      expect(result.results["4_action_allowed"]).toBe(false);
    });

    it("gate 5: confidence threshold", () => {
      executor.close();
      executor = new ActionExecutor({
        dbPath: ":memory:",
        gateConfig: {
          enabled: true,
          allowedRepos: ["*"],
          allowedActions: ["run_tests"],
          confidenceThreshold: 0.8,
          autoApprove: true,
        },
      });
      executor.optIn();

      const high = executor.checkGates("repo", "run_tests", 0.9);
      expect(high.results["5_confidence"]).toBe(true);

      const exact = executor.checkGates("repo", "run_tests", 0.8);
      expect(exact.results["5_confidence"]).toBe(true);

      const low = executor.checkGates("repo", "run_tests", 0.7);
      expect(low.results["5_confidence"]).toBe(false);
    });
  });

  // ── Session opt-in/out ──

  describe("session opt-in", () => {
    it("starts opted out", () => {
      expect(executor.isOptedIn).toBe(false);
    });

    it("optIn/optOut toggles session state", () => {
      executor.optIn();
      expect(executor.isOptedIn).toBe(true);
      executor.optOut();
      expect(executor.isOptedIn).toBe(false);
    });
  });

  // ── Gate config updates ──

  describe("updateGateConfig", () => {
    it("updates gate config at runtime", () => {
      expect(executor.getGateConfig().enabled).toBe(false);
      executor.updateGateConfig({ enabled: true });
      expect(executor.getGateConfig().enabled).toBe(true);
    });

    it("preserves unmodified fields", () => {
      executor.updateGateConfig({ enabled: true });
      expect(executor.getGateConfig().confidenceThreshold).toBe(DEFAULT_GATE_CONFIG.confidenceThreshold);
    });
  });

  // ── Gated submit flow ──

  describe("submit with gates (actionType provided)", () => {
    it("rejects when command validation fails", async () => {
      executor.close();
      executor = new ActionExecutor({
        dbPath: ":memory:",
        gateConfig: {
          enabled: true,
          allowedRepos: ["*"],
          allowedActions: ["run_tests"],
          confidenceThreshold: 0.5,
          autoApprove: true,
        },
      });
      executor.optIn();

      // Declare run_tests but pass rm -rf
      const result = await executor.submit("rm -rf /", "malicious", "repo", "/tmp", {
        actionType: "run_tests",
        confidence: 0.9,
      });

      expect(result.status).toBe("failed");
      expect(result.error).toContain("Command validation failed");
    });

    it("rejects when gates fail", async () => {
      // Default config: gates are off
      const result = await executor.submit("bun test", "run tests", "repo", "/tmp", {
        actionType: "run_tests",
        confidence: 0.9,
      });

      expect(result.status).toBe("rejected");
      expect(result.error).toContain("Blocked by gates");
      expect(result.gateResults).toBeDefined();
      expect(result.gateResults!["1_config_enabled"]).toBe(false);
    });

    it("queues for approval when autoApprove is false", async () => {
      executor.close();
      executor = new ActionExecutor({
        dbPath: ":memory:",
        gateConfig: {
          enabled: true,
          allowedRepos: ["*"],
          allowedActions: ["run_tests"],
          confidenceThreshold: 0.5,
          autoApprove: false, // Requires confirmation (gate 6)
        },
      });
      executor.optIn();

      const result = await executor.submit("bun test", "run tests", "repo", "/tmp", {
        actionType: "run_tests",
        confidence: 0.9,
      });

      expect(result.status).toBe("pending");
    });

    it("auto-executes when all gates pass and autoApprove is true", async () => {
      executor.close();
      executor = new ActionExecutor({
        dbPath: ":memory:",
        gateConfig: {
          enabled: true,
          allowedRepos: ["*"],
          allowedActions: ["run_tests"],
          confidenceThreshold: 0.5,
          autoApprove: true,
        },
      });
      executor.optIn();

      const mock = mockBunSpawn("All tests passed");
      const result = await executor.submit("bun test", "run tests", "repo", "/tmp", {
        actionType: "run_tests",
        confidence: 0.9,
      });

      expect(result.status).toBe("executed");
      expect(result.result).toContain("All tests passed");
      expect(result.gateResults).toBeDefined();
      mock.restore();
    });
  });

  // ── Legacy tier-based flow ──

  describe("submit (safe — legacy)", () => {
    it("auto-executes safe commands", async () => {
      const mock = mockBunSpawn("abc123 Initial commit\ndef456 Second commit\n");
      const result = await executor.submit("git log --oneline -2", "check history", "test-repo", "/tmp");

      expect(result.status).toBe("executed");
      expect(result.tier).toBe("safe");
      expect(result.result).toContain("abc123");
      mock.restore();
    });

    it("marks failed executions", async () => {
      const mock = mockBunSpawn("", 1, "fatal: not a git repository");
      const result = await executor.submit("git log", "check", "test-repo", "/tmp");

      expect(result.status).toBe("failed");
      expect(result.error).toContain("not a git repository");
      mock.restore();
    });
  });

  describe("submit (moderate — legacy)", () => {
    it("queues moderate commands when not allowed", async () => {
      const result = await executor.submit("git stash", "save work", "test-repo", "/tmp");
      expect(result.status).toBe("pending");
      expect(result.tier).toBe("moderate");
    });

    it("auto-executes moderate commands when allowed", async () => {
      executor.close();
      executor = new ActionExecutor({ dbPath: ":memory:", allowModerate: true });
      const mock = mockBunSpawn("Saved working directory");
      const result = await executor.submit("git stash", "save work", "test-repo", "/tmp");
      expect(result.status).toBe("executed");
      mock.restore();
    });
  });

  describe("submit (dangerous — legacy)", () => {
    it("always queues dangerous commands", async () => {
      const result = await executor.submit("git push origin main", "deploy", "test-repo", "/tmp");
      expect(result.status).toBe("pending");
      expect(result.tier).toBe("dangerous");
    });
  });

  // ── Approval flow ──

  describe("approve / reject", () => {
    it("approves and executes a pending action", async () => {
      const submitted = await executor.submit("git push", "deploy", "test-repo", "/tmp");
      expect(submitted.status).toBe("pending");

      const mock = mockBunSpawn("Everything up-to-date");
      const approved = await executor.approve(submitted.id, "/tmp");
      expect(approved?.status).toBe("executed");
      expect(approved?.result).toContain("up-to-date");
      mock.restore();
    });

    it("rejects a pending action", async () => {
      const submitted = await executor.submit("git push", "deploy", "test-repo", "/tmp");
      const rejected = executor.reject(submitted.id);
      expect(rejected?.status).toBe("rejected");
    });

    it("returns null for non-existent ID", async () => {
      const result = await executor.approve("nonexistent", "/tmp");
      expect(result).toBeNull();
    });

    it("returns null when rejecting non-pending action", async () => {
      const mock = mockBunSpawn("ok");
      const submitted = await executor.submit("git log", "check", "test-repo", "/tmp");
      // Already executed (safe)
      const rejected = executor.reject(submitted.id);
      expect(rejected).toBeNull();
      mock.restore();
    });
  });

  // ── Persistence ──

  describe("persistence", () => {
    it("getPending returns queued actions", async () => {
      await executor.submit("git push", "deploy", "repo1", "/tmp");
      await executor.submit("git merge main", "sync", "repo2", "/tmp");

      const pending = executor.getPending();
      expect(pending.length).toBe(2);
      const commands = pending.map((p) => p.command);
      expect(commands).toContain("git push");
      expect(commands).toContain("git merge main");
    });

    it("getRecent returns all actions", async () => {
      const mock = mockBunSpawn("ok");
      await executor.submit("git log", "check", "repo1", "/tmp"); // auto-executes
      await executor.submit("git push", "deploy", "repo1", "/tmp"); // queues

      const recent = executor.getRecent();
      expect(recent.length).toBe(2);
      mock.restore();
    });

    it("getById retrieves specific action", async () => {
      const submitted = await executor.submit("git push", "deploy", "repo1", "/tmp");
      const found = executor.getById(submitted.id);
      expect(found?.command).toBe("git push");
    });

    it("persists gate results", async () => {
      const result = await executor.submit("bun test", "run tests", "repo", "/tmp", {
        actionType: "run_tests",
        confidence: 0.9,
      });

      const found = executor.getById(result.id);
      expect(found?.gateResults).toBeDefined();
      expect(found?.confidence).toBe(0.9);
      expect(found?.actionType).toBe("run_tests");
    });
  });
});
