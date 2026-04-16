import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTempRepo } from "../helpers/temp-repo.ts";

/**
 * Tests for git diff parsing logic used by the repos-diff endpoint.
 *
 * The endpoint:
 *   1. Runs gitExec(repoPath, ["diff"]) for full diff text
 *   2. Splits on "^diff --git" to get per-file chunks
 *   3. Counts +/- lines per chunk
 *   4. Caps at 500KB total
 */

interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  chunks: string;
}

interface DiffResult {
  files: DiffFile[];
  stats: { filesChanged: number; insertions: number; deletions: number };
  truncated: boolean;
}

const MAX_DIFF_BYTES = 500 * 1024; // 500KB

function parseDiffOutput(rawDiff: string): DiffResult {
  const truncated = new TextEncoder().encode(rawDiff).length > MAX_DIFF_BYTES;
  const effectiveDiff = truncated
    ? rawDiff.slice(0, MAX_DIFF_BYTES)
    : rawDiff;

  const chunks = effectiveDiff.split(/^diff --git /m).filter(Boolean);
  const files: DiffFile[] = [];
  let totalInsertions = 0;
  let totalDeletions = 0;

  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    // Extract filename from "a/path b/path"
    const headerMatch = lines[0]?.match(/a\/(.+?) b\//);
    const path = headerMatch?.[1] ?? "unknown";

    let additions = 0;
    let deletions = 0;
    for (const line of lines) {
      if (line.startsWith("+") && !line.startsWith("+++")) additions++;
      if (line.startsWith("-") && !line.startsWith("---")) deletions++;
    }

    files.push({ path, additions, deletions, chunks: "diff --git " + chunk });
    totalInsertions += additions;
    totalDeletions += deletions;
  }

  return {
    files,
    stats: {
      filesChanged: files.length,
      insertions: totalInsertions,
      deletions: totalDeletions,
    },
    truncated,
  };
}

describe("Diff parser — unit tests", () => {
  test("parses empty diff", () => {
    const result = parseDiffOutput("");
    expect(result.files).toEqual([]);
    expect(result.stats.filesChanged).toBe(0);
    expect(result.truncated).toBe(false);
  });

  test("parses single file diff", () => {
    const raw = `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,4 @@
 line1
+added line
 line2
-removed line
 line3
`;
    const result = parseDiffOutput(raw);
    expect(result.files.length).toBe(1);
    expect(result.files[0].path).toBe("file.txt");
    expect(result.files[0].additions).toBe(1);
    expect(result.files[0].deletions).toBe(1);
    expect(result.stats.filesChanged).toBe(1);
    expect(result.stats.insertions).toBe(1);
    expect(result.stats.deletions).toBe(1);
    expect(result.truncated).toBe(false);
  });

  test("parses multi-file diff", () => {
    const raw = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1,3 @@
 existing
+new line 1
+new line 2
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,2 +1 @@
 keep
-deleted
`;
    const result = parseDiffOutput(raw);
    expect(result.files.length).toBe(2);
    expect(result.files[0].path).toBe("src/a.ts");
    expect(result.files[0].additions).toBe(2);
    expect(result.files[0].deletions).toBe(0);
    expect(result.files[1].path).toBe("src/b.ts");
    expect(result.files[1].additions).toBe(0);
    expect(result.files[1].deletions).toBe(1);
    expect(result.stats.filesChanged).toBe(2);
    expect(result.stats.insertions).toBe(2);
    expect(result.stats.deletions).toBe(1);
  });

  test("does not count +++ and --- header lines as additions/deletions", () => {
    const raw = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1 +1,2 @@
 existing
+added
`;
    const result = parseDiffOutput(raw);
    expect(result.files[0].additions).toBe(1);
    expect(result.files[0].deletions).toBe(0);
  });

  test("sets truncated flag for oversized diff", () => {
    // Generate a diff larger than 500KB
    const bigContent = "+" + "x".repeat(1000) + "\n";
    const lines = bigContent.repeat(600); // ~600KB
    const raw = `diff --git a/big.txt b/big.txt
--- a/big.txt
+++ b/big.txt
@@ -0,0 +1,600 @@
${lines}`;
    const result = parseDiffOutput(raw);
    expect(result.truncated).toBe(true);
  });

  test("does not set truncated for small diff", () => {
    const raw = `diff --git a/small.txt b/small.txt
--- a/small.txt
+++ b/small.txt
@@ -1 +1,2 @@
 line
+added
`;
    const result = parseDiffOutput(raw);
    expect(result.truncated).toBe(false);
  });
});

describe("Diff parser — integration with real git repo", () => {
  let repo: { path: string; cleanup: () => void };

  beforeEach(async () => {
    repo = await createTempRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  test("parses real git diff output from modified file", async () => {
    // Modify a file to create a diff
    await Bun.write(`${repo.path}/README.md`, "# Test Repo\n\nModified content\n");

    const proc = Bun.spawn(["git", "diff"], {
      cwd: repo.path,
      stdout: "pipe",
      stderr: "ignore",
    });
    const rawDiff = await new Response(proc.stdout).text();
    await proc.exited;

    const result = parseDiffOutput(rawDiff);
    expect(result.files.length).toBe(1);
    expect(result.files[0].path).toBe("README.md");
    expect(result.files[0].additions).toBeGreaterThan(0);
    expect(result.truncated).toBe(false);
  });

  test("parses diff with new file added (untracked then staged)", async () => {
    await Bun.write(`${repo.path}/new-file.ts`, 'export const x = 1;\nexport const y = 2;\n');
    await Bun.spawn(["git", "add", "new-file.ts"], { cwd: repo.path, stdout: "ignore" }).exited;

    const proc = Bun.spawn(["git", "diff", "--cached"], {
      cwd: repo.path,
      stdout: "pipe",
      stderr: "ignore",
    });
    const rawDiff = await new Response(proc.stdout).text();
    await proc.exited;

    const result = parseDiffOutput(rawDiff);
    expect(result.files.length).toBe(1);
    expect(result.files[0].additions).toBe(2);
  });

  test("handles empty diff when repo is clean", async () => {
    const proc = Bun.spawn(["git", "diff"], {
      cwd: repo.path,
      stdout: "pipe",
      stderr: "ignore",
    });
    const rawDiff = await new Response(proc.stdout).text();
    await proc.exited;

    const result = parseDiffOutput(rawDiff);
    expect(result.files).toEqual([]);
    expect(result.stats.filesChanged).toBe(0);
  });
});
