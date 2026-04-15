import type { Daemon } from "../core/daemon.ts";
import type { SSEManager } from "./api/sse.ts";

export interface DashboardContext {
  daemon: Daemon;
  sse: SSEManager;
}
