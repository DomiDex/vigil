import { DecisionEngine } from "./decision-max.ts";
import { GitWatcher } from "../git/watcher.ts";
import { loadConfig } from "../core/config.ts";

interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: { streaming: boolean; pushNotifications: boolean };
  skills: { id: string; name: string; description: string }[];
}

interface JsonRpcRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params?: any;
}

export function startA2AServer(port: number): void {
  const config = loadConfig();
  const engine = new DecisionEngine(config);
  const watcher = new GitWatcher();

  const agentCard: AgentCard = {
    name: "Vigil",
    description: "Always-on git monitoring agent",
    url: `http://localhost:${port}`,
    version: "0.1.0",
    capabilities: { streaming: false, pushNotifications: false },
    skills: [
      { id: "repo-status", name: "Repository Status", description: "Get current git repository status and insights" },
      { id: "risk-detection", name: "Risk Detection", description: "Detect risky patterns in git activity" },
      { id: "pattern-analysis", name: "Pattern Analysis", description: "Analyze development patterns across repos" },
      { id: "ask", name: "Ask Vigil", description: "Ask questions about monitored repositories" },
    ],
  };

  Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      // Agent card
      if (url.pathname === "/.well-known/agent-card.json") {
        return Response.json(agentCard);
      }

      // Health check
      if (url.pathname === "/health") {
        return Response.json({ status: "ok", uptime: process.uptime() });
      }

      // JSON-RPC endpoint
      if (url.pathname === "/" && req.method === "POST") {
        try {
          const body = (await req.json()) as JsonRpcRequest;

          if (body.method !== "message/send") {
            return Response.json({
              jsonrpc: "2.0",
              id: body.id,
              error: { code: -32601, message: "Method not found" },
            });
          }

          // Extract text from message parts
          const parts = body.params?.message?.parts ?? [];
          const text = parts
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join("\n");

          if (!text) {
            return Response.json({
              jsonrpc: "2.0",
              id: body.id,
              error: { code: -32602, message: "No text content in message" },
            });
          }

          // Build context from watched repos
          const contexts: string[] = [];
          for (const [path] of watcher.getRepos()) {
            contexts.push(await watcher.buildContext(path));
          }
          const context = contexts.join("\n\n---\n\n") || "(no repos being watched)";

          const answer = await engine.ask(text, context);

          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              task: {
                id: crypto.randomUUID(),
                status: "completed",
                artifacts: [
                  {
                    type: "text",
                    parts: [{ type: "text", text: answer }],
                  },
                ],
              },
            },
          });
        } catch {
          return Response.json({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error" },
          });
        }
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  console.log(`🔔 Vigil A2A server running on http://localhost:${port}`);
  console.log(`   Agent card: http://localhost:${port}/.well-known/agent-card.json`);
}
