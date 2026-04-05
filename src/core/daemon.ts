import { TickEngine } from "./tick-engine.ts";
import { loadConfig, type VigilConfig } from "./config.ts";
import { GitWatcher, type GitEvent } from "../git/watcher.ts";
import { EventLog, VectorStore, type MemoryEntry } from "../memory/store.ts";
import { DecisionEngine } from "../llm/decision-max.ts";
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

export class Daemon {
  private config: VigilConfig;
  private tickEngine: TickEngine;
  private gitWatcher: GitWatcher;
  private eventLog: EventLog;
  private vectorStore: VectorStore;
  private decisionEngine: DecisionEngine;
  private lastConsolidation = Date.now();
  private repoPaths: string[];

  constructor(repoPaths: string[], options?: { tickInterval?: number; model?: string }) {
    this.config = loadConfig();
    if (options?.tickInterval) this.config.tickInterval = options.tickInterval;
    if (options?.model) this.config.tickModel = options.model;

    this.repoPaths = repoPaths;
    this.tickEngine = new TickEngine(this.config);
    this.gitWatcher = new GitWatcher();
    this.eventLog = new EventLog();
    this.vectorStore = new VectorStore();
    this.decisionEngine = new DecisionEngine(this.config);
  }

  async start(): Promise<void> {
    console.log(chalk.cyan(BANNER));
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

    // Start everything
    this.gitWatcher.startPolling();
    this.tickEngine.start();

    console.log(chalk.green("  ▶ Daemon started. Ctrl+C to stop.\n"));

    // Graceful shutdown
    process.on("SIGINT", () => {
      console.log(chalk.red("\n  ■ Shutting down..."));
      this.tickEngine.stop();
      this.gitWatcher.stopPolling();
      process.exit(0);
    });
  }

  private async handleTick(tickNum: number, isSleeping: boolean): Promise<void> {
    if (isSleeping) {
      if (tickNum % 10 === 0) {
        console.log(chalk.gray(`  💤 tick ${tickNum} (sleeping)`));
      }
      await this.maybeConsolidate();
      return;
    }

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

      const result = await this.decisionEngine.decide(context, memorySummary, profileSummary);

      switch (result.decision) {
        case "SILENT":
          if (tickNum % 10 === 0) {
            console.log(chalk.gray(`  · tick ${tickNum}: ${result.reasoning}`));
          }
          break;

        case "OBSERVE": {
          const entry: MemoryEntry = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            repo: repoName,
            type: "decision",
            content: result.content || result.reasoning,
            metadata: { tickNum, decision: "OBSERVE" },
            confidence: 0.5,
          };
          this.vectorStore.store(entry);
          this.eventLog.append(repoName, { type: "observe", detail: result.content || result.reasoning });
          console.log(chalk.blue(`  👁 tick ${tickNum}: ${result.content || result.reasoning}`));
          break;
        }

        case "NOTIFY":
          this.eventLog.append(repoName, { type: "notify", detail: result.content || result.reasoning });
          console.log(chalk.yellow(`  🔔 tick ${tickNum}: ${result.content || result.reasoning}`));
          break;

        case "ACT":
          this.eventLog.append(repoName, { type: "act", detail: result.action || result.reasoning });
          console.log(chalk.red(`  ⚡ tick ${tickNum} [PROPOSED ACTION]: ${result.action || result.reasoning}`));
          break;
      }
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
