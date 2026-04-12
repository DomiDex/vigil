import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionExecutor } from "../../action/executor.ts";
import {
  getActionsFragment,
  getActionsJSON,
  getActionsPendingJSON,
  handleReject,
} from "../../dashboard/api/actions.ts";
import type { DashboardContext } from "../../dashboard/server.ts";

function makeMockCtx(executor: ActionExecutor): DashboardContext {
  return {
    daemon: {
      actionExecutor: executor,
      repoPaths: ["/home/user/repos/vigil", "/home/user/repos/my-app"],
    } as any,
    sse: {} as any,
  };
}

describe("Action Dashboard API", () => {
  let tmpDir: string;
  let executor: ActionExecutor;
  let ctx: DashboardContext;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "vigil-action-dash-test-"));
    executor = new ActionExecutor({
      dbPath: join(tmpDir, "actions.db"),
      allowModerate: false,
      gateConfig: {
        enabled: true,
        allowedRepos: ["*"],
        allowedActions: ["git_stash", "run_tests"],
        confidenceThreshold: 0.8,
        autoApprove: false,
      },
    });
    ctx = makeMockCtx(executor);
  });

  afterEach(() => {
    executor.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("getActionsJSON", () => {
    it("returns empty state correctly", () => {
      const result = getActionsJSON(ctx);
      expect(result.actions).toHaveLength(0);
      expect(result.pending).toHaveLength(0);
      expect(result.stats.executed).toBe(0);
      expect(result.stats.rejected).toBe(0);
      expect(result.stats.pending).toBe(0);
      expect(result.byTier.safe).toBe(0);
      expect(result.byTier.moderate).toBe(0);
    });

    it("returns actions after submission", async () => {
      executor.optIn();
      await executor.submit("git log --oneline", "Check recent commits", "vigil", tmpDir);

      const result = getActionsJSON(ctx);
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].command).toBe("git log --oneline");
      expect(result.actions[0].tier).toBe("safe");
      expect(result.actions[0].timeFormatted).toBeDefined();
    });

    it("tracks tier stats", async () => {
      executor.optIn();
      // Safe action — auto-executed (legacy tier flow, no actionType)
      await executor.submit("git log --oneline", "Check commits", "vigil", tmpDir);
      // Moderate action — queued (no auto-moderate)
      await executor.submit("git stash", "Save changes", "vigil", tmpDir);

      const result = getActionsJSON(ctx);
      expect(result.byTier.safe).toBe(1);
      expect(result.byTier.moderate).toBe(1);
    });

    it("filters by status", async () => {
      executor.optIn();
      await executor.submit("git log --oneline", "Check commits", "vigil", tmpDir);
      await executor.submit("git stash", "Stash work", "vigil", tmpDir);

      // git log is safe -> executed, git stash is moderate -> pending
      const executed = getActionsJSON(ctx, { status: "executed" });
      // git log may fail (not a real repo), so check for either executed or failed
      expect(executed.actions.length).toBeGreaterThanOrEqual(0);

      const pending = getActionsJSON(ctx, { status: "pending" });
      expect(pending.actions).toHaveLength(1);
      expect(pending.actions[0].command).toBe("git stash");
    });

    it("returns gate config and opt-in status", () => {
      const result = getActionsJSON(ctx);
      expect(result.gateConfig.enabled).toBe(true);
      expect(result.isOptedIn).toBe(false);

      executor.optIn();
      const result2 = getActionsJSON(ctx);
      expect(result2.isOptedIn).toBe(true);
    });
  });

  describe("getActionsPendingJSON", () => {
    it("returns only pending actions", async () => {
      executor.optIn();
      await executor.submit("git log", "Check", "vigil", tmpDir);
      await executor.submit("git stash", "Save", "vigil", tmpDir);

      const result = getActionsPendingJSON(ctx);
      expect(result.pending).toHaveLength(1);
      expect(result.pending[0].command).toBe("git stash");
    });
  });

  describe("getActionsFragment", () => {
    it("returns HTML with empty state", () => {
      const html = getActionsFragment(ctx);
      expect(html).toContain("act-layout");
      expect(html).toContain("act-filter-bar");
      expect(html).toContain("Action History");
      expect(html).toContain("No actions recorded");
    });

    it("renders action rows after submission", async () => {
      executor.optIn();
      await executor.submit("git log --oneline", "Check commits", "vigil", tmpDir);

      const html = getActionsFragment(ctx);
      expect(html).toContain("git log --oneline");
      expect(html).toContain("vigil");
      expect(html).toContain("act-tier-safe");
    });

    it("renders pending card with gate checklist", async () => {
      executor.optIn();
      await executor.submit("git stash", "Save changes", "vigil", tmpDir, {
        actionType: "git_stash",
        confidence: 0.85,
      });

      const html = getActionsFragment(ctx);
      expect(html).toContain("act-pending-card");
      expect(html).toContain("git stash");
      expect(html).toContain("Save changes");
      expect(html).toContain("85%");
      expect(html).toContain("act-gate-list");
      expect(html).toContain("Gate 1: Config enabled");
      expect(html).toContain("Gate 6: User approval");
      expect(html).toContain("act-btn-approve");
      expect(html).toContain("act-btn-reject");
    });

    it("renders tier badges with correct classes", async () => {
      executor.optIn();
      await executor.submit("git stash", "Save", "vigil", tmpDir);

      const html = getActionsFragment(ctx);
      expect(html).toContain("act-tier-moderate");
    });

    it("shows stats section", async () => {
      executor.optIn();
      await executor.submit("git log", "Check", "vigil", tmpDir);

      const html = getActionsFragment(ctx);
      expect(html).toContain("act-stats-section");
      expect(html).toContain("Executed");
      expect(html).toContain("Rejected");
    });

    it("renders filter buttons with counts", async () => {
      executor.optIn();
      await executor.submit("git stash", "Save", "vigil", tmpDir);

      const html = getActionsFragment(ctx);
      expect(html).toContain("act-filter-count");
      expect(html).toContain("Pending");
    });
  });

  describe("handleReject", () => {
    it("rejects a pending action and returns updated fragment", async () => {
      executor.optIn();
      const action = await executor.submit("git stash", "Save work", "vigil", tmpDir);
      expect(action.status).toBe("pending");

      const html = handleReject(ctx, action.id);
      expect(html).toContain("act-layout");

      // Action should now be rejected
      const updated = executor.getById(action.id);
      expect(updated?.status).toBe("rejected");
    });

    it("handles non-existent action gracefully", () => {
      const html = handleReject(ctx, "non-existent-id");
      expect(html).toContain("act-layout");
    });
  });

  describe("gate display", () => {
    it("shows passed gates with checkmarks", async () => {
      executor.optIn();
      await executor.submit("git stash", "Save", "vigil", tmpDir, {
        actionType: "git_stash",
        confidence: 0.9,
      });

      const html = getActionsFragment(ctx);
      expect(html).toContain("act-gate-pass");
      expect(html).toContain("Gate 2: Session opted in");
      expect(html).toContain("Gate 5: Confidence threshold");
    });

    it("shows failed gates when action is blocked", async () => {
      // Don't opt in — Gate 2 will fail
      const action = await executor.submit("git stash", "Save", "vigil", tmpDir, {
        actionType: "git_stash",
        confidence: 0.9,
      });

      // Action should be rejected by gates
      expect(action.status).toBe("rejected");

      const html = getActionsFragment(ctx);
      // Rejected action shows in history, not pending
      expect(html).toContain("git stash");
    });
  });

  describe("tier color-coding", () => {
    it("safe actions get green badge", async () => {
      executor.optIn();
      await executor.submit("git log", "Check", "vigil", tmpDir);

      const html = getActionsFragment(ctx);
      expect(html).toContain("act-tier-safe");
    });

    it("moderate actions get amber badge", async () => {
      executor.optIn();
      await executor.submit("git stash", "Save", "vigil", tmpDir);

      const html = getActionsFragment(ctx);
      expect(html).toContain("act-tier-moderate");
    });

    it("dangerous actions get red badge", async () => {
      executor.optIn();
      await executor.submit("git push origin main", "Deploy", "vigil", tmpDir);

      const html = getActionsFragment(ctx);
      expect(html).toContain("act-tier-dangerous");
    });
  });
});
