import chalk from "chalk";
import { createInterface, type Interface } from "readline";

export interface PendingReply {
  tickNum: number;
  repo: string;
  decision: string;
  content: string;
  userReply: string;
  timestamp: number;
}

/**
 * Captures optional user replies after each tick observation.
 * Non-blocking: if no reply comes before the next tick, it moves on.
 */
export class UserReply {
  private rl: Interface | null = null;
  private pendingReplies: PendingReply[] = [];
  private waitingForInput = false;
  private currentContext: { tickNum: number; repo: string; decision: string; content: string } | null = null;

  start(): void {
    if (!process.stdin.isTTY) return; // Skip if not interactive

    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "",
    });

    this.rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed || !this.currentContext) return;

      this.pendingReplies.push({
        ...this.currentContext,
        userReply: trimmed,
        timestamp: Date.now(),
      });

      console.log(chalk.green(`  ✓ Reply noted.`));
      this.waitingForInput = false;
      this.currentContext = null;
    });
  }

  /**
   * Show the reply prompt after a tick observation.
   * Call this after printing OBSERVE/NOTIFY/ACT output.
   */
  showPrompt(tickNum: number, repo: string, decision: string, content: string): void {
    if (!this.rl) return;

    this.currentContext = { tickNum, repo, decision, content };
    this.waitingForInput = true;

    // Show a subtle prompt — user can type or ignore
    process.stdout.write(chalk.gray("  › "));
  }

  /**
   * Clear the prompt when a new tick starts (user didn't reply).
   */
  clearPrompt(): void {
    if (this.waitingForInput) {
      this.waitingForInput = false;
      this.currentContext = null;
    }
  }

  /**
   * Drain all pending user replies and return them.
   * Called by the daemon to feed replies into the next tick's context.
   */
  drain(): PendingReply[] {
    const replies = [...this.pendingReplies];
    this.pendingReplies = [];
    return replies;
  }

  stop(): void {
    this.rl?.close();
    this.rl = null;
  }
}
