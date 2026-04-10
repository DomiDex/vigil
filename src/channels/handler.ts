import { EventEmitter } from "node:events";
import type { MessageRouter } from "../messaging/router.ts";
import { createMessage, type VigilMessage } from "../messaging/schema.ts";
import { checkChannelGates, type GateContext } from "./gate.ts";
import { type ChannelEntry, ChannelMessageSchema, wrapChannelMessage } from "./schema.ts";

/**
 * Channel notification handler — processes inbound MCP server messages.
 *
 * Kairos pattern: "SleepTool polls hasCommandsInQueue() and wakes within 1s.
 * The model sees where the message came from and decides which tool to reply with."
 */
export class ChannelHandler extends EventEmitter {
  private channels = new Map<string, ChannelEntry>();
  private messageQueue: VigilMessage[] = [];

  constructor(
    private router: MessageRouter,
    private getGateContext: () => GateContext,
  ) {
    super();
  }

  /**
   * Register a channel server after capability negotiation.
   */
  registerChannel(entry: ChannelEntry): void {
    const ctx = this.getGateContext();
    const result = checkChannelGates(entry, ctx);

    if (!result.allowed) {
      this.emit("channel_rejected", {
        channel: entry.name,
        gate: result.deniedAt,
        reason: result.reason,
      });
      return;
    }

    this.channels.set(entry.name, entry);
    this.emit("channel_registered", { channel: entry.name });
  }

  /**
   * Unregister a channel server (e.g., on disconnect).
   */
  unregisterChannel(name: string): boolean {
    const removed = this.channels.delete(name);
    if (removed) {
      this.emit("channel_unregistered", { channel: name });
    }
    return removed;
  }

  /**
   * Handle inbound notification from MCP server.
   * Validates schema, wraps in XML tag, routes as structured message.
   */
  async handleNotification(serverName: string, raw: unknown): Promise<void> {
    // Validate channel is registered
    const channel = this.channels.get(serverName);
    if (!channel) {
      this.emit("notification_rejected", {
        server: serverName,
        reason: "Server not registered as channel",
      });
      return;
    }

    // Validate message schema
    const parsed = ChannelMessageSchema.safeParse(raw);
    if (!parsed.success) {
      this.emit("notification_rejected", {
        server: serverName,
        reason: `Invalid schema: ${parsed.error.message}`,
      });
      return;
    }

    const { content, meta } = parsed.data.params;

    // Wrap in XML for LLM consumption (Kairos pattern)
    const wrapped = wrapChannelMessage(serverName, content, meta);

    // Create structured message and route
    const message = createMessage({
      source: {
        repo: "channel",
        event: `channel:${serverName}`,
        agent: meta?.user ?? serverName,
      },
      status: "proactive",
      message: wrapped,
      metadata: { channelSource: serverName, ...meta },
    });

    // Queue for next tick (SleepTool wake pattern)
    this.messageQueue.push(message);
    this.emit("notification_queued", { server: serverName });

    // Route immediately to non-tick channels (console, jsonl)
    await this.router.route(message);
  }

  /**
   * Check if there are queued channel messages (polled by tick engine).
   */
  hasQueuedMessages(): boolean {
    return this.messageQueue.length > 0;
  }

  /**
   * Drain all queued messages — called by tick engine when processing.
   */
  drainQueue(): VigilMessage[] {
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    return messages;
  }

  /**
   * Get all registered channel names.
   */
  getRegisteredChannels(): string[] {
    return [...this.channels.keys()];
  }

  /**
   * Check if a specific channel is registered.
   */
  isRegistered(name: string): boolean {
    return this.channels.has(name);
  }
}
