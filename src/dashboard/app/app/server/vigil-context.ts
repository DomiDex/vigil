import type { DashboardContext } from "../../../server.ts";

declare global {
  var __vigil_ctx__: DashboardContext | null;
}

globalThis.__vigil_ctx__ = globalThis.__vigil_ctx__ ?? null;

export function setVigilContext(ctx: DashboardContext): void {
  globalThis.__vigil_ctx__ = ctx;
}

export function getVigilContext(): DashboardContext {
  if (!globalThis.__vigil_ctx__) throw new Error("Vigil context not initialized");
  return globalThis.__vigil_ctx__;
}
