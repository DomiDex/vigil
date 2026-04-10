import type { DashboardContext } from "../server.ts";

const HEARTBEAT_INTERVAL = 15_000; // 15s

export class SSEManager {
  private clients = new Set<ReadableStreamDefaultController<Uint8Array>>();

  /** Create a new SSE response for a client */
  connect(): Response {
    const encoder = new TextEncoder();
    let controller: ReadableStreamDefaultController<Uint8Array>;
    let heartbeat: ReturnType<typeof setInterval>;

    const stream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        controller = ctrl;
      },
      cancel: () => {
        this.clients.delete(controller);
        clearInterval(heartbeat);
      },
    });

    // Must defer client registration until controller is assigned
    queueMicrotask(() => {
      this.clients.add(controller);
      // Send initial connected event
      controller.enqueue(encoder.encode("event: connected\ndata: {}\n\n"));
      // Heartbeat keeps connection alive
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          this.clients.delete(controller);
          clearInterval(heartbeat);
        }
      }, HEARTBEAT_INTERVAL);
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  /** Broadcast an event to all connected clients */
  broadcast(event: string, data: unknown): void {
    const encoder = new TextEncoder();
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const bytes = encoder.encode(payload);

    for (const client of this.clients) {
      try {
        client.enqueue(bytes);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  /** Number of connected clients */
  get clientCount(): number {
    return this.clients.size;
  }
}

/** Wire SSE to daemon events (tick, messages, state changes) */
export function wireSSE(sse: SSEManager, ctx: DashboardContext): void {
  const { daemon } = ctx;
  const tick = daemon.tickEngine as any;

  // Broadcast tick events via the public onTick API
  tick.onTick(async (tickNum: number, isSleeping: boolean) => {
    const adaptiveInterval = Math.round(tick.sleep.getNextInterval());
    sse.broadcast("tick", {
      tickCount: tickNum,
      isSleeping,
      nextIn: isSleeping ? daemon.config.sleepTickInterval : adaptiveInterval,
    });
  });

  // Broadcast new messages via MessageRouter
  daemon.messageRouter.on("delivered", ({ message }: { message: any }) => {
    sse.broadcast("message", {
      id: message.id,
      decision: message.metadata?.decision || "SILENT",
      message: message.message,
      timestamp: message.timestamp,
      repo: message.source?.repo,
      severity: message.severity,
    });
  });
}
