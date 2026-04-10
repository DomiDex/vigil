import { randomBytes } from "node:crypto";

interface PendingPermission {
  requestId: string;
  channelName: string;
  toolName: string;
  createdAt: number;
  expiresAt: number;
  resolve: (granted: boolean) => void;
}

/**
 * Permission workflow for channel tool use.
 * When the LLM wants to use a channel's tool (e.g., send a Slack message),
 * the user must approve via the channel itself.
 *
 * Kairos pattern: "Server parses the user's reply and emits {request_id, behavior}"
 */
export class ChannelPermissionManager {
  private pending = new Map<string, PendingPermission>();
  private readonly TTL_MS: number;

  constructor(ttlMs = 5 * 60 * 1000) {
    this.TTL_MS = ttlMs;
  }

  /**
   * Request permission for a tool use via channel.
   * Returns a promise that resolves when the user responds (or expires).
   */
  requestPermission(channelName: string, toolName: string, _description: string): Promise<boolean> {
    // Generate unique request ID (5-char alphanumeric, Kairos pattern)
    const requestId = randomBytes(3).toString("hex").slice(0, 5);

    return new Promise<boolean>((resolve) => {
      const entry: PendingPermission = {
        requestId,
        channelName,
        toolName,
        createdAt: Date.now(),
        expiresAt: Date.now() + this.TTL_MS,
        resolve,
      };

      this.pending.set(requestId, entry);

      // Auto-expire
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          resolve(false); // Expired = denied
        }
      }, this.TTL_MS);
    });
  }

  /**
   * Handle permission response from channel server.
   */
  handlePermissionResponse(requestId: string, behavior: "allow" | "deny"): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;

    this.pending.delete(requestId);
    entry.resolve(behavior === "allow");
    return true;
  }

  /**
   * Get the number of pending permission requests.
   */
  getPendingCount(): number {
    return this.pending.size;
  }

  /**
   * Check if a specific request is still pending.
   */
  isPending(requestId: string): boolean {
    return this.pending.has(requestId);
  }
}
