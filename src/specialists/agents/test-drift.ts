import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { SpecialistConfig, SpecialistContext } from "../types.ts";

/**
 * Find the corresponding test file for a source file.
 * Uses 3 heuristic patterns:
 *   1. src/foo/bar.ts -> tests/foo/bar.test.ts
 *   2. src/foo/bar.ts -> src/foo/bar.test.ts
 *   3. src/foo/bar.ts -> src/foo/__tests__/bar.ts
 */
export function findTestFile(sourceFile: string, repoPath: string): string | null {
  const patterns = [
    (f: string) => f.replace(/^src\//, "tests/").replace(/\.ts$/, ".test.ts"),
    (f: string) => f.replace(/\.ts$/, ".test.ts"),
    (f: string) => {
      const dir = dirname(f);
      const base = basename(f, ".ts");
      return join(dir, "__tests__", `${base}.ts`);
    },
  ];

  for (const pattern of patterns) {
    const candidate = pattern(sourceFile);
    if (existsSync(join(repoPath, candidate))) return candidate;
  }
  return null;
}

export const TEST_DRIFT_AGENT: SpecialistConfig = {
  name: "test-drift",
  class: "analytical",
  description: "Test coverage analyst — detects source changes without matching test updates",
  triggerEvents: ["new_commit", "file_change"],

  buildPrompt(context: SpecialistContext): string {
    const sourceFiles = context.changedFiles.filter(
      (f) => f.endsWith(".ts") && !f.includes(".test.") && !f.includes(".spec.") && !f.includes("__tests__"),
    );

    const mapping = sourceFiles.map((f) => {
      const testFile = findTestFile(f, context.repoPath);
      const testChanged = testFile ? context.changedFiles.includes(testFile) : false;
      return { source: f, test: testFile, testChanged };
    });

    const mappingText = mapping
      .map(
        (m) =>
          `- ${m.source} -> ${m.test ?? "(no test file found)"} ${
            m.test ? (m.testChanged ? "(UPDATED)" : "(NOT updated)") : ""
          }`,
      )
      .join("\n");

    const recentTitles = context.recentFindings.map((f) => `- ${f.title}`).join("\n") || "(none)";

    return `You are a test coverage analyst. Given the changed source files and their corresponding test files, identify test drift.

Test drift means:
- Source file changed but its test file was NOT updated
- New functions/methods added without test coverage
- Test assertions that no longer match the implementation
- Mock data that is stale relative to the actual data shapes

File mapping (source -> test):
${mappingText}

Previous findings (do NOT duplicate these):
${recentTitles}

Repository: ${context.repoName} (branch: ${context.branch})

Git diff:
\`\`\`
${context.diff}
\`\`\`

For each source file with drift, report:
- Which functions/exports changed
- What test updates are missing
- Severity: "warning" if tests exist but are stale, "critical" if no tests exist for new code

Respond with ONLY a JSON object:
{
  "findings": [{ "severity": "info|warning|critical", "title": "...", "detail": "...", "file": "...", "line": null, "suggestion": "..." }],
  "confidence": 0.0-1.0,
  "skippedReason": null
}

If all source files have matching, up-to-date tests, return: { "findings": [], "confidence": 1.0, "skippedReason": "All tests up to date" }`;
  },
};
