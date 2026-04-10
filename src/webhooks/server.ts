import { createHmac, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";

export interface WebhookConfig {
  port: number;
  secret: string;
  path: string;
  allowedEvents: string[];
}

export const DEFAULT_WEBHOOK_CONFIG: WebhookConfig = {
  port: 7433, // VIGIL on phone keypad
  secret: "",
  path: "/webhook/github",
  allowedEvents: ["pull_request", "pull_request_review", "push", "issues", "issue_comment"],
};

export interface WebhookEvent {
  type: string;
  action: string;
  payload: Record<string, unknown>;
  receivedAt: number;
}

/**
 * Lightweight webhook HTTP server for GitHub events.
 * Validates HMAC signatures, parses payloads, emits typed events.
 *
 * Uses Bun.serve() per project conventions.
 */
export class WebhookServer extends EventEmitter {
  private server: ReturnType<typeof Bun.serve> | null = null;
  private config: WebhookConfig;

  constructor(config: Partial<WebhookConfig> = {}) {
    super();
    this.config = { ...DEFAULT_WEBHOOK_CONFIG, ...config };
  }

  async start(): Promise<void> {
    const { port, path, allowedEvents, secret } = this.config;

    this.server = Bun.serve({
      port,
      fetch: async (req) => {
        const url = new URL(req.url);

        if (req.method !== "POST" || url.pathname !== path) {
          return new Response(null, { status: 404 });
        }

        const body = await req.text();

        // Verify GitHub HMAC signature
        if (secret) {
          const signature = req.headers.get("x-hub-signature-256");
          if (!this.verifySignature(body, signature)) {
            return Response.json({ error: "Invalid signature" }, { status: 401 });
          }
        }

        // Parse event type
        const eventType = req.headers.get("x-github-event");
        if (!eventType || !allowedEvents.includes(eventType)) {
          return new Response(null, { status: 200 }); // Accept but ignore
        }

        // Parse payload
        try {
          const payload = JSON.parse(body);
          const event: WebhookEvent = {
            type: eventType,
            action: payload.action ?? "",
            payload,
            receivedAt: Date.now(),
          };
          this.emit("webhook_event", event);
          return Response.json({ received: true });
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
      },
    });

    this.emit("webhook_server_started", { port });
  }

  stop(): void {
    this.server?.stop();
    this.server = null;
  }

  getPort(): number {
    return this.config.port;
  }

  private verifySignature(body: string, signature: string | null): boolean {
    if (!signature) return false;
    const expected = `sha256=${createHmac("sha256", this.config.secret).update(body).digest("hex")}`;
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false; // Length mismatch
    }
  }
}
