export type SpecialistName = "code-review" | "security" | "test-drift" | "flaky-test";
export type SpecialistClass = "deterministic" | "analytical";
export type FindingSeverity = "info" | "warning" | "critical";

export interface SpecialistConfig {
  name: SpecialistName;
  class: SpecialistClass;
  description: string;
  /** Model override — defaults to config.tickModel (haiku). Ignored for deterministic agents. */
  model?: string;
  /** Git event types that trigger this specialist */
  triggerEvents: string[];
  /** Glob patterns — specialist only runs when changed files match */
  watchPatterns?: string[];
  /** System prompt builder for the LLM call (analytical agents only) */
  buildPrompt?: (context: SpecialistContext) => string;
  /** Execute function for deterministic agents */
  execute?: (context: SpecialistContext) => Promise<SpecialistResult>;
}

export interface SpecialistContext {
  repoName: string;
  repoPath: string;
  branch: string;
  diff: string;
  changedFiles: string[];
  recentCommits: string[];
  recentFindings: Finding[];
  /** Test run results — populated when run_tests action completes */
  testRunResult?: TestRunResult;
}

export interface TestRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timestamp: number;
}

export interface Finding {
  id: string;
  specialist: SpecialistName;
  severity: FindingSeverity;
  title: string;
  detail: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

export interface SpecialistResult {
  specialist: SpecialistName;
  findings: Finding[];
  confidence: number;
  skippedReason?: string;
}
