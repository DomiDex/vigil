import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { ActionExecutor } from "../../action/executor.ts";
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
      // --list combined with -d should still be moderate (delete intent wins)
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
      expect(ActionExecutor.parseCommand("git log --oneline -10")).toEqual([
        "git",
        "log",
        "--oneline",
        "-10",
      ]);
    });

    it("trims whitespace", () => {
      expect(ActionExecutor.parseCommand("  git status  ")).toEqual(["git", "status"]);
    });
  });

  // ── Safe auto-execution ──

  describe("submit (safe)", () => {
    it("auto-executes safe commands", async () => {
      const mock = mockBunSpawn("abc123 Initial commit\ndef456 Second commit\n");
      const result = await executor.submit(
        "git log --oneline -2",
        "check history",
        "test-repo",
        "/tmp",
      );

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

  // ── Moderate gating ──

  describe("submit (moderate)", () => {
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

  // ── Dangerous always queues ──

  describe("submit (dangerous)", () => {
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
  });
});
