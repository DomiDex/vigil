#!/usr/bin/env bun
import { Command } from "commander";
import chalk from "chalk";
import { loadConfig, saveConfig } from "../core/config.ts";
import { Daemon } from "../core/daemon.ts";
import { EventLog, VectorStore } from "../memory/store.ts";
import { DecisionEngine } from "../llm/decision-max.ts";
import { GitWatcher } from "../git/watcher.ts";
import { resolve } from "path";

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
  .action(async (repos: string[], opts) => {
    const resolvedRepos = repos.map((r) => resolve(r));
    const daemon = new Daemon(resolvedRepos, {
      tickInterval: opts.tick,
      model: opts.model,
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
      profileStr
    );

    store.storeConsolidated(crypto.randomUUID(), repoName, result.summary, memories.map((m) => m.id));
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
    (config as any)[key] = isNaN(numVal) ? value : numVal;
    saveConfig(config);
    console.log(chalk.green(`  ✓ ${key} = ${value}`));
  });

program.parse();
