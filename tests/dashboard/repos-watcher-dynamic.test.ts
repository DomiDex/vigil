import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { GitWatcher } from "../../src/git/watcher.ts";
import { createTempRepo } from "../helpers/temp-repo.ts";

/**
 * Tests for dynamic addRepo/removeRepo on GitWatcher.
 *
 * Phase 5 adds these methods so repos can be managed without daemon restart.
 */

describe("GitWatcher — dynamic repo management", () => {
  let repo1: { path: string; cleanup: () => void };
  let repo2: { path: string; cleanup: () => void };
  let watcher: GitWatcher;

  beforeEach(async () => {
    repo1 = await createTempRepo();
    repo2 = await createTempRepo();
    watcher = new GitWatcher();
  });

  afterEach(() => {
    watcher.stopPolling();
    repo1.cleanup();
    repo2.cleanup();
  });

  test("addRepo registers a new repo in state", async () => {
    await watcher.addRepo(repo1.path);
    const state = watcher.getRepoState(repo1.path);
    expect(state).toBeTruthy();
    expect(state!.currentBranch).toBeTruthy();
  });

  test("addRepo is idempotent — adding same repo twice does not error", async () => {
    await watcher.addRepo(repo1.path);
    await watcher.addRepo(repo1.path);
    const state = watcher.getRepoState(repo1.path);
    expect(state).toBeTruthy();
  });

  test("addRepo rejects non-git directory", async () => {
    const tmpDir = `/tmp/vigil-test-nogit-${Date.now()}`;
    await Bun.spawn(["mkdir", "-p", tmpDir]).exited;

    try {
      await watcher.addRepo(tmpDir);
      // If addRepo does not throw, check state is not added
      const state = watcher.getRepoState(tmpDir);
      // Either it threw or state should be null/undefined
      expect(state).toBeFalsy();
    } catch (err) {
      // Expected — non-git dir should be rejected
      expect(err).toBeTruthy();
    } finally {
      Bun.spawnSync(["rm", "-rf", tmpDir]);
    }
  });

  test("multiple repos can be watched simultaneously", async () => {
    await watcher.addRepo(repo1.path);
    await watcher.addRepo(repo2.path);
    expect(watcher.getRepoState(repo1.path)).toBeTruthy();
    expect(watcher.getRepoState(repo2.path)).toBeTruthy();
  });

  test("removeRepo removes repo from state", async () => {
    await watcher.addRepo(repo1.path);
    expect(watcher.getRepoState(repo1.path)).toBeTruthy();

    // Get repo name (basename of path)
    const repoName = repo1.path.split("/").pop()!;
    watcher.removeRepo(repoName);

    // After removal, state should be gone
    const state = watcher.getRepoState(repo1.path);
    expect(state).toBeFalsy();
  });

  test("removeRepo does not affect other repos", async () => {
    await watcher.addRepo(repo1.path);
    await watcher.addRepo(repo2.path);

    const repo1Name = repo1.path.split("/").pop()!;
    watcher.removeRepo(repo1Name);

    expect(watcher.getRepoState(repo1.path)).toBeFalsy();
    expect(watcher.getRepoState(repo2.path)).toBeTruthy();
  });

  test("removeRepo is safe for unknown repo name", () => {
    // Should not throw for a repo that was never added
    expect(() => watcher.removeRepo("nonexistent-repo")).not.toThrow();
  });
});
