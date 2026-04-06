import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getConfigDir, loadConfig } from "../core/config.ts";
import { GitWatcher } from "../git/watcher.ts";
import { DecisionEngine } from "./decision-max.ts";

/**
 * Load or generate a bearer token for A2A server authentication.
 * Token is stored at ~/.vigil/a2a-token with owner-only read permissions.
 */
export function loadOrCreateToken(configDir?: string): string {
  const tokenPath = join(configDir ?? getConfigDir(), "a2a-token");

  if (existsSync(tokenPath)) {
    return readFileSync(tokenPath, "utf-8").trim();
  }

  const token = randomUUID();
  writeFileSync(tokenPath, token, { mode: 0o600 });
  console.log(`[a2a] Generated auth token: ${tokenPath}`);
  return token;
}

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

export function startA2AServer(
  port: number,
  deps?: { engine?: DecisionEngine; watcher?: GitWatcher; maxConcurrent?: number; authToken?: string },
): ReturnType<typeof Bun.serve> {
  const config = loadConfig();
  const engine = deps?.engine ?? new DecisionEngine(config);
  const watcher = deps?.watcher ?? new GitWatcher();
  const authToken = deps?.authToken ?? loadOrCreateToken();

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

  const maxConcurrent = deps?.maxConcurrent ?? 10;
  let activeRequests = 0;

  const server = Bun.serve({
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

      // All other endpoints require authentication
      const authHeader = req.headers.get("Authorization");
      if (!authHeader || authHeader !== `Bearer ${authToken}`) {
        return Response.json(
          { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Unauthorized" } },
          { status: 401 },
        );
      }

      // JSON-RPC endpoint
      if (url.pathname === "/" && req.method === "POST") {
        // Rate limiting
        if (activeRequests >= maxConcurrent) {
          return Response.json(
            { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Too many concurrent requests" } },
            { status: 429 },
          );
        }

        activeRequests++;
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
        } catch (err) {
          const isParseError = err instanceof SyntaxError;
          return Response.json({
            jsonrpc: "2.0",
            id: null,
            error: {
              code: isParseError ? -32700 : -32603,
              message: isParseError ? "Parse error" : "Internal error",
            },
          });
        } finally {
          activeRequests--;
        }
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  console.log(`🔔 Vigil A2A server running on http://localhost:${port}`);
  console.log(`   Agent card: http://localhost:${port}/.well-known/agent-card.json`);
  console.log(`   Auth: Bearer token required for all endpoints except agent-card and health`);

  return server;
}
