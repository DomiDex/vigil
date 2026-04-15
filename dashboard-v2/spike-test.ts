/**
 * Temporary spike test — sets up mock DashboardContext for Phase 0 validation.
 * Delete after Phase 0 is complete.
 */
import { setVigilContext } from "./src/server/vigil-context.ts";

const mockDaemon = {
  repoPaths: ["/tmp/fake-repo"],
  tickEngine: {
    currentTick: 42,
    isSleeping: false,
  },
  config: {
    tickInterval: 30,
    sleepTickInterval: 300,
  },
} as any;

const mockSSE = {
  broadcast: () => {},
  clientCount: 0,
  connect: () => new Response(),
} as any;

setVigilContext({ daemon: mockDaemon, sse: mockSSE });

console.log("[spike-test] Vigil context initialized with mock data");
console.log("[spike-test] Repos:", mockDaemon.repoPaths.length);
console.log("[spike-test] Tick:", mockDaemon.tickEngine.currentTick);
