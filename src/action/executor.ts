import { Database } from "bun:sqlite";
import { join } from "node:path";
import {
  type ActionGateConfig,
  type ActionType,
  DEFAULT_GATE_CONFIG,
  getDataDir,
} from "../core/config.ts";

// ── Types ──

export type ActionTier = "safe" | "moderate" | "dangerous";
export type ActionStatus = "pending" | "approved" | "rejected" | "executed" | "failed";

export interface ActionRequest {
  id: string;
  repo: string;
  command: string;
  args: string[];
  tier: ActionTier;
  actionType?: ActionType;
  reason: string;
  confidence: number;
  status: ActionStatus;
  result?: string;
  error?: string;
  gateResults?: Record<string, boolean>;
  createdAt: number;
  updatedAt: number;
}

export interface GateCheckResult {
  allowed: boolean;
  results: Record<string, boolean>;
  failedGates: string[];
}

// ── Whitelists ──

const SAFE_GIT_SUBCOMMANDS = new Set([
  "log",
  "diff",
  "show",
  "status",
  "shortlog",
  "describe",
  "rev-parse",
  "ls-files",
  "ls-tree",
  "cat-file",
  "blame",
  "reflog",
]);

const MODERATE_GIT_SUBCOMMANDS = new Set([
  "stash",
  "branch",
  "checkout",
  "switch",
  "commit",
  "add",
  "restore",
  "reset",
  "tag",
]);

const DANGEROUS_GIT_SUBCOMMANDS = new Set(["push", "merge", "rebase", "pull", "remote", "clean"]);

/**
 * Command patterns per ActionType — validates the command matches
 * the declared action type, preventing the LLM from declaring
 * "run_tests" but executing "rm -rf".
 */
const COMMAND_PATTERNS: Record<ActionType, RegExp[]> = {
  git_stash: [/^git stash/],
  git_branch: [/^git (checkout -b|branch|switch -c)/],
  git_commit: [/^git (add|commit)/],
  run_tests: [/^(bun test|npm test|pytest|cargo test|go test|make test)/],
  run_lint: [/^(bun run lint|npm run lint|eslint|prettier|ruff|clippy)/],
  custom_script: [/.*/], // Custom scripts validated by allowlist only
};

// ── ActionExecutor ──

/**
 * Safe action execution with multi-gate safety.
 *
 * Modeled on Kairos's 6-layer gating pattern:
 * 1. Config gate: actions.enabled must be true
 * 2. Session gate: user must have opted in this session
 * 3. Repo gate: repo must be in allowlist
 * 4. Action gate: action type must be in allowlist
 * 5. Confidence gate: decision confidence must exceed threshold
 * 6. Confirmation gate: user must confirm (unless autoApprove)
 */
export class ActionExecutor {
  private db: Database;
  private allowModerate: boolean;
  private gateConfig: ActionGateConfig;
  private sessionOptIn = false;

  constructor(opts?: {
    dbPath?: string;
    allowModerate?: boolean;
    gateConfig?: Partial<ActionGateConfig>;
  }) {
    this.db = new Database(opts?.dbPath ?? join(getDataDir(), "vigil.db"));
    this.allowModerate = opts?.allowModerate ?? false;
    this.gateConfig = { ...DEFAULT_GATE_CONFIG, ...opts?.gateConfig };
    this.init();
  }

  private init(): void {
    this.db.run("PRAGMA journal_mode = WAL;");
    this.db.run(`
      CREATE TABLE IF NOT EXISTS action_queue (
        id TEXT PRIMARY KEY,
        repo TEXT NOT NULL,
        command TEXT NOT NULL,
        args TEXT DEFAULT '[]',
        tier TEXT NOT NULL,
        action_type TEXT,
        reason TEXT DEFAULT '',
        confidence REAL DEFAULT 0,
        status TEXT DEFAULT 'pending',
        result TEXT,
        error TEXT,
        gate_results TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  /** Update gate config at runtime (e.g. from config hot-reload) */
  updateGateConfig(config: Partial<ActionGateConfig>): void {
    this.gateConfig = { ...this.gateConfig, ...config };
  }

  /** Get current gate config (for inspection/testing) */
  getGateConfig(): ActionGateConfig {
    return { ...this.gateConfig };
  }

  /** Session opt-in — Gate 2 */
  optIn(): void {
    this.sessionOptIn = true;
  }

  /** Session opt-out */
  optOut(): void {
    this.sessionOptIn = false;
  }

  /** Whether the user has opted in this session */
  get isOptedIn(): boolean {
    return this.sessionOptIn;
  }

  /**
   * Check all 6 gates for an action request.
   * Returns detailed per-gate results for transparency.
   */
  checkGates(repo: string, actionType: ActionType | undefined, confidence: number): GateCheckResult {
    const results: Record<string, boolean> = {
      "1_config_enabled": this.gateConfig.enabled,
      "2_session_optin": this.sessionOptIn,
      "3_repo_allowed":
        this.gateConfig.allowedRepos.includes("*") || this.gateConfig.allowedRepos.includes(repo),
      "4_action_allowed":
        actionType !== undefined && this.gateConfig.allowedActions.includes(actionType),
      "5_confidence": confidence >= this.gateConfig.confidenceThreshold,
    };

    const failedGates = Object.entries(results)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    const allowed = failedGates.length === 0;

    return { allowed, results, failedGates };
  }

  /**
   * Validate that a command matches the declared action type.
   * Prevents the LLM from declaring "run_tests" but executing "rm -rf".
   */
  static validateCommand(command: string, actionType: ActionType): boolean {
    const patterns = COMMAND_PATTERNS[actionType];
    if (!patterns) return false;
    return patterns.some((p) => p.test(command));
  }

  /** Classify a command string into a tier */
  static classifyTier(command: string): ActionTier {
    const parts = ActionExecutor.parseCommand(command);
    if (parts[0] !== "git") return "dangerous";

    const subcommand = parts[1];
    if (!subcommand) return "safe"; // bare "git" is harmless

    // Handle flags on branch: "branch --list" is safe, "branch -d" is moderate
    if (subcommand === "branch") {
      const restArgs = parts.slice(2);
      const hasDeleteFlag = restArgs.some(
        (a) => a === "-d" || a === "-D" || a === "--delete" || a.startsWith("--delete="),
      );
      const hasListOnly = restArgs.every(
        (a) => a === "--list" || a === "-l" || a === "-a" || a === "-r" || !a.startsWith("-"),
      );
      if (hasListOnly && !hasDeleteFlag) {
        return "safe";
      }
    }

    if (SAFE_GIT_SUBCOMMANDS.has(subcommand)) return "safe";
    if (MODERATE_GIT_SUBCOMMANDS.has(subcommand)) return "moderate";
    if (DANGEROUS_GIT_SUBCOMMANDS.has(subcommand)) return "dangerous";

    return "dangerous"; // unknown subcommand = dangerous by default
  }

  /** Parse a command string into argument array for Bun.spawn, respecting quotes */
  static parseCommand(command: string): string[] {
    const args: string[] = [];
    let current = "";
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < command.length; i++) {
      const ch = command[i];
      if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
      } else if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
      } else if (/\s/.test(ch) && !inSingle && !inDouble) {
        if (current) {
          args.push(current);
          current = "";
        }
      } else {
        current += ch;
      }
    }
    if (current) args.push(current);
    return args;
  }

  /**
   * Submit an action with gate checking.
   * Gate-checked actions require all 6 gates to pass.
   * Legacy behavior (tier-only) still works for backward compat.
   */
  async submit(
    command: string,
    reason: string,
    repo: string,
    repoPath: string,
    opts?: { actionType?: ActionType; confidence?: number },
  ): Promise<ActionRequest> {
    const tier = ActionExecutor.classifyTier(command);
    const args = ActionExecutor.parseCommand(command);
    const actionType = opts?.actionType;
    const confidence = opts?.confidence ?? 0;

    const action: ActionRequest = {
      id: crypto.randomUUID(),
      repo,
      command,
      args,
      tier,
      actionType,
      reason,
      confidence,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // If an actionType is declared, run gate checks
    if (actionType !== undefined) {
      // Validate command matches declared action type
      if (!ActionExecutor.validateCommand(command, actionType)) {
        action.status = "failed";
        action.error = "Command validation failed — does not match declared action type";
        action.gateResults = { command_validation: false };
        action.updatedAt = Date.now();
        this.save(action);
        return action;
      }

      const gateCheck = this.checkGates(repo, actionType, confidence);
      action.gateResults = gateCheck.results;

      if (!gateCheck.allowed) {
        action.status = "rejected";
        action.error = `Blocked by gates: ${gateCheck.failedGates.join(", ")}`;
        action.updatedAt = Date.now();
        this.save(action);
        return action;
      }

      // Gate 6: confirmation — if autoApprove is off, queue for approval
      if (!this.gateConfig.autoApprove) {
        this.save(action);
        return action;
      }

      // All gates passed + autoApprove — execute
      return this.execute(action, repoPath);
    }

    // Legacy tier-based flow (no actionType declared)
    if (tier === "safe") {
      return this.execute(action, repoPath);
    }

    if (tier === "moderate" && this.allowModerate) {
      return this.execute(action, repoPath);
    }

    // Queue for approval
    this.save(action);
    return action;
  }

  /** Execute an action by spawning a subprocess */
  async execute(action: ActionRequest, repoPath: string): Promise<ActionRequest> {
    try {
      const proc = Bun.spawn(action.args, {
        cwd: repoPath,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        action.status = "failed";
        action.error = stderr.trim() || `Exit code ${exitCode}`;
      } else {
        action.status = "executed";
        action.result = stdout.trim();
      }
    } catch (err) {
      action.status = "failed";
      action.error = String(err);
    }

    action.updatedAt = Date.now();
    this.save(action);
    return action;
  }

  /** Approve a pending action and execute it */
  async approve(id: string, repoPath: string): Promise<ActionRequest | null> {
    const action = this.getById(id);
    if (!action || action.status !== "pending") return null;

    action.status = "approved";
    action.updatedAt = Date.now();
    return this.execute(action, repoPath);
  }

  /** Reject a pending action */
  reject(id: string): ActionRequest | null {
    const action = this.getById(id);
    if (!action || action.status !== "pending") return null;

    action.status = "rejected";
    action.updatedAt = Date.now();
    this.save(action);
    return action;
  }

  /** Get all pending actions */
  getPending(): ActionRequest[] {
    const rows = this.db
      .query("SELECT * FROM action_queue WHERE status = 'pending' ORDER BY created_at DESC")
      .all() as any[];
    return rows.map(this.rowToAction);
  }

  /** Get recent actions (any status) */
  getRecent(limit = 20): ActionRequest[] {
    const rows = this.db
      .query("SELECT * FROM action_queue ORDER BY created_at DESC LIMIT ?")
      .all(limit) as any[];
    return rows.map(this.rowToAction);
  }

  /** Get action by ID */
  getById(id: string): ActionRequest | null {
    const row = this.db.query("SELECT * FROM action_queue WHERE id = ?").get(id) as any;
    if (!row) return null;
    return this.rowToAction(row);
  }

  private save(action: ActionRequest): void {
    this.db.run(
      `INSERT OR REPLACE INTO action_queue (id, repo, command, args, tier, action_type, reason, confidence, status, result, error, gate_results, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        action.id,
        action.repo,
        action.command,
        JSON.stringify(action.args),
        action.tier,
        action.actionType ?? null,
        action.reason,
        action.confidence,
        action.status,
        action.result ?? null,
        action.error ?? null,
        action.gateResults ? JSON.stringify(action.gateResults) : null,
        action.createdAt,
        action.updatedAt,
      ],
    );
  }

  private rowToAction(row: any): ActionRequest {
    return {
      id: row.id,
      repo: row.repo,
      command: row.command,
      args: JSON.parse(row.args),
      tier: row.tier,
      actionType: row.action_type ?? undefined,
      reason: row.reason,
      confidence: row.confidence ?? 0,
      status: row.status,
      result: row.result ?? undefined,
      error: row.error ?? undefined,
      gateResults: row.gate_results ? JSON.parse(row.gate_results) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  close(): void {
    this.db.close();
  }
}
