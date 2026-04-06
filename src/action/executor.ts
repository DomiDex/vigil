import { Database } from "bun:sqlite";
import { join } from "node:path";
import { getDataDir } from "../core/config.ts";

// ── Types ──

export type ActionTier = "safe" | "moderate" | "dangerous";
export type ActionStatus = "pending" | "approved" | "rejected" | "executed" | "failed";

export interface ActionRequest {
  id: string;
  repo: string;
  command: string;
  args: string[];
  tier: ActionTier;
  reason: string;
  status: ActionStatus;
  result?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
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

// ── ActionExecutor ──

export class ActionExecutor {
  private db: Database;
  private allowModerate: boolean;

  constructor(opts?: { dbPath?: string; allowModerate?: boolean }) {
    this.db = new Database(opts?.dbPath ?? join(getDataDir(), "vigil.db"));
    this.allowModerate = opts?.allowModerate ?? false;
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
        reason TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        result TEXT,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
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
        if (current) { args.push(current); current = ""; }
      } else {
        current += ch;
      }
    }
    if (current) args.push(current);
    return args;
  }

  /** Submit an action. Safe actions auto-execute, others may queue. */
  async submit(
    command: string,
    reason: string,
    repo: string,
    repoPath: string,
  ): Promise<ActionRequest> {
    const tier = ActionExecutor.classifyTier(command);
    const args = ActionExecutor.parseCommand(command);

    const action: ActionRequest = {
      id: crypto.randomUUID(),
      repo,
      command,
      args,
      tier,
      reason,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

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
      `INSERT OR REPLACE INTO action_queue (id, repo, command, args, tier, reason, status, result, error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        action.id,
        action.repo,
        action.command,
        JSON.stringify(action.args),
        action.tier,
        action.reason,
        action.status,
        action.result ?? null,
        action.error ?? null,
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
      reason: row.reason,
      status: row.status,
      result: row.result ?? undefined,
      error: row.error ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  close(): void {
    this.db.close();
  }
}
