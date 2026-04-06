import { TickEngine } from "./tick-engine.ts";
import { loadConfig, watchConfig, stopWatchingConfig, type VigilConfig } from "./config.ts";
import { GitWatcher, type GitEvent } from "../git/watcher.ts";
import { EventLog, VectorStore, type MemoryEntry } from "../memory/store.ts";
import { DecisionEngine } from "../llm/decision-max.ts";
import { UserReply } from "./user-reply.ts";
import { acquireLock, releaseLock } from "./instance-lock.ts";
import { randomUUID } from "crypto";
import chalk from "chalk";

const BANNER = `
╔══════════════════════════════════════╗
║   ██╗   ██╗██╗ ██████╗ ██╗██╗      ║
║   ██║   ██║██║██╔════╝ ██║██║      ║
║   ██║   ██║██║██║  ███╗██║██║      ║
║   ╚██╗ ██╔╝██║██║   ██║██║██║      ║
║    ╚████╔╝ ██║╚██████╔╝██║███████╗ ║
║     ╚═══╝  ╚═╝ ╚═════╝ ╚═╝╚══════╝ ║
║       always watching, never sleeping ║
╚══════════════════════════════════════╝
`;

/** Format text for console display — preserve newlines, indent continuation lines */
function formatTick(text: string): string {
  return text.trim().replace(/\n/g, "\n    ");
}

export class Daemon {
  private config: VigilConfig;
  private tickEngine: TickEngine;
  private gitWatcher: GitWatcher;
  private eventLog: EventLog;
  private vectorStore: VectorStore;
  private decisionEngine: DecisionEngine;
  private userReply: UserReply;
  private lastConsolidation = Date.now();
  private repoPaths: string[];
  private sessionId: string;

  constructor(repoPaths: string[], options?: { tickInterval?: number; model?: string }) {
    this.config = loadConfig();
    if (options?.tickInterval) this.config.tickInterval = options.tickInterval;
    if (options?.model) this.config.tickModel = options.model;

    this.repoPaths = repoPaths;
    this.sessionId = randomUUID();
    this.tickEngine = new TickEngine(this.config);
    this.gitWatcher = new GitWatcher();
    this.eventLog = new EventLog();
    this.vectorStore = new VectorStore();
    this.decisionEngine = new DecisionEngine(this.config);
    this.userReply = new UserReply();
  }

  async start(): Promise<void> {
    // Acquire instance lock — prevents duplicate daemons on same repos
    if (!acquireLock(this.sessionId, this.repoPaths)) {
      console.error(chalk.red("  ✗ Failed to acquire instance lock. Another Vigil may be running."));
      process.exit(1);
    }

    console.log(chalk.cyan(BANNER));
    console.log(chalk.gray(`  Session: ${this.sessionId.slice(0, 8)}`));
    console.log(chalk.gray(`  Tick interval: ${this.config.tickInterval}s`));
    console.log(chalk.gray(`  Model: ${this.config.tickModel}`));
    console.log(chalk.gray(`  Sleep after: ${this.config.sleepAfter}s idle`));
    console.log();

    // Init stores
    this.vectorStore.init();

    // Add repos
    for (const repoPath of this.repoPaths) {
      await this.gitWatcher.addRepo(repoPath);
      console.log(chalk.green(`  ✓ Watching: ${repoPath}`));
    }
    console.log();

    // Wire git events
    this.gitWatcher.onEvent((event: GitEvent) => {
      this.tickEngine.reportActivity();
      this.eventLog.append(event.repo, {
        type: event.type,
        detail: event.detail,
      });
      console.log(chalk.yellow(`  ⚡ ${event.repo}: ${event.detail}`));
    });

    // Wire tick handler
    this.tickEngine.onTick(async (tickNum, isSleeping) => {
      await this.handleTick(tickNum, isSleeping);
    });

    // Watch for config changes at runtime
    watchConfig((newConfig) => {
      this.config = newConfig;
      this.tickEngine.updateConfig(newConfig);
      this.decisionEngine.updateConfig(newConfig);
      console.log(chalk.gray(`  [config] Reloaded — tick interval: ${newConfig.tickInterval}s`));
    });

    // Start everything
    this.gitWatcher.startPolling();
    this.tickEngine.start();

    // Start listening for user replies
    this.userReply.start();

    console.log(chalk.green("  ▶ Daemon started. Ctrl+C to stop."));
    console.log(chalk.gray("    Reply after any observation to give Vigil feedback.\n"));

    // Prevent fs.watch errors from crashing the daemon
    process.on("uncaughtException", (err) => {
      if (err && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        // Broken symlinks in watched dirs — safe to ignore
        return;
      }
      console.error(chalk.red(`  ✗ Uncaught: ${err}`));
    });

    // Graceful shutdown
    process.on("SIGINT", () => {
      console.log(chalk.red("\n  ■ Shutting down..."));
      stopWatchingConfig();
      releaseLock(this.sessionId);
      this.userReply.stop();
      this.tickEngine.stop();
      this.gitWatcher.stopPolling();
      process.exit(0);
    });
  }

  private async handleTick(tickNum: number, isSleeping: boolean): Promise<void> {
    // Clear any pending prompt from the previous tick
    this.userReply.clearPrompt();

    if (isSleeping) {
      if (tickNum % 10 === 0) {
        console.log(chalk.gray(`  💤 tick ${tickNum} (sleeping)`));
      }
      await this.maybeConsolidate();
      return;
    }

    // Drain user replies from previous ticks
    const userReplies = this.userReply.drain();

    // Store user replies as memories and build context string
    let userRepliesContext = "";
    for (const reply of userReplies) {
      const entry: MemoryEntry = {
        id: crypto.randomUUID(),
        timestamp: reply.timestamp,
        repo: reply.repo,
        type: "user_reply",
        content: `User replied to ${reply.decision}: "${reply.userReply}" (re: "${reply.content}")`,
        metadata: { tickNum: reply.tickNum, decision: reply.decision },
        confidence: 1.0,
      };
      this.vectorStore.store(entry);
      this.eventLog.append(reply.repo, { type: "user_reply", detail: reply.userReply });
    }
    if (userReplies.length > 0) {
      userRepliesContext = userReplies
        .map((r) => `[User replied to tick ${r.tickNum} ${r.decision}] "${r.content}" → User said: "${r.userReply}"`)
        .join("\n");
    }

    // Track last observation for showing prompt
    let lastObservation: { repo: string; decision: string; content: string } | null = null;

    // Build context for each repo
    for (const repoPath of this.repoPaths) {
      const context = await this.gitWatcher.buildContext(repoPath);
      const repoName = repoPath.split("/").pop() || repoPath;

      // Get recent memories
      const memories = this.vectorStore.getByRepo(repoName, 10);
      const memorySummary = memories.map((m) => `[${m.type}] ${m.content}`).join("\n") || "(none)";

      // Get repo profile
      const profile = this.vectorStore.getRepoProfile(repoName);
      const profileSummary = profile ? `${profile.summary}\nPatterns: ${profile.patterns.join(", ")}` : "(no profile)";

      // Include user replies in the context if any
      const fullContext = userRepliesContext
        ? `${context}\n\nUser feedback from previous ticks:\n${userRepliesContext}`
        : context;

      const result = await this.decisionEngine.decide(fullContext, memorySummary, profileSummary);

      switch (result.decision) {
        case "SILENT":
          if (tickNum <= 3 || tickNum % 10 === 0) {
            console.log(chalk.cyan(`  · tick ${tickNum}`) + chalk.gray(` [${repoName}] ${formatTick(result.reasoning)}`));
          }
          break;

        case "OBSERVE": {
          const content = result.content || result.reasoning;
          const entry: MemoryEntry = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            repo: repoName,
            type: "decision",
            content,
            metadata: { tickNum, decision: "OBSERVE" },
            confidence: 0.5,
          };
          this.vectorStore.store(entry);
          this.eventLog.append(repoName, { type: "observe", detail: content });
          console.log(chalk.cyan(`  👁 tick ${tickNum}`) + chalk.white(` [${repoName}] ${formatTick(content)}`));
          lastObservation = { repo: repoName, decision: "OBSERVE", content };
          break;
        }

        case "NOTIFY": {
          const content = result.content || result.reasoning;
          this.eventLog.append(repoName, { type: "notify", detail: content });
          console.log(chalk.cyan(`  🔔 tick ${tickNum}`) + chalk.yellow(` [${repoName}] ${formatTick(content)}`));
          lastObservation = { repo: repoName, decision: "NOTIFY", content };
          break;
        }

        case "ACT": {
          const content = result.action || result.reasoning;
          this.eventLog.append(repoName, { type: "act", detail: content });
          console.log(chalk.cyan(`  ⚡ tick ${tickNum}`) + chalk.red(` [${repoName}] ACTION: ${formatTick(content)}`));
          lastObservation = { repo: repoName, decision: "ACT", content };
          break;
        }
      }
    }

    // Show reply prompt after the last non-silent observation
    if (lastObservation) {
      this.userReply.showPrompt(tickNum, lastObservation.repo, lastObservation.decision, lastObservation.content);
    }
  }

  private async maybeConsolidate(): Promise<void> {
    const idleSec = (Date.now() - this.lastConsolidation) / 1000;
    if (idleSec < this.config.dreamAfter) return;

    console.log(chalk.magenta("\n  🌙 Entering dream phase...\n"));
    this.tickEngine.pause();

    for (const repoPath of this.repoPaths) {
      const repoName = repoPath.split("/").pop() || repoPath;
      const memories = this.vectorStore.getByRepo(repoName, 50);
      if (memories.length === 0) continue;

      const observations = memories.map((m) => m.content);
      const profile = this.vectorStore.getRepoProfile(repoName);
      const profileStr = profile ? `${profile.summary}\nPatterns: ${profile.patterns.join(", ")}` : "";

      const result = await this.decisionEngine.consolidate(observations, profileStr);

      // Store consolidated result
      this.vectorStore.storeConsolidated(
        crypto.randomUUID(),
        repoName,
        result.summary,
        memories.map((m) => m.id)
      );

      // Update repo profile
      this.vectorStore.saveRepoProfile({
        repo: repoName,
        summary: result.summary,
        patterns: result.patterns,
        lastUpdated: Date.now(),
      });

      console.log(chalk.magenta(`  ✨ Consolidated ${memories.length} observations for ${repoName}`));
      if (result.insights.length > 0) {
        for (const insight of result.insights) {
          console.log(chalk.magenta(`     💡 ${insight}`));
        }
      }
    }

    this.lastConsolidation = Date.now();
    this.tickEngine.resume();
    console.log(chalk.magenta("\n  ☀ Dream phase complete. Resuming.\n"));
  }
}
