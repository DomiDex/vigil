import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type GitEvent, GitWatcher } from "../../git/watcher.ts";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.ts";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Directly invoke the private poll() method */
async function triggerPoll(watcher: GitWatcher): Promise<void> {
  await (watcher as any).poll();
}

describe("GitWatcher", () => {
  let repo: TempRepo;
  let watcher: GitWatcher;

  beforeEach(() => {
    repo = createTempRepo();
    watcher = new GitWatcher();
  });

  afterEach(() => {
    watcher.stopPolling();
    repo.cleanup();
  });

  describe("event detection", () => {
    it("detects new commit", async () => {
      await watcher.addRepo(repo.path);
      const events: GitEvent[] = [];
      watcher.onEvent((e) => events.push(e));

      repo.exec('git commit --allow-empty -m "second commit"');
      await triggerPoll(watcher);

      const commitEvents = events.filter((e) => e.type === "new_commit");
      expect(commitEvents.length).toBe(1);
      expect(commitEvents[0].detail).toContain("second commit");
    });

    it("detects branch switch", async () => {
      await watcher.addRepo(repo.path);
      const events: GitEvent[] = [];
      watcher.onEvent((e) => events.push(e));

      repo.exec("git checkout -b feature-branch");
      await triggerPoll(watcher);

      const branchEvents = events.filter((e) => e.type === "branch_switch");
      expect(branchEvents.length).toBe(1);
      expect(branchEvents[0].detail).toContain("feature-branch");
    });

    it("detects uncommitted drift", async () => {
      await watcher.addRepo(repo.path);
      const events: GitEvent[] = [];
      watcher.onEvent((e) => events.push(e));

      writeFileSync(join(repo.path, "dirty.txt"), "dirty");

      const realNow = Date.now();
      let nowValue = realNow;
      const nowSpy = spyOn(Date, "now").mockImplementation(() => nowValue);

      // First poll: sets uncommittedSince
      await triggerPoll(watcher);

      // Advance time past 30-minute threshold
      nowValue = realNow + 31 * 60 * 1000;
      await triggerPoll(watcher);

      nowSpy.mockRestore();

      const driftEvents = events.filter((e) => e.type === "uncommitted_drift");
      expect(driftEvents.length).toBe(1);
    });

    it("no drift before threshold", async () => {
      await watcher.addRepo(repo.path);
      const events: GitEvent[] = [];
      watcher.onEvent((e) => events.push(e));

      writeFileSync(join(repo.path, "dirty.txt"), "dirty");

      const realNow = Date.now();
      let nowValue = realNow;
      const nowSpy = spyOn(Date, "now").mockImplementation(() => nowValue);

      // First poll sets uncommittedSince
      await triggerPoll(watcher);

      // Only 29 minutes — below 30min threshold
      nowValue = realNow + 29 * 60 * 1000;
      await triggerPoll(watcher);

      nowSpy.mockRestore();

      const driftEvents = events.filter((e) => e.type === "uncommitted_drift");
      expect(driftEvents.length).toBe(0);
    });

    it("drift resets after event", async () => {
      await watcher.addRepo(repo.path);
      const events: GitEvent[] = [];
      watcher.onEvent((e) => events.push(e));

      writeFileSync(join(repo.path, "dirty.txt"), "dirty");

      const realNow = Date.now();
      let nowValue = realNow;
      const nowSpy = spyOn(Date, "now").mockImplementation(() => nowValue);

      // First poll: sets uncommittedSince
      await triggerPoll(watcher);

      // Trigger drift
      nowValue = realNow + 31 * 60 * 1000;
      await triggerPoll(watcher);

      // Poll again 1s later — no second drift because uncommittedSince was reset
      nowValue = realNow + 31 * 60 * 1000 + 1000;
      await triggerPoll(watcher);

      nowSpy.mockRestore();

      const driftEvents = events.filter((e) => e.type === "uncommitted_drift");
      expect(driftEvents.length).toBe(1);
    });

    it("drift clears on clean state", async () => {
      await watcher.addRepo(repo.path);

      writeFileSync(join(repo.path, "file.txt"), "content");

      // Poll once to record uncommitted
      await triggerPoll(watcher);

      // Commit the file to clean up
      repo.exec('git add . && git commit -m "clean up"');

      const events: GitEvent[] = [];
      watcher.onEvent((e) => events.push(e));

      await triggerPoll(watcher);

      const driftEvents = events.filter((e) => e.type === "uncommitted_drift");
      expect(driftEvents.length).toBe(0);
    });

    it("fs.watch filters .git changes", async () => {
      const events: GitEvent[] = [];
      watcher.onEvent((e) => {
        if (e.type === "file_change") events.push(e);
      });
      await watcher.addRepo(repo.path);

      writeFileSync(join(repo.path, ".git", "test-file"), "data");
      await wait(500);

      const gitDirEvents = events.filter((e) => e.detail.includes(".git"));
      expect(gitDirEvents.length).toBe(0);
    });

    it("fs.watch filters node_modules", async () => {
      mkdirSync(join(repo.path, "node_modules"), { recursive: true });

      const events: GitEvent[] = [];
      watcher.onEvent((e) => {
        if (e.type === "file_change") events.push(e);
      });
      await watcher.addRepo(repo.path);

      writeFileSync(join(repo.path, "node_modules", "pkg.js"), "data");
      await wait(500);

      const nmEvents = events.filter((e) => e.detail.includes("node_modules"));
      expect(nmEvents.length).toBe(0);
    });

    it("tracks multiple repos independently", async () => {
      const repo2 = createTempRepo();
      try {
        await watcher.addRepo(repo.path);
        await watcher.addRepo(repo2.path);

        const events: GitEvent[] = [];
        watcher.onEvent((e) => events.push(e));

        repo.exec('git commit --allow-empty -m "repo1 commit"');
        repo2.exec('git commit --allow-empty -m "repo2 commit"');

        await triggerPoll(watcher);

        const repos = new Set(events.filter((e) => e.type === "new_commit").map((e) => e.repo));
        expect(repos.size).toBe(2);
      } finally {
        repo2.cleanup();
      }
    });
  });

  describe("buildContext()", () => {
    it("clean repo shows (clean) and (no changes)", async () => {
      await watcher.addRepo(repo.path);
      const ctx = await watcher.buildContext(repo.path);
      expect(ctx).toContain("(clean)");
      expect(ctx).toContain("(no changes)");
    });

    it("dirty repo shows file names", async () => {
      await watcher.addRepo(repo.path);
      writeFileSync(join(repo.path, "newfile.txt"), "data");
      const ctx = await watcher.buildContext(repo.path);
      expect(ctx).toContain("newfile.txt");
    });

    it("shows last 10 commits only", async () => {
      for (let i = 0; i < 15; i++) {
        repo.exec(`git commit --allow-empty -m "commit ${i}"`);
      }
      await watcher.addRepo(repo.path);
      const ctx = await watcher.buildContext(repo.path);
      // Extract only the "Recent Commits" section lines
      const recentSection = ctx.split("### Recent Commits")[1]?.split("###")[0] ?? "";
      const commitLines = recentSection.split("\n").filter((l) => /^[a-f0-9]{7,}/.test(l.trim()));
      expect(commitLines.length).toBe(10);
    });

    it("unknown repo path returns error string", async () => {
      const ctx = await watcher.buildContext("/nonexistent/path");
      expect(ctx).toBe("Unknown repo: /nonexistent/path");
    });

    it("context has required markdown headers", async () => {
      await watcher.addRepo(repo.path);
      const ctx = await watcher.buildContext(repo.path);
      expect(ctx).toContain("## Repo:");
      expect(ctx).toContain("### Git Status");
      expect(ctx).toContain("### Recent Commits");
      expect(ctx).toContain("### Last Commit");
      expect(ctx).toContain("### Last Commit Diff");
      expect(ctx).toContain("### Working Tree Diff Stats");
      expect(ctx).toContain("### Working Tree Diff");
    });
  });
});
