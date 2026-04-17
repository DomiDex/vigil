import type { SpecialistConfig, SpecialistContext } from "../types.ts";

export const SECURITY_AGENT: SpecialistConfig = {
  name: "security",
  class: "analytical",
  description: "Security auditor — secrets, injection, crypto, CORS, auth",
  triggerEvents: ["new_commit", "file_change"],
  watchPatterns: ["**/*.ts", "**/*.json", "**/*.env*", "**/*.yaml", "**/*.yml"],

  buildPrompt(context: SpecialistContext): string {
    const recentTitles = context.recentFindings
      .map(f => `- ${f.title}`).join("\n") || "(none)";

    return `You are a security auditor. Scan the git diff for vulnerabilities.

Check for:
- Hardcoded secrets (API keys, tokens, passwords, connection strings)
- SQL injection / command injection vectors
- Path traversal (unsanitized file paths from user input)
- Insecure crypto (weak hashing, predictable randomness)
- Dependency issues (if package.json/lock files changed)
- Overly permissive CORS, missing auth checks
- Sensitive data in logs or error messages

Severity guide:
- critical: exploitable vulnerability, hardcoded production secret
- warning: potential vulnerability depending on context, dev-only secret
- info: best practice suggestion, minor hardening

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

If there are no issues, return: { "findings": [], "confidence": 1.0, "skippedReason": "No security issues found" }`;
  },
};
