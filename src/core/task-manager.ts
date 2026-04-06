import { Database, type SQLQueryBindings } from "bun:sqlite";
import { join } from "node:path";
import { getDataDir } from "./config.ts";

// ── Types ──

export type TaskStatus = "pending" | "active" | "waiting" | "completed" | "failed" | "cancelled";

export interface WaitCondition {
  type: "event" | "task" | "schedule";
  /** For event: the git event type to wait for (e.g., "new_commit", "branch_switch") */
  eventType?: string;
  /** For event: optional filter pattern */
  filter?: string;
  /** For task: the task ID to wait for */
  taskId?: string;
  /** For schedule: cron expression */
  cron?: string;
}

export interface Task {
  id: string;
  repo: string;
  title: string;
  description: string;
  status: TaskStatus;
  waitCondition: WaitCondition | null;
  parentId: string | null;
  metadata: Record<string, unknown>;
  result: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateTaskOpts {
  repo: string;
  title: string;
  description?: string;
  waitCondition?: WaitCondition;
  parentId?: string;
  metadata?: Record<string, unknown>;
}

export interface GitEvent {
  type: string;
  detail?: string;
  [key: string]: unknown;
}

// ── TaskManager ──

export class TaskManager {
  private db: Database;

  constructor(dbPath?: string) {
    this.db = new Database(dbPath ?? join(getDataDir(), "vigil.db"));
    this.init();
  }

  private init(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        repo TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        wait_condition TEXT,
        parent_id TEXT,
        metadata TEXT DEFAULT '{}',
        result TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  /** Create a new task. Starts as 'pending' or 'waiting' if a wait condition is set. */
  create(opts: CreateTaskOpts): Task {
    const id = crypto.randomUUID();
    const now = Date.now();
    const status: TaskStatus = opts.waitCondition ? "waiting" : "pending";

    this.db.run(
      `INSERT INTO tasks (id, repo, title, description, status, wait_condition, parent_id, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        opts.repo,
        opts.title,
        opts.description ?? "",
        status,
        opts.waitCondition ? JSON.stringify(opts.waitCondition) : null,
        opts.parentId ?? null,
        JSON.stringify(opts.metadata ?? {}),
        now,
        now,
      ],
    );

    return this.getById(id)!;
  }

  /** Move a task to 'active' status. */
  activate(id: string): Task | null {
    this.db.run(
      `UPDATE tasks SET status = 'active', updated_at = ? WHERE id = ? AND status IN ('pending', 'waiting')`,
      [Date.now(), id],
    );
    return this.getById(id);
  }

  /** Mark a task as completed with a result. */
  complete(id: string, result: string): Task | null {
    this.db.run(
      `UPDATE tasks SET status = 'completed', result = ?, updated_at = ? WHERE id = ? AND status IN ('pending', 'active')`,
      [result, Date.now(), id],
    );

    // Check if any tasks are waiting on this one
    const waiting = this.db.query(`SELECT id, wait_condition FROM tasks WHERE status = 'waiting'`).all() as {
      id: string;
      wait_condition: string;
    }[];

    for (const row of waiting) {
      const wc: WaitCondition = JSON.parse(row.wait_condition);
      if (wc.type === "task" && wc.taskId === id) {
        this.activate(row.id);
      }
    }

    return this.getById(id);
  }

  /** Mark a task as failed with an error message. */
  fail(id: string, error: string): Task | null {
    this.db.run(
      `UPDATE tasks SET status = 'failed', result = ?, updated_at = ? WHERE id = ? AND status IN ('pending', 'active', 'waiting')`,
      [error, Date.now(), id],
    );
    return this.getById(id);
  }

  /** Cancel a task. */
  cancel(id: string): Task | null {
    this.db.run(
      `UPDATE tasks SET status = 'cancelled', updated_at = ? WHERE id = ? AND status NOT IN ('completed', 'failed')`,
      [Date.now(), id],
    );
    return this.getById(id);
  }

  /** Get active tasks, optionally filtered by repo. */
  getActive(repo?: string): Task[] {
    if (repo) {
      return this.queryTasks(
        `SELECT * FROM tasks WHERE status IN ('pending', 'active') AND repo = ? ORDER BY created_at`,
        [repo],
      );
    }
    return this.queryTasks(`SELECT * FROM tasks WHERE status IN ('pending', 'active') ORDER BY created_at`);
  }

  /** Get tasks waiting on conditions. */
  getWaiting(): Task[] {
    return this.queryTasks(`SELECT * FROM tasks WHERE status = 'waiting' ORDER BY created_at`);
  }

  /** List tasks by status, optionally filtered by repo. */
  list(opts?: { status?: TaskStatus; repo?: string; limit?: number }): Task[] {
    let sql = "SELECT * FROM tasks WHERE 1=1";
    const params: SQLQueryBindings[] = [];

    if (opts?.status) {
      sql += " AND status = ?";
      params.push(opts.status);
    }
    if (opts?.repo) {
      sql += " AND repo = ?";
      params.push(opts.repo);
    }
    sql += " ORDER BY updated_at DESC";
    if (opts?.limit) {
      sql += " LIMIT ?";
      params.push(opts.limit);
    }

    return this.queryTasks(sql, params);
  }

  /** Check waiting tasks against recent git events. Returns newly-activated tasks. */
  checkWaitConditions(events: GitEvent[]): Task[] {
    if (events.length === 0) return [];

    const waiting = this.getWaiting();
    const activated: Task[] = [];

    for (const task of waiting) {
      if (!task.waitCondition) continue;
      const wc = task.waitCondition;

      if (wc.type === "event" && wc.eventType) {
        const matched = events.some((e) => {
          if (e.type !== wc.eventType) return false;
          if (wc.filter && e.detail) {
            return e.detail.includes(wc.filter);
          }
          return true;
        });

        if (matched) {
          const activated_task = this.activate(task.id);
          if (activated_task) activated.push(activated_task);
        }
      }
    }

    return activated;
  }

  /** Get subtasks of a parent task. */
  getSubtasks(parentId: string): Task[] {
    return this.queryTasks(`SELECT * FROM tasks WHERE parent_id = ? ORDER BY created_at`, [parentId]);
  }

  /** Get a task by ID. */
  getById(id: string): Task | null {
    const row = this.db.query(`SELECT * FROM tasks WHERE id = ?`).get(id) as any;
    return row ? this.rowToTask(row) : null;
  }

  close(): void {
    this.db.close();
  }

  private queryTasks(sql: string, params?: SQLQueryBindings[]): Task[] {
    const rows = params ? (this.db.query(sql).all(...params) as any[]) : (this.db.query(sql).all() as any[]);
    return rows.map(this.rowToTask);
  }

  private rowToTask(row: any): Task {
    return {
      id: row.id,
      repo: row.repo,
      title: row.title,
      description: row.description,
      status: row.status,
      waitCondition: row.wait_condition ? JSON.parse(row.wait_condition) : null,
      parentId: row.parent_id,
      metadata: JSON.parse(row.metadata || "{}"),
      result: row.result,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
