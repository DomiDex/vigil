export class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;

  url: string;
  readyState: number = FakeEventSource.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;

  private listeners: Map<string, Set<(ev: MessageEvent) => void>> = new Map();
  private closed = false;

  /** Track all instances for test assertions */
  static instances: FakeEventSource[] = [];

  constructor(url: string | URL) {
    this.url = typeof url === "string" ? url : url.toString();
    FakeEventSource.instances.push(this);
    // Auto-open after microtask (simulates real EventSource behavior)
    queueMicrotask(() => {
      if (!this.closed) {
        this.readyState = FakeEventSource.OPEN;
        this.onopen?.(new Event("open"));
      }
    });
  }

  addEventListener(type: string, listener: (ev: any) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (ev: any) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  // --- Test helpers (not on real EventSource) ---

  /** Simulate the server sending a named event */
  emit(type: string, data: string = "{}"): void {
    const event = new MessageEvent(type, { data });
    this.listeners.get(type)?.forEach((fn) => fn(event));
  }

  /** Simulate a connection error */
  simulateError(): void {
    this.readyState = FakeEventSource.CLOSED;
    this.onerror?.(new Event("error"));
  }

  /** Simulate the "connected" event that Vigil SSE sends on first connect */
  simulateConnected(): void {
    this.emit("connected", '{"status":"ok"}');
  }

  /** Reset all tracked instances (call in afterEach) */
  static reset(): void {
    for (const instance of FakeEventSource.instances) {
      instance.close();
    }
    FakeEventSource.instances = [];
  }
}
