import { EventEmitter } from "node:events";
import type { MessageStatus, VigilMessage } from "./schema.ts";

/**
 * Delivery channel interface — each destination implements this.
 */
export interface DeliveryChannel {
  name: string;
  isEnabled(): boolean;
  accepts(message: VigilMessage): boolean;
  deliver(message: VigilMessage): Promise<DeliveryResult>;
}

export interface DeliveryResult {
  channel: string;
  success: boolean;
  error?: string;
  externalId?: string;
}

/**
 * Message router — fans out structured messages to registered channels.
 *
 * Kairos routes via tool selection (model picks SendUserMessage vs MCP tool).
 * Vigil routes via config (user declares which channels get which messages).
 */
export class MessageRouter extends EventEmitter {
  private channels: DeliveryChannel[] = [];
  private history: VigilMessage[] = [];
  private maxHistory = 1000;

  registerChannel(channel: DeliveryChannel): void {
    this.channels.push(channel);
  }

  async route(message: VigilMessage): Promise<DeliveryResult[]> {
    this.history.push(message);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const targets = this.channels.filter((ch) => ch.isEnabled() && ch.accepts(message));

    if (targets.length === 0) {
      this.emit("undelivered", message);
      return [];
    }

    const results = await Promise.allSettled(
      targets.map(async (ch) => {
        try {
          return await ch.deliver(message);
        } catch (err) {
          return {
            channel: ch.name,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    const delivered = results.map((r) =>
      r.status === "fulfilled" ? r.value : { channel: "unknown", success: false, error: String(r.reason) },
    );

    this.emit("delivered", { message, results: delivered });
    return delivered;
  }

  getHistory(filter?: { status?: MessageStatus; limit?: number }): VigilMessage[] {
    let msgs = this.history;
    if (filter?.status) {
      msgs = msgs.filter((m) => m.status === filter.status);
    }
    if (filter?.limit) {
      msgs = msgs.slice(-filter.limit);
    }
    return msgs;
  }

  getChannelCount(): number {
    return this.channels.length;
  }
}
