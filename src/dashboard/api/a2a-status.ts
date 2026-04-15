import type { DashboardContext } from "../types.ts";

function getA2A(ctx: DashboardContext) {
  try {
    const a = (ctx.daemon as any).a2aServer;
    return a && typeof a.getStatus === "function" ? a : null;
  } catch {
    return null;
  }
}

export function getA2AStatusJSON(ctx: DashboardContext) {
  const a2a = getA2A(ctx);
  if (!a2a) {
    return {
      running: false,
      port: 0,
      endpoint: "",
      authType: "none",
      connections: 0,
      maxConnections: 0,
    };
  }
  return a2a.getStatus();
}

export function getA2ASkillsJSON(ctx: DashboardContext) {
  const a2a = getA2A(ctx);
  if (!a2a) return [];
  const card = a2a.getAgentCard();
  return card?.skills ?? [];
}

export function getA2AHistoryJSON(ctx: DashboardContext) {
  const a2a = getA2A(ctx);
  if (!a2a) return [];
  return a2a.getHistory();
}
