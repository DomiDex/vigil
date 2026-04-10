import { randomUUID } from "node:crypto";
import { join } from "node:path";
import chalk from "chalk";
import { ActionExecutor } from "../action/executor.ts";
import { type GitEvent, GitWatcher } from "../git/watcher.ts";
import { DecisionEngine } from "../llm/decision-max.ts";
import { CrossRepoAnalyzer } from "../memory/cross-repo.ts";
import { EventLog, type MemoryEntry, VectorStore } from "../memory/store.ts";
import { NativeBackend } from "../messaging/backends/native.ts";
import { NtfyBackend } from "../messaging/backends/ntfy.ts";
import { PushChannel } from "../messaging/channels/push.ts";
import { ConsoleChannel, createMessage, DisplayFilter, JsonlChannel, MessageRouter } from "../messaging/index.ts";
import { NotificationRouter } from "../notify/push.ts";
import { WebhookProcessor } from "../webhooks/processor.ts";
import { type WebhookEvent, WebhookServer } from "../webhooks/server.ts";
import { SubscriptionManager } from "../webhooks/subscriptions.ts";
import type { ActionType } from "./config.ts";
import { getConfigDir, getLogsDir, loadConfig, stopWatchingConfig, type VigilConfig, watchConfig } from "./config.ts";
import { FEATURES } from "./features.ts";
import { acquireLock, releaseLock } from "./instance-lock.ts";
import { MetricsStore } from "./metrics.ts";
import { type SessionData, SessionStore } from "./session.ts";
import { TickEngine } from "./tick-engine.ts";
import { UserReply } from "./user-reply.ts";

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

/** Dependency injection for testability */
interface DaemonDeps {
  tickEngine?: TickEngine;
  gitWatcher?: GitWatcher;
  eventLog?: EventLog;
  vectorStore?: VectorStore;
  decisionEngine?: DecisionEngine;
  sessionStore?: SessionStore;
  actionExecutor?: ActionExecutor;
  notifier?: NotificationRouter;
  crossRepoAnalyzer?: CrossRepoAnalyzer;
  metrics?: MetricsStore;
  messageRouter?: MessageRouter;
  webhookServer?: WebhookServer;
  subscriptionManager?: SubscriptionManager;
}

export class Daemon {
  config: VigilConfig;
  private tickEngine: TickEngine;
  private gitWatcher: GitWatcher;
  private eventLog: EventLog;
  private vectorStore: VectorStore;
  private decisionEngine: DecisionEngine;
  private userReply: UserReply;
  private sessionStore: SessionStore;
  notifier: NotificationRouter;
  crossRepoAnalyzer: CrossRepoAnalyzer;
  metrics: MetricsStore;
  messageRouter: MessageRouter;
  displayFilter: DisplayFilter;
  briefMode: boolean;
  private webhookServer: WebhookServer | null = null;
  private subscriptionManager: SubscriptionManager | null = null;
  private webhookProcessor: WebhookProcessor | null = null;
  lastConsolidation = Date.now();
  observationsSinceLastDream = 0;
  /** Ring buffer of recent per-repo decisions to prevent redundant observations */
  private recentDecisions = new Map<string, { decision: string; summary: string; tick: number }[]>();
  repoPaths: string[];
  private sessionId: string;
  private session: SessionData | null = null;
  actionExecutor: ActionExecutor;
  /** CLI overrides that must survive config hot-reloads */
  private cliOverrides: { tickInterval?: number; model?: string } = {};

  constructor(
    repoPaths: string[],
    options?: { tickInterval?: number; model?: string; brief?: boolean },
    deps?: DaemonDeps,
  ) {
    this.config = loadConfig();
    if (options?.tickInterval) {
      this.config.tickInterval = options.tickInterval;
      this.cliOverrides.tickInterval = options.tickInterval;
    }
    if (options?.model) {
      this.config.tickModel = options.model;
      this.cliOverrides.model = options.model;
    }

    this.repoPaths = repoPaths;
    this.sessionId = randomUUID();
    this.tickEngine = deps?.tickEngine ?? new TickEngine(this.config);
    this.gitWatcher = deps?.gitWatcher ?? new GitWatcher();
    this.eventLog = deps?.eventLog ?? new EventLog();
    this.vectorStore = deps?.vectorStore ?? new VectorStore();
    this.decisionEngine = deps?.decisionEngine ?? new DecisionEngine(this.config);
    this.sessionStore = deps?.sessionStore ?? new SessionStore();
    this.actionExecutor =
      deps?.actionExecutor ??
      new ActionExecutor({
        allowModerate: this.config.allowModerateActions,
        gateConfig: this.config.actions,
      });
    this.notifier =
      deps?.notifier ??
      new NotificationRouter({
        backends: this.config.notifyBackends as any[],
        webhookUrl: this.config.webhookUrl || undefined,
      });
    this.crossRepoAnalyzer = deps?.crossRepoAnalyzer ?? new CrossRepoAnalyzer();
    this.metrics = deps?.metrics ?? new MetricsStore();
    this.userReply = new UserReply();

    // Brief mode — CLI flag overrides config
    this.briefMode = options?.brief ?? this.config.briefMode ?? false;
    this.displayFilter = new DisplayFilter(
      this.briefMode
        ? { showStatuses: ["proactive", "alert", "scheduled"] }
        : { showStatuses: ["normal", "proactive", "alert", "scheduled"] },
    );

    // Message router — structured output pipeline
    this.messageRouter = deps?.messageRouter ?? new MessageRouter();
    // In brief mode, ConsoleChannel filters what's shown; JSONL always logs everything
    this.messageRouter.registerChannel(new ConsoleChannel(this.briefMode ? this.displayFilter : undefined));
    this.messageRouter.registerChannel(new JsonlChannel(join(getLogsDir(), "messages.jsonl")));

    // Push notifications channel (Phase 13)
    if (this.config.push?.enabled) {
      const pushChannel = new PushChannel(this.config.push);
      if (this.config.push.ntfy?.topic) {
        const { topic, server, token } = this.config.push.ntfy;
        pushChannel.addBackend(new NtfyBackend(topic, server, token));
      }
      if (this.config.push.native) {
        pushChannel.addBackend(new NativeBackend());
      }
      if (pushChannel.getBackends().length > 0) {
        this.messageRouter.registerChannel(pushChannel);
      }
    }

    // Webhook server (Phase 12) — gated by feature flag
    if (this.config.features[FEATURES.VIGIL_WEBHOOKS]) {
      this.subscriptionManager = deps?.subscriptionManager ?? new SubscriptionManager(getConfigDir());
      this.subscriptionManager.load();
      this.webhookServer = deps?.webhookServer ?? new WebhookServer(this.config.webhook);
      this.webhookProcessor = new WebhookProcessor(this.subscriptionManager, this.messageRouter);
    }
  }

  async start(): Promise<void> {
    // Acquire instance lock — prevents duplicate daemons on same repos
    if (!acquireLock(this.sessionId, this.repoPaths)) {
      console.error(chalk.red("  ✗ Failed to acquire instance lock. Another Vigil may be running."));
      process.exit(1);
    }

    console.log(chalk.cyan(BANNER));

    // Restore session state from previous run
    const lastSession = this.sessionStore.getLastSession();
    if (lastSession) {
      console.log(chalk.gray(`  Resuming after ${lastSession.state} session (${lastSession.tickCount} ticks)`));
      if (lastSession.state === "stopped") {
        this.lastConsolidation = lastSession.lastTickAt;
      }
    }

    this.session = this.sessionStore.create(this.repoPaths, this.config as any);
    this.sessionId = this.session.id;

    console.log(chalk.gray(`  Session: ${this.sessionId.slice(0, 8)}`));
    console.log(chalk.gray(`  Tick interval: ${this.config.tickInterval}s`));
    console.log(chalk.gray(`  Model: ${this.config.tickModel}`));
    console.log(chalk.gray(`  Sleep after: ${this.config.sleepAfter}s idle`));
    console.log(chalk.gray("  Proactive mode: enabled (adaptive tick intervals)"));
    console.log();

    // Init stores
    this.vectorStore.init();

    // Add repos and load agent definitions
    for (const repoPath of this.repoPaths) {
      await this.gitWatcher.addRepo(repoPath);
      const agent = await this.decisionEngine.loadAgent(repoPath);
      if (agent) {
        console.log(chalk.green(`  ✓ Watching: ${repoPath}`) + chalk.cyan(` [agent: ${agent.name}]`));
      } else {
        console.log(chalk.green(`  ✓ Watching: ${repoPath}`));
      }
    }
    console.log();

    // Wire git events — feed into work detector for proactive mode
    this.gitWatcher.onEvent((event: GitEvent) => {
      this.tickEngine.onGitEvent({
        type: event.type,
        detail: event.detail,
        branch: event.repo,
      });
      this.eventLog.append(event.repo, {
        type: event.type,
        detail: event.detail,
      });
      console.log(chalk.yellow(`  ⚡ ${event.repo}: ${event.detail}`));
    });

    // Wire proactive tick handler — called only when WorkDetector triggers
    this.tickEngine.onProactiveTick(async (tickNum, analysis, tickPrompt) => {
      if (this.session) {
        this.sessionStore.updateTick(this.session.id, tickNum);
      }
      this.metrics.increment("ticks.proactive");
      console.log(
        chalk.gray(`  [tick ${tickNum}] Proactive: ${analysis.reason} (${analysis.signals.length} signal(s))`),
      );
      await this.handleTick(tickNum, false, tickPrompt);
    });

    // Wire regular tick handler — always fires for sleep/consolidation
    this.tickEngine.onTick(async (tickNum, isSleeping) => {
      if (this.session) {
        this.sessionStore.updateTick(this.session.id, tickNum);
      }
      if (isSleeping) {
        await this.handleTick(tickNum, true);
      }
      // When awake, proactive handler drives LLM calls — regular handler only does consolidation
    });

    // Watch for config changes at runtime
    watchConfig((newConfig) => {
      // Re-apply CLI overrides — they take precedence over the config file
      if (this.cliOverrides.tickInterval !== undefined) {
        newConfig.tickInterval = this.cliOverrides.tickInterval;
      }
      if (this.cliOverrides.model !== undefined) {
        newConfig.tickModel = this.cliOverrides.model;
      }
      this.config = newConfig;
      this.tickEngine.updateConfig(newConfig);
      this.decisionEngine.updateConfig(newConfig);
      this.actionExecutor.updateGateConfig(newConfig.actions);
      this.notifier = new NotificationRouter({
        backends: newConfig.notifyBackends as any[],
        webhookUrl: newConfig.webhookUrl || undefined,
      });
      console.log(chalk.gray(`  [config] Reloaded — tick interval: ${newConfig.tickInterval}s`));
    });

    // Start everything
    this.metrics.startFlushing();
    this.gitWatcher.startPolling();
    this.tickEngine.start();

    // Start webhook server if configured
    if (this.webhookServer && this.webhookProcessor) {
      const processor = this.webhookProcessor;
      this.webhookServer.on("webhook_event", (event: WebhookEvent) => {
        processor.process(event).catch((err) => {
          console.error(chalk.red(`  ✗ Webhook processing error: ${err}`));
        });
      });
      await this.webhookServer.start();
      console.log(chalk.green(`  ✓ Webhook server listening on port ${this.webhookServer.getPort()}`));
    }

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
      if (this.session) {
        this.sessionStore.stop(this.session.id);
      }
      this.webhookServer?.stop();
      stopWatchingConfig();
      releaseLock(this.sessionId);
      this.metrics.stop();
      this.userReply.stop();
      this.tickEngine.stop();
      this.gitWatcher.stopPolling();
      process.exit(0);
    });
  }

  async handleTick(tickNum: number, isSleeping: boolean, tickPrompt?: string): Promise<void> {
    // Clear any pending prompt from the previous tick
    this.userReply.clearPrompt();

    this.metrics.increment("ticks.total");

    if (isSleeping) {
      this.metrics.increment("ticks.sleeping");
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

      // Include cross-repo context when watching multiple repos
      const crossRepoContext = this.repoPaths.length > 1 ? this.crossRepoAnalyzer.getRelatedRepoContext(repoName) : "";

      // Include tick prompt, user replies, cross-repo context, and recent decision history
      let fullContext = context;
      if (tickPrompt) fullContext += `\n\n${tickPrompt}`;
      if (crossRepoContext) fullContext += `\n\n${crossRepoContext}`;
      if (userRepliesContext) fullContext += `\n\nUser feedback from previous ticks:\n${userRepliesContext}`;

      // Inject recent decisions so the LLM avoids repeating itself
      const recentForRepo = this.recentDecisions.get(repoName) ?? [];
      if (recentForRepo.length > 0) {
        const historyLines = recentForRepo
          .map((d) => `  tick ${d.tick}: ${d.decision} — ${d.summary.slice(0, 120)}`)
          .join("\n");
        fullContext += `\n\nYour recent decisions for this repo (DO NOT repeat the same observation — return SILENT if nothing changed):\n${historyLines}`;
      }

      // Build repo context for agent-aware prompt
      const repoState = this.gitWatcher.getRepoState(repoPath);
      const repoCtx = repoState
        ? {
            repoPath,
            repoName,
            branch: repoState.currentBranch,
            recentCommits: [] as string[],
            uncommittedFiles: [] as string[],
          }
        : undefined;

      const decisionStart = Date.now();
      const result = await this.decisionEngine.decide(
        fullContext,
        memorySummary,
        profileSummary,
        repoCtx,
        !!tickPrompt,
      );
      this.metrics.timing("llm.decision_ms", Date.now() - decisionStart, { repo: repoName });
      this.metrics.increment(`decisions.${result.decision.toLowerCase()}`);

      switch (result.decision) {
        case "SILENT": {
          // In brief mode, SILENT decisions are suppressed entirely
          if (!this.briefMode) {
            console.log(
              chalk.cyan(`  · tick ${tickNum}`) +
                chalk.blueBright(` [${repoName}]`) +
                chalk.white(` ${formatTick(result.reasoning)}`),
            );
          }
          break;
        }

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
          this.observationsSinceLastDream++;

          const observeMsg = createMessage({
            source: {
              repo: repoName,
              branch: repoState?.currentBranch,
              event: "observe",
              agent: repoCtx ? undefined : "vigil",
            },
            status: "normal",
            severity: "info",
            message: content,
            metadata: { tickNum, decision: "OBSERVE" },
          });
          await this.messageRouter.route(observeMsg);

          lastObservation = { repo: repoName, decision: "OBSERVE", content };
          break;
        }

        case "NOTIFY": {
          const content = result.content || result.reasoning;
          this.eventLog.append(repoName, { type: "notify", detail: content });
          this.observationsSinceLastDream++;

          const notifyMsg = createMessage({
            source: {
              repo: repoName,
              branch: repoState?.currentBranch,
              event: "notify",
              agent: repoCtx ? undefined : "vigil",
            },
            status: "proactive",
            severity: "warning",
            message: content,
            metadata: { tickNum, decision: "NOTIFY" },
          });
          await this.messageRouter.route(notifyMsg);

          await this.notifier.send(`Vigil — ${repoName}`, content, "info");
          lastObservation = { repo: repoName, decision: "NOTIFY", content };
          break;
        }

        case "ACT": {
          const content = result.action || result.reasoning;
          this.eventLog.append(repoName, { type: "act", detail: content });
          this.observationsSinceLastDream++;

          const actMsg = createMessage({
            source: {
              repo: repoName,
              branch: repoState?.currentBranch,
              event: "act",
              agent: repoCtx ? undefined : "vigil",
            },
            status: "alert",
            severity: "critical",
            message: `ACTION: ${content}`,
            metadata: { tickNum, decision: "ACT", action: result.action },
          });
          await this.messageRouter.route(actMsg);

          // Attempt gated action execution if a command is provided
          if (result.action) {
            const actionResult = await this.actionExecutor.submit(result.action, result.reasoning, repoName, repoPath, {
              actionType: result.actionType as ActionType | undefined,
              confidence: result.confidence ?? 0,
            });

            if (actionResult.status === "executed") {
              console.log(chalk.green(`    ✓ Action executed: ${actionResult.result?.slice(0, 120) || "ok"}`));
            } else if (actionResult.status === "pending") {
              console.log(chalk.yellow(`    ⏳ Action queued for approval (id: ${actionResult.id.slice(0, 8)})`));
            } else if (actionResult.status === "rejected") {
              console.log(chalk.red(`    ✗ Action blocked: ${actionResult.error}`));
            } else if (actionResult.status === "failed") {
              console.log(chalk.red(`    ✗ Action failed: ${actionResult.error}`));
            }
          }

          await this.notifier.send(`Vigil — ${repoName}`, content, "warning");
          lastObservation = { repo: repoName, decision: "ACT", content };
          break;
        }
      }

      // Record this decision in the ring buffer (keep last 5)
      const history = this.recentDecisions.get(repoName) ?? [];
      history.push({
        decision: result.decision,
        summary: result.content || result.reasoning,
        tick: tickNum,
      });
      if (history.length > 5) history.shift();
      this.recentDecisions.set(repoName, history);
    }

    // Show reply prompt after the last non-silent observation
    if (lastObservation) {
      this.userReply.showPrompt(tickNum, lastObservation.repo, lastObservation.decision, lastObservation.content);
    }
  }

  async maybeConsolidate(): Promise<void> {
    const idleSec = (Date.now() - this.lastConsolidation) / 1000;
    if (idleSec < this.config.dreamAfter) return;

    // Don't consolidate if no new observations since last dream
    if (this.observationsSinceLastDream === 0) return;

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
        memories.map((m) => m.id),
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

    // Cross-repo analysis when watching multiple repos
    if (this.repoPaths.length > 1) {
      const crossMemories = this.vectorStore.getCrossRepoMemories(50);
      const profiles = this.vectorStore.getAllRepoProfiles();

      if (profiles.length > 1) {
        const crossAnalysis = await this.decisionEngine.analyzeCrossRepo(crossMemories, profiles);

        if (crossAnalysis.risks.length > 0) {
          console.log(chalk.yellow("\n  Cross-repo risks detected:"));
          for (const r of crossAnalysis.risks) {
            console.log(chalk.yellow(`    ⚠  ${r}`));
          }
        }

        if (crossAnalysis.patterns.length > 0) {
          console.log(chalk.magenta("\n  Cross-repo patterns:"));
          for (const p of crossAnalysis.patterns) {
            console.log(chalk.magenta(`    🔗 ${p}`));
          }
        }

        // Store as a special cross-repo memory
        this.vectorStore.store({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          repo: "_cross_repo",
          type: "consolidated",
          content: JSON.stringify(crossAnalysis),
          metadata: { repos: this.repoPaths.map((p) => p.split("/").pop()) },
          confidence: 0.8,
        });

        // Auto-declare relations from detected patterns
        for (const profile of profiles) {
          for (const other of profiles) {
            if (profile.repo >= other.repo) continue;
            if (crossAnalysis.patterns.length > 0) {
              this.crossRepoAnalyzer.declareRelation(
                profile.repo,
                other.repo,
                "shared_pattern",
                crossAnalysis.patterns[0],
                0.6,
              );
            }
          }
        }
      }
    }

    // Prune stale memories after consolidation
    const pruned = this.vectorStore.prune();
    if (pruned > 0) {
      console.log(chalk.magenta(`  🗑  Pruned ${pruned} stale memories`));
    }

    this.lastConsolidation = Date.now();
    this.observationsSinceLastDream = 0;
    this.tickEngine.resume();
    console.log(chalk.magenta("\n  ☀ Dream phase complete. Resuming.\n"));
  }
}
