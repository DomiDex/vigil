import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// ── Code Analysis Tools ──
// Read-only tools for deeper codebase inspection during ticks.

const MAX_SEARCH_RESULTS = 20;
const MAX_LINE_CONTEXT = 200;
const SEARCH_OUTPUT_CAP = 4000;
const READ_RANGE_CAP = 8000;
const LIST_FILES_CAP = 100;

/** Validate that a path stays within the repo root. */
function isPathSafe(repoPath: string, filePath: string): boolean {
  if (filePath.includes("..")) return false;
  const resolved = resolve(repoPath, filePath);
  return resolved.startsWith(resolve(repoPath));
}

/** Run a git command in a repo directory, return stdout or throw. */
async function gitExec(args: string[], cwd: string, timeoutMs = 10_000): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const timer = setTimeout(() => proc.kill(), timeoutMs);
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  clearTimeout(timer);

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(stderr.trim() || `git ${args[0]} failed (exit ${exitCode})`);
  }
  return stdout;
}

// ── search_codebase ──

export async function searchCodebase(
  repoPath: string,
  pattern: string,
  glob?: string,
  maxResults?: number,
): Promise<{ tool: string; result: unknown; error?: string }> {
  const limit = Math.min(maxResults ?? MAX_SEARCH_RESULTS, MAX_SEARCH_RESULTS);

  try {
    const args = ["grep", "-n", "--no-color", "-I", pattern];
    if (glob) args.push("--", glob);

    const raw = await gitExec(args, repoPath);
    const lines = raw.trim().split("\n").filter(Boolean);
    const matches = lines.slice(0, limit).map((line) => {
      return line.length > MAX_LINE_CONTEXT ? `${line.slice(0, MAX_LINE_CONTEXT)}...` : line;
    });

    let output = matches.join("\n");
    if (output.length > SEARCH_OUTPUT_CAP) {
      output = `${output.slice(0, SEARCH_OUTPUT_CAP)}\n...(truncated)`;
    }

    const total = lines.length;
    const shown = matches.length;
    const header = total > shown ? `Showing ${shown} of ${total} matches:\n` : "";
    return { tool: "search_codebase", result: `${header}${output}` };
  } catch (err) {
    const msg = String(err);
    // git grep returns exit 1 when no matches — not an error
    if (msg.includes("exit 1") || msg.includes("exit code 1")) {
      return { tool: "search_codebase", result: "No matches found" };
    }
    return { tool: "search_codebase", result: null, error: msg };
  }
}

// ── list_files ──

export async function listFiles(
  repoPath: string,
  path?: string,
  glob?: string,
): Promise<{ tool: string; result: unknown; error?: string }> {
  try {
    const args = ["ls-files"];
    if (path) {
      if (!isPathSafe(repoPath, path)) {
        return { tool: "list_files", result: null, error: "Path traversal not allowed" };
      }
      args.push(path);
    }

    const raw = await gitExec(args, repoPath);
    let files = raw.trim().split("\n").filter(Boolean);

    // Apply glob filter if provided (simple pattern matching)
    if (glob) {
      const re = globToRegex(glob);
      files = files.filter((f) => re.test(f));
    }

    if (files.length > LIST_FILES_CAP) {
      return {
        tool: "list_files",
        result: `${files.slice(0, LIST_FILES_CAP).join("\n")}\n...(${files.length - LIST_FILES_CAP} more files)`,
      };
    }

    return {
      tool: "list_files",
      result: files.length > 0 ? files.join("\n") : "No files found",
    };
  } catch (err) {
    return { tool: "list_files", result: null, error: String(err) };
  }
}

/** Convert a simple glob pattern to a regex (handles *, **, ?) */
function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*");
  return new RegExp(`^${escaped}$`);
}

// ── read_file_range ──

export function readFileRange(
  repoPath: string,
  filePath: string,
  startLine?: number,
  endLine?: number,
): { tool: string; result: unknown; error?: string } {
  if (!isPathSafe(repoPath, filePath)) {
    return { tool: "read_file_range", result: null, error: "Path traversal not allowed" };
  }

  try {
    const fullPath = join(repoPath, filePath);
    const content = readFileSync(fullPath, "utf-8");
    const lines = content.split("\n");

    const start = Math.max(1, startLine ?? 1);
    const end = Math.min(lines.length, endLine ?? lines.length);

    // Add line numbers for context
    const slice = lines
      .slice(start - 1, end)
      .map((line, i) => `${start + i}: ${line}`)
      .join("\n");

    if (slice.length > READ_RANGE_CAP) {
      return {
        tool: "read_file_range",
        result: `${slice.slice(0, READ_RANGE_CAP)}\n...(truncated at ${READ_RANGE_CAP} chars, lines ${start}-${end} of ${lines.length})`,
      };
    }

    return {
      tool: "read_file_range",
      result: `Lines ${start}-${end} of ${lines.length} in ${filePath}:\n${slice}`,
    };
  } catch {
    return { tool: "read_file_range", result: null, error: `File not found: ${filePath}` };
  }
}

// ── summarize_structure ──

export async function summarizeStructure(
  repoPath: string,
  path?: string,
): Promise<{ tool: string; result: unknown; error?: string }> {
  if (path && !isPathSafe(repoPath, path)) {
    return { tool: "summarize_structure", result: null, error: "Path traversal not allowed" };
  }

  try {
    const args = ["ls-files"];
    if (path) args.push(path);

    const raw = await gitExec(args, repoPath);
    const files = raw.trim().split("\n").filter(Boolean);

    if (files.length === 0) {
      return { tool: "summarize_structure", result: "No files found" };
    }

    // Build directory tree with file counts
    const tree = buildTree(files);
    return { tool: "summarize_structure", result: tree };
  } catch (err) {
    return { tool: "summarize_structure", result: null, error: String(err) };
  }
}

interface TreeNode {
  files: string[];
  dirs: Map<string, TreeNode>;
}

function buildTree(files: string[]): string {
  const root: TreeNode = { files: [], dirs: new Map() };

  for (const file of files) {
    const parts = file.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.dirs.has(parts[i])) {
        node.dirs.set(parts[i], { files: [], dirs: new Map() });
      }
      node = node.dirs.get(parts[i])!;
    }
    node.files.push(parts[parts.length - 1]);
  }

  const lines: string[] = [];
  formatTree(root, "", lines);
  return lines.join("\n");
}

function formatTree(node: TreeNode, prefix: string, lines: string[]): void {
  // Sort dirs first, then files
  const sortedDirs = [...node.dirs.entries()].sort(([a], [b]) => a.localeCompare(b));

  for (const [name, child] of sortedDirs) {
    const fileCount = countFiles(child);
    lines.push(`${prefix}${name}/ (${fileCount} files)`);
    formatTree(child, `${prefix}  `, lines);
  }

  // Show files at this level (collapse if too many)
  if (node.files.length > 10) {
    lines.push(`${prefix}[${node.files.length} files]`);
  } else {
    for (const file of node.files.sort()) {
      lines.push(`${prefix}${file}`);
    }
  }
}

function countFiles(node: TreeNode): number {
  let count = node.files.length;
  for (const child of node.dirs.values()) {
    count += countFiles(child);
  }
  return count;
}
