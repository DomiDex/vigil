import type { SpecialistConfig, SpecialistContext } from "../types.ts";

export const CODE_REVIEW_AGENT: SpecialistConfig = {
  name: "code-review",
  class: "analytical",
  description: "Senior code reviewer — logic errors, API misuse, performance issues",
  triggerEvents: ["new_commit"],
  watchPatterns: ["src/**/*.ts", "!src/**/*.test.ts", "!src/**/*.spec.ts"],

  buildPrompt(context: SpecialistContext): string {
    const recentTitles = context.recentFindings.map((f) => `- ${f.title}`).join("\n") || "(none)";

    return `You are a senior code reviewer. Analyze the git diff below and report findings.

Focus on:
- Logic errors, off-by-one, null/undefined risks
- API misuse (wrong method signatures, missing error handling)
- Performance issues (N+1 queries, unnecessary allocations, blocking in async)
- Naming/readability issues (only when genuinely confusing)

Do NOT report:
- Style/formatting (handled by linter)
- Missing comments or docstrings
- Type annotation suggestions
- Anything already flagged in previous findings

Previous findings (do NOT duplicate these):
${recentTitles}

Repository: ${context.repoName} (branch: ${context.branch})
Changed files: ${context.changedFiles.join(", ")}

Git diff:
\`\`\`
${context.diff}
\`\`\`

Respond with ONLY a JSON object:
{
  "findings": [{ "severity": "info|warning|critical", "title": "...", "detail": "...", "file": "...", "line": null, "suggestion": "..." }],
  "confidence": 0.0-1.0,
  "skippedReason": null
}

If there are no issues, return: { "findings": [], "confidence": 1.0, "skippedReason": "No issues found" }`;
  },
};
