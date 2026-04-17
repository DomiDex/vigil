import { resolve } from "node:path";
import { gitExec } from "../../git/exec.ts";
import type { DashboardContext } from "../types.ts";

// ── Types ────────────────────────────────────────

export interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  chunks: string;
}

export interface DiffResult {
  files: DiffFile[];
  stats: { filesChanged: number; insertions: number; deletions: number };
  truncated: boolean;
}

// ── Constants ────────────────────────────────────

const MAX_DIFF_BYTES = 500 * 1024; // 500KB

// ── Parser ───────────────────────────────────────

export function parseDiffOutput(rawDiff: string): DiffResult {
  const truncated = new TextEncoder().encode(rawDiff).length > MAX_DIFF_BYTES;
  const effectiveDiff = truncated ? rawDiff.slice(0, MAX_DIFF_BYTES) : rawDiff;

  const chunks = effectiveDiff.split(/^diff --git /m).filter(Boolean);
  const files: DiffFile[] = [];
  let totalInsertions = 0;
  let totalDeletions = 0;

  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    const headerMatch = lines[0]?.match(/a\/(.+?) b\//);
    const path = headerMatch?.[1] ?? "unknown";

    let additions = 0;
    let deletions = 0;
    for (const line of lines) {
      if (line.startsWith("+") && !line.startsWith("+++")) additions++;
      if (line.startsWith("-") && !line.startsWith("---")) deletions++;
    }

    files.push({ path, additions, deletions, chunks: `diff --git ${chunk}` });
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

// ── Helpers ──────────────────────────────────────

function repoNameFromPath(p: string): string {
  return p.split("/").pop() || p;
}

// ── API: GET /api/repos/:name/diff ───────────────

export async function getRepoDiffJSON(ctx: DashboardContext, repoName: string): Promise<DiffResult | null> {
  const repoPath = ctx.daemon.repoPaths.find((p) => repoNameFromPath(p) === repoName);
  if (!repoPath) return null;

  const absPath = resolve(repoPath);

  const diffResult = await gitExec(absPath, ["diff"]);
  if (diffResult.exitCode !== 0) {
    return { files: [], stats: { filesChanged: 0, insertions: 0, deletions: 0 }, truncated: false };
  }

  return parseDiffOutput(diffResult.stdout);
}
