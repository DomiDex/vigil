import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { loadConfig } from "../../core/config.ts";
import { GitWatcher } from "../../git/watcher.ts";
import { startA2AServer } from "../../llm/a2a-server.ts";
import { DecisionEngine, resetCircuitBreaker } from "../../llm/decision-max.ts";

let server: ReturnType<typeof Bun.serve>;
let port: number;
let mockEngine: DecisionEngine;
let mockWatcher: GitWatcher;
const TEST_TOKEN = "test-auth-token-12345";

function rpcBody(method: string, parts: { type: string; text: string }[] = []) {
  return {
    jsonrpc: "2.0",
    id: 1,
    method,
    params: { message: { parts } },
  };
}

beforeEach(() => {
  resetCircuitBreaker();
  port = 40000 + Math.floor(Math.random() * 10000);
  const config = loadConfig();
  mockEngine = new DecisionEngine(config);
  mockWatcher = new GitWatcher();
});

afterEach(() => {
  if (server) server.stop(true);
});

describe("public endpoints (no auth needed)", () => {
  test("agent card is accessible without auth", async () => {
    server = startA2AServer(port, { engine: mockEngine, watcher: mockWatcher, authToken: TEST_TOKEN });

    const res = await fetch(`http://localhost:${port}/.well-known/agent-card.json`);
    expect(res.status).toBe(200);
    const card = await res.json();
    expect(card.name).toBe("Vigil");
  });

  test("health check is accessible without auth", async () => {
    server = startA2AServer(port, { engine: mockEngine, watcher: mockWatcher, authToken: TEST_TOKEN });

    const res = await fetch(`http://localhost:${port}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});

describe("authenticated endpoints", () => {
  test("POST without auth header returns 401", async () => {
    server = startA2AServer(port, { engine: mockEngine, watcher: mockWatcher, authToken: TEST_TOKEN });

    const res = await fetch(`http://localhost:${port}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rpcBody("message/send", [{ type: "text", text: "hello" }])),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.message).toBe("Unauthorized");
  });

  test("POST with wrong token returns 401", async () => {
    server = startA2AServer(port, { engine: mockEngine, watcher: mockWatcher, authToken: TEST_TOKEN });

    const res = await fetch(`http://localhost:${port}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong-token",
      },
      body: JSON.stringify(rpcBody("message/send", [{ type: "text", text: "hello" }])),
    });

    expect(res.status).toBe(401);
  });

  test("POST with valid token succeeds", async () => {
    spyOn(mockEngine, "ask").mockResolvedValue("authed response");
    server = startA2AServer(port, { engine: mockEngine, watcher: mockWatcher, authToken: TEST_TOKEN });

    const res = await fetch(`http://localhost:${port}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify(rpcBody("message/send", [{ type: "text", text: "hello" }])),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.task.status).toBe("completed");
    expect(json.result.task.artifacts[0].parts[0].text).toBe("authed response");
  });

  test("Bearer prefix is required", async () => {
    server = startA2AServer(port, { engine: mockEngine, watcher: mockWatcher, authToken: TEST_TOKEN });

    const res = await fetch(`http://localhost:${port}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: TEST_TOKEN, // Missing "Bearer " prefix
      },
      body: JSON.stringify(rpcBody("message/send", [{ type: "text", text: "hello" }])),
    });

    expect(res.status).toBe(401);
  });
});

describe("token generation", () => {
  test("loadOrCreateToken is exported", async () => {
    const mod = await import("../../llm/a2a-server.ts");
    expect(typeof mod.loadOrCreateToken).toBe("function");
  });
});
