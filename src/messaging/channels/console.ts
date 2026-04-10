import chalk from "chalk";
import type { DisplayFilter } from "../displayFilter.ts";
import type { DeliveryChannel, DeliveryResult } from "../router.ts";
import type { VigilMessage } from "../schema.ts";

const SEVERITY_PREFIXES: Record<string, string> = {
  info: chalk.blue("info"),
  warning: chalk.yellow("warn"),
  critical: chalk.red("CRIT"),
};

/**
 * Console channel — always-on fallback.
 * Kairos equivalent: the "detail view" text output.
 *
 * When a DisplayFilter is provided, only messages passing the filter
 * are printed (brief mode). Without a filter, everything is shown.
 */
export class ConsoleChannel implements DeliveryChannel {
  name = "console";
  private filter: DisplayFilter | null;

  constructor(filter?: DisplayFilter) {
    this.filter = filter ?? null;
  }

  isEnabled(): boolean {
    return true;
  }

  accepts(message: VigilMessage): boolean {
    // When filtering is active, skip messages the filter rejects.
    // They still reach other channels (jsonl, push) via the router.
    if (this.filter && !this.filter.shouldDisplay(message)) {
      return false;
    }
    return true;
  }

  async deliver(message: VigilMessage): Promise<DeliveryResult> {
    const prefix = SEVERITY_PREFIXES[message.severity] ?? "info";
    const repo = message.source.repo;
    const branch = message.source.branch ? `:${message.source.branch}` : "";
    const source = chalk.gray(`[${repo}${branch}]`);
    const statusTag = message.status !== "normal" ? chalk.cyan(` (${message.status})`) : "";

    console.log(`  ${prefix} ${source}${statusTag} ${message.message}`);

    if (message.attachments.length > 0) {
      console.log(
        chalk.gray(
          `       ${message.attachments.length} attachment(s): ${message.attachments.map((a) => a.path).join(", ")}`,
        ),
      );
    }

    return { channel: this.name, success: true };
  }
}
