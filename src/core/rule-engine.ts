/**
 * Deterministic rule engine — evaluates git context against user-defined rules
 * before routing to LLM. If a rule matches, the decision is made instantly
 * without an LLM call, saving tokens and latency.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "./config.ts";

export type RuleAction = "SILENT" | "OBSERVE" | "NOTIFY";

export interface Rule {
  id: string;
  name: string;
  /** Glob or regex pattern matching on the git context string */
  match: {
    /** Match on commit messages */
    commitMessage?: string;
    /** Match on changed file paths */
    filePath?: string;
    /** Match on branch name */
    branch?: string;
    /** Match on git status (e.g., number of uncommitted files) */
    uncommittedAbove?: number;
  };
  action: RuleAction;
  /** Message to emit when rule fires */
  message: string;
  enabled: boolean;
}

export interface RuleMatch {
  rule: Rule;
  action: RuleAction;
  message: string;
}

export class RuleEngine {
  private rules: Rule[] = [];

  constructor(rules?: Rule[]) {
    if (rules) {
      this.rules = rules;
    } else {
      this.loadFromDisk();
    }
    this.loadDefaults();
  }

  /** Load rules from ~/.vigil/rules.json if it exists */
  loadFromDisk(): void {
    const rulesPath = join(getConfigDir(), "rules.json");
    if (!existsSync(rulesPath)) return;
    try {
      const raw = readFileSync(rulesPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.rules = parsed;
      }
    } catch {
      // Ignore malformed rules file — keep current rules
    }
  }

  /** Save current rules to disk */
  saveToDisk(): void {
    const rulesPath = join(getConfigDir(), "rules.json");
    writeFileSync(rulesPath, JSON.stringify(this.rules, null, 2));
  }

  /** Add a rule */
  addRule(rule: Rule): void {
    this.rules.push(rule);
  }

  /** Remove a rule by id */
  removeRule(id: string): boolean {
    const idx = this.rules.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    this.rules.splice(idx, 1);
    return true;
  }

  /** Safely compile a regex, returning null if invalid or potentially catastrophic */
  private safeRegex(pattern: string): RegExp | null {
    // Reject patterns with nested quantifiers that can cause catastrophic backtracking
    if (/(\+|\*|\{)\s*(\+|\*|\{)/.test(pattern) || /\(\?[^)]*\)\+/.test(pattern)) {
      return null;
    }
    try {
      return new RegExp(pattern, "i");
    } catch {
      return null;
    }
  }

  /** Evaluate context against all enabled rules. Returns first match or null. */
  evaluate(context: {
    commitMessages: string[];
    changedFiles: string[];
    branch: string;
    uncommittedCount: number;
  }): RuleMatch | null {
    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      let matched = true;

      if (rule.match.commitMessage !== undefined) {
        const re = this.safeRegex(rule.match.commitMessage);
        if (!re) { matched = false; }
        else {
          const anyMatch = context.commitMessages.some((msg) => re.test(msg));
          if (!anyMatch) matched = false;
        }
      }

      if (matched && rule.match.filePath !== undefined) {
        const re = this.safeRegex(rule.match.filePath);
        if (!re) { matched = false; }
        else {
          const anyMatch = context.changedFiles.some((f) => re.test(f));
          if (!anyMatch) matched = false;
        }
      }

      if (matched && rule.match.branch !== undefined) {
        const re = this.safeRegex(rule.match.branch);
        if (!re) { matched = false; }
        else if (!re.test(context.branch)) matched = false;
      }

      if (matched && rule.match.uncommittedAbove !== undefined) {
        if (context.uncommittedCount <= rule.match.uncommittedAbove) {
          matched = false;
        }
      }

      if (matched) {
        return {
          rule,
          action: rule.action,
          message: rule.message,
        };
      }
    }

    return null;
  }

  /** Built-in default rules */
  private loadDefaults(): void {
    // Only add defaults if no rules loaded
    if (this.rules.length > 0) return;

    this.rules = [
      {
        id: "default-todo-fixme",
        name: "TODO/FIXME/HACK in commit",
        match: {
          commitMessage: "\\b(TODO|FIXME|HACK)\\b",
        },
        action: "NOTIFY",
        message:
          "Commit message contains TODO/FIXME/HACK — flagging for review.",
        enabled: true,
      },
      {
        id: "default-uncommitted-overflow",
        name: "Too many uncommitted files",
        match: {
          uncommittedAbove: 20,
        },
        action: "NOTIFY",
        message:
          "More than 20 uncommitted files detected — consider committing or stashing.",
        enabled: true,
      },
      {
        id: "default-package-changes",
        name: "Package manifest changes",
        match: {
          filePath: "(^|/)package\\.json$|(^|/)(package-lock\\.json|bun\\.lockb|yarn\\.lock|pnpm-lock\\.yaml)$",
        },
        action: "OBSERVE",
        message: "Package manifest or lock file changed — dependencies may have shifted.",
        enabled: true,
      },
      {
        id: "default-env-file",
        name: "Environment file changes",
        match: {
          filePath: "(^|/)\\.env",
        },
        action: "NOTIFY",
        message:
          "Environment file (.env) changed — potential security concern, verify no secrets are committed.",
        enabled: true,
      },
      {
        id: "default-main-no-changes",
        name: "Main branch with no changes",
        match: {
          branch: "^main$",
          uncommittedAbove: -1,
        },
        action: "SILENT",
        message: "On main branch with no uncommitted changes — nothing to report.",
        enabled: true,
      },
    ];
  }

  listRules(): Rule[] {
    return [...this.rules];
  }
}
