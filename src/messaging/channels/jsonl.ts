import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { DeliveryChannel, DeliveryResult } from "../router.ts";
import type { VigilMessage } from "../schema.ts";

/**
 * JSONL file channel — append-only structured log.
 * Queryable via jq, loadable by downstream tools.
 */
export class JsonlChannel implements DeliveryChannel {
  name = "jsonl";

  constructor(private filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  isEnabled(): boolean {
    return true;
  }

  accepts(_message: VigilMessage): boolean {
    return true;
  }

  async deliver(message: VigilMessage): Promise<DeliveryResult> {
    const line = `${JSON.stringify(message)}\n`;
    appendFileSync(this.filePath, line, "utf-8");
    return { channel: this.name, success: true };
  }
}
