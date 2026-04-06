import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listFiles, readFileRange, searchCodebase, summarizeStructure } from "../../llm/code-tools.ts";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.ts";

let repo: TempRepo;

beforeAll(() => {
  repo = createTempRepo();

  // Create test files
  mkdirSync(join(repo.path, "src", "core"), { recursive: true });
  mkdirSync(join(repo.path, "src", "utils"), { recursive: true });
  mkdirSync(join(repo.path, "tests"), { recursive: true });

  writeFileSync(
    join(repo.path, "src", "core", "engine.ts"),
    `export class Engine {
  private running = false;

  start(): void {
    this.running = true;
    console.log("Engine started");
  }

  stop(): void {
    this.running = false;
  }
}
`,
  );

  writeFileSync(
    join(repo.path, "src", "core", "config.ts"),
    `export interface Config {
  port: number;
  host: string;
  debug: boolean;
}

export function loadConfig(): Config {
  return { port: 3000, host: "localhost", debug: false };
}
`,
  );

  writeFileSync(
    join(repo.path, "src", "utils", "helpers.ts"),
    `export function formatDate(d: Date): string {
  return d.toISOString();
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
`,
  );

  writeFileSync(
    join(repo.path, "tests", "engine.test.ts"),
    `import { Engine } from "../src/core/engine";
test("engine starts", () => {
  const e = new Engine();
  e.start();
});
`,
  );

  writeFileSync(join(repo.path, "README.md"), "# Test Project\nA simple test project.\n");

  // Stage and commit all files
  repo.exec("git add -A && git commit -m 'add test files'");
});

afterAll(() => {
  repo.cleanup();
});

// ── search_codebase ──

describe("search_codebase", () => {
  test("finds matching lines", async () => {
    const result = await searchCodebase(repo.path, "Engine");
    expect(result.error).toBeUndefined();
    expect(result.result).toContain("engine.ts");
    expect(result.result).toContain("Engine");
  });

  test("respects glob filter", async () => {
    const result = await searchCodebase(repo.path, "Engine", "*.test.ts");
    expect(result.error).toBeUndefined();
    expect(result.result).toContain("engine.test.ts");
    // Should not include the source file
    expect(result.result).not.toContain("src/core/engine.ts");
  });

  test("returns no matches message", async () => {
    const result = await searchCodebase(repo.path, "nonexistent_xyz_pattern_12345");
    expect(result.error).toBeUndefined();
    expect(result.result).toBe("No matches found");
  });

  test("limits results", async () => {
    const result = await searchCodebase(repo.path, "export", undefined, 2);
    expect(result.error).toBeUndefined();
    const text = result.result as string;
    // Should mention showing limited results
    expect(text).toContain("Showing 2 of");
  });
});

// ── list_files ──

describe("list_files", () => {
  test("lists all files", async () => {
    const result = await listFiles(repo.path);
    expect(result.error).toBeUndefined();
    const text = result.result as string;
    expect(text).toContain("src/core/engine.ts");
    expect(text).toContain("src/core/config.ts");
    expect(text).toContain("README.md");
  });

  test("filters by path prefix", async () => {
    const result = await listFiles(repo.path, "src/core");
    expect(result.error).toBeUndefined();
    const text = result.result as string;
    expect(text).toContain("engine.ts");
    expect(text).toContain("config.ts");
    expect(text).not.toContain("helpers.ts");
    expect(text).not.toContain("README.md");
  });

  test("filters by glob", async () => {
    const result = await listFiles(repo.path, undefined, "*.md");
    expect(result.error).toBeUndefined();
    const text = result.result as string;
    expect(text).toContain("README.md");
    expect(text).not.toContain("engine.ts");
  });

  test("blocks path traversal", async () => {
    const result = await listFiles(repo.path, "../etc");
    expect(result.error).toBe("Path traversal not allowed");
  });
});

// ── read_file_range ──

describe("read_file_range", () => {
  test("reads entire file with line numbers", () => {
    const result = readFileRange(repo.path, "src/core/config.ts");
    expect(result.error).toBeUndefined();
    const text = result.result as string;
    expect(text).toContain("1: export interface Config");
    expect(text).toContain("port: number");
  });

  test("reads specific line range", () => {
    const result = readFileRange(repo.path, "src/core/engine.ts", 4, 7);
    expect(result.error).toBeUndefined();
    const text = result.result as string;
    expect(text).toContain("Lines 4-7");
    expect(text).toContain("start()");
    // Should not contain lines outside range
    expect(text).not.toContain("export class");
  });

  test("blocks path traversal", () => {
    const result = readFileRange(repo.path, "../../../etc/passwd");
    expect(result.error).toBe("Path traversal not allowed");
  });

  test("returns error for missing file", () => {
    const result = readFileRange(repo.path, "nonexistent.ts");
    expect(result.error).toContain("File not found");
  });
});

// ── summarize_structure ──

describe("summarize_structure", () => {
  test("shows directory tree", async () => {
    const result = await summarizeStructure(repo.path);
    expect(result.error).toBeUndefined();
    const text = result.result as string;
    expect(text).toContain("src/");
    expect(text).toContain("core/");
    expect(text).toContain("utils/");
    expect(text).toContain("tests/");
  });

  test("shows file counts", async () => {
    const result = await summarizeStructure(repo.path);
    expect(result.error).toBeUndefined();
    const text = result.result as string;
    // src/ should report file count
    expect(text).toMatch(/src\/.*\d+ files/);
  });

  test("filters by subdirectory", async () => {
    const result = await summarizeStructure(repo.path, "src/core");
    expect(result.error).toBeUndefined();
    const text = result.result as string;
    expect(text).toContain("engine.ts");
    expect(text).toContain("config.ts");
    expect(text).not.toContain("helpers.ts");
  });

  test("blocks path traversal", async () => {
    const result = await summarizeStructure(repo.path, "../");
    expect(result.error).toBe("Path traversal not allowed");
  });
});
