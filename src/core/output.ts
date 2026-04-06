import chalk from "chalk";

export type OutputMode = "collapsed" | "verbose";

const DECISION_ICONS: Record<string, string> = {
  SILENT: "·",
  OBSERVE: "\u{1F441}",
  NOTIFY: "\u{1F514}",
  ACT: "\u26A1",
};

export class OutputFormatter {
  private mode: OutputMode;

  constructor(mode: OutputMode = "collapsed") {
    this.mode = mode;
  }

  tick(tickNum: number, decision: string, reasoning: string, tokens?: number): void {
    const tokenStr = tokens ? chalk.gray(` [~${tokens} tok]`) : "";
    if (this.mode === "collapsed") {
      const icon = DECISION_ICONS[decision] ?? "·";
      process.stdout.write(`\r  ${icon} tick ${tickNum}: ${decision}${tokenStr}  `);
    } else {
      console.log(chalk.gray(`  [tick ${tickNum}] ${decision}: ${reasoning}${tokenStr}`));
    }
  }

  notify(tickNum: number, message: string): void {
    console.log(`\n${chalk.yellow(`  \u{1F514} [tick ${tickNum}] ${message}`)}`);
  }

  observe(tickNum: number, message: string): void {
    if (this.mode === "collapsed") {
      const truncMsg = message.length > 60 ? `${message.slice(0, 57)}...` : message;
      process.stdout.write(`\r  \u{1F441} tick ${tickNum}: ${truncMsg}  `);
    } else {
      console.log(chalk.blue(`  \u{1F441} [tick ${tickNum}] ${message}`));
    }
  }

  act(tickNum: number, message: string): void {
    console.log(`\n${chalk.red(`  \u26A1 [tick ${tickNum}] [PROPOSED ACTION]: ${message}`)}`);
  }

  dream(message: string): void {
    console.log(chalk.magenta(`\n  \u{1F319} ${message}`));
  }

  dreamInsight(message: string): void {
    console.log(chalk.magenta(`     \u{1F4A1} ${message}`));
  }

  dreamComplete(message: string): void {
    console.log(chalk.magenta(`\n  \u2600 ${message}`));
  }

  event(repo: string, detail: string): void {
    if (this.mode === "verbose") {
      console.log(chalk.yellow(`  \u26A1 ${repo}: ${detail}`));
    }
  }

  sleep(tickNum: number): void {
    if (this.mode === "verbose" && tickNum % 10 === 0) {
      console.log(chalk.gray(`  \u{1F4A4} tick ${tickNum} (sleeping)`));
    }
  }

  sleepTransition(message: string): void {
    console.log(`\n${chalk.gray(`  \u{1F4A4} ${message}`)}`);
  }

  wakeTransition(message: string): void {
    console.log(`\n${chalk.green(`  \u23F0 ${message}`)}`);
  }

  banner(text: string): void {
    console.log(chalk.cyan(text));
  }

  info(message: string): void {
    console.log(chalk.gray(message));
  }

  success(message: string): void {
    console.log(chalk.green(message));
  }

  error(message: string): void {
    console.log(chalk.red(`  \u2716 ${message}`));
  }

  review(tickNum: number, report: string): void {
    console.log(`\n${chalk.cyan(`  \u{1F4DD} [tick ${tickNum}] Code Review:`)}`);
    for (const line of report.split("\n")) {
      console.log(chalk.white(`     ${line}`));
    }
    console.log();
  }

  actionQueued(tickNum: number, command: string, tier: string): void {
    console.log(`\n${chalk.yellow(`  \u{1F4CB} [tick ${tickNum}] Action queued (${tier}): ${command}`)}`);
  }

  actionExecuted(tickNum: number, command: string, result: string): void {
    const truncResult = result.length > 80 ? `${result.slice(0, 77)}...` : result;
    console.log(`\n${chalk.green(`  \u2713 [tick ${tickNum}] Executed: ${command} \u2192 ${truncResult}`)}`);
  }

  analysisProgress(phase: string, detail: string): void {
    console.log(chalk.cyan(`  \u27F3 [${phase}] ${detail}`));
  }
}
