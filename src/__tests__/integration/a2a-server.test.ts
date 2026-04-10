import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { loadConfig } from "../../core/config.ts";
import { GitWatcher } from "../../git/watcher.ts";
import { startA2AServer } from "../../llm/a2a-server.ts";
import { DecisionEngine, resetCircuitBreaker } from "../../llm/decision-max.ts";

let server: ReturnType<typeof Bun.serve>;
let port: number;
let mockEngine: DecisionEngine;
let mockWatcher: GitWatcher;
const TEST_TOKEN = "test-a2a-token";
const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${TEST_TOKEN}` };

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

describe("agent card", () => {
  test("GET agent card returns valid JSON with 4 skills", async () => {
    spyOn(mockEngine, "ask").mockResolvedValue("test");
    server = startA2AServer(port, { engine: mockEngine, watcher: mockWatcher, authToken: TEST_TOKEN });

    const res = await fetch(`http://localhost:${port}/.well-known/agent-card.json`);
    expect(res.status).toBe(200);
    const card = await res.json();
    expect(card.name).toBe("Vigil");
    expect(card.skills).toHaveLength(4);
  });

  test("agent card has correct version", async () => {
    spyOn(mockEngine, "ask").mockResolvedValue("test");
    server = startA2AServer(port, { engine: mockEngine, watcher: mockWatcher, authToken: TEST_TOKEN });

    const res = await fetch(`http://localhost:${port}/.well-known/agent-card.json`);
    const card = await res.json();
    expect(card.version).toBe("0.1.0");
  });
});

describe("health", () => {
  test("GET /health returns ok with uptime", async () => {
    server = startA2AServer(port, { engine: mockEngine, watcher: mockWatcher, authToken: TEST_TOKEN });

    const res = await fetch(`http://localhost:${port}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
  });
});

describe("message/send", () => {
  test("valid message returns completed task", async () => {
    spyOn(mockEngine, "ask").mockResolvedValue("Hello from Vigil");
    server = startA2AServer(port, { engine: mockEngine, watcher: mockWatcher, authToken: TEST_TOKEN });

    const res = await fetch(`http://localhost:${port}/`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(rpcBody("message/send", [{ type: "text", text: "What's the repo status?" }])),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.task.status).toBe("completed");
  });

  test("response has artifact with text", async () => {
    spyOn(mockEngine, "ask").mockResolvedValue("Some answer");
    server = startA2AServer(port, { engine: mockEngine, watcher: mockWatcher, authToken: TEST_TOKEN });

    const res = await fetch(`http://localhost:${port}/`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(rpcBody("message/send", [{ type: "text", text: "question" }])),
    });

    const json = await res.json();
    const text = json.result.task.artifacts[0].parts[0].text;
    expect(text).toBe("Some answer");
  });

  test("task has UUID id", async () => {
    spyOn(mockEngine, "ask").mockResolvedValue("answer");
    server = startA2AServer(port, { engine: mockEngine, watcher: mockWatcher, authToken: TEST_TOKEN });

    const res = await fetch(`http://localhost:${port}/`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(rpcBody("message/send", [{ type: "text", text: "q" }])),
    });

    const json = await res.json();
    const id = json.result.task.id;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test("multiple text parts joined with newline", async () => {
    const askSpy = spyOn(mockEngine, "ask").mockResolvedValue("answer");
    server = startA2AServer(port, { engine: mockEngine, watcher: mockWatcher, authToken: TEST_TOKEN });

    await fetch(`http://localhost:${port}/`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(
        rpcBody("message/send", [
          { type: "text", text: "part one" },
          { type: "text", text: "part two" },
        ]),
      ),
    });

    expect(askSpy).toHaveBeenCalledTimes(1);
    const calledWith = askSpy.mock.calls[0][0];
    expect(calledWith).toContain("part one");
    expect(calledWith).toContain("part two");
  });

  test("no repos gives fallback context", async () => {
    const askSpy = spyOn(mockEngine, "ask").mockResolvedValue("answer");
    server = startA2AServer(port, { engine: mockEngine, watcher: mockWatcher, authToken: TEST_TOKEN });

    await fetch(`http://localhost:${port}/`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(rpcBody("message/send", [{ type: "text", text: "q" }])),
    });

    const contextArg = askSpy.mock.calls[0][1];
    expect(contextArg).toBe("(no repos being watched)");
  });

  test("context built for all repos", async () => {
    const askSpy = spyOn(mockEngine, "ask").mockResolvedValue("answer");
    const buildCtxSpy = spyOn(mockWatcher, "buildContext").mockResolvedValue("repo-context");

    // Inject fake repos into the watcher's internal map
    const repos = mockWatcher.getRepos();
    repos.set("/fake/repo1", {
      path: "/fake/repo1",
      name: "repo1",
      lastCommitHash: "abc",
      currentBranch: "main",
      uncommittedSince: null,
    });
    repos.set("/fake/repo2", {
      path: "/fake/repo2",
      name: "repo2",
      lastCommitHash: "def",
      currentBranch: "main",
      uncommittedSince: null,
    });

    server = startA2AServer(port, { engine: mockEngine, watcher: mockWatcher, authToken: TEST_TOKEN });

    await fetch(`http://localhost:${port}/`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(rpcBody("message/send", [{ type: "text", text: "q" }])),
    });

    expect(buildCtxSpy).toHaveBeenCalledTimes(2);
    const contextArg = askSpy.mock.calls[0][1];
    expect(contextArg).toContain("repo-context");
  });
});

describe("error handling", () => {
  test("unknown method returns -32601", async () => {
    server = startA2AServer(port, { engine: mockEngine, watcher: mockWatcher, authToken: TEST_TOKEN });

    const res = await fetch(`http://localhost:${port}/`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(rpcBody("unknown")),
    });

    const json = await res.json();
    expect(json.error.code).toBe(-32601);
    expect(json.error.message).toBe("Method not found");
  });

  test("missing text parts returns -32602", async () => {
    server = startA2AServer(port, { engine: mockEngine, watcher: mockWatcher, authToken: TEST_TOKEN });

    const res = await fetch(`http://localhost:${port}/`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(rpcBody("message/send", [])),
    });

    const json = await res.json();
    expect(json.error.code).toBe(-32602);
  });

  test("LLM failure returns -32603", async () => {
    spyOn(mockEngine, "ask").mockRejectedValue(new Error("LLM down"));
    server = startA2AServer(port, { engine: mockEngine, watcher: mockWatcher, authToken: TEST_TOKEN });

    const res = await fetch(`http://localhost:${port}/`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(rpcBody("message/send", [{ type: "text", text: "q" }])),
    });

    const json = await res.json();
    expect(json.error.code).toBe(-32603);
    expect(json.error.message).toBe("Internal error");
  });

  test("malformed JSON body returns error", async () => {
    server = startA2AServer(port, { engine: mockEngine, watcher: mockWatcher, authToken: TEST_TOKEN });

    const res = await fetch(`http://localhost:${port}/`, {
      method: "POST",
      headers: authHeaders,
      body: "this is not json",
    });

    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(json.error.code).toBe(-32700);
  });

  test("non-POST to / without auth returns 401", async () => {
    server = startA2AServer(port, { engine: mockEngine, watcher: mockWatcher, authToken: TEST_TOKEN });

    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(401);
  });

  test("non-POST to / with auth returns 404", async () => {
    server = startA2AServer(port, { engine: mockEngine, watcher: mockWatcher, authToken: TEST_TOKEN });

    const res = await fetch(`http://localhost:${port}/`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(res.status).toBe(404);
  });
});

describe("rate limiting", () => {
  test("concurrent requests within limit succeed", async () => {
    spyOn(mockEngine, "ask").mockImplementation(async () => {
      await Bun.sleep(50);
      return "answer";
    });
    server = startA2AServer(port, {
      engine: mockEngine,
      watcher: mockWatcher,
      maxConcurrent: 2,
      authToken: TEST_TOKEN,
    });

    const body = JSON.stringify(rpcBody("message/send", [{ type: "text", text: "q" }]));
    const opts = { method: "POST", headers: authHeaders, body };

    const [r1, r2] = await Promise.all([
      fetch(`http://localhost:${port}/`, opts),
      fetch(`http://localhost:${port}/`, opts),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });

  test("requests over limit return 429", async () => {
    let resolve1: (v: string) => void = () => {};
    const askSpy = spyOn(mockEngine, "ask").mockImplementation(
      () =>
        new Promise((r) => {
          resolve1 = r;
        }),
    );
    server = startA2AServer(port, {
      engine: mockEngine,
      watcher: mockWatcher,
      maxConcurrent: 1,
      authToken: TEST_TOKEN,
    });

    const body = JSON.stringify(rpcBody("message/send", [{ type: "text", text: "q" }]));
    const opts = { method: "POST", headers: authHeaders, body };

    // First request takes the only slot
    const p1 = fetch(`http://localhost:${port}/`, opts);
    await Bun.sleep(50);

    // Second request should be rejected
    const r2 = await fetch(`http://localhost:${port}/`, opts);
    expect(r2.status).toBe(429);
    const json = await r2.json();
    expect(json.error.code).toBe(-32000);
    expect(json.error.message).toBe("Too many concurrent requests");

    // Clean up: resolve the first request so the server shuts down cleanly
    resolve1?.("done");
    await p1;
    askSpy.mockRestore();
  });

  test("slot freed after request completes", async () => {
    spyOn(mockEngine, "ask").mockResolvedValue("answer");
    server = startA2AServer(port, {
      engine: mockEngine,
      watcher: mockWatcher,
      maxConcurrent: 1,
      authToken: TEST_TOKEN,
    });

    const body = JSON.stringify(rpcBody("message/send", [{ type: "text", text: "q" }]));
    const opts = { method: "POST", headers: authHeaders, body };

    // First request completes, freeing the slot
    const r1 = await fetch(`http://localhost:${port}/`, opts);
    expect(r1.status).toBe(200);

    // Second request should succeed since slot is free
    const r2 = await fetch(`http://localhost:${port}/`, opts);
    expect(r2.status).toBe(200);
  });
});
