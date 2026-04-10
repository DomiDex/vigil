#!/usr/bin/env bun
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { ActionExecutor } from "../action/executor.ts";
import { getConfigDir, getDataDir, loadConfig, saveConfig } from "../core/config.ts";
import { Daemon } from "../core/daemon.ts";
import { FeatureGates } from "../core/feature-gates.ts";
import { FEATURES, type FeatureName } from "../core/features.ts";
import { MetricsStore } from "../core/metrics.ts";
import { GitWatcher } from "../git/watcher.ts";
import { DecisionEngine } from "../llm/decision-max.ts";
import { EventLog, VectorStore } from "../memory/store.ts";
import { NotificationRouter } from "../notify/push.ts";
import { SubscriptionManager } from "../webhooks/subscriptions.ts";

const program = new Command();

program
  .name("vigil")
  .description("Always-on git agent — watches repos, makes decisions, consolidates memory")
  .version("0.1.0");

// ── watch ──
program
  .command("watch")
  .description("Start watching repositories")
  .argument("<repos...>", "Paths to git repositories")
  .option("-t, --tick <seconds>", "Tick interval in seconds", parseInt)
  .option("-m, --model <model>", "Model for tick decisions")
  .option("-b, --brief", "Brief mode — only show important messages, suppress routine output")
  .action(async (repos: string[], opts) => {
    const resolvedRepos = repos.map((r) => resolve(r));
    const daemon = new Daemon(resolvedRepos, {
      tickInterval: opts.tick,
      model: opts.model,
      brief: opts.brief,
    });
    await daemon.start();
    // Keep alive
    setInterval(() => {}, 1 << 30);
  });

// ── status ──
program
  .command("status")
  .description("Show current configuration")
  .action(() => {
    const config = loadConfig();
    console.log(chalk.cyan("\n  Vigil Configuration\n"));
    for (const [key, value] of Object.entries(config)) {
      console.log(`  ${chalk.gray(key)}: ${chalk.white(String(value))}`);
    }
    console.log();
  });

// ── log ──
program
  .command("log")
  .description("View event log")
  .option("-r, --repo <name>", "Filter by repo name")
  .option("-t, --type <type>", "Filter by event type")
  .option("-l, --limit <n>", "Max entries to show", parseInt, 20)
  .action((opts) => {
    const eventLog = new EventLog();
    const entries = eventLog.query({
      repo: opts.repo,
      type: opts.type,
      limit: opts.limit,
    });

    if (entries.length === 0) {
      console.log(chalk.gray("\n  No log entries found.\n"));
      return;
    }

    const icons: Record<string, string> = {
      file_change: "📝",
      new_commit: "📦",
      branch_switch: "🔀",
      uncommitted_drift: "⏰",
      observe: "👁",
      notify: "🔔",
      act: "⚡",
      user_reply: "💬",
    };

    console.log(chalk.cyan("\n  Event Log\n"));
    for (const entry of entries) {
      const icon = icons[entry.type as string] || "·";
      const time = new Date(entry.timestamp as number).toLocaleTimeString();
      console.log(`  ${icon} ${chalk.gray(time)} ${chalk.white(entry.detail as string)}`);
    }
    console.log();
  });

// ── ask ──
program
  .command("ask")
  .description("Ask Vigil a question about a repo")
  .argument("<question...>", "Your question")
  .option("-r, --repo <path>", "Repo path", ".")
  .action(async (questionParts: string[], opts) => {
    const question = questionParts.join(" ");
    const config = loadConfig();
    const engine = new DecisionEngine(config);
    const watcher = new GitWatcher();

    const repoPath = resolve(opts.repo);
    await watcher.addRepo(repoPath);
    const context = await watcher.buildContext(repoPath);

    console.log(chalk.gray("\n  Thinking...\n"));
    const answer = await engine.ask(question, context);
    console.log(`  ${answer}\n`);
  });

// ── dream ──
program
  .command("dream")
  .description("Force memory consolidation")
  .option("-r, --repo <path>", "Repo path", ".")
  .action(async (opts) => {
    const config = loadConfig();
    const engine = new DecisionEngine(config);
    const store = new VectorStore();
    store.init();

    const repoName = resolve(opts.repo).split("/").pop() || "unknown";
    const memories = store.getByRepo(repoName, 50);

    if (memories.length === 0) {
      console.log(chalk.gray("\n  No memories to consolidate.\n"));
      return;
    }

    const profile = store.getRepoProfile(repoName);
    const profileStr = profile ? `${profile.summary}\nPatterns: ${profile.patterns.join(", ")}` : "";

    console.log(chalk.magenta(`\n  🌙 Consolidating ${memories.length} observations...\n`));

    const result = await engine.consolidate(
      memories.map((m) => m.content),
      profileStr,
    );

    store.storeConsolidated(
      crypto.randomUUID(),
      repoName,
      result.summary,
      memories.map((m) => m.id),
    );
    store.saveRepoProfile({
      repo: repoName,
      summary: result.summary,
      patterns: result.patterns,
      lastUpdated: Date.now(),
    });

    console.log(chalk.magenta(`  Summary: ${result.summary}`));
    for (const insight of result.insights) {
      console.log(chalk.magenta(`  💡 ${insight}`));
    }
    console.log();
  });

// ── memory ──
program
  .command("memory")
  .description("Show repo memory profile")
  .option("-r, --repo <path>", "Repo path", ".")
  .action((opts) => {
    const store = new VectorStore();
    store.init();
    const repoName = resolve(opts.repo).split("/").pop() || "unknown";
    const profile = store.getRepoProfile(repoName);

    if (!profile) {
      console.log(chalk.gray("\n  No memory profile found. Run 'dream' first.\n"));
      return;
    }

    console.log(chalk.cyan(`\n  Memory Profile: ${profile.repo}\n`));
    console.log(`  ${chalk.white(profile.summary)}`);
    if (profile.patterns.length > 0) {
      console.log(chalk.gray("\n  Patterns:"));
      for (const p of profile.patterns) {
        console.log(`    · ${p}`);
      }
    }
    console.log(chalk.gray(`\n  Last updated: ${new Date(profile.lastUpdated).toLocaleString()}\n`));
  });

// ── config ──
program
  .command("config")
  .description("View or set config values")
  .argument("[key]", "Config key to view/set")
  .argument("[value]", "New value to set")
  .action((key?: string, value?: string) => {
    const config = loadConfig();

    if (!key) {
      console.log(chalk.cyan("\n  Vigil Configuration\n"));
      for (const [k, v] of Object.entries(config)) {
        console.log(`  ${chalk.gray(k)}: ${chalk.white(String(v))}`);
      }
      console.log();
      return;
    }

    if (!(key in config)) {
      console.error(chalk.red(`  Unknown config key: ${key}`));
      return;
    }

    if (value === undefined) {
      console.log(`  ${key}: ${(config as any)[key]}`);
      return;
    }

    // Parse value
    const numVal = Number(value);
    (config as any)[key] = Number.isNaN(numVal) ? value : numVal;
    saveConfig(config);
    console.log(chalk.green(`  ✓ ${key} = ${value}`));
  });

// ── notifications ──
program
  .command("notifications")
  .description("View or clear notification queue")
  .option("--clear", "Clear all notifications")
  .option("-l, --limit <n>", "Max entries to show", parseInt, 20)
  .action((opts) => {
    const config = loadConfig();
    const notifier = new NotificationRouter({
      backends: config.notifyBackends as any[],
      webhookUrl: config.webhookUrl || undefined,
    });

    const entries = notifier.readQueue(opts.limit);

    if (opts.clear) {
      writeFileSync(join(getDataDir(), "notifications", "queue.jsonl"), "");
      console.log(chalk.green("  ✓ Cleared notification queue."));
      return;
    }

    if (entries.length === 0) {
      console.log(chalk.gray("\n  No notifications.\n"));
      return;
    }

    console.log(chalk.cyan("\n  Notifications\n"));
    for (const entry of entries) {
      const time = new Date(entry.timestamp as number).toLocaleTimeString();
      const severity = entry.severity as string;
      const icon = severity === "warning" ? "⚡" : "🔔";
      console.log(`  ${icon} ${chalk.gray(time)} ${chalk.white(entry.title as string)}`);
      console.log(`    ${entry.message}`);
    }
    console.log();
  });

// ── metrics ──
program
  .command("metrics")
  .description("Show operational metrics")
  .option("--hours <n>", "Hours to look back", "24")
  .action((opts) => {
    const metrics = new MetricsStore();
    const hours = Number.parseInt(opts.hours, 10) || 24;
    const since = Date.now() - hours * 3_600_000;
    const summary = metrics.getSummary(since);

    const entries = Object.entries(summary);
    if (entries.length === 0) {
      console.log(chalk.gray(`\n  No metrics recorded in the last ${hours}h.\n`));
      metrics.close();
      return;
    }

    console.log(chalk.cyan(`\n  Metrics (last ${hours}h)\n`));
    for (const [name, data] of entries) {
      console.log(
        `  ${chalk.white(name)}: count=${chalk.green(String(data.count))} avg=${chalk.yellow(data.avg.toFixed(1))} max=${chalk.red(data.max.toFixed(1))}`,
      );
    }
    console.log();
    metrics.close();
  });

// ── actions ──
program
  .command("actions")
  .description("View and manage queued actions")
  .option("--pending", "Show only pending actions")
  .option("--approve <id>", "Approve a pending action")
  .option("--reject <id>", "Reject a pending action")
  .option("-l, --limit <n>", "Max entries to show", parseInt, 20)
  .action(async (opts) => {
    const config = loadConfig();
    const executor = new ActionExecutor({
      allowModerate: config.allowModerateActions,
      gateConfig: config.actions,
    });

    if (opts.approve) {
      const result = await executor.approve(opts.approve, ".");
      if (!result) {
        console.log(chalk.red(`  ✗ No pending action found with id: ${opts.approve}`));
      } else {
        console.log(
          result.status === "executed"
            ? chalk.green(`  ✓ Action executed: ${result.result?.slice(0, 120) || "ok"}`)
            : chalk.red(`  ✗ Action failed: ${result.error}`),
        );
      }
      executor.close();
      return;
    }

    if (opts.reject) {
      const result = executor.reject(opts.reject);
      if (!result) {
        console.log(chalk.red(`  ✗ No pending action found with id: ${opts.reject}`));
      } else {
        console.log(chalk.green(`  ✓ Action rejected: ${result.command}`));
      }
      executor.close();
      return;
    }

    const actions = opts.pending ? executor.getPending() : executor.getRecent(opts.limit);

    if (actions.length === 0) {
      console.log(chalk.gray(`\n  No ${opts.pending ? "pending " : ""}actions.\n`));
      executor.close();
      return;
    }

    const statusIcons: Record<string, string> = {
      pending: "⏳",
      approved: "✓",
      executed: "✓",
      rejected: "✗",
      failed: "✗",
    };

    console.log(chalk.cyan(`\n  ${opts.pending ? "Pending " : ""}Actions\n`));
    for (const action of actions) {
      const icon = statusIcons[action.status] || "·";
      const time = new Date(action.createdAt).toLocaleTimeString();
      const statusColor =
        action.status === "executed"
          ? chalk.green
          : action.status === "failed" || action.status === "rejected"
            ? chalk.red
            : chalk.yellow;
      console.log(`  ${icon} ${chalk.gray(time)} ${statusColor(`[${action.status}]`)} ${chalk.white(action.command)}`);
      console.log(`    ${chalk.gray(`id: ${action.id.slice(0, 8)}  tier: ${action.tier}  repo: ${action.repo}`)}`);
      if (action.error) {
        console.log(`    ${chalk.red(action.error)}`);
      }
    }
    console.log();
    executor.close();
  });

// ── webhook ──
program
  .command("webhook")
  .description("Manage PR webhook subscriptions")
  .option("--subscribe <repo>", "Subscribe to a PR (format: owner/repo#123)")
  .option("--events <events>", "Comma-separated events to watch", "opened,closed,review_submitted,commented")
  .option("--unsubscribe <id>", "Unsubscribe by subscription ID")
  .option("--list", "List all subscriptions")
  .option("--repo <repo>", "Filter list by repo (owner/repo)")
  .action((opts) => {
    const subs = new SubscriptionManager(getConfigDir());
    subs.load();

    if (opts.subscribe) {
      const match = opts.subscribe.match(/^(.+)#(\d+)$/);
      if (!match) {
        console.error(chalk.red("  ✗ Invalid format. Use: owner/repo#123"));
        return;
      }
      const [, repo, prNum] = match;
      const events = opts.events.split(",").map((e: string) => e.trim());
      const sub = subs.subscribe(repo, parseInt(prNum, 10), events);
      console.log(chalk.green(`  ✓ Subscribed to ${repo}#${prNum} (id: ${sub.id})`));
      console.log(chalk.gray(`    Events: ${events.join(", ")}`));
      return;
    }

    if (opts.unsubscribe) {
      const removed = subs.unsubscribe(opts.unsubscribe);
      if (removed) {
        console.log(chalk.green(`  ✓ Unsubscribed: ${opts.unsubscribe}`));
      } else {
        console.log(chalk.red(`  ✗ Subscription not found: ${opts.unsubscribe}`));
      }
      return;
    }

    // Default: list
    const list = subs.list({ repo: opts.repo });
    if (list.length === 0) {
      console.log(chalk.gray("\n  No webhook subscriptions.\n"));
      return;
    }

    console.log(chalk.cyan("\n  Webhook Subscriptions\n"));
    for (const sub of list) {
      const status = sub.active ? chalk.green("active") : chalk.gray("inactive");
      console.log(`  ${status} ${chalk.white(`${sub.repo}#${sub.prNumber}`)} ${chalk.gray(`(id: ${sub.id})`)}`);
      console.log(`    Events: ${sub.events.join(", ")}`);
      console.log(`    Created: ${new Date(sub.createdAt).toLocaleString()}`);
    }
    console.log();
  });

// ── features ──
program
  .command("features")
  .description("View and manage feature gates")
  .option("--enable <feature>", "Enable a feature in config (Layer 2)")
  .option("--disable <feature>", "Disable a feature in config (Layer 2)")
  .option("--diagnose <feature>", "Show per-layer gate status for a feature")
  .action(async (opts) => {
    const config = loadConfig();
    const configPath = join(getConfigDir(), "config.json");
    const gates = new FeatureGates({ configPath, remoteTTL: 300_000 });
    gates.loadConfigFlags();

    // Set build flags (all enabled by default)
    for (const feature of Object.values(FEATURES)) {
      gates.setBuildFlag(feature, true);
    }

    if (opts.enable) {
      const featureName = resolveFeatureName(opts.enable);
      if (!featureName) {
        console.error(chalk.red(`  ✗ Unknown feature: ${opts.enable}`));
        console.log(chalk.gray(`  Available: ${Object.values(FEATURES).join(", ")}`));
        return;
      }
      config.features[featureName] = true;
      saveConfig(config);
      console.log(chalk.green(`  ✓ Enabled: ${featureName}`));
      return;
    }

    if (opts.disable) {
      const featureName = resolveFeatureName(opts.disable);
      if (!featureName) {
        console.error(chalk.red(`  ✗ Unknown feature: ${opts.disable}`));
        console.log(chalk.gray(`  Available: ${Object.values(FEATURES).join(", ")}`));
        return;
      }
      config.features[featureName] = false;
      saveConfig(config);
      console.log(chalk.green(`  ✓ Disabled: ${featureName}`));
      return;
    }

    if (opts.diagnose) {
      const featureName = resolveFeatureName(opts.diagnose);
      if (!featureName) {
        console.error(chalk.red(`  ✗ Unknown feature: ${opts.diagnose}`));
        return;
      }
      const diagnosis = await gates.diagnose(featureName);
      console.log(chalk.cyan(`\n  Feature Gate Diagnosis: ${featureName}\n`));
      for (const [layer, status] of Object.entries(diagnosis)) {
        const icon = status === false ? chalk.red("✗") : status === true ? chalk.green("✓") : chalk.gray("–");
        const label = status === undefined ? "n/a" : status ? "enabled" : "BLOCKED";
        console.log(`  ${icon} ${chalk.white(layer.padEnd(10))} ${label}`);
      }
      console.log();
      return;
    }

    // Default: list all features with status
    console.log(chalk.cyan("\n  Feature Gates\n"));
    for (const [_, name] of Object.entries(FEATURES)) {
      const enabled = gates.isEnabledCached(name);
      const icon = enabled ? chalk.green("✓") : chalk.red("✗");
      const configVal = config.features[name];
      const configLabel =
        configVal === true ? chalk.green("on") : configVal === false ? chalk.red("off") : chalk.gray("default");
      console.log(`  ${icon} ${chalk.white(name.padEnd(30))} config: ${configLabel}`);
    }
    console.log(chalk.gray(`\n  Use --enable/--disable <feature> to toggle.\n`));
  });

/** Resolve a feature name — accepts full name or short key */
function resolveFeatureName(input: string): FeatureName | null {
  // Try exact match on values
  const values = Object.values(FEATURES);
  if (values.includes(input as FeatureName)) return input as FeatureName;

  // Try matching by key (e.g., "VIGIL_BRIEF" or "brief")
  const upper = input.toUpperCase();
  const withPrefix = upper.startsWith("VIGIL_") ? upper : `VIGIL_${upper}`;
  const entry = Object.entries(FEATURES).find(([key]) => key === withPrefix);
  if (entry) return entry[1];

  return null;
}

program.parse();
