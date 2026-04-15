import type { DashboardContext } from "../types.ts";

export function getA2AStatusJSON(ctx: DashboardContext) {
  const a2a = (ctx.daemon as any).a2aServer;
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
  const a2a = (ctx.daemon as any).a2aServer;
  if (!a2a) return [];
  const card = a2a.getAgentCard();
  return card?.skills ?? [];
}

export function getA2AHistoryJSON(ctx: DashboardContext) {
  const a2a = (ctx.daemon as any).a2aServer;
  if (!a2a) return [];
  return a2a.getHistory();
}
