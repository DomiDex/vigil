import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../core/config.ts";

export interface SessionState {
  sessionId: string;
  repo: string;
  createdAt: number;
  tickCount: number;
  estimatedTokens: number;
}

/** Max estimated tokens before rotating to a fresh session */
const TOKEN_ROTATION_THRESHOLD = 120_000;

/** Rough chars-to-tokens ratio (English text averages ~4 chars per token) */
const CHARS_PER_TOKEN = 4;

export class SessionManager {
  private sessionsDir: string;

  constructor(sessionsDir?: string) {
    this.sessionsDir = sessionsDir ?? join(getDataDir(), "sessions");
    mkdirSync(this.sessionsDir, { recursive: true });
  }

  /** Get or create a session for a repo */
  getSession(repo: string): SessionState {
    const path = this.sessionPath(repo);
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8"));
    }
    return this.createSession(repo);
  }

  /** Create a fresh session with a new UUID */
  createSession(repo: string): SessionState {
    const state: SessionState = {
      sessionId: crypto.randomUUID(),
      repo,
      createdAt: Date.now(),
      tickCount: 0,
      estimatedTokens: 0,
    };
    this.save(state);
    return state;
  }

  /** Increment tick count + estimated tokens, rotate if over budget */
  recordTick(repo: string, inputChars: number, outputChars: number): SessionState {
    const session = this.getSession(repo);
    session.tickCount++;
    session.estimatedTokens += Math.ceil((inputChars + outputChars) / CHARS_PER_TOKEN);

    if (session.estimatedTokens > TOKEN_ROTATION_THRESHOLD) {
      return this.createSession(repo);
    }

    this.save(session);
    return session;
  }

  private sessionPath(repo: string): string {
    return join(this.sessionsDir, `session-${repo}.json`);
  }

  private save(state: SessionState): void {
    writeFileSync(this.sessionPath(state.repo), JSON.stringify(state, null, 2));
  }
}
