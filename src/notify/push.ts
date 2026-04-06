import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../core/config.ts";

export type NotifyBackend = "desktop" | "webhook" | "file";

export interface NotifyConfig {
  backends: NotifyBackend[];
  webhookUrl?: string;
}

export class NotificationRouter {
  private config: NotifyConfig;
  private queueDir: string;

  constructor(config: NotifyConfig) {
    this.config = config;
    this.queueDir = join(getDataDir(), "notifications");
    mkdirSync(this.queueDir, { recursive: true });
  }

  async send(title: string, message: string, severity = "info"): Promise<void> {
    const tasks: Promise<void>[] = [];
    for (const backend of this.config.backends) {
      switch (backend) {
        case "desktop":
          tasks.push(this.sendDesktop(title, message));
          break;
        case "webhook":
          tasks.push(this.sendWebhook(title, message, severity));
          break;
        case "file":
          this.appendQueue(title, message, severity);
          break;
      }
    }
    await Promise.allSettled(tasks);
  }

  /** Read recent notifications from the file queue */
  readQueue(limit = 20): Record<string, unknown>[] {
    const { existsSync, readFileSync } = require("node:fs");
    const queuePath = join(this.queueDir, "queue.jsonl");
    if (!existsSync(queuePath)) return [];

    const lines = readFileSync(queuePath, "utf-8").trim().split("\n").filter(Boolean);

    return lines
      .slice(-limit)
      .reverse()
      .map((line: string) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  private async sendDesktop(title: string, message: string): Promise<void> {
    const platform = process.platform;
    try {
      if (platform === "linux") {
        Bun.spawn(["notify-send", title, message]);
      } else if (platform === "darwin") {
        Bun.spawn([
          "osascript",
          "-e",
          `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`,
        ]);
      } else if (platform === "win32") {
        Bun.spawn([
          "powershell.exe",
          "-Command",
          `Add-Type -AssemblyName System.Windows.Forms; ` +
            `[System.Windows.Forms.MessageBox]::Show('${message.replace(/'/g, "''")}','${title.replace(/'/g, "''")}')`,
        ]);
      }
    } catch {
      // Desktop notifications are best-effort
    }
  }

  private async sendWebhook(title: string, message: string, severity: string): Promise<void> {
    if (!this.config.webhookUrl) return;
    try {
      await fetch(this.config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, message, severity, timestamp: Date.now() }),
      });
    } catch {
      // Webhook failures are best-effort
    }
  }

  private appendQueue(title: string, message: string, severity: string): void {
    const line = `${JSON.stringify({ title, message, severity, timestamp: Date.now() })}\n`;
    appendFileSync(join(this.queueDir, "queue.jsonl"), line);
  }
}
