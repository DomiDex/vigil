// Local type alias — mirrors the parent DashboardContext shape.
// Using a local interface avoids tsc following imports into the parent Bun project.
export interface DashboardContext {
  daemon: any;
  sse: any;
  [key: string]: any;
}

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
