import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getDataDir } from "./config.ts";

export interface SessionData {
  id: string;
  startedAt: number;
  lastTickAt: number;
  tickCount: number;
  repos: string[];
  config: Record<string, unknown>;
  state: "active" | "stopped" | "crashed";
}

/**
 * Session persistence for Vigil daemon.
 *
 * Inspired by Kairos session tracking (bootstrap/state.ts sessionId +
 * parentSessionId) but adapted for daemon lifecycle.
 *
 * Stores sessions in SQLite for restart resilience.
 */
export class SessionStore {
  private db: Database;

  constructor(dbPath?: string) {
    this.db = new Database(dbPath ?? join(getDataDir(), "vigil.db"));
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL,
        last_tick_at INTEGER,
        tick_count INTEGER DEFAULT 0,
        repos TEXT NOT NULL,
        config TEXT,
        state TEXT DEFAULT 'active',
        stopped_at INTEGER
      )
    `);
  }

  create(repos: string[], config: Record<string, unknown>): SessionData {
    const session: SessionData = {
      id: randomUUID(),
      startedAt: Date.now(),
      lastTickAt: Date.now(),
      tickCount: 0,
      repos,
      config,
      state: "active",
    };

    this.db.run(
      `INSERT INTO sessions (id, started_at, last_tick_at, tick_count, repos, config, state)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.startedAt,
        session.lastTickAt,
        session.tickCount,
        JSON.stringify(session.repos),
        JSON.stringify(session.config),
        session.state,
      ],
    );

    // Mark any previous "active" sessions as "crashed"
    this.db.run(`UPDATE sessions SET state = 'crashed', stopped_at = ? WHERE state = 'active' AND id != ?`, [
      Date.now(),
      session.id,
    ]);

    return session;
  }

  updateTick(id: string, tickCount: number): void {
    this.db.run(`UPDATE sessions SET last_tick_at = ?, tick_count = ? WHERE id = ?`, [Date.now(), tickCount, id]);
  }

  stop(id: string): void {
    this.db.run(`UPDATE sessions SET state = 'stopped', stopped_at = ? WHERE id = ?`, [Date.now(), id]);
  }

  getLastSession(): SessionData | null {
    const row = this.db
      .query(
        `SELECT * FROM sessions WHERE state IN ('stopped', 'crashed')
         ORDER BY last_tick_at DESC LIMIT 1`,
      )
      .get() as any;

    if (!row) return null;
    return {
      id: row.id,
      startedAt: row.started_at,
      lastTickAt: row.last_tick_at,
      tickCount: row.tick_count,
      repos: JSON.parse(row.repos),
      config: JSON.parse(row.config || "{}"),
      state: row.state,
    };
  }

  getActiveSession(): SessionData | null {
    const row = this.db
      .query(`SELECT * FROM sessions WHERE state = 'active' ORDER BY started_at DESC LIMIT 1`)
      .get() as any;

    if (!row) return null;
    return {
      id: row.id,
      startedAt: row.started_at,
      lastTickAt: row.last_tick_at,
      tickCount: row.tick_count,
      repos: JSON.parse(row.repos),
      config: JSON.parse(row.config || "{}"),
      state: row.state,
    };
  }

  close(): void {
    this.db.close();
  }
}
