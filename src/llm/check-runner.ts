/**
 * Static analysis runner — executes linters, type checkers, and test runners
 * with timeout protection and result summarization.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ── Types ──

export type CheckType = "eslint" | "tsc" | "biome" | "pytest" | "bun-test" | "custom";

export interface CheckConfig {
  type: CheckType;
  command: string[];
  cwd: string;
  timeoutMs: number;
}

export interface CheckResult {
  type: CheckType;
  exitCode: number;
  /** Summarized output (truncated to fit LLM context) */
  summary: string;
  /** Number of errors found */
  errorCount: number;
  /** Number of warnings found */
  warningCount: number;
  durationMs: number;
}

const MAX_OUTPUT_CHARS = 3000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Detection ──

/**
 * Auto-detect which checks are available in a repo by looking for config files.
 */
export function detectChecks(repoPath: string): CheckConfig[] {
  const configs: CheckConfig[] = [];

  // TypeScript
  if (existsSync(join(repoPath, "tsconfig.json"))) {
    configs.push({
      type: "tsc",
      command: ["npx", "tsc", "--noEmit"],
      cwd: repoPath,
      timeoutMs: 30_000,
    });
  }

  // ESLint — check for .eslintrc* or eslint.config.*
  const eslintConfigs = [
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.json",
    ".eslintrc.yml",
    ".eslintrc.yaml",
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    "eslint.config.ts",
  ];
  if (eslintConfigs.some((f) => existsSync(join(repoPath, f)))) {
    configs.push({
      type: "eslint",
      command: ["npx", "eslint", ".", "--max-warnings", "0"],
      cwd: repoPath,
      timeoutMs: 30_000,
    });
  }

  // Biome
  if (existsSync(join(repoPath, "biome.json")) || existsSync(join(repoPath, "biome.jsonc"))) {
    configs.push({
      type: "biome",
      command: ["npx", "@biomejs/biome", "check", "."],
      cwd: repoPath,
      timeoutMs: 30_000,
    });
  }

  // Pytest
  const hasPytestIni = existsSync(join(repoPath, "pytest.ini"));
  let hasPyprojectPytest = false;
  const pyprojectPath = join(repoPath, "pyproject.toml");
  if (existsSync(pyprojectPath)) {
    try {
      const content = readFileSync(pyprojectPath, "utf-8");
      hasPyprojectPytest = content.includes("[tool.pytest]");
    } catch {
      // ignore read errors
    }
  }
  if (hasPytestIni || hasPyprojectPytest) {
    configs.push({
      type: "pytest",
      command: ["python", "-m", "pytest", "--tb=short", "-q"],
      cwd: repoPath,
      timeoutMs: 60_000,
    });
  }

  // Bun test — requires bun.lock/bun.lockb AND a test script in package.json
  const hasBunLock = existsSync(join(repoPath, "bun.lock")) || existsSync(join(repoPath, "bun.lockb"));
  if (hasBunLock) {
    let hasTestScript = false;
    const pkgPath = join(repoPath, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        hasTestScript = Boolean(pkg?.scripts?.test);
      } catch {
        // ignore parse errors
      }
    }
    if (hasTestScript) {
      configs.push({
        type: "bun-test",
        command: ["bun", "test"],
        cwd: repoPath,
        timeoutMs: 60_000,
      });
    }
  }

  return configs;
}

// ── Execution ──

/**
 * Run a single check with timeout protection.
 */
export async function runCheck(config: CheckConfig): Promise<CheckResult> {
  const start = performance.now();

  const proc = Bun.spawn(config.command, {
    cwd: config.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const timeoutResult = Symbol("timeout");
  const raceResult = await Promise.race([proc.exited, sleep(config.timeoutMs).then(() => timeoutResult)]);

  if (raceResult === timeoutResult) {
    proc.kill();
    const durationMs = Math.round(performance.now() - start);
    return {
      type: config.type,
      exitCode: -1,
      summary: `Timed out after ${config.timeoutMs}ms`,
      errorCount: 0,
      warningCount: 0,
      durationMs,
    };
  }

  const exitCode = raceResult as number;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const combined = `${stdout}\n${stderr}`.trim();
  const durationMs = Math.round(performance.now() - start);

  const { errorCount, warningCount } = parseOutput(config.type, combined);
  const summary = summarizeOutput(combined, MAX_OUTPUT_CHARS);

  return {
    type: config.type,
    exitCode,
    summary,
    errorCount,
    warningCount,
    durationMs,
  };
}

// ── Parsing ──

/**
 * Parse output to extract error/warning counts.
 */
function parseOutput(type: CheckType, output: string): { errorCount: number; warningCount: number } {
  switch (type) {
    case "eslint": {
      // ESLint summary line: "X problems (Y errors, Z warnings)"
      const problemMatch = output.match(/(\d+)\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)/);
      if (problemMatch) {
        return {
          errorCount: parseInt(problemMatch[2], 10),
          warningCount: parseInt(problemMatch[3], 10),
        };
      }
      // Fallback: count lines containing "error" or "warning"
      const lines = output.split("\n");
      return {
        errorCount: lines.filter((l) => /\berror\b/i.test(l)).length,
        warningCount: lines.filter((l) => /\bwarning\b/i.test(l)).length,
      };
    }

    case "tsc": {
      // tsc: lines matching "error TS\d+"
      const errorLines = output.split("\n").filter((l) => /error TS\d+/.test(l));
      return { errorCount: errorLines.length, warningCount: 0 };
    }

    case "biome": {
      const lines = output.split("\n");
      return {
        errorCount: lines.filter((l) => /\berror\b/i.test(l)).length,
        warningCount: lines.filter((l) => /\bwarning\b/i.test(l)).length,
      };
    }

    case "pytest": {
      // pytest: "X failed, Y passed" or "X passed"
      const failMatch = output.match(/(\d+)\s+failed/);
      const _passMatch = output.match(/(\d+)\s+passed/);
      return {
        errorCount: failMatch ? parseInt(failMatch[1], 10) : 0,
        warningCount: 0,
      };
    }

    case "bun-test": {
      // bun test: "X fail"
      const failMatch = output.match(/(\d+)\s+fail/);
      return {
        errorCount: failMatch ? parseInt(failMatch[1], 10) : 0,
        warningCount: 0,
      };
    }

    default: {
      // custom / generic: count lines with "error" or "warning"
      const lines = output.split("\n");
      return {
        errorCount: lines.filter((l) => /error/i.test(l)).length,
        warningCount: lines.filter((l) => /warning/i.test(l)).length,
      };
    }
  }
}

// ── Summarization ──

/**
 * Truncate and summarize output for LLM consumption.
 */
function summarizeOutput(output: string, maxChars: number): string {
  if (output.length <= maxChars) return output;

  const headSize = 1500;
  const tailSize = 1000;
  const separator = "\n...(truncated)...\n";

  return output.slice(0, headSize) + separator + output.slice(-tailSize);
}
