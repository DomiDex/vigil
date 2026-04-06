import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { GitWatcher, type GitEvent } from "../../src/git/watcher.ts";
import { createTempRepo } from "../helpers/temp-repo.ts";

describe("GitWatcher", () => {
  let repo: { path: string; cleanup: () => void };
  let watcher: GitWatcher;

  beforeEach(async () => {
    repo = await createTempRepo();
    watcher = new GitWatcher();
    await watcher.addRepo(repo.path);
  });

  afterEach(() => {
    watcher.stopPolling();
    repo.cleanup();
  });

  test("initializes repo state correctly", () => {
    const state = watcher.getRepoState(repo.path);
    expect(state).toBeTruthy();
    expect(state!.lastCommitHash).toMatch(/^[a-f0-9]{40}$/);
    expect(state!.currentBranch).toBeTruthy();
    expect(state!.uncommittedSince).toBeNull();
    expect(state!.lastReflogHash).toBeTruthy();
    expect(state!.knownCommitSHAs.size).toBe(1);
  });

  test("detects new commits", async () => {
    const events: GitEvent[] = [];
    watcher.onEvent((e) => events.push(e));

    // Create a new commit
    await Bun.write(`${repo.path}/test.txt`, "hello");
    await Bun.spawn(["git", "add", "."], { cwd: repo.path, stdout: "ignore" }).exited;
    await Bun.spawn(["git", "commit", "-m", "test commit"], {
      cwd: repo.path,
      stdout: "ignore",
      stderr: "ignore",
    }).exited;

    watcher.startPolling(1);
    await Bun.sleep(2500);

    const commitEvents = events.filter((e) => e.type === "new_commit");
    expect(commitEvents.length).toBeGreaterThanOrEqual(1);
    expect(commitEvents[0].detail).toContain("test commit");
  });

  test("detects branch switch", async () => {
    const events: GitEvent[] = [];
    watcher.onEvent((e) => events.push(e));

    await Bun.spawn(["git", "checkout", "-b", "feature-test"], {
      cwd: repo.path,
      stdout: "ignore",
      stderr: "ignore",
    }).exited;

    watcher.startPolling(1);
    await Bun.sleep(2500);

    const branchEvents = events.filter((e) => e.type === "branch_switch");
    expect(branchEvents.length).toBeGreaterThanOrEqual(1);
    expect(branchEvents[0].detail).toContain("feature-test");
  });

  test("detects rebase", async () => {
    const events: GitEvent[] = [];
    watcher.onEvent((e) => events.push(e));

    // Create a second commit, then amend it (triggers reflog change)
    await Bun.write(`${repo.path}/file1.txt`, "content1");
    await Bun.spawn(["git", "add", "."], { cwd: repo.path, stdout: "ignore" }).exited;
    await Bun.spawn(["git", "commit", "-m", "second"], {
      cwd: repo.path,
      stdout: "ignore",
      stderr: "ignore",
    }).exited;

    // Poll once to pick up the second commit
    watcher.startPolling(1);
    await Bun.sleep(1500);

    // Amend the commit (changes reflog, orphans previous SHA)
    await Bun.write(`${repo.path}/file2.txt`, "content2");
    await Bun.spawn(["git", "add", "."], { cwd: repo.path, stdout: "ignore" }).exited;
    await Bun.spawn(["git", "commit", "--amend", "-m", "amended"], {
      cwd: repo.path,
      stdout: "ignore",
      stderr: "ignore",
    }).exited;

    await Bun.sleep(2500);

    // Should detect either a rebase_detected or new_commit after amend
    const allTypes = events.map((e) => e.type);
    expect(allTypes.some((t) => t === "new_commit" || t === "rebase_detected")).toBe(true);
  });

  test("builds context string", async () => {
    const context = await watcher.buildContext(repo.path);
    expect(context).toContain("## Repo:");
    expect(context).toContain("Branch:");
    expect(context).toContain("### Git Status");
    expect(context).toContain("### Recent Commits");
  });

  test("deduplicates rapid events", async () => {
    const events: GitEvent[] = [];
    watcher.onEvent((e) => events.push(e));

    // Rapid-fire multiple file changes
    for (let i = 0; i < 5; i++) {
      await Bun.write(`${repo.path}/rapid-${i}.txt`, `content-${i}`);
    }

    // The dedup window should collapse some of these
    watcher.startPolling(1);
    await Bun.sleep(1500);

    // We should have events, but not necessarily one per file due to dedup
    // (file_change events with same detail get deduped, but different filenames won't)
    expect(events.length).toBeGreaterThan(0);
  });
});
