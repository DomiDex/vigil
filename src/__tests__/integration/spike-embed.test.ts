import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { startDashboard } from "../../dashboard/server.ts";
import { createMockDaemon } from "../helpers/mock-daemon.ts";

const BUILD_DIR = join(import.meta.dir, "../../../dashboard-v2/dist/server");
const buildExists = existsSync(BUILD_DIR);

let server: ReturnType<typeof Bun.serve>;
let port: number;
let baseUrl: string;

beforeEach(() => {
  port = 40000 + Math.floor(Math.random() * 10000);
  baseUrl = `http://localhost:${port}`;
});

afterEach(() => {
  if (server) server.stop(true);
});

describe.skipIf(!buildExists)("spike handler embedding", () => {
  test("build output exists", () => {
    const files = new Bun.Glob("*.{js,mjs}").scanSync(BUILD_DIR);
    const entries = [...files];
    expect(entries.length).toBeGreaterThan(0);
  });

  test("handler exports a fetch function", async () => {
    const serverEntry = join(BUILD_DIR, "server.js");
    expect(existsSync(serverEntry)).toBe(true);

    const mod = await import(serverEntry);
    expect(mod.default).toBeDefined();
    expect(typeof mod.default.fetch).toBe("function");
  });

  test("embedded handler serves HTML for root path", async () => {
    const daemon = createMockDaemon();
    server = await startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Vigil");
  });

  test("existing API routes still work", async () => {
    const daemon = createMockDaemon();
    server = await startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/overview`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("repos");
    expect(data).toHaveProperty("uptime");
    expect(data).toHaveProperty("tickCount");
  });

  test("API routes take priority over handler", async () => {
    const daemon = createMockDaemon();
    server = await startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/overview`);
    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type");
    expect(contentType).toContain("application/json");
  });
});
